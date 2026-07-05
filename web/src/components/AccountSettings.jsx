import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'

/* ── iOS Toggle ─────────────────────────────────────────────────── */
function Toggle({ value, onChange, disabled }) {
  return (
    <button
      type="button"
      className={`acc2-toggle ${value ? 'on' : ''}`}
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      aria-checked={value}
      role="switch"
    >
      <div className="acc2-toggle-thumb" />
    </button>
  )
}

/* ── Section Label ──────────────────────────────────────────────── */
function SectionLabel({ children }) {
  return <div className="acc2-section-label">{children}</div>
}

/* ── Setting Card ───────────────────────────────────────────────── */
function SettingCard({ children }) {
  return <div className="acc2-setting-card">{children}</div>
}

/* ── Setting Row ────────────────────────────────────────────────── */
function SettingRow({ label, sub, right, last }) {
  return (
    <div className={`acc2-row ${last ? 'last' : ''}`}>
      <div className="acc2-row-text">
        <div className="acc2-row-label">{label}</div>
        {sub && <div className="acc2-row-sub">{sub}</div>}
      </div>
      {right && <div className="acc2-row-right">{right}</div>}
    </div>
  )
}

/* ── Modal ──────────────────────────────────────────────────────── */
function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="acc2-modal-overlay" onClick={onClose}>
      <div className="acc2-modal" onClick={e => e.stopPropagation()}>
        <div className="acc2-modal-header">
          <div className="acc2-modal-title">{title}</div>
          <button className="acc2-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="acc2-modal-body">{children}</div>
      </div>
    </div>
  )
}

/* ── Password Modal ─────────────────────────────────────────────── */
function PasswordModal({ open, onClose, token }) {
  const [form, setForm]         = useState({ current: '', next: '', confirm: '' })
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState(false)
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async e => {
    e.preventDefault()
    setError(''); setSuccess(false)
    if (form.next !== form.confirm) { setError('Passwords do not match'); return }
    if (form.next.length < 8)       { setError('Min. 8 characters');      return }
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_password: form.current, new_password: form.next }),
      })
      if (res.ok) {
        setSuccess(true)
        setForm({ current: '', next: '', confirm: '' })
      } else {
        const data = await res.json()
        setError(data.detail || 'Failed to change password')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Change Password">
      <form className="acc2-form" onSubmit={handleSubmit}>
        <input className="acc2-input" type="password" placeholder="Current password"
          value={form.current} onChange={e => setForm(p => ({ ...p, current: e.target.value }))} required />
        <input className="acc2-input" type="password" placeholder="New password (min. 8 chars)"
          value={form.next} onChange={e => setForm(p => ({ ...p, next: e.target.value }))} required />
        <input className="acc2-input" type="password" placeholder="Confirm new password"
          value={form.confirm} onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))} required />
        {error   && <div className="acc2-msg acc2-msg-error">{error}</div>}
        {success && <div className="acc2-msg acc2-msg-ok">Password updated successfully.</div>}
        <button className="acc2-btn acc2-btn-primary" type="submit" disabled={loading}>
          {loading ? <span className="auth-spinner" /> : 'Update Password'}
        </button>
      </form>
    </Modal>
  )
}

