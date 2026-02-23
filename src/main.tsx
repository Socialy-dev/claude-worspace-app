import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// Prevent Electron from navigating/opening files on drag-and-drop globally.
// Without this, dropping a file anywhere in the window replaces the app with the file.
document.addEventListener('dragover', (e) => e.preventDefault(), true)
document.addEventListener('drop', (e) => e.preventDefault(), true)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
