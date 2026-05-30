import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'

let _alertCtx = null
function getAudioCtx() {
  if (!_alertCtx || _alertCtx.state === 'closed')
    _alertCtx = new (window.AudioContext || window.webkitAudioContext)()
  if (_alertCtx.state === 'suspended') _alertCtx.resume()
  return _alertCtx
}

const COINS = [
  'BTC','ETH','SOL','XRP','BNB','DOGE','AVAX','LINK','ADA','DOT',
  'MATIC','LTC','NEAR','APT','ARB','OP','INJ','SUI',
]

function fmtPrice(n) {
  if (!n) return '—'
  if (n >= 1000) return '$' + n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return '$' + n.toFixed(4)
}

/* ── Toast ─────────────────────────────────────────────────────── */
function Toast({ alerts, onDismiss }) {
  useEffect(() => {
    if (!alerts.length) return
    const timer = setTimeout(() => { if (alerts[0]) onDismiss(alerts[0].id) }, 8000)
    return () => clearTimeout(timer)
  }, [alerts, onDismiss])

  if (!alerts.length) return null
  return createPortal(
    <div className="alert-toasts">
      {alerts.map(a => (
        <div key={a.id} className={`alert-toast ${a.direction === 'above' ? 'toast-up' : 'toast-down'}`}>
          <span className="toast-icon">{a.direction === 'above' ? '▲' : '▼'}</span>
          <div className="toast-body">
            <strong>{a.coin}/USDT</strong> hedef fiyata ulaştı
            <div className="toast-detail">{fmtPrice(a.target_price)} {a.direction === 'above' ? 'üstüne çıktı' : 'altına düştü'}</div>
          </div>
          <button className="toast-close" onClick={e => { e.stopPropagation(); onDismiss(a.id) }}>✕</button>
        </div>
      ))}
    </div>,
    document.body
  )
}

/* ── Alert Row ─────────────────────────────────────────────────── */
function AlertRow({ alert, currentPrice, onDelete }) {
  const isUp      = alert.direction === 'above'
  const triggered = alert.triggered
  const tone      = isUp ? '#00e87a' : '#f43f5e'

  // Distance to target
  const dist = currentPrice
    ? ((alert.target_price - currentPrice) / currentPrice * 100)
    : null
  const distClose = dist !== null && Math.abs(dist) < 2

  // Proximity bar: how close current price is to target (0–100%)
  let proximity = null
  if (currentPrice && alert.target_price) {
    const range = alert.target_price * 0.1 // ±10% window
    const delta = alert.target_price - currentPrice
    proximity = Math.max(0, Math.min(100, 100 - (Math.abs(delta) / range) * 100))
  }

  return (
    <div className={`ca2-row ${triggered ? 'ca2-row-triggered' : ''}`}>
      {/* Left accent bar */}
      <div className="ca2-row-accent" style={{ background: triggered ? '#444' : tone }} />

      {/* Coin */}
      <div className="ca2-row-coin">
        <span className="ca2-sym">{alert.coin}</span>
        <span className="ca2-pair">/USDT</span>
      </div>

      {/* Direction + target */}
      <div className="ca2-row-cond">
        <span className={`ca2-dir ${isUp ? 'up' : 'down'}`}>
          {isUp ? '▲ Above' : '▼ Below'}
        </span>
        <span className="ca2-target">{fmtPrice(alert.target_price)}</span>
      </div>

      {/* Current price + proximity bar */}
      <div className="ca2-row-price">
        <div className="ca2-price-row">
          <span className="ca2-price-lbl">Current</span>
          <span className="ca2-price-val">{currentPrice ? fmtPrice(currentPrice) : '—'}</span>
        </div>
        {proximity !== null && !triggered && (
          <div className="ca2-prox-track">
            <div className="ca2-prox-fill" style={{ width: proximity + '%', background: distClose ? '#fbbf24' : tone }} />
          </div>
        )}
      </div>

      {/* Distance */}
      <div className="ca2-row-dist">
        {dist !== null && !triggered && (
          <span className="ca2-dist" style={{ color: distClose ? '#fbbf24' : 'var(--text-muted)' }}>
            {dist > 0 ? '+' : ''}{dist.toFixed(2)}%
          </span>
        )}
      </div>

      {/* Status */}
      <div className="ca2-row-status">
        {triggered
          ? <span className="ca2-badge triggered">✓ Triggered</span>
          : <span className="ca2-badge active">● Active</span>
        }
      </div>

      {/* Delete */}
      <button className="ca2-delete" onClick={() => onDelete(alert.id)} title="Delete">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  )
}

