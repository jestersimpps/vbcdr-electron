import { app, BrowserWindow, Menu, session, shell, systemPreferences, dialog } from 'electron'
import path from 'path'
import { registerProjectHandlers } from '@main/ipc/projects'
import { registerFilesystemHandlers } from '@main/ipc/filesystem'
import { registerTerminalHandlers } from '@main/ipc/terminal'
import { registerClipboardHandlers } from '@main/ipc/clipboard'
import { registerGitHandlers } from '@main/ipc/git'
import { registerWorktreeHandlers } from '@main/ipc/worktrees'
import { registerClaudeConfigHandlers } from '@main/ipc/claude-config'
import { registerClaudeExplainHandlers } from '@main/ipc/claude-explain'
import { registerClaudeSessionsHandlers } from '@main/ipc/claude-sessions'
import { registerSkillsHandlers } from '@main/ipc/skills'
import { registerMcpHandlers } from '@main/ipc/mcp'
import { registerCompanionHandlers } from '@main/ipc/companion'
import { ensureCompanionPrompt } from '@main/services/companion-prompt'
import { registerActivityHandlers } from '@main/ipc/activity'
import { registerSessionSummaryHandlers } from '@main/ipc/session-summary'
import { registerTokenUsageHandlers } from '@main/ipc/token-usage'
import { registerDevServerHandlers } from '@main/ipc/dev-servers'
import { registerProviderModelsHandlers } from '@main/ipc/provider-models'
import { registerKeybindingHandlers } from '@main/ipc/keybindings'
import { effectiveAccelerator } from '@main/models/keybindings'
import { getKeybindingOverrides } from '@main/services/keybindings-service'
import { registerVoiceAgentHandlers } from '@main/ipc/voice-agent'
import { stopVoiceAgent } from '@main/services/voice-agent'
import { isFeatureEnabled } from '@main/models/feature-flags'
import { killAll, killOrphanedPtys } from '@main/services/pty-manager'
import { compactActivity, flushActivity } from '@main/services/activity-service'
import { compactTokenUsage, flushTokenUsage } from '@main/services/token-usage-service'
import { stopWatching } from '@main/services/file-watcher'
import { registerUpdaterHandlers } from '@main/ipc/updater'
import { initAutoUpdater, startUpdateChecks, stopUpdateChecks, checkForUpdatesInteractive } from '@main/services/auto-updater'
import { startClipboardWatcher, stopClipboardWatcher } from '@main/services/clipboard-watcher'
import { startScrollbackSweeps, stopScrollbackSweeps } from '@main/services/scrollback-sweeper'
import { stopAutoFetch } from '@main/services/git-fetch-service'
import { stopAllRefsWatchers } from '@main/services/git-refs-watcher'

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

process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason)
})

app.on('render-process-gone', (_event, webContents, details) => {
  console.error('[main] render-process-gone:', details.reason, details.exitCode)
  if (details.reason === 'crashed' || details.reason === 'oom') {
    if (mainWindow && !mainWindow.isDestroyed() && webContents === mainWindow.webContents) {
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'error',
        title: 'vbcdr',
        message: 'The window crashed.',
        detail: `Reason: ${details.reason}. Reload to recover?`,
        buttons: ['Reload', 'Quit'],
        defaultId: 0,
        cancelId: 1
      })
      if (choice === 0) mainWindow.reload()
      else app.quit()
    }
  }
})

app.on('child-process-gone', (_event, details) => {
  console.error('[main] child-process-gone:', details.type, details.reason)
})

function activeWebContents(): Electron.WebContents | null {
  if (!mainWindow || mainWindow.isDestroyed()) return null
  return mainWindow.webContents
}

function handleBeforeInput(_event: Electron.Event, input: Electron.Input): void {
  if (input.type !== 'keyDown') return

  const digit = /^(?:Digit)?([1-9])$/.exec(input.code)
  if (input.control && !input.meta && !input.alt && !input.shift && digit) {
    _event.preventDefault()
    activeWebContents()?.send('menu:action', `switch-terminal-${digit[1]}`)
    return
  }
  if (input.alt && !input.meta && !input.control && !input.shift && digit) {
    _event.preventDefault()
    activeWebContents()?.send('menu:action', `switch-project-${digit[1]}`)
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const appOrigin = process.env.ELECTRON_RENDERER_URL ?? 'file://'
    if (url.startsWith(appOrigin)) return
    event.preventDefault()
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  startClipboardWatcher(mainWindow)
}

registerProjectHandlers()
registerFilesystemHandlers()
registerTerminalHandlers()
registerClipboardHandlers()
registerGitHandlers()
registerWorktreeHandlers()
registerClaudeConfigHandlers()
registerClaudeExplainHandlers()
registerClaudeSessionsHandlers()
registerSkillsHandlers()
registerMcpHandlers()
registerCompanionHandlers()
ensureCompanionPrompt()
registerUpdaterHandlers()
registerActivityHandlers()
registerSessionSummaryHandlers()
registerTokenUsageHandlers()
registerDevServerHandlers()
registerProviderModelsHandlers()
registerKeybindingHandlers(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenu()))
})
if (isFeatureEnabled('voiceControl')) registerVoiceAgentHandlers()

