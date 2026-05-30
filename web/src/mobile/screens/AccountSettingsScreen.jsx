import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { haptic } from '../../capacitor'
import { API_BASE } from '../../config'
import { useTheme } from '../../hooks/useTheme'

// ─── iOS Toggle ──────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }) {
  return (
    <div
      onClick={() => { haptic('light'); onChange(!checked) }}
      style={{
        width: 44, height: 26, borderRadius: 13, flexShrink: 0, cursor: 'pointer',
        background: checked ? '#00d992' : 'rgba(255,255,255,0.12)',
        transition: 'background 0.2s ease', position: 'relative',
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: checked ? 21 : 3,
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s ease',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }} />
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, color: '#444', letterSpacing: 1.2, padding: '20px 20px 8px' }}>
      {children}
    </div>
  )
}

// ─── List Row ─────────────────────────────────────────────────────────────────
function Row({ label, value, accent, chevron, danger, onPress }) {
  return (
    <div
      onClick={onPress}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        cursor: onPress ? 'pointer' : 'default',
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 600, color: danger ? '#f43f5e' : '#fff' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {value && <span style={{ fontSize: 14, color: accent ? '#00d992' : '#555', fontWeight: 500 }}>{value}</span>}
        {chevron && <span style={{ color: '#333', fontSize: 18, lineHeight: 1 }}>›</span>}
      </div>
    </div>
  )
}

// ─── Bottom Sheet ─────────────────────────────────────────────────────────────
function Sheet({ open, onClose, title, children }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    setTimeout(() => document.addEventListener('touchstart', handler), 100)
    return () => document.removeEventListener('touchstart', handler)
  }, [open, onClose])

  if (!open) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end',
    }}>
      <div ref={ref} style={{
        width: '100%', background: 'var(--bg-2)', borderRadius: '20px 20px 0 0',
        padding: '0 0 40px', maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '12px auto 0' }} />
        <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', textAlign: 'center', padding: '14px 20px 4px' }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

