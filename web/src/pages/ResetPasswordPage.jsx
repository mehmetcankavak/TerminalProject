import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLang } from '../context/LangContext'
import { API_BASE } from '../config'

export default function ResetPasswordPage() {
  const { t } = useLang()
  const [params]   = useSearchParams()
  const navigate   = useNavigate()
  const token      = params.get('token') || ''

  const [password,  setPassword]  = useState('')
  const [password2, setPassword2] = useState('')
  const [status,    setStatus]    = useState('idle')
  const [errMsg,    setErrMsg]    = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password !== password2) { setErrMsg(t('err_mismatch')); return }
    if (password.length < 8)    { setErrMsg(t('err_min_chars')); return }
    setStatus('loading'); setErrMsg('')
    try {
      const res  = await fetch(`${API_BASE}/auth/reset-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) { setErrMsg(data.detail || t('err_generic')); setStatus('error'); return }
      setStatus('done')
      setTimeout(() => navigate('/login'), 2000)
    } catch {
      setErrMsg(t('err_connection')); setStatus('error')
    }
  }

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-grid-bg" />
        <nav className="landing-nav">
          <Link to="/" className="landing-logo">
            <span className="logo-bracket">[</span>TT<span className="logo-bracket">]</span>
          </Link>
        </nav>
        <div className="auth-center">
          <div className="auth-card">
            <div className="auth-card-header">
              <h1 className="auth-card-title">Invalid Link</h1>
              <p className="auth-card-sub">{t('reset_invalid_link')}</p>
            </div>
            <Link to="/forgot-password" className="auth-btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              {t('reset_request_new')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-grid-bg" />

      <nav className="landing-nav">
        <Link to="/" className="landing-logo">
          <span className="logo-bracket">[</span>TT<span className="logo-bracket">]</span>
        </Link>
        <div className="landing-nav-actions">
          <Link to="/login" className="nav-link">Sign In</Link>
        </div>
      </nav>

      <div className="auth-center">
        <div className="auth-card">
          <div className="auth-card-header">
            <div className="auth-card-eyebrow">SECURITY</div>
            <h1 className="auth-card-title">{t('newpw_title')}</h1>
            <p className="auth-card-sub">Choose a strong password for your account</p>
          </div>

          {status === 'done' ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div className="auth-success-icon">✓</div>
              <p style={{ color: '#00d992', fontWeight: 600, fontSize: 14 }}>{t('newpw_done')}</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>Redirecting to login...</p>
            </div>
          ) : (
            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-field">
                <label className="auth-label">{t('newpw_label')}</label>
                <input
                  className="auth-input"
                  type="password"
                  placeholder={t('newpw_ph')}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="auth-field">
                <label className="auth-label">{t('newpw_confirm')}</label>
                <input
                  className="auth-input"
                  type="password"
                  placeholder={t('newpw_confirm_ph')}
                  value={password2}
                  onChange={e => setPassword2(e.target.value)}
                  required
                />
              </div>
              {errMsg && (
                <div className="auth-error">
                  <span className="auth-error-icon">!</span>
                  {errMsg}
                </div>
              )}
              <button className="auth-btn" disabled={status === 'loading'}>
                {status === 'loading' ? <span className="auth-spinner" /> : t('newpw_btn')}
              </button>
            </form>
          )}

          <div className="auth-footer-links">
            <span className="auth-footer-text">Remember your password?</span>
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
