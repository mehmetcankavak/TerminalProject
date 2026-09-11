import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import AuthLayout from '../components/AuthLayout'
import { Eye, EyeOff } from 'lucide-react'
import GoogleAuthButton from '../components/GoogleAuthButton'

export default function LoginPage() {
  const { login, googleLogin } = useAuth()
  const { t, lang } = useLang()
  const copy = (en, tr) => lang === 'tr' ? tr : en
  const hasGoogle = !!import.meta.env.VITE_GOOGLE_CLIENT_ID
  const navigate  = useNavigate()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [showPass, setShowPass] = useState(false)

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
    <AuthLayout>
        <div className="lp2-right">
          <div className="lp2-card-shell">
            <div className="lp2-card">
              <div className="lp2-card-topline" />

              <div className="lp2-card-header">
                <div className="lp2-card-eyebrow">SECURE ACCESS</div>
                <h1 className="lp2-card-title">{copy('Sign In', 'Giriş yap')}</h1>
                <p className="lp2-card-sub">{copy('Enter your credentials to access the terminal', 'Terminale erişmek için hesabına giriş yap.')}</p>
              </div>

              <form className="lp2-form" onSubmit={handleSubmit}>
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
                    autoFocus
                  />
                </div>

                <div className="lp2-field">
                  <div className="lp2-label-row">
                    <label className="lp2-label" htmlFor="auth-password">{copy('PASSWORD', 'Şifre')}</label>
                    <Link to="/forgot-password" className="lp2-forgot">
                      {t('forgot_password')}
                    </Link>
                  </div>
                  <div className="lp2-input-wrap">
                    <input
                      className={`lp2-input lp2-input-padded${error ? ' lp2-input-error' : ''}`}
                      id="auth-password"
                      autoComplete="current-password"
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
                      aria-label={showPass ? copy('Hide password', 'Şifreyi gizle') : copy('Show password', 'Şifreyi göster')}
                    >
                      {showPass ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
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
                      <span>{copy('SIGN IN', 'Giriş yap')}</span>
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
                    <span className="lp2-divider-text">{copy('or continue with', 'veya şununla devam et')}</span>
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

        </div>
    </AuthLayout>
  )
}
