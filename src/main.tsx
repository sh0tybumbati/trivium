import React from 'react'
import ReactDOM from 'react-dom/client'
import TriviaApp from './TriviaApp.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <TriviaApp />
    </ErrorBoundary>
  </React.StrictMode>,
)