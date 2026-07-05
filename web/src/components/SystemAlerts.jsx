import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'

const STORAGE_KEY = 'nt_system_alerts'

const ALERT_TYPES = [
  { id: 'breaking',     name: 'Breaking Alerts',   desc: 'Trending & breaking news',    icon: 'BRK', color: '#8b5cf6' },
  { id: 'liquidations', name: 'Liquidations',       desc: 'Position > $500K liquidated', icon: 'LIQ', color: '#f43f5e' },
  { id: 'volume',       name: 'Volume Spike',       desc: '2× average in 15 min',        icon: 'VOL', color: '#00e87a' },
  { id: 'big-transfer', name: 'Big Transfer',       desc: 'On-chain move > $10M',        icon: 'TXN', color: '#3b82f6' },
  { id: 'token-unlock', name: 'Token Unlock',       desc: 'Unlock event in 3 days',      icon: 'UNL', color: '#8b5cf6' },
  { id: 'economic',     name: 'Economic Calendar',  desc: 'High-impact macro events',    icon: 'ECO', color: '#f59e0b' },
  { id: 'wallets',      name: 'Whale Wallets',      desc: 'Tracked wallet activity',     icon: 'WHL', color: '#06b6d4' },
  { id: 'price-alert',  name: 'Price Alerts',       desc: 'Target price reached',        icon: 'PRC', color: '#f97316' },
]

function fmtPrice(n) {
  if (!n) return '—'
  if (n >= 1000) return '$' + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return '$' + Number(n).toFixed(4)
}

function fmtDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function SystemAlerts() {
  const { token } = useAuth()

  const [prefs, setPrefs] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      const init = {}
      ALERT_TYPES.forEach(a => { init[a.id] = saved[a.id] ?? false })
      return init
    } catch {
      const init = {}
      ALERT_TYPES.forEach(a => { init[a.id] = false })
      return init
    }
  })

  const [priceAlerts,    setPriceAlerts]    = useState([])
  const [alertsLoading,  setAlertsLoading]  = useState(false)

  const fetchPriceAlerts = useCallback(async () => {
    if (!token) return
    setAlertsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/alerts`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) setPriceAlerts(await res.json())
    } catch {}
    setAlertsLoading(false)
  }, [token])

  useEffect(() => { fetchPriceAlerts() }, [fetchPriceAlerts])

  const toggle = (id) => {
    setPrefs(prev => {
      const next = { ...prev, [id]: !prev[id] }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const toggleAll = () => {
    const allOn = Object.values(prefs).every(v => v)
    const next = {}
    ALERT_TYPES.forEach(a => { next[a.id] = !allOn })
    setPrefs(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const activeAlerts    = priceAlerts.filter(a => !a.triggered)
  const triggeredAlerts = priceAlerts.filter(a =>  a.triggered)
  const enabledCount    = Object.values(prefs).filter(Boolean).length

  return (
    <div className="sa2-page">

      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="sa2-header">
        <div>
          <div className="sa2-title">System Alerts</div>
          <div className="sa2-subtitle">
            <span className="sa2-live-dot" />
            Notification Preferences · Preferences saved in browser
          </div>
        </div>
        <div className="sa2-header-stats">
          <div className="sa2-hstat">
            <span className="sa2-hstat-val" style={{ color: '#00e87a' }}>{enabledCount}</span>
            <span className="sa2-hstat-lbl">Enabled</span>
          </div>
          <div className="sa2-hstat">
            <span className="sa2-hstat-val">{ALERT_TYPES.length - enabledCount}</span>
            <span className="sa2-hstat-lbl">Disabled</span>
          </div>
          <div className="sa2-hstat">
            <span className="sa2-hstat-val" style={{ color: '#f59e0b' }}>{activeAlerts.length}</span>
            <span className="sa2-hstat-lbl">Price Active</span>
          </div>
        </div>
      </div>

      {/* ── Two-column grid ─────────────────────────────────────── */}
      <div className="sa2-grid">

        {/* ── Notification Preferences ──────────────────────────── */}
        <div className="sa2-card">
          <div className="sa2-card-hdr">
            <div>
              <div className="sa2-card-title">NOTIFICATION PREFERENCES</div>
              <div className="sa2-card-sub">Choose which alerts to receive</div>
            </div>
            <button className="sa2-toggle-all-btn" onClick={toggleAll}>
              {Object.values(prefs).every(v => v) ? 'Disable All' : 'Enable All'}
            </button>
          </div>

          <div className="sa2-notif-list">
            {ALERT_TYPES.map(at => {
              const on = prefs[at.id]
              return (
                <div key={at.id} className={`sa2-notif-row ${on ? 'sa2-notif-row-on' : ''}`} onClick={() => toggle(at.id)}>
                  {/* Left accent */}
                  <div className="sa2-notif-accent" style={{ background: on ? at.color : 'transparent' }} />

                  {/* Icon */}
                  <div className="sa2-notif-icon" style={{ background: on ? at.color + '22' : 'rgba(255,255,255,0.04)', color: on ? at.color : 'var(--text-muted)' }}>
                    {at.icon}
                  </div>

                  {/* Info */}
                  <div className="sa2-notif-info">
                    <div className="sa2-notif-name" style={{ color: on ? 'var(--text-primary)' : 'var(--text-muted)' }}>{at.name}</div>
                    <div className="sa2-notif-desc">{at.desc}</div>
                  </div>

                  {/* Toggle */}
                  <div className={`sa2-toggle ${on ? 'sa2-toggle-on' : ''}`} style={{ '--ton': at.color }}>
                    <div className="sa2-toggle-knob" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Price Alert Summary ───────────────────────────────── */}
        <div className="sa2-card">
          <div className="sa2-card-hdr">
            <div>
              <div className="sa2-card-title">PRICE ALERTS</div>
              <div className="sa2-card-sub">
                {priceAlerts.length > 0
                  ? `${activeAlerts.length} active · ${triggeredAlerts.length} triggered`
                  : 'Set in Custom Alerts page'}
              </div>
            </div>
            <button className="sa2-refresh-btn" onClick={fetchPriceAlerts} title="Refresh">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0018.49 15"/>
              </svg>
            </button>
          </div>

          <div className="sa2-alerts-body">
            {alertsLoading ? (
              <div className="sa2-empty">
                <div className="sa2-spinner" />
                <span>Loading…</span>
              </div>
            ) : priceAlerts.length === 0 ? (
              <div className="sa2-empty">
                <div className="sa2-empty-icon">—</div>
                <div className="sa2-empty-title">No price alerts</div>
                <div className="sa2-empty-sub">Go to Custom Alerts to set up price notifications</div>
              </div>
            ) : (
              <>
                {triggeredAlerts.length > 0 && (
                  <div className="sa2-alert-section">
                    <div className="sa2-section-label triggered">TRIGGERED</div>
                    {triggeredAlerts.map(a => (
                      <div key={a.id} className="sa2-alert-row sa2-alert-triggered">
                        <div className="sa2-alert-coin">
                          <span className="sa2-alert-sym">{a.coin}</span>
                          <span className="sa2-alert-pair">/USDT</span>
                        </div>
                        <div className={`sa2-alert-dir ${a.direction === 'above' ? 'up' : 'down'}`}>
                          {a.direction === 'above' ? '▲' : '▼'}
                        </div>
                        <div className="sa2-alert-target">{fmtPrice(a.target_price)}</div>
                        <div className="sa2-alert-date">{fmtDate(a.created_at)}</div>
                        <div className="sa2-alert-status triggered">✓ Done</div>
                      </div>
                    ))}
                  </div>
                )}

                {activeAlerts.length > 0 && (
                  <div className="sa2-alert-section">
                    <div className="sa2-section-label active">WATCHING</div>
                    {activeAlerts.map(a => (
                      <div key={a.id} className="sa2-alert-row sa2-alert-active">
                        <div className="sa2-alert-coin">
                          <span className="sa2-alert-sym">{a.coin}</span>
                          <span className="sa2-alert-pair">/USDT</span>
                        </div>
                        <div className={`sa2-alert-dir ${a.direction === 'above' ? 'up' : 'down'}`}>
                          {a.direction === 'above' ? '▲' : '▼'}
                        </div>
                        <div className="sa2-alert-target">{fmtPrice(a.target_price)}</div>
                        <div className="sa2-alert-date">{fmtDate(a.created_at)}</div>
                        <div className="sa2-alert-status active">● Active</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
