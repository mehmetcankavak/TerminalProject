import { useRef, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import GoogleAuthButton from '../components/GoogleAuthButton'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'

const PERKS = [
  { icon: 'liq',   label: 'Liquidation Stream',   desc: 'Real-time long/short liquidations' },
  { icon: 'whale', label: 'Whale Alerts',          desc: 'Instant large transfer detection' },
  { icon: 'smart', label: 'Smart Money',           desc: 'Copy top Hyperliquid traders' },
  { icon: 'fund',  label: 'Funding Rate',          desc: 'Live rates across all exchanges' },
  { icon: 'alert', label: 'Custom Alerts',         desc: 'Price and condition triggers' },
]

function PerkIcon({ type }) {
  const paths = {
    liq:   <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
    whale: <><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></>,
    smart: <><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 100 4h4a2 2 0 110 4H8"/><line x1="12" y1="6" x2="12" y2="18"/></>,
    fund:  <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>,
    alert: <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></>,
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[type]}
    </svg>
  )
}

function PasswordStrength({ password }) {
  if (!password.length) return null
  let score = 0
  if (password.length >= 8)  score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  const levels = ['Weak', 'Weak', 'Fair', 'Good', 'Strong']
  const colors = ['#ef4444', '#ef4444', '#f59e0b', '#22c55e', '#00e87a']
  const label = levels[Math.min(score, 4)]
  const color = colors[Math.min(score, 4)]
  return (
    <div className="reg-pw-strength">
      <div className="reg-pw-bars">
        {[0,1,2,3].map(i => (
          <div key={i} className="reg-pw-seg" style={{ background: i < score ? color : 'rgba(255,255,255,.08)' }} />
        ))}
      </div>
      <span className="reg-pw-label" style={{ color }}>{label}</span>
    </div>
  )
}

