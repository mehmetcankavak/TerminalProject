import { Component } from 'react'
import ReactDOM from 'react-dom/client'
import { isNative, setStatusBarDark } from './capacitor'
setStatusBarDark()
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { LangProvider } from './context/LangContext'

if (isNative) {
  try {
    navigator.serviceWorker?.getRegistrations?.()
      .then(registrations => registrations.forEach(reg => reg.unregister()))
      .catch(() => {})
    window.caches?.keys?.()
      .then(keys => keys.forEach(key => window.caches.delete(key)))
      .catch(() => {})
  } catch {}
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ background: '#08090c', color: '#e8e6e3', padding: 40, fontFamily: 'monospace', minHeight: '100vh' }}>
          <h2 style={{ color: '#ef4444' }}>Render Hatası</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#fbbf24' }}>
            {this.state.error.toString()}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ErrorBoundary>
      <LangProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LangProvider>
    </ErrorBoundary>
  </BrowserRouter>
)
