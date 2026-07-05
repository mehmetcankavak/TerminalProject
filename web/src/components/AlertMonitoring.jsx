import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'

function fmtDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function fmtPrice(n) {
  if (!n) return '—'
  if (n >= 1000) return '$' + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return '$' + Number(n).toFixed(4)
}

export default function AlertMonitoring() {
  const { token } = useAuth()
  const [alerts,  setAlerts]  = useState([])
  const [loading, setLoading] = useState(false)
  const [lastUp,  setLastUp]  = useState(null)

  const fetchAlerts = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) { setAlerts(await res.json()); setLastUp(new Date()) }
      else setAlerts([])
    } catch { setAlerts([]) }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => {
    fetchAlerts()
    const id = setInterval(fetchAlerts, 20_000)
    return () => clearInterval(id)
  }, [fetchAlerts])

  const active    = alerts.filter(a => !a.triggered)
  const triggered = alerts.filter(a =>  a.triggered)

  return (
    <div className="alm-page">

      {/* Header */}
      <div className="alm-header">
        <div className="alm-header-left">
          <div className="alm-title">Alert Monitoring</div>
          <div className="alm-subtitle">
            <span className="alm-live-dot" />
            Triggered Alerts History · 20s refresh
            {lastUp && <span className="alm-updated">↻ {lastUp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
        </div>
        <div className="alm-stats">
          <div className="alm-stat">
            <span className="alm-stat-val active">{active.length}</span>
            <span className="alm-stat-lbl">Active</span>
          </div>
          <div className="alm-stat-divider" />
          <div className="alm-stat">
            <span className="alm-stat-val triggered">{triggered.length}</span>
            <span className="alm-stat-lbl">Triggered</span>
          </div>
          <div className="alm-stat-divider" />
          <div className="alm-stat">
            <span className="alm-stat-val">{alerts.length}</span>
            <span className="alm-stat-lbl">Total</span>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && alerts.length === 0 ? (
        <div className="alm-loading">
          <div className="alm-spinner" />
          <span>Loading…</span>
        </div>
      ) : alerts.length === 0 ? (
        <div className="alm-empty">
          <div className="alm-empty-icon">🔔</div>
          <div className="alm-empty-title">No alerts yet</div>
          <div className="alm-empty-sub">Set up price alerts in Custom Alerts</div>
        </div>
      ) : (
        <div className="alm-list">

          {/* Column labels */}
          <div className="alm-col-labels">
            <span style={{ width: 80 }}>COIN</span>
            <span style={{ width: 90 }}>DIRECTION</span>
            <span style={{ flex: 1 }}>TARGET</span>
            <span style={{ width: 110 }}>DATE</span>
            <span style={{ width: 100 }}>STATUS</span>
          </div>

          {alerts.map(a => {
            const isTriggered = a.triggered
            const isUp = a.direction === 'above'
            return (
              <div key={a.id} className={`alm-row ${isTriggered ? 'alm-row-triggered' : 'alm-row-active'}`}>
                <div className="alm-row-coin" style={{ width: 80 }}>
                  <span className="alm-coin-sym">{a.coin}</span>
                  <span className="alm-coin-pair">/USDT</span>
                </div>
                <div style={{ width: 90 }}>
                  <span className={`alm-dir-badge ${isUp ? 'up' : 'down'}`}>
                    {isUp ? '▲ Above' : '▼ Below'}
                  </span>
                </div>
                <div style={{ flex: 1 }} className="alm-target">
                  {fmtPrice(a.target_price)}
                </div>
                <div style={{ width: 110 }} className="alm-date">
                  {fmtDate(a.created_at)}
                </div>
                <div style={{ width: 100 }}>
                  <span className={`alm-status-badge ${isTriggered ? 'triggered' : 'active'}`}>
                    {isTriggered ? '✓ Triggered' : '● Active'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
