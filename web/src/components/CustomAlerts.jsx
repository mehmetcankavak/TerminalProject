import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Bell, Trash2, ChevronDown } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'
import AssetLogo from './AssetLogo'

let _alertCtx = null
function getAudioCtx() {
  if (!_alertCtx || _alertCtx.state === 'closed')
    _alertCtx = new (window.AudioContext || window.webkitAudioContext)()
  if (_alertCtx.state === 'suspended') _alertCtx.resume()
  return _alertCtx
}

const COINS = ['BTC','ETH','SOL','XRP','BNB','DOGE','AVAX','LINK','ADA','DOT','MATIC','LTC','NEAR','APT','ARB','OP','INJ','SUI']

const fmtPrice = n => {
  if (!n && n !== 0) return '—'
  const v = Number(n)
  if (v >= 1000) return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (v >= 1) return v.toFixed(2)
  return v.toFixed(4)
}
const fmtDate = ts => {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/* ── Toast (portal, so it overlays everything) ─────────────────────────── */
function Toast({ alerts, onDismiss }) {
  useEffect(() => {
    if (!alerts.length) return
    const timer = setTimeout(() => { if (alerts[0]) onDismiss(alerts[0].id) }, 8000)
    return () => clearTimeout(timer)
  }, [alerts, onDismiss])
  if (!alerts.length) return null
  return createPortal(
    <div className="ct-workspace ws-toasts">
      {alerts.map(a => (
        <div key={a.id} className={`ws-toast ${a.direction === 'above' ? 'up' : 'down'}`}>
          <Bell size={16} />
          <div className="ws-flex-1">
            <b>{a.coin}/USDT</b> hit its target
            <div className="ws-muted ws-small">${fmtPrice(a.target_price)} · {a.direction === 'above' ? 'rose above' : 'fell below'}</div>
          </div>
          <button className="ws-iconbtn" onClick={e => { e.stopPropagation(); onDismiss(a.id) }}>✕</button>
        </div>
      ))}
    </div>,
    document.body,
  )
}

function SelectBox({ value, onChange, children, prefix }) {
  return (
    <div className="ws-inline-select ca-select">
      {prefix}<span className="ws-flex-1">{value}</span><ChevronDown size={16} className="ws-muted" />
      <select onChange={onChange}>{children}</select>
    </div>
  )
}

export default function CustomAlerts() {
  const { token } = useAuth()
  const [alerts, setAlerts]   = useState([])
  const [prices, setPrices]   = useState({})
  const [toasts, setToasts]   = useState([])
  const [view, setView]       = useState('all')
  const [form, setForm]       = useState(() => {
    try {
      const prefill = sessionStorage.getItem('ca_prefill_coin')
      if (prefill) {
        sessionStorage.removeItem('ca_prefill_coin')
        return { coin: COINS.includes(prefill.toUpperCase()) ? prefill.toUpperCase() : 'BTC', direction: 'above', price: '' }
      }
    } catch { /* sessionStorage blocked */ }
    return { coin: 'BTC', direction: 'above', price: '' }
  })
  const [creating, setCreating] = useState(false)
  const [error, setError]       = useState('')
  const prevPrices   = useRef({})
  const firedAlerts  = useRef(new Set())
  const fetchPending = useRef(false)
  const deletingRef  = useRef(new Set())

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/alerts`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) setAlerts(await res.json())
    } catch { /* keep the last list */ }
  }, [token])
  useEffect(() => { fetchAlerts() }, [fetchAlerts])

  /* Binance WS prices */
  useEffect(() => {
    let retries = 0, unmounted = false, currentWs = null
    function connect() {
      if (unmounted || retries >= 6) return
      const streams = COINS.map(c => `${c.toLowerCase()}usdt@miniTicker`).join('/')
      const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`)
      currentWs = ws
      ws.onopen = () => { retries = 0 }
      ws.onmessage = e => {
        try {
          const { data: d } = JSON.parse(e.data)
          if (d) setPrices(prev => ({ ...prev, [d.s.replace('USDT', '')]: parseFloat(d.c) }))
        } catch { /* ignore malformed frames */ }
      }
      ws.onclose = () => {
        if (unmounted) return
        retries++
        if (retries < 6) setTimeout(connect, Math.min(2000 * Math.pow(2, retries - 1), 30000))
      }
      ws.onerror = () => ws.close()
    }
    connect()
    return () => { unmounted = true; try { currentWs?.close() } catch { /* already closed */ } }
  }, [])

  /* Alert checker */
  useEffect(() => {
    if (!alerts.length) return
    alerts.forEach(alert => {
      if (alert.triggered) return
      const price = prices[alert.coin]
      if (!price) return
      const prev = prevPrices.current[alert.coin]
      const hit = alert.direction === 'above' ? price >= alert.target_price : price <= alert.target_price
      if (hit && prev !== undefined && !firedAlerts.current.has(alert.id)) {
        firedAlerts.current.add(alert.id)
        setToasts(t => [...t, { ...alert, id: alert.id + '_toast_' + Date.now() }])
        try {
          const ctx = getAudioCtx()
          const freq = alert.direction === 'above' ? 880 : 440
          const bip = t => {
            const osc = ctx.createOscillator(), gain = ctx.createGain()
            osc.connect(gain); gain.connect(ctx.destination)
            osc.type = 'sine'; osc.frequency.value = freq
            gain.gain.setValueAtTime(1.0, t)
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
            osc.start(t); osc.stop(t + 0.3)
          }
          bip(ctx.currentTime); bip(ctx.currentTime + 0.4)
        } catch { /* audio blocked */ }
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
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ coin: form.coin, direction: form.direction, target_price: parsed }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.detail || 'Error') }
      else { setForm(f => ({ ...f, price: '' })); fetchAlerts() }
    } catch { setError('Connection error') }
    setCreating(false)
  }

  const handleDelete = async id => {
    if (deletingRef.current.has(id)) return
    deletingRef.current.add(id)
    try {
      await fetch(`${API_BASE}/api/alerts/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      firedAlerts.current.delete(id)
      setAlerts(a => a.filter(x => x.id !== id))
    } catch { /* leave the row */ }
    finally { deletingRef.current.delete(id) }
  }

  const visible = useMemo(() => alerts.filter(a => view === 'all' || (view === 'active' ? !a.triggered : a.triggered)), [alerts, view])
  const currentPrice = prices[form.coin]

  return (
    <div className="ws-page">
      <Toast alerts={toasts} onDismiss={id => setToasts(t => t.filter(x => x.id !== id))} />

      <div className="ws-page-head">
        <div className="ws-page-head-left">
          <h1 className="ws-title">Custom Alerts</h1>
          <p className="ws-subtitle" style={{ fontSize: 15 }}>Set price alerts and stay informed about key market levels.</p>
        </div>
      </div>

      {/* Create */}
      <div className="ws-card">
        <div className="ws-card-body" style={{ padding: '22px 24px 26px' }}>
          <h2 className="ws-h2" style={{ marginBottom: 18 }}>Create Price Alert</h2>
          <div className="ca-form">
            <div className="ws-field">
              <label>Asset</label>
              <SelectBox value={`${form.coin}/USDT`} onChange={e => setForm(f => ({ ...f, coin: e.target.value }))}
                prefix={<span className="ws-asset-logo ws-asset-logo-sm"><AssetLogo symbol={form.coin} type="crypto" size={22} radius={11} /></span>}>
                {COINS.map(c => <option key={c} value={c}>{c}/USDT</option>)}
              </SelectBox>
            </div>
            <div className="ws-field">
              <label>Condition</label>
              <SelectBox value={form.direction === 'above' ? 'Rises above' : 'Falls below'} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}>
                <option value="above">Rises above</option>
                <option value="below">Falls below</option>
              </SelectBox>
            </div>
            <div className="ws-field">
              <label>Target Price (USDT) {currentPrice && <span className="ws-muted">· now {fmtPrice(currentPrice)}</span>}</label>
              <input className="ws-input ws-input-lg ws-mono" type="number" placeholder={currentPrice ? currentPrice.toFixed(2) : '75000.00'}
                value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleCreate()} />
            </div>
            <div className="ws-field">
              <label>&nbsp;</label>
              <button className="ws-btn ws-btn-primary ws-btn-lg" style={{ fontSize: 15, height: 50, padding: '0 22px' }} onClick={handleCreate} disabled={creating}>
                <Bell size={17} /> {creating ? 'Creating…' : 'Create Alert'}
              </button>
            </div>
          </div>
          {error && <div className="ws-note ws-note-err ws-mt-16">{error}</div>}
        </div>
      </div>

      {/* Existing */}
      <div className="ws-card ws-mt-16" style={{ minHeight: 420 }}>
        <div className="ws-card-body" style={{ padding: '22px 24px' }}>
          <div className="ws-row-between" style={{ marginBottom: 16 }}>
            <h2 className="ws-h2">Existing Alerts</h2>
            <div className="ws-row">
              <div className="ws-seg">
                {[['all', 'All'], ['active', 'Active'], ['triggered', 'Triggered']].map(([id, label]) => (
                  <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>{label}</button>
                ))}
              </div>
              <span className="ws-text" style={{ marginLeft: 8 }}>{alerts.length} alerts</span>
            </div>
          </div>
          <div className="ws-card ws-card-flat">
            <div className="ws-table-wrap">
              <table className="ws-table ws-table-tall">
                <thead>
                  <tr><th>Asset</th><th>Condition</th><th>Target Price (USDT)</th><th>Status</th><th>Created At</th><th className="ws-right">Actions</th></tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr><td colSpan={6}><div className="ws-empty"><div className="ws-empty-icon"><Bell size={26} strokeWidth={1.4} /></div><div className="ws-empty-title">{view === 'all' ? 'No alerts yet' : `No ${view} alerts`}</div><div className="ws-empty-sub">Create one above to get notified.</div></div></td></tr>
                  ) : visible.map(a => (
                    <tr key={a.id}>
                      <td><div className="ws-asset"><span className="ws-asset-logo ws-asset-logo-lg"><AssetLogo symbol={a.coin} type="crypto" size={36} radius={18} /></span><span className="ws-asset-sym" style={{ fontSize: 14 }}>{a.coin}/USDT</span></div></td>
                      <td className="ws-text" style={{ fontSize: 14 }}>{a.direction === 'above' ? 'Rises above' : 'Falls below'}</td>
                      <td className="ws-mono ws-ink" style={{ fontSize: 14 }}>{fmtPrice(a.target_price)}</td>
                      <td>{a.triggered
                        ? <span className="ws-badge ws-badge-neg ws-badge-dot">Triggered</span>
                        : <span className="ws-badge ws-badge-pos ws-badge-dot">Active</span>}</td>
                      <td className="ws-text ws-num" style={{ fontSize: 14 }}>{fmtDate(a.created_at)}</td>
                      <td className="ws-right"><button className="ws-iconbtn" title="Delete" onClick={() => handleDelete(a.id)}><Trash2 size={18} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