export default function RegisterPage() {
  const { login, googleLogin } = useAuth()
  const navigate  = useNavigate()
  const hasGoogle = !!import.meta.env.VITE_GOOGLE_CLIENT_ID
  const [searchParams] = useSearchParams()
  const pageRef = useRef(null)

  const [name,            setName]            = useState('')
  const [email,           setEmail]           = useState('')
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [selectedPlan,    setSelectedPlan]    = useState(searchParams.get('plan') === 'pro' ? 'pro' : 'free')
  const [error,           setError]           = useState('')
  const [loading,         setLoading]         = useState(false)
  const [showPass,        setShowPass]        = useState(false)

  const handlePointerMove = (e) => {
    const rect = pageRef.current?.getBoundingClientRect(); if (!rect) return
    pageRef.current.style.setProperty('--mx', `${e.clientX - rect.left}px`)
    pageRef.current.style.setProperty('--my', `${e.clientY - rect.top}px`)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) { setError('Passwords do not match'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const res  = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name: name || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Registration failed')
      await login(email, password)
      if (selectedPlan === 'pro') { sessionStorage.setItem('tt_start_page', 'upgrade'); navigate('/app#upgrade'); return }
      navigate('/app')
    } catch (err) {
      setError(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div ref={pageRef} className="lp2-root" onMouseMove={handlePointerMove}>
      <div className="lp2-bg-grid" />
      <div className="lp2-bg-orb lp2-bg-orb-1" />
      <div className="lp2-bg-orb lp2-bg-orb-2" />
      <div className="lp2-spotlight" />

      {/* Nav */}
      <nav className="lp2-nav">
        <Link to="/" className="lp2-nav-logo">
          <span className="lp2-bracket">[</span>TT<span className="lp2-bracket">]</span>
          <span className="lp2-nav-wordmark">TRADING TERMINAL</span>
        </Link>
        <Link to="/login" className="lp2-nav-cta">Sign In</Link>
      </nav>

      <main className="lp2-split reg-split">
        {/* LEFT - brand panel */}
        <div className="lp2-left">
          <div className="lp2-left-inner">
            <div className="lp2-eyebrow">
              <span className="lp2-pulse" />
              PROFESSIONAL TRADING TOOLS
            </div>

            <h1 className="lp2-headline">
              Join the Pro<br />
              <span className="lp2-headline-accent">Trading Community.</span>
            </h1>

            <p className="lp2-subtext">
              Access real-time liquidations, whale alerts, smart money tracking and AI analysis. Everything serious traders need.
            </p>

            {/* Feature perks */}
            <div className="reg-perks">
              {PERKS.map(p => (
                <div key={p.icon} className="reg-perk">
                  <div className="reg-perk-icon"><PerkIcon type={p.icon} /></div>
                  <div>
                    <div className="reg-perk-label">{p.label}</div>
                    <div className="reg-perk-desc">{p.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="reg-free-note">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              Free plan available. No credit card required.
            </div>
          </div>
        </div>

        {/* RIGHT - form */}
        <div className="lp2-right">
          <div className="lp2-card-shell">
            <div className="lp2-card">
              <div className="lp2-card-topline" />

              <div className="lp2-card-header">
                <div className="lp2-card-eyebrow">GET STARTED</div>
                <h2 className="lp2-card-title">Create Account</h2>
                <p className="lp2-card-sub">Join thousands of professional traders</p>
              </div>

              {/* Plan selector */}
              <div className="reg-plans">
                <button
                  type="button"
                  className={`reg-plan ${selectedPlan === 'free' ? 'active' : ''}`}
                  onClick={() => setSelectedPlan('free')}
                >
                  <div className="reg-plan-name">FREE</div>
                  <div className="reg-plan-price">$0</div>
                  <div className="reg-plan-desc">Basic access</div>
                </button>
                <button
                  type="button"
                  className={`reg-plan reg-plan-pro ${selectedPlan === 'pro' ? 'active-pro' : ''}`}
                  onClick={() => setSelectedPlan('pro')}
                >
                  <div className="reg-plan-badge">RECOMMENDED</div>
                  <div className="reg-plan-name pro">PRO</div>
                  <div className="reg-plan-price pro">$39<span>/mo</span></div>
                  <div className="reg-plan-desc">Full terminal access</div>
                </button>
              </div>

              <form className="lp2-form" onSubmit={handleSubmit}>
                <div className="lp2-field">
                  <label className="lp2-label">
                    DISPLAY NAME <span style={{ opacity:.4, fontSize:'8px' }}>(OPTIONAL)</span>
                  </label>
                  <input
                    className="lp2-input"
                    type="text"
                    placeholder="e.g. Trader Mike"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    maxLength={40}
                    autoFocus
                  />
                </div>

                <div className="lp2-field">
                  <label className="lp2-label">EMAIL</label>
                  <input
                    className={`lp2-input${error ? ' lp2-input-error' : ''}`}
                    type="email"
                    placeholder="trader@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="lp2-field">
                  <label className="lp2-label">PASSWORD</label>
                  <div className="lp2-input-wrap">
                    <input
                      className={`lp2-input lp2-input-padded${error ? ' lp2-input-error' : ''}`}
                      type={showPass ? 'text' : 'password'}
                      placeholder="Min. 8 characters"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                    />
                    <button type="button" className="lp2-pass-eye" onClick={() => setShowPass(p => !p)}>
                      {showPass ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                  </div>
                  <PasswordStrength password={password} />
                </div>

                <div className="lp2-field">
                  <label className="lp2-label">CONFIRM PASSWORD</label>
                  <input
                    className={`lp2-input${error ? ' lp2-input-error' : ''}`}
                    type="password"
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <div className="lp2-error">
                    <span className="lp2-error-dot" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className={`lp2-btn${loading ? ' lp2-btn-loading' : ''}${selectedPlan === 'pro' ? ' lp2-btn-pro-variant' : ''}`}
                  disabled={loading}
                >
                  {loading ? (
                    <span className="lp2-spinner" />
                  ) : (
                    <>
                      <span>{selectedPlan === 'pro' ? 'CREATE ACCOUNT & UPGRADE' : 'CREATE FREE ACCOUNT'}</span>
                      <span className="lp2-btn-icon">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                      </span>
                    </>
                  )}
                </button>
              </form>

              {hasGoogle && (
                <>
                  <div className="lp2-divider">
                    <span className="lp2-divider-line" />
                    <span className="lp2-divider-text">or continue with</span>
                    <span className="lp2-divider-line" />
                  </div>
                  <GoogleAuthButton
                    onSuccess={async (token) => {
                      setError('')
                      setLoading(true)
                      try { await googleLogin(token); navigate('/app') }
                      catch (err) { setError(err.message || 'Google signup failed') }
                      finally { setLoading(false) }
                    }}
                    onError={() => setError('Google signup failed')}
                    loading={loading}
                  />
                </>
              )}

              <div className="lp2-footer">
                <span className="lp2-footer-text">Already have an account?</span>
                <Link to="/login" className="lp2-footer-link">Sign in</Link>
              </div>
            </div>
          </div>

          <div className="lp2-security-note">
            <span className="lp2-security-dot" />
            256-bit encrypted connection
          </div>
        </div>
      </main>
    </div>
  )
}
