import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { haptic } from '../capacitor'
import LogoTT from '../components/LogoTT'
import { registerPlugin } from '@capacitor/core'

const GoogleAuth = registerPlugin('GoogleAuth')

export default function MobileAuth({ onSuccess }) {
  const { login, register, googleLogin } = useAuth()
  const [tab, setTab] = useState('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]         = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const switchTab = (t) => { setTab(t); setError(''); haptic('light') }

  const handleGoogleSignIn = async () => {
    setError(''); setGoogleLoading(true)
    haptic('medium')
    try {
      const result = await GoogleAuth.signIn()
      const idToken = result?.authentication?.idToken
      if (!idToken) throw new Error('Google sign-in failed')
      await googleLogin(idToken)
      haptic('heavy')
      onSuccess?.()
    } catch (err) {
      haptic('light')
      if (!err?.message?.includes('cancel')) {
        setError(err.message || 'Google sign-in failed')
      }
    } finally {
      setGoogleLoading(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    haptic('medium')
    try {
      if (tab === 'login') {
        await login(email, password)
      } else {
        await register(email, password, name)
      }
      haptic('heavy')
      onSuccess?.()
    } catch (err) {
      haptic('light')
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="m-root m-auth">
      {/* Background */}
      <div className="m-auth-bg">
        <div className="m-auth-grid" />
        <div className="m-auth-orb1" />
        <div className="m-auth-orb2" />
      </div>

      {/* Logo */}
      <div className="m-auth-logo">
        <LogoTT width={80} height={80} />
        <span className="m-auth-logo-name">Trading Terminal</span>
      </div>

      {/* Card */}
      <div className="m-auth-card">
        <div className="m-auth-handle" />

        {/* Login / Register tabs */}
        <div className="m-auth-tabs">
          <button className={`m-auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => switchTab('login')}>
            Sign In
          </button>
          <button className={`m-auth-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => switchTab('register')}>
            Create Account
          </button>
        </div>

        <form onSubmit={submit}>
          {tab === 'register' && (
            <div className="m-auth-field">
              <label className="m-auth-label">Name</label>
              <input
                className="m-auth-input"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={e => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}

          <div className="m-auth-field">
            <label className="m-auth-label">Email</label>
            <input
              className={`m-auth-input ${error ? 'error' : ''}`}
              type="text"
              inputMode="email"
              placeholder="trader@example.com"
              value={email}
              onChange={e => setEmail(e.target.value.trim())}
              autoComplete="email"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>

          <div className="m-auth-field">
            <label className="m-auth-label">Password</label>
            <input
              className={`m-auth-input ${error ? 'error' : ''}`}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </div>

          {error && (
            <div className="m-auth-error">
              <span>⚠</span> {error}
            </div>
          )}

          <button type="submit" className="m-auth-btn" disabled={loading}>
            {loading
              ? <span className="m-spinner" />
              : tab === 'login' ? '→ Sign In' : '→ Create Account'
            }
          </button>
        </form>

        {tab === 'login' && (
          <div className="m-auth-forgot">
            <a href="/forgot-password">Forgot password?</a>
          </div>
        )}

        <div className="m-auth-divider">
          <span className="m-auth-divider-line" />
          <span className="m-auth-divider-text">OR</span>
          <span className="m-auth-divider-line" />
        </div>

        <button className="m-auth-google-btn" onClick={handleGoogleSignIn} disabled={googleLoading || loading} type="button">
          {googleLoading ? <span className="m-spinner" /> : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>
      </div>
    </div>
  )
}
