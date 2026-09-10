import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppProviders } from './app/providers.tsx'
import { bootFinished } from './boot-status.ts'
import { ErrorBoundary } from './components/error-boundary.tsx'
import { listenForUnhandledErrors } from './lib/global-errors.ts'

listenForUnhandledErrors()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProviders>
        <App />
      </AppProviders>
    </ErrorBoundary>
  </StrictMode>,
)

// The application owns the window from here on and reports its failures itself.
bootFinished()
