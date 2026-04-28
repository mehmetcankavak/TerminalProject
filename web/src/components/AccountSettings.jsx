import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'

export default function AccountSettings() {
  const { user, token, plan, logout } = useAuth()
  const isPro = plan === 'pro'
  const goUpgrade = () => {
    window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page: 'upgrade' } }))
  }

  const [pwForm, setPwForm]                   = useState({ current: '', next: '', confirm: '' })
  const [pwError, setPwError]                 = useState('')
  const [pwSuccess, setPwSuccess]             = useState(false)
  const [pwLoading, setPwLoading]             = useState(false)

  // Email
  const [emailSettings, setEmailSettings] = useState(null)
  const [emailSaving, setEmailSaving]     = useState(false)
  const [emailMsg, setEmailMsg]           = useState('')

  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/api/email/settings`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setEmailSettings(d))
      .catch(() => setEmailSettings({ enabled: false, notify_news: false, notify_orders: true, notify_alerts: true }))
  }, [token])

  const handleEmailSave = async () => {
    setEmailSaving(true); setEmailMsg('')
    try {
      const res = await fetch(`${API_BASE}/api/email/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(emailSettings),
      })
      if (res.ok) { setEmailMsg('✓ Saved'); setEmailSettings(p => ({ ...p, enabled: true })) }
      else setEmailMsg('Something went wrong')
    } catch { setEmailMsg('Connection error') }
    finally { setEmailSaving(false) }
  }

  const handleEmailDisable = async () => {
    setEmailSaving(true)
    try {
      await fetch(`${API_BASE}/api/email/settings`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      setEmailSettings(p => ({ ...p, enabled: false })); setEmailMsg('')
    } catch { /* silent — next poll will retry */ }
    finally { setEmailSaving(false) }
  }

  // Telegram
  const [tgStatus, setTgStatus]       = useState(null)   // null=yükleniyor, {connected}
  const [tgChatId, setTgChatId]       = useState('')
  const [tgLoading, setTgLoading]     = useState(false)
  const [tgMsg, setTgMsg]             = useState('')
  const [tgSettings, setTgSettings]   = useState({ notify_news: true, notify_orders: true, notify_alerts: true })

  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/api/telegram/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setTgStatus(d); if (d.connected) setTgSettings({ notify_news: d.notify_news, notify_orders: d.notify_orders, notify_alerts: d.notify_alerts }) })
      .catch(() => setTgStatus({ connected: false }))
  }, [token])

  const handleTgConnect = async (e) => {
    e.preventDefault()
    setTgMsg('')
    setTgLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/telegram/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chat_id: tgChatId, ...tgSettings }),
      })
      const data = await res.json()
      if (res.ok) {
        setTgStatus({ connected: true, chat_id: tgChatId, ...tgSettings })
        setTgMsg('✓ Telegram connected! A test message has been sent.')
      } else {
        setTgMsg(`Error: ${data.detail || 'Connection failed'}`)
      }
    } catch { setTgMsg('Connection error') }
    finally { setTgLoading(false) }
  }

  const handleTgDisconnect = async () => {
    setTgLoading(true)
    try {
      await fetch(`${API_BASE}/api/telegram/connect`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      setTgStatus({ connected: false })
      setTgChatId('')
      setTgMsg('')
    } catch { /* silent */ }
    finally { setTgLoading(false) }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPwError('')
    setPwSuccess(false)
    if (pwForm.next !== pwForm.confirm) { setPwError('Passwords do not match'); return }
    if (pwForm.next.length < 8)         { setPwError('Min. 8 characters');      return }
    setPwLoading(true)
    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.next }),
      })
      if (res.ok) {
        setPwSuccess(true)
        setPwForm({ current: '', next: '', confirm: '' })
      } else {
        const data = await res.json()
        setPwError(data.detail || 'Failed to change password')
      }
    } catch {
      setPwError('Network error')
    } finally {
      setPwLoading(false)
    }
  }

  return (
    <div className="account-settings">

      {/* ── Plan & Billing ── */}
      <div className="acc-section">
        <div className="acc-section-title">PLAN &amp; BILLING</div>

        <div className="acc-plan-row">
          <div className="acc-plan-info">
            <span className={`acc-plan-badge ${isPro ? 'acc-plan-pro' : 'acc-plan-free'}`}>
              {isPro ? 'PRO' : 'FREE'}
            </span>
            <div>
              <div className="acc-plan-name">{isPro ? 'Pro Plan' : 'Free Plan'}</div>
              <div className="acc-plan-sub">
                {isPro
                  ? user?.plan_expires_at
                    ? `Active until ${new Date(user.plan_expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                    : 'Active'
                  : 'Upgrade to unlock all 13 tools'}
              </div>
            </div>
          </div>
          {!isPro && (
            <button
              className="acc-btn acc-btn-pro"
              onClick={goUpgrade}
            >
              Upgrade to Pro →
            </button>
          )}
          {isPro && (
            <button
              className="acc-btn acc-btn-outline"
              onClick={goUpgrade}
            >
              Extend Plan →
            </button>
          )}
        </div>

        {isPro && user?.plan_expires_at && (
          <div className="acc-billing-note">
            Your PRO access expires on {new Date(user.plan_expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
            You can extend anytime by making another crypto payment.
          </div>
        )}
      </div>

      {/* ── Account Info ── */}
      <div className="acc-section">
        <div className="acc-section-title">ACCOUNT</div>
        <div className="acc-field-row">
          <span className="acc-field-label">EMAIL</span>
          <span className="acc-field-value">{user?.email}</span>
        </div>
        <div className="acc-field-row">
          <span className="acc-field-label">MEMBER SINCE</span>
          <span className="acc-field-value">
            {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}
          </span>
        </div>
      </div>

      {/* ── Change Password ── */}
      <div className="acc-section">
        <div className="acc-section-title">CHANGE PASSWORD</div>
        <form className="acc-pw-form" onSubmit={handleChangePassword}>
          <input
            className="acc-input"
            type="password"
            placeholder="Current password"
            value={pwForm.current}
            onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))}
            required
          />
          <input
            className="acc-input"
            type="password"
            placeholder="New password (min. 8 chars)"
            value={pwForm.next}
            onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))}
            required
          />
          <input
            className="acc-input"
            type="password"
            placeholder="Confirm new password"
            value={pwForm.confirm}
            onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
            required
          />
          {pwError   && <div className="acc-msg acc-msg-error">{pwError}</div>}
          {pwSuccess && <div className="acc-msg acc-msg-ok">Password updated successfully.</div>}
          <button className="acc-btn acc-btn-outline" type="submit" disabled={pwLoading}>
            {pwLoading ? <span className="auth-spinner" /> : 'Update Password'}
          </button>
        </form>
      </div>

      {/* ── Email Notifications ── */}
      <div className="acc-section">
        <div className="acc-section-title">EMAIL NOTIFICATIONS</div>
        {emailSettings === null ? (
          <div className="acc-field-row"><span className="acc-field-label">Loading…</span></div>
        ) : (
          <div>
            <div className="acc-billing-note" style={{ marginBottom: 12 }}>
              Notifications will be sent to <b>{user?.email}</b>.
              {!emailSettings.enabled && <span style={{ color: '#4e4d49' }}> (Disabled)</span>}
              {emailSettings.enabled && <span style={{ color: '#00d992' }}> (Active)</span>}
            </div>
            <div style={{ display: 'flex', gap: 16, margin: '8px 0 12px' }}>
              {[['notify_alerts', 'Price Alerts'], ['notify_orders', 'Orders'], ['notify_news', 'HIGH Priority News']].map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#b0ada8', cursor: 'pointer' }}>
                  <input type="checkbox"
                    checked={emailSettings[key] ?? false}
                    onChange={e => setEmailSettings(p => ({ ...p, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
            </div>
            {emailMsg && <div className={`acc-msg ${emailMsg.startsWith('✓') ? 'acc-msg-ok' : 'acc-msg-error'}`}>{emailMsg}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="acc-btn acc-btn-outline" style={{ fontSize: 12 }} onClick={handleEmailSave} disabled={emailSaving}>
                {emailSaving ? <span className="auth-spinner" /> : 'Save'}
              </button>
              {emailSettings.enabled && (
                <button className="acc-btn acc-btn-danger" style={{ fontSize: 12 }} onClick={handleEmailDisable} disabled={emailSaving}>
                  Disable
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Telegram Notifications ── */}
      <div className="acc-section">
        <div className="acc-section-title">TELEGRAM NOTIFICATIONS</div>
        {tgStatus === null ? (
          <div className="acc-field-row"><span className="acc-field-label">Loading…</span></div>
        ) : tgStatus.connected ? (
          <div>
            <div className="acc-field-row">
              <span className="acc-field-label">STATUS</span>
              <span className="acc-field-value" style={{ color: '#00d992' }}>● Connected · {tgStatus.chat_id}</span>
            </div>
            <div className="acc-field-row" style={{ gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
              {[['notify_news', 'HIGH Priority News'], ['notify_orders', 'Orders'], ['notify_alerts', 'Price Alerts']].map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#b0ada8', cursor: 'pointer' }}>
                  <input type="checkbox" checked={tgSettings[key]} onChange={e => setTgSettings(p => ({ ...p, [key]: e.target.checked }))} />
                  {label}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="acc-btn acc-btn-outline" style={{ fontSize: 12 }}
                onClick={() => handleTgConnect({ preventDefault: () => {} })} disabled={tgLoading}>
                {tgLoading ? <span className="auth-spinner" /> : 'Update Settings'}
              </button>
              <button className="acc-btn acc-btn-danger" style={{ fontSize: 12 }} onClick={handleTgDisconnect} disabled={tgLoading}>
                Disconnect
              </button>
            </div>
            {tgMsg && <div className={`acc-msg ${tgMsg.startsWith('✓') ? 'acc-msg-ok' : 'acc-msg-error'}`}>{tgMsg}</div>}
          </div>
        ) : (
          <form onSubmit={handleTgConnect}>
            <div className="acc-billing-note" style={{ marginBottom: 12 }}>
              1. Open Telegram and send <code>/start</code> to <b>@TradingToolsBot</b>.<br />
              2. The bot will reply with your Chat ID — paste it below.
            </div>
            <input
              className="acc-input"
              type="text"
              placeholder="Chat ID (e.g. 123456789)"
              value={tgChatId}
              onChange={e => setTgChatId(e.target.value)}
              required
            />
            <div style={{ display: 'flex', gap: 16, margin: '10px 0' }}>
              {[['notify_news', 'HIGH Priority News'], ['notify_orders', 'Orders'], ['notify_alerts', 'Price Alerts']].map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#b0ada8', cursor: 'pointer' }}>
                  <input type="checkbox" checked={tgSettings[key]} onChange={e => setTgSettings(p => ({ ...p, [key]: e.target.checked }))} />
                  {label}
                </label>
              ))}
            </div>
            {tgMsg && <div className={`acc-msg ${tgMsg.startsWith('✓') ? 'acc-msg-ok' : 'acc-msg-error'}`}>{tgMsg}</div>}
            <button className="acc-btn acc-btn-outline" type="submit" disabled={tgLoading}>
              {tgLoading ? <span className="auth-spinner" /> : 'Connect Telegram →'}
            </button>
          </form>
        )}
      </div>

      {/* ── Danger zone ── */}
      <div className="acc-section acc-section-danger">
        <div className="acc-section-title">SESSION</div>
        <button className="acc-btn acc-btn-danger" onClick={logout}>
          Sign Out
        </button>
      </div>

    </div>
  )
}
