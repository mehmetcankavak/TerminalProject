import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import { Eye, EyeOff } from 'lucide-react'
import GoogleAuthButton from '../components/GoogleAuthButton'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { API_BASE } from '../config'

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
          <div key={i} className="reg-pw-seg" style={{ background: i < score ? color : '#e4e6df' }} />
        ))}
      </div>
      <span className="reg-pw-label" style={{ color }}>{label}</span>
    </div>
  )
}

export default function RegisterPage() {
  const { login, googleLogin } = useAuth()
  const { lang } = useLang()
  const copy = (en, tr) => lang === 'tr' ? tr : en
  const navigate  = useNavigate()
  const hasGoogle = !!import.meta.env.VITE_GOOGLE_CLIENT_ID
  const [searchParams] = useSearchParams()

  const [name,            setName]            = useState('')
  const [email,           setEmail]           = useState('')
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [selectedPlan,    setSelectedPlan]    = useState(searchParams.get('plan') === 'pro' ? 'pro' : 'free')
  const [error,           setError]           = useState('')
  const [loading,         setLoading]         = useState(false)
  const [showPass,        setShowPass]        = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) { setError(copy('Passwords do not match', 'Şifreler eşleşmiyor')); return }
    if (password.length < 8) { setError(copy('Password must be at least 8 characters', 'Şifre en az 8 karakter olmalı')); return }
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
    <AuthLayout register>
        <div className="lp2-right">
          <div className="lp2-card-shell">
            <div className="lp2-card">
              <div className="lp2-card-topline" />

              <div className="lp2-card-header">
                <div className="lp2-card-eyebrow">GET STARTED</div>
                <h1 className="lp2-card-title">{copy('Create Account', 'Hesap oluştur')}</h1>
                <p className="lp2-card-sub">{copy('Your next move starts here.', 'Sıradaki hamlen burada başlıyor.')}</p>
              </div>

              {/* Plan selector */}
              <div className="reg-plans">
                <button
                  type="button"
                  className={`reg-plan ${selectedPlan === 'free' ? 'active' : ''}`}
                  aria-pressed={selectedPlan === 'free'}
                  onClick={() => setSelectedPlan('free')}
                >
                  <div className="reg-plan-name">FREE</div>
                  <div className="reg-plan-price">$0</div>
                  <div className="reg-plan-desc">{copy('Basic access', 'Temel erişim')}</div>
                </button>
                <button
                  type="button"
                  className={`reg-plan reg-plan-pro ${selectedPlan === 'pro' ? 'active-pro' : ''}`}
                  aria-pressed={selectedPlan === 'pro'}
                  onClick={() => setSelectedPlan('pro')}
                >
                  <div className="reg-plan-badge">RECOMMENDED</div>
                  <div className="reg-plan-name pro">PRO</div>
                  <div className="reg-plan-price pro">$39<span>/mo</span></div>
                  <div className="reg-plan-desc">{copy('Billed $468 yearly', 'Yıllık $468 olarak faturalanır')}</div>
                </button>
              </div>

              <form className="lp2-form" onSubmit={handleSubmit}>
                <div className="lp2-field">
                  <label className="lp2-label" htmlFor="auth-name">
                    {copy('Display name', 'Görünen ad')} <span>({copy('optional', 'isteğe bağlı')})</span>
                  </label>
                  <input
                    className="lp2-input"
                    id="auth-name"
                    autoComplete="nickname"
                    type="text"
                    placeholder="e.g. Trader Mike"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    maxLength={40}
                    autoFocus
                  />
                </div>

                <div className="lp2-field">
                  <label className="lp2-label" htmlFor="auth-email">{copy('EMAIL', 'E-posta')}</label>
                  <input
                    className={`lp2-input${error ? ' lp2-input-error' : ''}`}
                    id="auth-email"
                    autoComplete="email"
                    type="email"
                    placeholder="trader@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="lp2-field">
                  <label className="lp2-label" htmlFor="auth-password">{copy('PASSWORD', 'Şifre')}</label>
                  <div className="lp2-input-wrap">
                    <input
                      className={`lp2-input lp2-input-padded${error ? ' lp2-input-error' : ''}`}
                      id="auth-password"
                      autoComplete="new-password"
                      type={showPass ? 'text' : 'password'}
                      placeholder="Min. 8 characters"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                    />
                    <button type="button" className="lp2-pass-eye" onClick={() => setShowPass(p => !p)} aria-label={showPass ? copy('Hide password', 'Şifreyi gizle') : copy('Show password', 'Şifreyi göster')}>
                      {showPass ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                  <PasswordStrength password={password} />
                </div>

                <div className="lp2-field">
                  <label className="lp2-label" htmlFor="auth-confirm">{copy('CONFIRM PASSWORD', 'Şifreyi doğrula')}</label>
                  <input
                    className={`lp2-input${error ? ' lp2-input-error' : ''}`}
                    id="auth-confirm"
                    autoComplete="new-password"
                    type="password"
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <div className="lp2-error" role="alert">
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
                      <span>{selectedPlan === 'pro' ? copy('Create account & upgrade', 'Hesap oluştur ve yükselt') : copy('Create free account', 'Ücretsiz hesap oluştur')}</span>
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
                    <span className="lp2-divider-text">{copy('or continue with', 'veya şununla devam et')}</span>
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
                <span className="lp2-footer-text">{copy('Already have an account?', 'Zaten hesabın var mı?')}</span>
                <Link to="/login" className="lp2-footer-link">{copy('Sign in', 'Giriş yap')}</Link>
              </div>
            </div>
          </div>

        </div>
    </AuthLayout>
  )
}
