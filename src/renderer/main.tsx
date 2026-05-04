import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'

document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => e.preventDefault())

// `@monaco-editor/react`'s DiffEditor cleanup disposes underlying TextModels
// before clearing them off the widget, which Monaco reports via a setTimeout
// rethrow. Harmless (Monaco recovers via setModel(null)) but noisy in the
// console, especially under React StrictMode's double-mount in dev.
const MONACO_BENIGN = 'TextModel got disposed before DiffEditorWidget model got reset'
window.addEventListener('error', (e) => {
  if (e.message?.includes(MONACO_BENIGN) || e.error?.message?.includes(MONACO_BENIGN)) {
    e.preventDefault()
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
