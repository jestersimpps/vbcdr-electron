import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
