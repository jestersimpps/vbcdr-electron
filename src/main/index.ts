import { app, BrowserWindow, Menu } from 'electron'
import path from 'path'
import { registerProjectHandlers } from '@main/ipc/projects'
import { registerFilesystemHandlers } from '@main/ipc/filesystem'
import { registerTerminalHandlers } from '@main/ipc/terminal'
import { registerGitHandlers } from '@main/ipc/git'
import { registerClaudeConfigHandlers } from '@main/ipc/claude-config'
import { registerClaudeExplainHandlers } from '@main/ipc/claude-explain'
import { registerSkillsHandlers } from '@main/ipc/skills'
import { registerActivityHandlers } from '@main/ipc/activity'
import { registerTokenUsageHandlers } from '@main/ipc/token-usage'
import { registerWorktreeHandlers } from '@main/ipc/worktree'
import { registerDevServerHandlers } from '@main/ipc/dev-servers'
import { killAll, killOrphanedPtys } from '@main/services/pty-manager'
import { compactActivity, flushActivity } from '@main/services/activity-service'
import { compactTokenUsage, flushTokenUsage } from '@main/services/token-usage-service'
import { stopWatching } from '@main/services/file-watcher'
import { registerUpdaterHandlers } from '@main/ipc/updater'
import { initAutoUpdater, checkForUpdates, checkForUpdatesInteractive } from '@main/services/auto-updater'
import { stopAutoFetch } from '@main/services/git-fetch-service'

app.setName('vbcdr')
app.setAboutPanelOptions({
  applicationName: 'vbcdr',
  applicationVersion: app.getVersion(),
  version: '',
  copyright: '© 2026 Jo Vinkenroye',
  credits: 'A desktop vibe coding environment for Claude Code developers.\nTerminal, editor, and git — all in one window.',
  iconPath: path.join(__dirname, '../../resources/icon.png')
})

let mainWindow: BrowserWindow | null = null

function handleBeforeInput(_event: Electron.Event, input: Electron.Input): void {
  if (input.type !== 'keyDown') return

  if (input.meta && input.alt && /^[1-9]$/.test(input.key)) {
    _event.preventDefault()
    mainWindow?.webContents.send('menu:action', `switch-project-${input.key}`)
    return
  }
}

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
      sandbox: false
    }
  })

  mainWindow.webContents.on('before-input-event', handleBeforeInput)

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
registerGitHandlers()
registerClaudeConfigHandlers()
registerClaudeExplainHandlers()
registerSkillsHandlers()
registerUpdaterHandlers()
registerActivityHandlers()
registerTokenUsageHandlers()
registerWorktreeHandlers()
registerDevServerHandlers()

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
      {
        label: 'Check for Updates...',
        click: () => checkForUpdatesInteractive()
      },
      { type: 'separator' },
      { role: 'hide', label: 'Hide vbcdr' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit', label: 'Quit vbcdr' }
    ]
  }

  const send = (action: string): void => {
    mainWindow?.webContents.send('menu:action', action)
  }

  const fileMenu: Electron.MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      {
        label: 'New Project',
        accelerator: 'CmdOrCtrl+N',
        click: () => send('new-project')
      },
      {
        label: 'Close Project',
        accelerator: 'CmdOrCtrl+W',
        click: () => send('close-project')
      },
      { type: 'separator' },
      {
        label: 'Open File...',
        accelerator: 'CmdOrCtrl+P',
        click: () => send('open-palette-files')
      },
      {
        label: 'Save',
        accelerator: 'CmdOrCtrl+S',
        click: () => send('save-file')
      },
      {
        label: 'Close File',
        accelerator: 'CmdOrCtrl+Alt+W',
        click: () => send('close-file-tab')
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
      { role: 'selectAll' },
      { type: 'separator' },
      {
        label: 'Command Palette',
        accelerator: 'CmdOrCtrl+K',
        click: () => send('open-palette')
      }
    ]
  }

  const viewMenu: Electron.MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      {
        label: 'Dashboard',
        click: () => send('toggle-dashboard')
      },
      {
        label: 'Statistics',
        click: () => send('show-statistics')
      },
      {
        label: 'Usage',
        click: () => send('show-usage')
      },
      { type: 'separator' },
      {
        label: 'Editor',
        accelerator: 'CmdOrCtrl+1',
        click: () => send('center-tab-editor')
      },
      {
        label: 'Claude Config',
        accelerator: 'CmdOrCtrl+2',
        click: () => send('center-tab-claude')
      },
      {
        label: 'Skills',
        accelerator: 'CmdOrCtrl+3',
        click: () => send('center-tab-skills')
      },
      {
        label: 'Terminals',
        accelerator: 'CmdOrCtrl+4',
        click: () => send('center-tab-terminals')
      },
      { type: 'separator' },
      {
        label: 'Toggle Light/Dark',
        accelerator: 'CmdOrCtrl+Shift+L',
        click: () => send('toggle-variant')
      },
      { type: 'separator' },
      {
        label: 'Reload',
        accelerator: 'CmdOrCtrl+R',
        click: () => mainWindow?.webContents.reload()
      },
      {
        label: 'Force Reload',
        accelerator: 'CmdOrCtrl+Shift+R',
        click: () => mainWindow?.webContents.reloadIgnoringCache()
      },
      { role: 'toggleDevTools' },
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

  const terminalMenu: Electron.MenuItemConstructorOptions = {
    label: 'Terminal',
    submenu: [
      {
        label: 'New Claude Terminal',
        click: () => send('new-claude-terminal')
      },
      {
        label: 'New Shell Terminal',
        click: () => send('new-shell-terminal')
      },
      { type: 'separator' },
      {
        label: 'Next Tab',
        accelerator: 'CmdOrCtrl+Shift+]',
        click: () => send('terminal-tab-next')
      },
      {
        label: 'Previous Tab',
        accelerator: 'CmdOrCtrl+Shift+[',
        click: () => send('terminal-tab-prev')
      },
      { type: 'separator' },
      {
        label: 'Restart Claude',
        click: () => send('restart-claude')
      },
      {
        label: 'Clear Context',
        click: () => send('clear-context')
      }
    ]
  }

  const gitMenu: Electron.MenuItemConstructorOptions = {
    label: 'Git',
    submenu: [
      {
        label: 'Pull & Rebase',
        click: () => send('git-pull-rebase')
      },
      { type: 'separator' },
      {
        label: 'Commit',
        click: () => send('git-commit')
      }
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

  return [
    ...(isMac ? [appMenu] : []),
    fileMenu,
    editMenu,
    viewMenu,
    terminalMenu,
    gitMenu,
    windowMenu
  ]
}

app.whenReady().then(() => {
  killOrphanedPtys()
  compactActivity()
  compactTokenUsage()
  createWindow()
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenu()))

  initAutoUpdater()
  if (!process.env.ELECTRON_RENDERER_URL) {
    setTimeout(() => checkForUpdates(), 5000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  killAll()
  stopWatching()
  stopAutoFetch()
  flushActivity()
  flushTokenUsage()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  killAll()
  stopWatching()
  stopAutoFetch()
  flushActivity()
  flushTokenUsage()
})