/* ── Main ──────────────────────────────────────────────────────── */
export default function CustomAlerts() {
  const { token } = useAuth()
  const [alerts,   setAlerts]   = useState([])
  const [prices,   setPrices]   = useState({})
  const [toasts,   setToasts]   = useState([])
  const [form,     setForm]     = useState(() => {
    try {
      const prefill = sessionStorage.getItem('ca_prefill_coin')
      if (prefill) {
        sessionStorage.removeItem('ca_prefill_coin')
        const coin = COINS.includes(prefill.toUpperCase()) ? prefill.toUpperCase() : 'BTC'
        return { coin, direction: 'above', price: '' }
      }
    } catch {}
    return { coin: 'BTC', direction: 'above', price: '' }
  })
  const [creating, setCreating] = useState(false)
  const [error,    setError]    = useState('')
  const wsRef        = useRef(null)
  const prevPrices   = useRef({})
  const firedAlerts  = useRef(new Set())
  const fetchPending = useRef(false)

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/alerts`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) setAlerts(await res.json())
    } catch {}
  }, [token])

  useEffect(() => { fetchAlerts() }, [fetchAlerts])

  /* Binance WS prices */
  useEffect(() => {
    let retries = 0, unmounted = false, currentWs = null
    function connect() {
      if (unmounted || retries >= 6) return
      const streams = COINS.map(c => `${c.toLowerCase()}usdt@miniTicker`).join('/')
      const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`)
      currentWs = ws; wsRef.current = ws
      ws.onopen  = () => { retries = 0 }
      ws.onmessage = (e) => {
        try {
          const { data: d } = JSON.parse(e.data)
          if (!d) return
          setPrices(prev => ({ ...prev, [d.s.replace('USDT', '')]: parseFloat(d.c) }))
        } catch {}
      }
      ws.onclose = () => {
        if (unmounted) return
        retries++
        if (retries < 6) setTimeout(connect, Math.min(2000 * Math.pow(2, retries - 1), 30000))
      }
      ws.onerror = () => ws.close()
    }
    connect()
    return () => { unmounted = true; try { currentWs?.close() } catch {} }
  }, [])

  /* Alert checker */
  useEffect(() => {
    if (!alerts.length) return
    alerts.forEach(alert => {
      if (alert.triggered) return
      const price = prices[alert.coin]
      if (!price) return
      const prev = prevPrices.current[alert.coin]
      const hit  = alert.direction === 'above' ? price >= alert.target_price : price <= alert.target_price
      if (hit && prev !== undefined && !firedAlerts.current.has(alert.id)) {
        firedAlerts.current.add(alert.id)
        setToasts(t => [...t, { ...alert, id: alert.id + '_toast_' + Date.now() }])
        try {
          const ctx  = getAudioCtx()
          const freq = alert.direction === 'above' ? 880 : 440
          const bip  = (t) => {
            const osc = ctx.createOscillator(), gain = ctx.createGain()
            osc.connect(gain); gain.connect(ctx.destination)
            osc.type = 'sine'; osc.frequency.value = freq
            gain.gain.setValueAtTime(1.0, t)
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
            osc.start(t); osc.stop(t + 0.3)
          }
          bip(ctx.currentTime); bip(ctx.currentTime + 0.4)
        } catch {}
        if (!fetchPending.current) {
          fetchPending.current = true
          setTimeout(() => { fetchAlerts(); fetchPending.current = false }, 600)
        }
      }
      prevPrices.current[alert.coin] = price
    })
  }, [prices, alerts, fetchAlerts])

  const handleCreate = async () => {
    const parsed = parseFloat(form.price)
    if (!form.price || isNaN(parsed) || parsed <= 0) { setError('Enter a valid price greater than 0'); return }
    if (parsed > 1e9) { setError('Price too high'); return }
    setCreating(true); setError('')
    try {
      const res = await fetch(`${API_BASE}/api/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ coin: form.coin, direction: form.direction, target_price: parsed }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.detail || 'Error') }
      else { setForm(f => ({ ...f, price: '' })); fetchAlerts() }
    } catch { setError('Connection error') }
    setCreating(false)
  }

  const deletingRef = useRef(new Set())
  const handleDelete = async (id) => {
    if (deletingRef.current.has(id)) return
    deletingRef.current.add(id)
    try {
      await fetch(`${API_BASE}/api/alerts/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      firedAlerts.current.delete(id)
      setAlerts(a => a.filter(x => x.id !== id))
    } catch {}
    finally { deletingRef.current.delete(id) }
  }

  const activeAlerts    = alerts.filter(a => !a.triggered)
  const triggeredAlerts = alerts.filter(a =>  a.triggered)
  const currentPrice    = prices[form.coin]

  return (
    <div className="ca2-page">
      <Toast alerts={toasts} onDismiss={id => setToasts(t => t.filter(x => x.id !== id))} />

      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="ca2-header">
        <div>
          <div className="ca2-title">Custom Alerts</div>
          <div className="ca2-subtitle">
            <span className="ca2-live-dot" />
            Real-time · Binance prices · Audio notification
          </div>
        </div>
        <div className="ca2-header-stats">
          <div className="ca2-hstat active">
            <span className="ca2-hstat-val">{activeAlerts.length}</span>
            <span className="ca2-hstat-lbl">Active</span>
          </div>
          <div className="ca2-hstat triggered">
            <span className="ca2-hstat-val">{triggeredAlerts.length}</span>
            <span className="ca2-hstat-lbl">Triggered</span>
          </div>
        </div>
      </div>

      {/* ── Create Form ─────────────────────────────────────────── */}
      <div className="ca2-form-card">
        <div className="ca2-form-label">NEW PRICE ALERT</div>

        <div className="ca2-form-body">
          {/* Coin select */}
          <div className="ca2-field">
            <label className="ca2-field-lbl">Coin</label>
            <select className="ca2-select" value={form.coin} onChange={e => setForm(f => ({ ...f, coin: e.target.value }))}>
              {COINS.map(c => <option key={c} value={c}>{c}/USDT</option>)}
            </select>
          </div>

          {/* Direction select */}
          <div className="ca2-field">
            <label className="ca2-field-lbl">Condition</label>
            <select className="ca2-select" value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}>
              <option value="above">▲ Rises above</option>
              <option value="below">▼ Falls below</option>
            </select>
          </div>

          {/* Target price */}
          <div className="ca2-field ca2-field-price">
            <label className="ca2-field-lbl">
              Target Price
              {currentPrice && (
                <span className="ca2-field-hint">Now: <strong>{fmtPrice(currentPrice)}</strong></span>
              )}
            </label>
            <div className="ca2-price-wrap">
              <span className="ca2-price-dollar">$</span>
              <input
                className="ca2-price-input"
                type="number"
                placeholder={currentPrice ? currentPrice.toFixed(2) : 'Enter price'}
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>
          </div>

          {/* Submit */}
          <div className="ca2-field ca2-field-submit">
            <label className="ca2-field-lbl">&nbsp;</label>
            <button className="ca2-submit-btn" onClick={handleCreate} disabled={creating}>
              {creating
                ? <><span className="ca2-btn-spinner" /> Creating…</>
                : <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Add Alert
                  </>
              }
            </button>
          </div>
        </div>

        {error && <div className="ca2-error">{error}</div>}
      </div>

      {/* ── Active Alerts ───────────────────────────────────────── */}
      <div className="ca2-section">
        <div className="ca2-section-hdr">
          <span className="ca2-section-label">ACTIVE ALERTS</span>
          <span className="ca2-section-count active">{activeAlerts.length}</span>
        </div>

        {activeAlerts.length === 0 ? (
          <div className="ca2-empty">
            <div className="ca2-empty-icon">🔔</div>
            <div>No active alerts</div>
            <div className="ca2-empty-sub">Create one above to get notified</div>
          </div>
        ) : (
          <div className="ca2-list">
            <div className="ca2-col-labels">
              <div style={{ width: 32 }} />
              <div style={{ width: 80 }}>COIN</div>
              <div style={{ width: 160 }}>CONDITION</div>
              <div style={{ flex: 1 }}>CURRENT · PROXIMITY</div>
              <div style={{ width: 70 }}>DISTANCE</div>
              <div style={{ width: 100 }}>STATUS</div>
              <div style={{ width: 36 }} />
            </div>
            {activeAlerts.map(a => (
              <AlertRow key={a.id} alert={a} currentPrice={prices[a.coin]} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>

      {/* ── Triggered Alerts ────────────────────────────────────── */}
      {triggeredAlerts.length > 0 && (
        <div className="ca2-section">
          <div className="ca2-section-hdr">
            <span className="ca2-section-label">TRIGGERED</span>
            <span className="ca2-section-count triggered">{triggeredAlerts.length}</span>
          </div>
          <div className="ca2-list">
            {triggeredAlerts.map(a => (
              <AlertRow key={a.id} alert={a} currentPrice={prices[a.coin]} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
