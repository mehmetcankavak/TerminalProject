import { useState, useEffect, useCallback } from 'react'
import { Pencil, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'

/* ── Primitives ─────────────────────────────────────────────────── */
function Toggle({ value, onChange, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={!!value} disabled={disabled}
      className={`ws-toggle ${value ? 'on' : ''}`} onClick={() => !disabled && onChange(!value)} />
  )
}

function Group({ label, children }) {
  return (
    <div className="ws-setting-group">
      <div className="ws-setting-label">{label}</div>
      {children}
    </div>
  )
}

function Row({ label, sub, value, right }) {
  return (
    <div className={`ws-setting-row ${value === undefined ? 'ws-setting-row-2' : ''}`}>
      <div className="ws-setting-key">{label}{sub && <small>{sub}</small>}</div>
      {value !== undefined && <div className="ws-setting-val">{value}</div>}
      <div>{right}</div>
    </div>
  )
}

function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="ws-modal-overlay" onClick={onClose}>
      <div className="ws-modal" onClick={e => e.stopPropagation()}>
        <div className="ws-modal-head">
          <h3 className="ws-h3">{title}</h3>
          <button className="ws-iconbtn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="ws-modal-body">{children}</div>
      </div>
    </div>
  )
}

/* ── Name modal ─────────────────────────────────────────────────── */
function NameModal({ open, onClose, token, initial, onSaved }) {
  const [name, setName]       = useState(initial || '')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => { if (open) { setName(initial || ''); setError('') } }, [open, initial])

  const submit = async e => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.detail || 'Could not update name'); return }
      await onSaved()
      onClose()
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Name">
      <form className="ws-form" onSubmit={submit}>
        <div className="ws-field">
          <label>Display name</label>
          <input className="ws-input" value={name} onChange={e => setName(e.target.value)} maxLength={80} autoFocus />
        </div>
        {error && <div className="ws-note ws-note-err">{error}</div>}
        <div className="ws-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="ws-btn" onClick={onClose}>Cancel</button>
          <button className="ws-btn ws-btn-primary" type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}

/* ── Password modal ─────────────────────────────────────────────── */
function PasswordModal({ open, onClose, token }) {
  const [form, setForm]       = useState({ current: '', next: '', confirm: '' })
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

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
      if (res.ok) { setSuccess(true); setForm({ current: '', next: '', confirm: '' }) }
      else { const data = await res.json(); setError(data.detail || 'Failed to change password') }
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Change Password">
      <form className="ws-form" onSubmit={handleSubmit}>
        <input className="ws-input" type="password" placeholder="Current password" value={form.current} onChange={e => setForm(p => ({ ...p, current: e.target.value }))} required />
        <input className="ws-input" type="password" placeholder="New password (min. 8 chars)" value={form.next} onChange={e => setForm(p => ({ ...p, next: e.target.value }))} required />
        <input className="ws-input" type="password" placeholder="Confirm new password" value={form.confirm} onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))} required />
        {error   && <div className="ws-note ws-note-err">{error}</div>}
        {success && <div className="ws-note ws-note-ok">Password updated successfully.</div>}
        <button className="ws-btn ws-btn-primary" type="submit" disabled={loading}>{loading ? 'Updating…' : 'Update Password'}</button>
      </form>
    </Modal>
  )
}

/* ── Telegram modal ─────────────────────────────────────────────── */
const TG_KEYS = [['notify_alerts', 'Price Alerts'], ['notify_orders', 'Orders'], ['notify_news', 'High Priority News']]

