import { useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'

export default function LoginPage() {
  const { login, googleLogin } = useAuth()
  const { t } = useLang()
  const hasGoogle = !!import.meta.env.VITE_GOOGLE_CLIENT_ID
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const pageRef = useRef(null)

  const handlePointerMove = (e) => {
    const rect = pageRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    pageRef.current.style.setProperty('--mx', `${x}px`)
    pageRef.current.style.setProperty('--my', `${y}px`)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/app')
    } catch (err) {
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div ref={pageRef} className="auth-page auth-page-premium" onMouseMove={handlePointerMove}>
      <div className="auth-grid-bg" />
      <div className="auth-dot-bg" />
      <div className="auth-spotlight" />

      <nav className="landing-nav auth-nav">
        <Link to="/" className="landing-logo">
          <span className="logo-bracket">[</span>TT<span className="logo-bracket">]</span>
        </Link>
        <div className="landing-nav-actions auth-nav-actions">
          <Link to="/register" className="nav-link">Create Account</Link>
        </div>
      </nav>

      <div className="auth-center">
        <div className="auth-card">
          <div className="auth-card-header">
            <div className="auth-card-eyebrow">SECURE ACCESS</div>
            <h1 className="auth-card-title">Sign In</h1>
            <p className="auth-card-sub">Enter your credentials to access the terminal</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label className="auth-label">EMAIL ADDRESS</label>
              <input
                className={`auth-input ${error ? 'auth-input-error' : ''}`}
                type="email"
                placeholder="trader@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">PASSWORD</label>
              <input
                className={`auth-input ${error ? 'auth-input-error' : ''}`}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="auth-error">
                <span className="auth-error-icon">!</span>
                {error}
              </div>
            )}

            <button
              type="submit"
              className={`auth-btn ${loading ? 'auth-btn-loading' : ''}`}
              disabled={loading}
            >
              {loading ? (
                <span className="auth-spinner" />
              ) : (
                'SIGN IN'
              )}
            </button>
          </form>

          {hasGoogle && (
            <>
              <div className="auth-divider">
                <span className="auth-divider-line" />
                <span className="auth-divider-text">OR</span>
                <span className="auth-divider-line" />
              </div>
              <div className="auth-google-wrap">
                <GoogleLogin
                  onSuccess={async (credentialResponse) => {
                    setError('')
                    setLoading(true)
                    try {
                      await googleLogin(credentialResponse.credential)
                      navigate('/app')
                    } catch (err) {
                      setError(err.message || 'Google login failed')
                    } finally {
                      setLoading(false)
                    }
                  }}
                  onError={() => setError('Google login failed')}
                  theme="filled_black"
                  size="large"
                  width="100%"
                  text="signin_with"
                  shape="rectangular"
                />
              </div>
            </>
          )}

          <div className="auth-footer-links">
            <Link to="/forgot-password" className="auth-link" style={{ opacity: .6 }}>{t('forgot_password')}</Link>
            <span className="auth-footer-text" style={{ opacity: .3 }}>·</span>
            <span className="auth-footer-text">{t('no_account')}</span>
            <Link to="/register" className="auth-link">{t('free_register')}</Link>
          </div>
        </div>

        <div className="auth-security-note">
          <span className="auth-security-dot" />
          256-bit encrypted connection
        </div>
      </div>
    </div>
  )
}
