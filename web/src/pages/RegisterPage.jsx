import { useRef, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'

export default function RegisterPage() {
  const { login, googleLogin } = useAuth()
  const navigate = useNavigate()
  const hasGoogle = !!import.meta.env.VITE_GOOGLE_CLIENT_ID
  const [searchParams] = useSearchParams()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [selectedPlan, setSelectedPlan] = useState(searchParams.get('plan') === 'pro' ? 'pro' : 'free')
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

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      // Register account
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name: name || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Registration failed')

      // Auto-login
      const loginData = await login(email, password)

      // If PRO selected, route to in-app crypto checkout
      if (selectedPlan === 'pro') {
        sessionStorage.setItem('tt_start_page', 'upgrade')
        navigate('/app#upgrade')
        return
      }

      navigate('/app')
    } catch (err) {
      setError(err.message || 'Registration failed')
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
          <Link to="/login" className="nav-link">Sign In</Link>
        </div>
      </nav>

      <div className="auth-center">
        <div className="auth-card auth-card-wide">
          <div className="auth-card-header">
            <div className="auth-card-eyebrow">GET STARTED</div>
            <h1 className="auth-card-title">Create Account</h1>
            <p className="auth-card-sub">Join thousands of professional traders</p>
          </div>

          {/* Plan selector */}
          <div className="plan-selector">
            <div
              className={`plan-option ${selectedPlan === 'free' ? 'plan-option-active' : ''}`}
              onClick={() => setSelectedPlan('free')}
            >
              <div className="plan-option-name">FREE</div>
              <div className="plan-option-price">$0</div>
              <div className="plan-option-desc">Basic access</div>
            </div>
            <div
              className={`plan-option plan-option-pro ${selectedPlan === 'pro' ? 'plan-option-pro-active' : ''}`}
              onClick={() => setSelectedPlan('pro')}
            >
              <div className="plan-option-badge">RECOMMENDED</div>
              <div className="plan-option-name">PRO</div>
              <div className="plan-option-price">$29<span>/mo</span></div>
              <div className="plan-option-desc">Full terminal access</div>
            </div>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label className="auth-label">DISPLAY NAME <span style={{opacity:.4, fontWeight:400}}>(optional)</span></label>
              <input
                className="auth-input"
                type="text"
                placeholder="e.g. Trader Mike"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                maxLength={40}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">EMAIL ADDRESS</label>
              <input
                className={`auth-input ${error ? 'auth-input-error' : ''}`}
                type="email"
                placeholder="trader@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">PASSWORD</label>
              <input
                className={`auth-input ${error ? 'auth-input-error' : ''}`}
                type="password"
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {password.length > 0 && (() => {
                let score = 0
                if (password.length >= 8) score++
                if (password.length >= 12) score++
                if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
                if (/[0-9]/.test(password)) score++
                if (/[^A-Za-z0-9]/.test(password)) score++
                const levels = ['Weak','Weak','Fair','Good','Strong']
                const colors = ['#ef4444','#ef4444','#f59e0b','#22c55e','#00d992']
                const label = levels[Math.min(score, 4)]
                const color = colors[Math.min(score, 4)]
                return (
                  <div className="pw-strength">
                    <div className="pw-strength-bar">
                      {[0,1,2,3].map(i => (
                        <div key={i} className="pw-strength-seg" style={{ background: i < score ? color : 'rgba(255,255,255,.08)' }} />
                      ))}
                    </div>
                    <span className="pw-strength-label" style={{ color }}>{label}</span>
                  </div>
                )
              })()}
            </div>

            <div className="auth-field">
              <label className="auth-label">CONFIRM PASSWORD</label>
              <input
                className={`auth-input ${error ? 'auth-input-error' : ''}`}
                type="password"
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
              className={`auth-btn ${loading ? 'auth-btn-loading' : ''} ${selectedPlan === 'pro' ? 'auth-btn-pro' : ''}`}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="auth-spinner" />
                  <span style={{ marginLeft: 8, fontSize: 11, opacity: .7 }}>
                    {selectedPlan === 'pro' ? 'Preparing crypto checkout...' : 'Creating account...'}
                  </span>
                </>
              ) : selectedPlan === 'pro' ? (
                'CREATE ACCOUNT & UPGRADE'
              ) : (
                'CREATE FREE ACCOUNT'
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
                      setError(err.message || 'Google signup failed')
                    } finally {
                      setLoading(false)
                    }
                  }}
                  onError={() => setError('Google signup failed')}
                  theme="filled_black"
                  size="large"
                  width="100%"
                  text="signup_with"
                  shape="rectangular"
                />
              </div>
            </>
          )}

          <div className="auth-footer-links">
            <span className="auth-footer-text">Already have an account?</span>
            <Link to="/login" className="auth-link">Sign in</Link>
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