// ─── Input Field ──────────────────────────────────────────────────────────────
function Input({ placeholder, value, onChange, type = 'text' }) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', boxSizing: 'border-box',
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12, padding: '13px 16px', fontSize: 15, color: '#fff',
        outline: 'none', fontFamily: 'inherit',
      }}
    />
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AccountSettingsScreen() {
  const { theme, setTheme } = useTheme()
  const { user, token, plan, logout } = useAuth()
  const isPro = plan === 'pro'

  // Password
  const [pwSheet,   setPwSheet]   = useState(false)
  const [pwForm,    setPwForm]    = useState({ current: '', next: '', confirm: '' })
  const [pwError,   setPwError]   = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)

  // Email notifications
  const [emailSettings, setEmailSettings] = useState(null)
  const [emailSaving,   setEmailSaving]   = useState(false)
  const [emailMsg,      setEmailMsg]      = useState('')

  // Telegram
  const [tgStatus,   setTgStatus]   = useState(null)
  const [tgSheet,    setTgSheet]    = useState(false)
  const [tgChatId,   setTgChatId]   = useState('')
  const [tgLoading,  setTgLoading]  = useState(false)
  const [tgMsg,      setTgMsg]      = useState('')
  const [tgSettings, setTgSettings] = useState({ notify_news: true, notify_orders: true, notify_alerts: true })

  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/api/email/settings`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setEmailSettings(d))
      .catch(() => setEmailSettings({ enabled: false, notify_news: false, notify_orders: true, notify_alerts: true }))

    fetch(`${API_BASE}/api/telegram/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        setTgStatus(d)
        if (d.connected) setTgSettings({ notify_news: d.notify_news, notify_orders: d.notify_orders, notify_alerts: d.notify_alerts })
      })
      .catch(() => setTgStatus({ connected: false }))
  }, [token])

  const handleEmailToggle = async (key, val) => {
    const next = { ...emailSettings, [key]: val }
    setEmailSettings(next)
    setEmailSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/email/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...next, enabled: true }),
      })
      if (res.ok) setEmailMsg('Saved')
      else setEmailMsg('Error')
    } catch { setEmailMsg('Error') }
    finally { setEmailSaving(false); setTimeout(() => setEmailMsg(''), 2000) }
  }

  const handleEmailMasterToggle = async (val) => {
    if (!val) {
      setEmailSaving(true)
      try {
        await fetch(`${API_BASE}/api/email/settings`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
        setEmailSettings(p => ({ ...p, enabled: false }))
      } catch {}
      finally { setEmailSaving(false) }
    } else {
      handleEmailToggle('enabled', true)
    }
  }

  const handleTgConnect = async () => {
    setTgMsg(''); setTgLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/telegram/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chat_id: tgChatId, ...tgSettings }),
      })
      const data = await res.json()
      if (res.ok) {
        setTgStatus({ connected: true, chat_id: tgChatId, ...tgSettings })
        setTgSheet(false); setTgMsg('')
      } else {
        setTgMsg(data.detail || 'Connection failed')
      }
    } catch { setTgMsg('Connection error') }
    finally { setTgLoading(false) }
  }

  const handleTgDisconnect = async () => {
    setTgLoading(true)
    try {
      await fetch(`${API_BASE}/api/telegram/connect`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      setTgStatus({ connected: false }); setTgChatId(''); setTgMsg('')
    } catch {}
    finally { setTgLoading(false) }
  }

  const handleTgSettingsSave = async () => {
    setTgLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/telegram/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chat_id: tgStatus.chat_id, ...tgSettings }),
      })
      if (res.ok) setTgStatus(p => ({ ...p, ...tgSettings }))
    } catch {}
    finally { setTgLoading(false) }
  }

  const handleChangePassword = async () => {
    setPwError(''); setPwSuccess(false)
    if (pwForm.next !== pwForm.confirm) { setPwError('Passwords do not match'); return }
    if (pwForm.next.length < 8)         { setPwError('Min. 8 characters'); return }
    setPwLoading(true)
    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.next }),
      })
      if (res.ok) {
        setPwSuccess(true); setPwForm({ current: '', next: '', confirm: '' })
        setTimeout(() => { setPwSuccess(false); setPwSheet(false) }, 1500)
      } else {
        const data = await res.json()
        setPwError(data.detail || 'Failed')
      }
    } catch { setPwError('Network error') }
    finally { setPwLoading(false) }
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', color: 'var(--text)', paddingBottom: 40 }}>

      {/* ── Profile Card ── */}
      <div style={{ margin: '16px 16px 0', background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #00d99233, #00d99211)',
            border: '1px solid rgba(0,217,146,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 800, color: '#00d992',
          }}>
            {(user?.email?.[0] || '?').toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email}
            </div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 3 }}>
              Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}
            </div>
          </div>
          <div style={{
            padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
            background: isPro ? 'rgba(0,217,146,0.15)' : 'rgba(255,255,255,0.07)',
            color: isPro ? '#00d992' : '#555',
            border: `1px solid ${isPro ? 'rgba(0,217,146,0.3)' : 'rgba(255,255,255,0.08)'}`,
          }}>
            {isPro ? '✦ PRO' : 'FREE'}
          </div>
        </div>

        {isPro && user?.plan_expires_at && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(0,217,146,0.07)', borderRadius: 10, border: '1px solid rgba(0,217,146,0.15)' }}>
            <div style={{ fontSize: 12, color: '#00d992', fontWeight: 600 }}>
              Active until {new Date(user.plan_expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
        )}
      </div>

      {/* ── Plan ── */}
      <SectionTitle>PLAN &amp; BILLING</SectionTitle>
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, margin: '0 16px', overflow: 'hidden' }}>
        <Row
          label={isPro ? 'Extend Pro Plan' : 'Upgrade to Pro'}
          value={isPro ? 'Active' : 'Unlock all tools'}
          accent={isPro}
          chevron
          onPress={() => {
            haptic('light')
            window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page: 'upgrade' } }))
          }}
        />
      </div>

      {/* ── Appearance ── */}
      <SectionTitle>APPEARANCE</SectionTitle>
      <div style={{ background: 'var(--card)', borderRadius: 14, margin: '0 16px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Theme</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {theme === 'light' ? 'Light' : 'Dark'} mode
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-3)', borderRadius: 10, padding: 3 }}>
            {['dark', 'light'].map(t => (
              <button
                key={t}
                onClick={() => { haptic('light'); setTheme(t) }}
                style={{
                  border: 'none', cursor: 'pointer',
                  padding: '6px 14px', borderRadius: 8,
                  fontSize: 12, fontWeight: 700, letterSpacing: 0.4,
                  background: theme === t ? 'var(--green)' : 'transparent',
                  color: theme === t ? '#000' : 'var(--text-2)',
                  textTransform: 'capitalize',
                  transition: 'background 0.18s ease, color 0.18s ease',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Security ── */}
      <SectionTitle>SECURITY</SectionTitle>
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, margin: '0 16px', overflow: 'hidden' }}>
        <Row label="Change Password" chevron onPress={() => { haptic('light'); setPwSheet(true) }} />
      </div>

      {/* ── Email Notifications ── */}
      <SectionTitle>EMAIL NOTIFICATIONS</SectionTitle>
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, margin: '0 16px', overflow: 'hidden' }}>
        {emailSettings === null ? (
          <div style={{ padding: '14px 20px', color: '#444', fontSize: 14 }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Email Alerts</div>
                <div style={{ fontSize: 12, color: '#444', marginTop: 2 }}>{user?.email}</div>
              </div>
              <Toggle checked={!!emailSettings.enabled} onChange={v => handleEmailMasterToggle(v)} />
            </div>
            {[['notify_alerts', 'Price Alerts'], ['notify_orders', 'Orders'], ['notify_news', 'High Priority News']].map(([key, label]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 12px 36px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: 14, color: emailSettings.enabled ? '#bbb' : '#444' }}>{label}</span>
                <Toggle checked={!!emailSettings[key]} onChange={v => handleEmailToggle(key, v)} />
              </div>
            ))}
            {emailMsg && (
              <div style={{ padding: '8px 20px', fontSize: 12, color: '#00d992' }}>{emailMsg}</div>
            )}
          </>
        )}
      </div>

      {/* ── Telegram ── */}
      <SectionTitle>TELEGRAM NOTIFICATIONS</SectionTitle>
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, margin: '0 16px', overflow: 'hidden' }}>
        {tgStatus === null ? (
          <div style={{ padding: '14px 20px', color: '#444', fontSize: 14 }}>Loading…</div>
        ) : tgStatus.connected ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Telegram</div>
                <div style={{ fontSize: 12, color: '#00d992', marginTop: 2 }}>● Connected · {tgStatus.chat_id}</div>
              </div>
              <button
                onClick={() => { haptic('medium'); handleTgDisconnect() }}
                disabled={tgLoading}
                style={{ padding: '7px 14px', borderRadius: 10, border: '1px solid rgba(244,63,94,0.4)', background: 'rgba(244,63,94,0.1)', color: '#f43f5e', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Disconnect
              </button>
            </div>
            {[['notify_alerts', 'Price Alerts'], ['notify_orders', 'Orders'], ['notify_news', 'High Priority News']].map(([key, label]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 12px 36px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: 14, color: '#bbb' }}>{label}</span>
                <Toggle
                  checked={!!tgSettings[key]}
                  onChange={v => {
                    setTgSettings(p => ({ ...p, [key]: v }))
                    handleTgSettingsSave()
                  }}
                />
              </div>
            ))}
          </>
        ) : (
          <div
            onClick={() => { haptic('light'); setTgSheet(true) }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', cursor: 'pointer' }}
          >
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Connect Telegram</div>
              <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>Get alerts via @TradingToolsBot</div>
            </div>
            <span style={{ color: '#333', fontSize: 18 }}>›</span>
          </div>
        )}
      </div>

      {/* ── Sign Out ── */}
      <SectionTitle>SESSION</SectionTitle>
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, margin: '0 16px', overflow: 'hidden' }}>
        <div
          onClick={() => { haptic('medium'); logout() }}
          style={{ padding: '14px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <span style={{ fontSize: 15, fontWeight: 600, color: '#f43f5e' }}>Sign Out</span>
        </div>
      </div>

      {/* ── Change Password Sheet ── */}
      <Sheet open={pwSheet} onClose={() => { setPwSheet(false); setPwError(''); setPwSuccess(false) }} title="Change Password">
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input type="password" placeholder="Current password" value={pwForm.current} onChange={v => setPwForm(p => ({ ...p, current: v }))} />
          <Input type="password" placeholder="New password (min. 8 chars)" value={pwForm.next} onChange={v => setPwForm(p => ({ ...p, next: v }))} />
          <Input type="password" placeholder="Confirm new password" value={pwForm.confirm} onChange={v => setPwForm(p => ({ ...p, confirm: v }))} />
          {pwError   && <div style={{ fontSize: 13, color: '#f43f5e', fontWeight: 600 }}>{pwError}</div>}
          {pwSuccess && <div style={{ fontSize: 13, color: '#00d992', fontWeight: 600 }}>Password updated!</div>}
          <button
            onClick={() => { haptic('light'); handleChangePassword() }}
            disabled={pwLoading || !pwForm.current || !pwForm.next || !pwForm.confirm}
            style={{
              width: '100%', padding: '15px', borderRadius: 14, border: 'none', cursor: 'pointer',
              background: '#00d992', color: '#000', fontSize: 16, fontWeight: 800,
              opacity: pwLoading ? 0.6 : 1,
            }}>
            {pwLoading ? '…' : 'Update Password'}
          </button>
        </div>
      </Sheet>

      {/* ── Telegram Connect Sheet ── */}
      <Sheet open={tgSheet} onClose={() => { setTgSheet(false); setTgMsg('') }} title="Connect Telegram">
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '14px 16px', fontSize: 13, color: '#888', lineHeight: 1.6 }}>
            1. Open Telegram → search <span style={{ color: '#00d992', fontWeight: 700 }}>@TradingToolsBot</span>{'\n'}
            2. Send <span style={{ color: '#fff', fontWeight: 700 }}>/start</span>{'\n'}
            3. The bot will reply with your Chat ID
          </div>
          <Input placeholder="Chat ID (e.g. 123456789)" value={tgChatId} onChange={setTgChatId} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[['notify_alerts', 'Price Alerts'], ['notify_orders', 'Orders'], ['notify_news', 'High Priority News']].map(([key, label]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 4px' }}>
                <span style={{ fontSize: 14, color: '#bbb' }}>{label}</span>
                <Toggle checked={!!tgSettings[key]} onChange={v => setTgSettings(p => ({ ...p, [key]: v }))} />
              </div>
            ))}
          </div>

          {tgMsg && <div style={{ fontSize: 13, color: '#f43f5e', fontWeight: 600 }}>{tgMsg}</div>}

          <button
            onClick={() => { haptic('light'); handleTgConnect() }}
            disabled={tgLoading || !tgChatId.trim()}
            style={{
              width: '100%', padding: '15px', borderRadius: 14, border: 'none', cursor: 'pointer',
              background: '#00d992', color: '#000', fontSize: 16, fontWeight: 800,
              opacity: tgLoading || !tgChatId.trim() ? 0.5 : 1,
            }}>
            {tgLoading ? '…' : 'Connect →'}
          </button>
        </div>
      </Sheet>

    </div>
  )
}
