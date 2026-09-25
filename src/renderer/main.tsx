import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { PanelErrorBoundary } from './components/layout/PanelErrorBoundary'
import { useTerminalPrefsStore } from './stores/terminal-prefs-store'
import './index.css'

document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => e.preventDefault())

// Monaco surfaces certain async-cleanup races via setTimeout rethrow. They are
// harmless once the editor remounts (handled by per-file `key` props +
// MonacoErrorBoundary), but noisy in the console, especially under StrictMode.
const MONACO_BENIGN = [
  'TextModel got disposed before DiffEditorWidget model got reset',
  'InstantiationService has been disposed'
]
const matchesBenign = (msg: string | undefined): boolean =>
  !!msg && MONACO_BENIGN.some((p) => msg.includes(p))
window.addEventListener('error', (e) => {
  if (matchesBenign(e.message) || matchesBenign(e.error?.message)) {
    e.preventDefault()
  }
})
window.addEventListener('unhandledrejection', (e) => {
  if (matchesBenign(e.reason?.message) || matchesBenign(String(e.reason ?? ''))) {
    e.preventDefault()
  }
})

window.addEventListener('error', (e) => {
  if (matchesBenign(e.message) || matchesBenign(e.error?.message)) return
  console.error('[renderer] window error:', e.error ?? e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  if (matchesBenign(e.reason?.message) || matchesBenign(String(e.reason ?? ''))) return
  console.error('[renderer] unhandledrejection:', e.reason)
})

// xterm measures its cell once at creation and never again when a web font
// arrives, so the saved terminal font has to be loaded before any terminal mounts.
const { fontFamily, fontSize } = useTerminalPrefsStore.getState()
document.fonts
  .load(`${fontSize}px ${fontFamily}`)
  .catch(() => [])
  .then(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <PanelErrorBoundary label="App">
          <App />
        </PanelErrorBoundary>
      </React.StrictMode>
    )
  })
