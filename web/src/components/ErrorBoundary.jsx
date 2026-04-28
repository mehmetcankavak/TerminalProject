import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.inline) {
        return (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            flex: 1, padding: 48, color: '#e0e0e0', fontFamily: 'monospace',
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠</div>
            <h3 style={{ margin: '0 0 6px', color: '#ff3b5c', fontSize: 16 }}>This module crashed</h3>
            <code style={{
              background: '#1a1c25', padding: '6px 14px', borderRadius: 6,
              fontSize: 11, color: '#ff6b6b', marginBottom: 16, maxWidth: 420,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {this.state.error?.message || 'Unknown error'}
            </code>
            <button
              onClick={this.handleRetry}
              style={{
                background: 'transparent', color: '#00c8ff', border: '1px solid #00c8ff30',
                borderRadius: 6, padding: '8px 20px', fontSize: 12, cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )
      }
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: '#0a0b0f', color: '#e0e0e0', fontFamily: 'monospace', padding: 32,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠</div>
          <h2 style={{ margin: '0 0 8px', color: '#ff3b5c' }}>Bir şeyler ters gitti</h2>
          <p style={{ color: '#888', fontSize: 14, maxWidth: 400, textAlign: 'center', marginBottom: 24 }}>
            Uygulama beklenmeyen bir hatayla karşılaştı. Sayfayı yenileyerek tekrar deneyin.
          </p>
          <code style={{
            background: '#1a1c25', padding: '8px 16px', borderRadius: 6,
            fontSize: 12, color: '#ff6b6b', marginBottom: 24, maxWidth: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {this.state.error?.message || 'Unknown error'}
          </code>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#00c8ff', color: '#0a0b0f', border: 'none', borderRadius: 6,
              padding: '10px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Sayfayı Yenile
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
