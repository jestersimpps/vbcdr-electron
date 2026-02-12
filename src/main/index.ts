import { app, BrowserWindow, Menu, session, shell } from 'electron'
import path from 'path'
import { registerProjectHandlers } from '@main/ipc/projects'
import { registerFilesystemHandlers } from '@main/ipc/filesystem'
import { registerTerminalHandlers } from '@main/ipc/terminal'
import { registerBrowserHandlers } from '@main/ipc/browser'
import { registerGitHandlers } from '@main/ipc/git'
import { registerPasswordHandlers } from '@main/ipc/passwords'
import { registerClaudeConfigHandlers } from '@main/ipc/claude-config'
import { killAll, killOrphanedPtys } from '@main/services/pty-manager'
import { stopWatching } from '@main/services/file-watcher'
import { detachAllTabs } from '@main/services/browser-view'

app.setName('vbcdr')

const CHROME_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'

const ALLOWED_PERMISSIONS = new Set([
  'clipboard-read',
  'clipboard-sanitized-write',
  'fullscreen',
  'geolocation',
  'media',
  'mediaKeySystem',
  'midi',
  'notifications',
  'pointerLock',
  'window-management'
])

const configuredSessions = new WeakSet<Electron.Session>()

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#09090b',
    icon: path.join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true
    }
  })

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'r' && input.meta && !input.shift) {
      _event.preventDefault()
      mainWindow?.webContents.send('browser:reload')
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

registerProjectHandlers()
registerFilesystemHandlers()
registerTerminalHandlers()
registerBrowserHandlers()
registerGitHandlers()
registerPasswordHandlers()
registerClaudeConfigHandlers()

function buildMenu(): Electron.MenuItemConstructorOptions[] {
  const isMac = process.platform === 'darwin'

  const appMenu: Electron.MenuItemConstructorOptions = {
    label: 'vbcdr',
    submenu: [
      { role: 'about', label: 'About vbcdr' },
      { type: 'separator' },
      {
        label: 'Settings...',
        accelerator: 'CmdOrCtrl+,',
        click: () => mainWindow?.webContents.send('menu:action', 'settings')
      },
      { type: 'separator' },
      { role: 'hide', label: 'Hide vbcdr' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit', label: 'Quit vbcdr' }
    ]
  }

  const fileMenu: Electron.MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      {
        label: 'New Project',
        accelerator: 'CmdOrCtrl+N',
        click: () => mainWindow?.webContents.send('menu:action', 'new-project')
      },
      {
        label: 'Close Project',
        accelerator: 'CmdOrCtrl+W',
        click: () => mainWindow?.webContents.send('menu:action', 'close-project')
      },
      { type: 'separator' },
      {
        label: 'Close Window',
        accelerator: 'CmdOrCtrl+Shift+W',
        click: () => mainWindow?.close()
      }
    ]
  }

  const editMenu: Electron.MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' }
    ]
  }

  const viewMenu: Electron.MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      {
        label: 'Toggle Browser',
        accelerator: 'CmdOrCtrl+1',
        click: () => mainWindow?.webContents.send('menu:action', 'center-tab-browser')
      },
      {
        label: 'Toggle Editor',
        accelerator: 'CmdOrCtrl+2',
        click: () => mainWindow?.webContents.send('menu:action', 'center-tab-editor')
      },
      {
        label: 'Toggle Claude Config',
        accelerator: 'CmdOrCtrl+3',
        click: () => mainWindow?.webContents.send('menu:action', 'center-tab-claude')
      },
      { type: 'separator' },
      {
        label: 'Reload Browser',
        accelerator: 'CmdOrCtrl+R',
        click: () => mainWindow?.webContents.send('browser:reload')
      },
      { type: 'separator' },
      { role: 'toggleDevTools' },
      {
        label: 'Toggle App Developer Tools',
        accelerator: 'CmdOrCtrl+Shift+I',
        click: () => mainWindow?.webContents.toggleDevTools()
      },
      { type: 'separator' },
      {
        label: 'Actual Size',
        accelerator: 'CmdOrCtrl+0',
        click: () => mainWindow?.webContents.setZoomLevel(0)
      },
      {
        label: 'Zoom In',
        accelerator: 'CmdOrCtrl+=',
        click: () => {
          const wc = mainWindow?.webContents
          if (wc) wc.setZoomLevel(wc.getZoomLevel() + 0.5)
        }
      },
      {
        label: 'Zoom Out',
        accelerator: 'CmdOrCtrl+-',
        click: () => {
          const wc = mainWindow?.webContents
          if (wc) wc.setZoomLevel(wc.getZoomLevel() - 0.5)
        }
      },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  }

  const windowMenu: Electron.MenuItemConstructorOptions = {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' }
    ]
  }

  const helpMenu: Electron.MenuItemConstructorOptions = {
    label: 'Help',
    submenu: [
      {
        label: 'Learn More',
        click: () => shell.openExternal('https://github.com/jestersimpps/Claude-AIDE?tab=readme-ov-file')
      }
    ]
  }

  return [
    ...(isMac ? [appMenu] : []),
    fileMenu,
    editMenu,
    viewMenu,
    windowMenu,
    helpMenu
  ]
}

app.whenReady().then(() => {
  killOrphanedPtys()
  createWindow()
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenu()))

  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() === 'webview') {
      const ses = contents.session
      if (!configuredSessions.has(ses)) {
        configuredSessions.add(ses)
        ses.setUserAgent(CHROME_USER_AGENT)
        ses.webRequest.onBeforeSendHeaders((details, callback) => {
          details.requestHeaders['User-Agent'] = CHROME_USER_AGENT
          details.requestHeaders['Sec-CH-UA'] = '"Chromium";v="132", "Google Chrome";v="132", "Not-A.Brand";v="99"'
          details.requestHeaders['Sec-CH-UA-Mobile'] = '?0'
          details.requestHeaders['Sec-CH-UA-Platform'] = '"macOS"'
          delete details.requestHeaders['Sec-CH-UA-Full-Version-List']
          callback({ requestHeaders: details.requestHeaders })
        })
        ses.setPermissionRequestHandler((_wc, permission, callback) => {
          callback(ALLOWED_PERMISSIONS.has(permission))
        })
        ses.setPermissionCheckHandler((_wc, permission) => {
          return ALLOWED_PERMISSIONS.has(permission)
        })
      }

      contents.setWindowOpenHandler(({ url }) => {
        if (/accounts\.google\.com/.test(url)) {
          shell.openExternal(url)
          return { action: 'deny' }
        }
        contents.loadURL(url)
        return { action: 'deny' }
      })

      contents.on('will-navigate', (e, url) => {
        if (/accounts\.google\.com\/o\/oauth|accounts\.google\.com\/signin/.test(url)) {
          e.preventDefault()
          shell.openExternal(url)
        }
      })

      contents.on('before-input-event', (_e, input) => {
        if (input.type === 'keyDown' && input.key === 'r' && input.meta && !input.shift) {
          _e.preventDefault()
          mainWindow?.webContents.send('browser:reload')
        }
      })
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  killAll()
  stopWatching()
  detachAllTabs()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  killAll()
  stopWatching()
  detachAllTabs()
})
