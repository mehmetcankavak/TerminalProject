import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '../context/LangContext'
import { API_BASE } from '../config'

export default function ForgotPasswordPage() {
  const { t } = useLang()
  const [email,   setEmail]   = useState('')
  const [status,  setStatus]  = useState('idle')
  const [errMsg,  setErrMsg]  = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('loading')
    setErrMsg('')
    try {
      const res  = await fetch(`${API_BASE}/auth/forgot-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) { setErrMsg(data.detail || t('err_generic')); setStatus('error'); return }
      setStatus('done')
    } catch {
      setErrMsg(t('err_connection')); setStatus('error')
    }
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
            <div className="auth-card-eyebrow">ACCOUNT RECOVERY</div>
            <h1 className="auth-card-title">{t('reset_title')}</h1>
            <p className="auth-card-sub">Enter your email to receive a reset link</p>
          </div>

          {status === 'done' ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div className="auth-success-icon">✓</div>
              <p style={{ color: '#00d992', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{t('reset_done_title')}</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'pre-line', lineHeight: 1.5 }}>
                {t('reset_done_sub')}
              </p>
              <Link to="/login" className="auth-btn" style={{ display: 'block', textAlign: 'center', marginTop: 24, textDecoration: 'none' }}>
                {t('reset_back_login')}
              </Link>
            </div>
          ) : (
            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-field">
                <label className="auth-label">{t('reset_email_label')}</label>
                <input
                  className="auth-input"
                  type="email"
                  placeholder={t('reset_email_ph')}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              {errMsg && (
                <div className="auth-error">
                  <span className="auth-error-icon">!</span>
                  {errMsg}
                </div>
              )}
              <button className="auth-btn" disabled={status === 'loading'}>
                {status === 'loading' ? <span className="auth-spinner" /> : t('reset_send_btn')}
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
