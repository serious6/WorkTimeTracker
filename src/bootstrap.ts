import './index.css'
import { bootFailed } from './boot-status'

// Keep React out of the initial module graph and let the styled loading page
// paint and report before application evaluation can occupy the renderer.
window.requestAnimationFrame(() => {
  window.setTimeout(() => {
    void import('./main.tsx').catch(bootFailed)
  }, 0)
})