function buildMenu(): Electron.MenuItemConstructorOptions[] {
  const isMac = process.platform === 'darwin'
  const overrides = getKeybindingOverrides()
  const shortcut = (id: string): string | undefined => effectiveAccelerator(id, overrides)

  const appMenu: Electron.MenuItemConstructorOptions = {
    label: 'vbcdr',
    submenu: [
      { role: 'about', label: 'About vbcdr' },
      { type: 'separator' },
      {
        label: 'Settings...',
        accelerator: shortcut('settings'),
        click: () => activeWebContents()?.send('menu:action', 'settings')
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('menu:action', action)
    }
  }

  const fileMenu: Electron.MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      {
        label: 'New Project',
        accelerator: shortcut('new-project'),
        click: () => send('new-project')
      },
      {
        label: 'Close Project',
        accelerator: shortcut('close-project'),
        click: () => send('close-project')
      },
      { type: 'separator' },
      {
        label: 'Open File...',
        accelerator: shortcut('open-palette-files'),
        click: () => send('open-palette-files')
      },
      {
        label: 'Search in Files...',
        accelerator: shortcut('global-search'),
        click: () => send('global-search')
      },
      {
        label: 'Save',
        accelerator: shortcut('save-file'),
        click: () => send('save-file')
      },
      {
        label: 'Close File',
        accelerator: shortcut('close-file-tab'),
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
        accelerator: shortcut('open-palette'),
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
        accelerator: shortcut('center-tab-editor'),
        click: () => send('center-tab-editor')
      },
      {
        label: 'Claude Config',
        accelerator: shortcut('center-tab-claude'),
        click: () => send('center-tab-claude')
      },
      {
        label: 'Skills',
        accelerator: shortcut('center-tab-skills'),
        click: () => send('center-tab-skills')
      },
      {
        label: 'Terminals',
        accelerator: shortcut('center-tab-terminals'),
        click: () => send('center-tab-terminals')
      },
      { type: 'separator' },
      {
        label: 'Toggle Light/Dark',
        accelerator: shortcut('toggle-variant'),
        click: () => send('toggle-variant')
      },
      { type: 'separator' },
      {
        label: 'Reload',
        accelerator: shortcut('reload'),
        click: () => activeWebContents()?.reload()
      },
      {
        label: 'Force Reload',
        accelerator: shortcut('force-reload'),
        click: () => activeWebContents()?.reloadIgnoringCache()
      },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      {
        label: 'Actual Size',
        accelerator: shortcut('actual-size'),
        click: () => activeWebContents()?.setZoomLevel(0)
      },
      {
        label: 'Zoom In',
        accelerator: shortcut('zoom-in'),
        click: () => {
          const wc = activeWebContents()
          if (wc) wc.setZoomLevel(wc.getZoomLevel() + 0.5)
        }
      },
      {
        label: 'Zoom Out',
        accelerator: shortcut('zoom-out'),
        click: () => {
          const wc = activeWebContents()
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
        accelerator: shortcut('new-llm-tab'),
        click: () => send('new-claude-terminal')
      },
      {
        label: 'New Shell Terminal',
        click: () => send('new-shell-terminal')
      },
      { type: 'separator' },
      {
        label: 'Next Tab',
        accelerator: shortcut('terminal-tab-next'),
        click: () => send('terminal-tab-next')
      },
      {
        label: 'Previous Tab',
        accelerator: shortcut('terminal-tab-prev'),
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
  startScrollbackSweeps()

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media') {
      callback(true)
      return
    }
    callback(false)
  })

  if (process.platform === 'darwin' && isFeatureEnabled('voiceControl')) {
    systemPreferences.askForMediaAccess('microphone').catch(() => {})
  }

  createWindow()
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenu()))

  initAutoUpdater()
  if (!process.env.ELECTRON_RENDERER_URL) {
    setTimeout(() => startUpdateChecks(), 5000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopUpdateChecks()
  stopScrollbackSweeps()
  killAll()
  stopWatching()
  stopClipboardWatcher()
  stopAutoFetch()
  stopAllRefsWatchers()
  flushActivity()
  flushTokenUsage()
  stopVoiceAgent()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopScrollbackSweeps()
  killAll()
  stopWatching()
  stopClipboardWatcher()
  stopAutoFetch()
  stopAllRefsWatchers()
  flushActivity()
  flushTokenUsage()
  stopVoiceAgent()
})