/* ── Telegram Modal ─────────────────────────────────────────────── */
function TelegramModal({ open, onClose, token, tgStatus, onConnected, onDisconnected }) {
  const [chatId, setChatId]     = useState('')
  const [settings, setSettings] = useState({ notify_news: true, notify_orders: true, notify_alerts: true })
  const [loading, setLoading]   = useState(false)
  const [msg, setMsg]           = useState('')

  useEffect(() => {
    if (open && tgStatus?.connected) {
      setSettings({
        notify_news:   tgStatus.notify_news   ?? true,
        notify_orders: tgStatus.notify_orders ?? true,
        notify_alerts: tgStatus.notify_alerts ?? true,
      })
    }
  }, [open, tgStatus])

  const handleConnect = async e => {
    e.preventDefault(); setMsg(''); setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/telegram/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chat_id: chatId, ...settings }),
      })
      const data = await res.json()
      if (res.ok) {
        setMsg('✓ Telegram connected!')
        onConnected({ chat_id: chatId, ...settings })
      } else {
        setMsg(`Error: ${data.detail || 'Connection failed'}`)
      }
    } catch { setMsg('Connection error') }
    finally { setLoading(false) }
  }

  const handleUpdate = async () => {
    setLoading(true); setMsg('')
    try {
      const res = await fetch(`${API_BASE}/api/telegram/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chat_id: tgStatus?.chat_id, ...settings }),
      })
      if (res.ok) { setMsg('✓ Settings updated'); onConnected({ ...tgStatus, ...settings }) }
      else setMsg('Failed to update')
    } catch { setMsg('Network error') }
    finally { setLoading(false) }
  }

  const handleDisconnect = async () => {
    setLoading(true)
    try {
      await fetch(`${API_BASE}/api/telegram/connect`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      onDisconnected()
      onClose()
    } catch {} finally { setLoading(false) }
  }

  const connected = tgStatus?.connected

  return (
    <Modal open={open} onClose={onClose} title="Telegram Notifications">
      {connected ? (
        <div className="acc2-form">
          <div className="acc2-tg-status">
            <span className="acc2-tg-dot" />
            <span>Connected · {tgStatus.chat_id}</span>
          </div>
          <div className="acc2-setting-card" style={{ marginTop: 12 }}>
            {[['notify_alerts', 'Price Alerts'], ['notify_orders', 'Orders'], ['notify_news', 'HIGH Priority News']].map(([key, label], i, arr) => (
              <SettingRow key={key} label={label} last={i === arr.length - 1}
                right={<Toggle value={settings[key]} onChange={v => setSettings(p => ({ ...p, [key]: v }))} />} />
            ))}
          </div>
          {msg && <div className={`acc2-msg ${msg.startsWith('✓') ? 'acc2-msg-ok' : 'acc2-msg-error'}`}>{msg}</div>}
          <div className="acc2-btn-row">
            <button className="acc2-btn acc2-btn-primary" onClick={handleUpdate} disabled={loading}>
              {loading ? <span className="auth-spinner" /> : 'Save Settings'}
            </button>
            <button className="acc2-btn acc2-btn-danger" onClick={handleDisconnect} disabled={loading}>
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <form className="acc2-form" onSubmit={handleConnect}>
          <div className="acc2-tg-hint">
            1. Open Telegram and send <code>/start</code> to <b>@TradingToolsBot</b>.<br />
            2. The bot will reply with your Chat ID — paste it below.
          </div>
          <input className="acc2-input" type="text" placeholder="Chat ID (e.g. 123456789)"
            value={chatId} onChange={e => setChatId(e.target.value)} required />
          <div className="acc2-setting-card">
            {[['notify_alerts', 'Price Alerts'], ['notify_orders', 'Orders'], ['notify_news', 'HIGH Priority News']].map(([key, label], i, arr) => (
              <SettingRow key={key} label={label} last={i === arr.length - 1}
                right={<Toggle value={settings[key]} onChange={v => setSettings(p => ({ ...p, [key]: v }))} />} />
            ))}
          </div>
          {msg && <div className={`acc2-msg ${msg.startsWith('✓') ? 'acc2-msg-ok' : 'acc2-msg-error'}`}>{msg}</div>}
          <button className="acc2-btn acc2-btn-primary" type="submit" disabled={loading}>
            {loading ? <span className="auth-spinner" /> : 'Connect Telegram →'}
          </button>
        </form>
      )}
    </Modal>
  )
}

/* ── Main ───────────────────────────────────────────────────────── */
export default function AccountSettings() {
  const { user, token, plan, logout } = useAuth()
  const isPro = plan === 'pro'

  const goUpgrade = () => window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page: 'upgrade' } }))

  // Modals
  const [pwOpen, setPwOpen]   = useState(false)
  const [tgOpen, setTgOpen]   = useState(false)

  // Email settings
  const [emailSettings, setEmailSettings] = useState(null)
  const [emailSaving, setEmailSaving]     = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/api/email/settings`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setEmailSettings(d))
      .catch(() => setEmailSettings({ enabled: false, notify_news: false, notify_orders: true, notify_alerts: true }))
  }, [token])

  const saveEmailSettings = useCallback(async (patch) => {
    const next = { ...emailSettings, ...patch }
    setEmailSettings(next)
    try {
      await fetch(`${API_BASE}/api/email/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(next),
      })
    } catch {}
  }, [emailSettings, token])

  const handleEmailDisable = async () => {
    setEmailSaving(true)
    try {
      await fetch(`${API_BASE}/api/email/settings`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      setEmailSettings(p => ({ ...p, enabled: false }))
    } catch {}
    finally { setEmailSaving(false) }
  }

  // Telegram
  const [tgStatus, setTgStatus] = useState(null)

  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/api/telegram/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setTgStatus(d))
      .catch(() => setTgStatus({ connected: false }))
  }, [token])

  const initial = user?.email?.charAt(0)?.toUpperCase() || '?'
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—'

  return (
    <div className="acc2-page">

      {/* ── Hero header ────────────────────────────────────────────── */}
      <div className="acc2-hero">
        <div className="acc2-hero-left">
          <div className="acc2-avatar-lg">{initial}</div>
          <div>
            <div className="acc2-hero-email">{user?.email}</div>
            <div className="acc2-hero-meta">Member since {memberSince}</div>
          </div>
        </div>
        <div className="acc2-hero-right">
          <span className={`acc2-plan-badge-lg ${isPro ? 'pro' : 'free'}`}>
            {isPro ? '✦ PRO' : 'FREE'}
          </span>
          {!isPro && (
            <button className="acc2-btn acc2-btn-pro acc2-upgrade-btn" onClick={goUpgrade}>
              Upgrade to Pro →
            </button>
          )}
          {isPro && user?.plan_expires_at && (
            <div className="acc2-hero-expiry">
              Active until {new Date(user.plan_expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          )}
        </div>
      </div>

      {/* ── 2-column grid ──────────────────────────────────────────── */}
      <div className="acc2-grid">

        {/* Left column */}
        <div className="acc2-col">

          <SectionLabel>ACCOUNT</SectionLabel>
          <SettingCard>
            <SettingRow label="Email" sub={user?.email} />
            <SettingRow label="Member since" sub={memberSince} last />
          </SettingCard>

          <SectionLabel>SECURITY</SectionLabel>
          <SettingCard>
            <SettingRow label="Password" sub="••••••••••••"
              right={
                <button className="acc2-btn acc2-btn-ghost" onClick={() => setPwOpen(true)}>
                  Change →
                </button>
              }
            />
            <SettingRow label="Plan" sub={isPro ? 'Pro — all tools unlocked' : 'Free — 13 tools locked'} last
              right={
                <button className={`acc2-btn ${isPro ? 'acc2-btn-outline' : 'acc2-btn-pro'}`} onClick={goUpgrade}>
                  {isPro ? 'Extend →' : 'Upgrade →'}
                </button>
              }
            />
          </SettingCard>

          <SectionLabel>SESSION</SectionLabel>
          <SettingCard>
            <SettingRow label="Sign Out" sub="Log out of this device" last
              right={
                <button className="acc2-btn acc2-btn-danger" onClick={logout}>
                  Sign Out
                </button>
              }
            />
          </SettingCard>

        </div>

        {/* Right column */}
        <div className="acc2-col">

          <SectionLabel>EMAIL NOTIFICATIONS</SectionLabel>
          <SettingCard>
            {emailSettings === null ? (
              <SettingRow label="Loading…" last />
            ) : (
              <>
                <SettingRow label="Email Alerts" sub={emailSettings.enabled ? 'Active · ' + user?.email : 'Disabled'}
                  right={
                    <Toggle
                      value={!!emailSettings.enabled}
                      onChange={v => { if (v) saveEmailSettings({ enabled: true }); else handleEmailDisable() }}
                      disabled={emailSaving}
                    />
                  }
                />
                <SettingRow label="Price Alerts"
                  right={<Toggle value={emailSettings.notify_alerts ?? true}
                    onChange={v => saveEmailSettings({ notify_alerts: v })} />}
                />
                <SettingRow label="Order Fills"
                  right={<Toggle value={emailSettings.notify_orders ?? true}
                    onChange={v => saveEmailSettings({ notify_orders: v })} />}
                />
                <SettingRow label="HIGH Priority News" last
                  right={<Toggle value={emailSettings.notify_news ?? false}
                    onChange={v => saveEmailSettings({ notify_news: v })} />}
                />
              </>
            )}
          </SettingCard>

          <SectionLabel>TELEGRAM NOTIFICATIONS</SectionLabel>
          <SettingCard>
            {tgStatus === null ? (
              <SettingRow label="Loading…" last />
            ) : (
              <SettingRow
                label="Telegram Bot"
                sub={tgStatus.connected ? `● Connected · ${tgStatus.chat_id}` : 'Not connected'}
                last
                right={
                  tgStatus.connected
                    ? <button className="acc2-btn acc2-btn-ghost" onClick={() => setTgOpen(true)}>Settings →</button>
                    : <button className="acc2-btn acc2-btn-outline" onClick={() => setTgOpen(true)}>Connect →</button>
                }
              />
            )}
          </SettingCard>

        </div>
      </div>

      {/* Modals */}
      <PasswordModal open={pwOpen} onClose={() => setPwOpen(false)} token={token} />
      <TelegramModal
        open={tgOpen}
        onClose={() => setTgOpen(false)}
        token={token}
        tgStatus={tgStatus}
        onConnected={status => setTgStatus({ connected: true, ...status })}
        onDisconnected={() => setTgStatus({ connected: false })}
      />

    </div>
  )
}
