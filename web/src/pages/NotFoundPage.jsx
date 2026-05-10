import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="auth-page">
      <div className="auth-grid-bg" />

      <nav className="landing-nav">
        <Link to="/" className="landing-logo">
          <span className="logo-bracket">[</span>TT<span className="logo-bracket">]</span>
          <span className="logo-label">TRADING TERMINAL</span>
        </Link>
      </nav>

      <div className="auth-center">
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 80, fontWeight: 700, color: '#1a1a1a', lineHeight: 1 }}>
            404
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent)', letterSpacing: '0.1em', marginTop: 8, marginBottom: 24 }}>
            PAGE NOT FOUND
          </div>
          <p style={{ color: 'var(--text-3)', fontSize: 14, marginBottom: 32, maxWidth: 320, margin: '0 auto 32px' }}>
            The page you're looking for doesn't exist or has been moved.
          </p>
          <Link to="/" className="btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