function TelegramModal({ open, onClose, token, tgStatus, onConnected, onDisconnected }) {
  const [chatId, setChatId]     = useState('')
  const [settings, setSettings] = useState({ notify_news: true, notify_orders: true, notify_alerts: true })
  const [loading, setLoading]   = useState(false)
  const [msg, setMsg]           = useState('')

  useEffect(() => {
    if (open && tgStatus?.connected) {
      setSettings({ notify_news: tgStatus.notify_news ?? true, notify_orders: tgStatus.notify_orders ?? true, notify_alerts: tgStatus.notify_alerts ?? true })
    }
  }, [open, tgStatus])

  const post = async body => fetch(`${API_BASE}/api/telegram/connect`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  })

  const handleConnect = async e => {
    e.preventDefault(); setMsg(''); setLoading(true)
    try {
      const res = await post({ chat_id: chatId, ...settings })
      const data = await res.json()
      if (res.ok) { setMsg('✓ Telegram connected!'); onConnected({ chat_id: chatId, ...settings }) }
      else setMsg(`Error: ${data.detail || 'Connection failed'}`)
    } catch { setMsg('Connection error') }
    finally { setLoading(false) }
  }

  const handleUpdate = async () => {
    setLoading(true); setMsg('')
    try {
      const res = await post({ chat_id: tgStatus?.chat_id, ...settings })
      if (res.ok) { setMsg('✓ Settings updated'); onConnected({ ...tgStatus, ...settings }) }
      else setMsg('Failed to update')
    } catch { setMsg('Network error') }
    finally { setLoading(false) }
  }

  const handleDisconnect = async () => {
    setLoading(true)
    try {
      await fetch(`${API_BASE}/api/telegram/connect`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      onDisconnected(); onClose()
    } catch { /* keep the modal open so the user can retry */ }
    finally { setLoading(false) }
  }

  const connected = tgStatus?.connected
  const toggles = TG_KEYS.map(([key, label]) => (
    <Row key={key} label={label} right={<Toggle value={settings[key]} onChange={v => setSettings(p => ({ ...p, [key]: v }))} />} />
  ))

  return (
    <Modal open={open} onClose={onClose} title="Telegram Notifications">
      {connected ? (
        <div className="ws-form">
          <div className="ws-note ws-note-ok">Connected · {tgStatus.chat_id}</div>
          <div>{toggles}</div>
          {msg && <div className={`ws-note ${msg.startsWith('✓') ? 'ws-note-ok' : 'ws-note-err'}`}>{msg}</div>}
          <div className="ws-row">
            <button className="ws-btn ws-btn-primary" onClick={handleUpdate} disabled={loading}>Save Settings</button>
            <button className="ws-btn ws-btn-danger" onClick={handleDisconnect} disabled={loading}>Disconnect</button>
          </div>
        </div>
      ) : (
        <form className="ws-form" onSubmit={handleConnect}>
          <div className="ws-note">
            <span>1. Open Telegram and send <code>/start</code> to <b>@TradingToolsBot</b>.<br />2. The bot replies with your Chat ID — paste it below.</span>
          </div>
          <input className="ws-input" type="text" placeholder="Chat ID (e.g. 123456789)" value={chatId} onChange={e => setChatId(e.target.value)} required />
          <div>{toggles}</div>
          {msg && <div className={`ws-note ${msg.startsWith('✓') ? 'ws-note-ok' : 'ws-note-err'}`}>{msg}</div>}
          <button className="ws-btn ws-btn-primary" type="submit" disabled={loading}>{loading ? 'Connecting…' : 'Connect Telegram'}</button>
        </form>
      )}
    </Modal>
  )
}

/* ── Page ───────────────────────────────────────────────────────── */
const EMAIL_ROWS = [
  { key: 'enabled',       label: 'System Alerts',      sub: 'Receive important system alerts via email.' },
  { key: 'notify_alerts', label: 'Price Alerts',       sub: 'Get notified when your price alerts are triggered.' },
  { key: 'notify_orders', label: 'Order Fills',        sub: 'Receive a message when an order is filled.' },
  { key: 'notify_news',   label: 'High Priority News', sub: 'Get key market news as it breaks.' },
]

