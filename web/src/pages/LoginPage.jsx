import { useRef, useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import GoogleAuthButton from '../components/GoogleAuthButton'

const TICKER_DATA = [
  { pair: 'BTC/USDT', price: '67,420.50', change: '+2.14', up: true },
  { pair: 'ETH/USDT', price: '3,891.22',  change: '+1.87', up: true },
  { pair: 'SOL/USDT', price: '178.45',    change: '-0.43', up: false },
  { pair: 'BNB/USDT', price: '612.80',    change: '+0.92', up: true },
  { pair: 'HYPE/USDT', price: '24.17',    change: '+5.61', up: true },
]

const STATS = [
  { value: '<50ms', label: 'Latency' },
  { value: '4+',   label: 'Exchanges' },
  { value: '13+',  label: 'Tools' },
  { value: '24/7', label: 'Live' },
]

function LiveTicker() {
  const [rows, setRows] = useState(() =>
    TICKER_DATA.map(d => ({ ...d, flash: false }))
  )

  useEffect(() => {
    const id = setInterval(() => {
      setRows(prev =>
        prev.map(row => {
          const delta     = (Math.random() - 0.48) * 0.25
          const base      = parseFloat(row.price.replace(/,/g, ''))
          const next      = base * (1 + delta / 100)
          const changeNum = parseFloat(row.change) + (Math.random() - 0.48) * 0.08
          const formatted =
            next >= 1000
              ? next.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : next.toFixed(2)
          return {
            ...row,
            price:  formatted,
            change: `${changeNum >= 0 ? '+' : ''}${changeNum.toFixed(2)}`,
            up:     changeNum >= 0,
            flash:  true,
          }
        })
      )
      setTimeout(() => setRows(r => r.map(x => ({ ...x, flash: false }))), 400)
    }, 2200)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="lp2-ticker">
      {rows.map((row, i) => (
        <div
          key={row.pair}
          className={`lp2-ticker-row ${row.flash ? 'lp2-ticker-flash' : ''}`}
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <span className="lp2-ticker-pair">{row.pair}</span>
          <span className="lp2-ticker-price">{row.price}</span>
          <span className={`lp2-ticker-change ${row.up ? 'up' : 'dn'}`}>
            {row.change}%
          </span>
        </div>
      ))}
    </div>
  )
}

export default function LoginPage() {
  const { login, googleLogin } = useAuth()
  const { t } = useLang()
  const hasGoogle = !!import.meta.env.VITE_GOOGLE_CLIENT_ID
  const navigate  = useNavigate()
  const pageRef   = useRef(null)

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [showPass, setShowPass] = useState(false)

  const handlePointerMove = (e) => {
    const rect = pageRef.current?.getBoundingClientRect()
    if (!rect) return
    pageRef.current.style.setProperty('--mx', `${e.clientX - rect.left}px`)
    pageRef.current.style.setProperty('--my', `${e.clientY - rect.top}px`)
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
    <div ref={pageRef} className="lp2-root" onMouseMove={handlePointerMove}>
      <div className="lp2-bg-grid" />
      <div className="lp2-bg-orb lp2-bg-orb-1" />
      <div className="lp2-bg-orb lp2-bg-orb-2" />
      <div className="lp2-spotlight" />

      <nav className="lp2-nav">
        <Link to="/" className="lp2-nav-logo">
          <span className="lp2-bracket">[</span>TT<span className="lp2-bracket">]</span>
          <span className="lp2-nav-wordmark">TRADING TERMINAL</span>
        </Link>
        <Link to="/register" className="lp2-nav-cta">Create Account</Link>
      </nav>

      <main className="lp2-split">
        {/* LEFT - brand panel */}
        <div className="lp2-left">
          <div className="lp2-left-inner">
            <div className="lp2-eyebrow">
              <span className="lp2-pulse" />
              LIVE CRYPTO TERMINAL
            </div>

            <h1 className="lp2-headline">
              Trade Smarter.<br />
              <span className="lp2-headline-accent">React Faster.</span>
            </h1>

            <p className="lp2-subtext">
              Real-time liquidations, whale alerts, funding rates and AI insights. All in one terminal built for serious traders.
            </p>

            <LiveTicker />

            <div className="lp2-stats">
              {STATS.map(s => (
                <div key={s.label} className="lp2-stat">
                  <div className="lp2-stat-value">{s.value}</div>
                  <div className="lp2-stat-label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT - form panel */}
        <div className="lp2-right">
          <div className="lp2-card-shell">
            <div className="lp2-card">
              <div className="lp2-card-topline" />

              <div className="lp2-card-header">
                <div className="lp2-card-eyebrow">SECURE ACCESS</div>
                <h2 className="lp2-card-title">Sign In</h2>
                <p className="lp2-card-sub">Enter your credentials to access the terminal</p>
              </div>

              <form className="lp2-form" onSubmit={handleSubmit}>
                <div className="lp2-field">
                  <label className="lp2-label">EMAIL</label>
                  <input
                    className={`lp2-input${error ? ' lp2-input-error' : ''}`}
                    type="email"
                    placeholder="trader@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="lp2-field">
                  <div className="lp2-label-row">
                    <label className="lp2-label">PASSWORD</label>
                    <Link to="/forgot-password" className="lp2-forgot">
                      {t('forgot_password')}
                    </Link>
                  </div>
                  <div className="lp2-input-wrap">
                    <input
                      className={`lp2-input lp2-input-padded${error ? ' lp2-input-error' : ''}`}
                      type={showPass ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="lp2-pass-eye"
                      onClick={() => setShowPass(p => !p)}
                      aria-label={showPass ? 'Hide password' : 'Show password'}
                    >
                      {showPass ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="lp2-error">
                    <span className="lp2-error-dot" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className={`lp2-btn${loading ? ' lp2-btn-loading' : ''}`}
                  disabled={loading}
                >
                  {loading ? (
                    <span className="lp2-spinner" />
                  ) : (
                    <>
                      <span>SIGN IN</span>
                      <span className="lp2-btn-icon">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <line x1="5" y1="12" x2="19" y2="12"/>
                          <polyline points="12 5 19 12 12 19"/>
                        </svg>
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
                      try {
                        await googleLogin(token)
                        navigate('/app')
                      } catch (err) {
                        setError(err.message || 'Google login failed')
                      } finally {
                        setLoading(false)
                      }
                    }}
                    onError={() => setError('Google login failed')}
                    loading={loading}
                  />
                </>
              )}

              <div className="lp2-footer">
                <span className="lp2-footer-text">{t('no_account')}</span>
                <Link to="/register" className="lp2-footer-link">{t('free_register')}</Link>
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
