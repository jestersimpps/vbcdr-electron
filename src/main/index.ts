import { app, BrowserWindow, session, shell } from 'electron'
import path from 'path'
import { registerProjectHandlers } from '@main/ipc/projects'
import { registerFilesystemHandlers } from '@main/ipc/filesystem'
import { registerTerminalHandlers } from '@main/ipc/terminal'
import { registerBrowserHandlers } from '@main/ipc/browser'
import { registerGitHandlers } from '@main/ipc/git'
import { registerPasswordHandlers } from '@main/ipc/passwords'
import { killAll } from '@main/services/pty-manager'
import { stopWatching } from '@main/services/file-watcher'
import { detachAllTabs } from '@main/services/browser-view'

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

app.whenReady().then(() => {
  createWindow()

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