export default function AccountSettings() {
  const { user, token, logout, refreshUser } = useAuth()

  const [nameOpen, setNameOpen] = useState(false)
  const [pwOpen, setPwOpen]     = useState(false)
  const [tgOpen, setTgOpen]     = useState(false)

  const [emailSettings, setEmailSettings] = useState(null)
  const [emailSaving, setEmailSaving]     = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/api/email/settings`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setEmailSettings(d))
      .catch(() => setEmailSettings({ enabled: false, notify_news: false, notify_orders: true, notify_alerts: true }))
  }, [token])

  const saveEmailSettings = useCallback(async patch => {
    const next = { ...emailSettings, ...patch }
    setEmailSettings(next)
    try {
      await fetch(`${API_BASE}/api/email/settings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(next),
      })
    } catch { /* optimistic update stays; next load resyncs */ }
  }, [emailSettings, token])

  const handleEmailDisable = async () => {
    setEmailSaving(true)
    try {
      await fetch(`${API_BASE}/api/email/settings`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      setEmailSettings(p => ({ ...p, enabled: false }))
    } catch { /* leave as is */ }
    finally { setEmailSaving(false) }
  }

  const [tgStatus, setTgStatus] = useState(null)
  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/api/telegram/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setTgStatus(d))
      .catch(() => setTgStatus({ connected: false }))
  }, [token])

  const displayName = user?.name || (user?.email ? user.email.split('@')[0] : '—')

  return (
    <div className="ws-page acc-page">
      <div className="ws-page-head">
        <div className="ws-page-head-left"><h1 className="ws-title">Account Settings</h1></div>
      </div>

      <Group label="Account">
        <Row label="Name" value={displayName}
          right={<button className="ws-link" onClick={() => setNameOpen(true)}><Pencil size={15} /> Edit</button>} />
        <Row label="Email" value={user?.email || '—'}
          right={<span className="ws-link" style={{ opacity: 0.45, cursor: 'default' }} title="Email is your sign-in identity and cannot be changed here."><Pencil size={15} /> Edit</span>} />
      </Group>

      <Group label="Security">
        <Row label="Password" value={<span style={{ letterSpacing: '0.12em' }}>••••••••</span>}
          right={<button className="ws-btn" onClick={() => setPwOpen(true)}>Change Password</button>} />
      </Group>

      <Group label="Session">
        <Row label="Sign out from this account" sub="Ends your current session on this device."
          right={<button className="ws-btn ws-btn-danger" onClick={logout}>Sign Out</button>} />
      </Group>

      <Group label="Email Notifications">
        {emailSettings === null ? (
          <Row label="Loading…" />
        ) : EMAIL_ROWS.map(r => (
          <Row key={r.key} label={r.label} sub={r.sub}
            right={
              <Toggle
                value={r.key === 'enabled' ? !!emailSettings.enabled : (emailSettings[r.key] ?? true)}
                disabled={emailSaving}
                onChange={v => {
                  if (r.key === 'enabled') { if (v) saveEmailSettings({ enabled: true }); else handleEmailDisable() }
                  else saveEmailSettings({ [r.key]: v })
                }}
              />
            } />
        ))}
      </Group>

      <Group label="Telegram Notifications">
        <Row label="Telegram Status"
          sub={tgStatus === null ? 'Checking…' : tgStatus.connected ? `Connected · ${tgStatus.chat_id}` : 'Not connected'}
          right={
            <button className="ws-btn" onClick={() => setTgOpen(true)} disabled={tgStatus === null}>
              {tgStatus?.connected ? 'Telegram Settings' : 'Connect Telegram'}
            </button>
          } />
      </Group>

      <NameModal open={nameOpen} onClose={() => setNameOpen(false)} token={token} initial={user?.name || ''} onSaved={refreshUser} />
      <PasswordModal open={pwOpen} onClose={() => setPwOpen(false)} token={token} />
      <TelegramModal open={tgOpen} onClose={() => setTgOpen(false)} token={token} tgStatus={tgStatus}
        onConnected={status => setTgStatus({ connected: true, ...status })}
        onDisconnected={() => setTgStatus({ connected: false })} />
    </div>
  )
}
