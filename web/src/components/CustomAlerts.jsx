import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'

// Singleton AudioContext — browser max 6 limit aşılmasını engeller
let _alertCtx = null
function getAudioCtx() {
  if (!_alertCtx || _alertCtx.state === 'closed') {
    _alertCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
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

/* ── Alert Toast ── */
function Toast({ alerts, onDismiss }) {
  useEffect(() => {
    if (!alerts.length) return
    // 8 saniye sonra otomatik kapat
    const timer = setTimeout(() => {
      if (alerts[0]) onDismiss(alerts[0].id)
    }, 8000)
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
          <button
            className="toast-close"
            onClick={e => { e.stopPropagation(); onDismiss(a.id) }}
          >✕</button>
        </div>
      ))}
    </div>,
    document.body
  )
}

/* ── Alert Row ── */
function AlertRow({ alert, currentPrice, onDelete }) {
  const triggered = alert.triggered
  const dist = currentPrice
    ? ((alert.target_price - currentPrice) / currentPrice * 100)
    : null

  return (
    <div className={`ca-alert-row ${triggered ? 'ca-triggered' : ''}`}>
      <div className="ca-alert-coin">
        <span className="ca-coin-sym">{alert.coin}</span>
        <span className="ca-pair">/USDT</span>
      </div>

      <div className="ca-alert-cond">
        <span className={`ca-dir-badge ${alert.direction === 'above' ? 'dir-up' : 'dir-down'}`}>
          {alert.direction === 'above' ? '▲ Üstü' : '▼ Altı'}
        </span>
        <span className="ca-target">{fmtPrice(alert.target_price)}</span>
      </div>

      <div className="ca-alert-current">
        <span style={{ color: 'var(--text-secondary)' }}>Şu an</span>
        <span className="ca-current-price">{currentPrice ? fmtPrice(currentPrice) : '—'}</span>
      </div>

      <div className="ca-alert-dist">
        {dist !== null && (
          <span style={{ color: Math.abs(dist) < 2 ? '#fbbf24' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {dist > 0 ? '+' : ''}{dist.toFixed(2)}%
          </span>
        )}
      </div>

      <div className="ca-alert-status">
        {triggered
          ? <span className="ca-status triggered">✓ TETİKLENDİ</span>
          : <span className="ca-status active">● AKTİF</span>
        }
      </div>

      <button className="ca-delete" onClick={() => onDelete(alert.id)} title="Sil">✕</button>
    </div>
  )
}

export default function CustomAlerts() {
  const { token } = useAuth()
  const [alerts,     setAlerts]    = useState([])
  const [prices,     setPrices]    = useState({})
  const [toasts,     setToasts]    = useState([])
  const [form,       setForm]      = useState({ coin: 'BTC', direction: 'above', price: '' })
  const [creating,   setCreating]  = useState(false)
  const [error,      setError]     = useState('')
  const wsRef = useRef(null)
  const prevPrices = useRef({})
  const firedAlerts = useRef(new Set())
  const fetchPending = useRef(false)

  /* fetch alerts */
  const fetchAlerts = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/alerts`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) setAlerts(await res.json())
    } catch (err) { console.warn('[CustomAlerts] fetchAlerts error', err) }
  }, [token])

  useEffect(() => { fetchAlerts() }, [fetchAlerts])

  /* Binance WS fiyat */
  useEffect(() => {
    let retries = 0
    const MAX_RETRIES = 6
    let currentWs = null
    let unmounted = false

    function connect() {
      if (unmounted || retries >= MAX_RETRIES) return
      const streams = COINS.map(c => `${c.toLowerCase()}usdt@miniTicker`).join('/')
      const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`)
      currentWs = ws
      wsRef.current = ws

      ws.onopen = () => { retries = 0 }

      ws.onmessage = (e) => {
        try {
          const { data: d } = JSON.parse(e.data)
          if (!d) return
          const coin  = d.s.replace('USDT', '')
          const price = parseFloat(d.c)
          setPrices(prev => ({ ...prev, [coin]: price }))
        } catch { /* skip bad frame */ }
      }

      ws.onclose = () => {
        if (unmounted) return
        retries++
        if (retries < MAX_RETRIES) {
          const delay = Math.min(2000 * Math.pow(2, retries - 1), 30000)
          setTimeout(connect, delay)
        }
      }

      ws.onerror = () => { ws.close() }
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
        // Ses — çift bip (singleton AudioContext)
        try {
          const ctx = getAudioCtx()
          const freq = alert.direction === 'above' ? 880 : 440
          const bip = (startTime) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain); gain.connect(ctx.destination)
            osc.type = 'sine'
            osc.frequency.value = freq
            gain.gain.setValueAtTime(1.0, startTime)
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3)
            osc.start(startTime); osc.stop(startTime + 0.3)
          }
          bip(ctx.currentTime)
          bip(ctx.currentTime + 0.4)
        } catch (err) { console.warn('[CustomAlerts] alert sound error', err) }
        // Debounce: birden fazla alarm aynı anda tetiklenirse tek fetch
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
    if (!form.price || isNaN(parsed) || parsed <= 0) {
      setError('Geçerli bir fiyat gir (0\'dan büyük)')
      return
    }
    if (parsed > 1e9) {
      setError('Fiyat çok yüksek')
      return
    }
    setCreating(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ coin: form.coin, direction: form.direction, target_price: parseFloat(form.price) }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.detail || 'Hata')
      } else {
        setForm(f => ({ ...f, price: '' }))
        fetchAlerts()
      }
    } catch {
      setError('Bağlantı hatası')
    }
    setCreating(false)
  }

  const deletingRef = useRef(new Set())
  const handleDelete = async (id) => {
    if (deletingRef.current.has(id)) return
    deletingRef.current.add(id)
    try {
      await fetch(`${API_BASE}/api/alerts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      firedAlerts.current.delete(id)
      setAlerts(a => a.filter(x => x.id !== id))
    } catch (err) { console.warn('[CustomAlerts] delete error', err) }
    finally { deletingRef.current.delete(id) }
  }

  const activeAlerts    = alerts.filter(a => !a.triggered)
  const triggeredAlerts = alerts.filter(a => a.triggered)

  return (
    <div className="ca-page">
      <Toast alerts={toasts} onDismiss={id => setToasts(t => t.filter(x => x.id !== id))} />

      {/* Create form */}
      <div className="ca-form-card">
        <div className="ca-form-title">Yeni Fiyat Alarmı</div>
        <div className="ca-form-row">
          <select className="ca-select" value={form.coin} onChange={e => setForm(f => ({ ...f, coin: e.target.value }))}>
            {COINS.map(c => <option key={c} value={c}>{c}/USDT</option>)}
          </select>

          <select className="ca-select" value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}>
            <option value="above">▲ Üstüne çıkınca</option>
            <option value="below">▼ Altına düşünce</option>
          </select>

          <div className="ca-price-input-wrap">
            <span className="ca-dollar">$</span>
            <input
              className="ca-price-input"
              type="number"
              placeholder={prices[form.coin] ? prices[form.coin].toFixed(2) : 'Hedef fiyat'}
              value={form.price}
              onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
          </div>

          <button className="ca-create-btn" onClick={handleCreate} disabled={creating}>
            {creating ? '...' : '+ Alarm Ekle'}
          </button>
        </div>
        {error && <p className="ca-error">{error}</p>}
        {form.coin && prices[form.coin] && (
          <p className="ca-hint">Şu an: <strong>{fmtPrice(prices[form.coin])}</strong></p>
        )}
      </div>

      {/* Active alerts */}
      <div className="ca-section">
        <div className="ca-section-hdr">
          <span>Aktif Alarmlar</span>
          <span className="ca-count">{activeAlerts.length}</span>
        </div>
        {activeAlerts.length === 0
          ? <div className="ca-empty">Henüz aktif alarm yok</div>
          : activeAlerts.map(a => (
              <AlertRow key={a.id} alert={a} currentPrice={prices[a.coin]} onDelete={handleDelete} />
            ))
        }
      </div>

      {/* Triggered alerts */}
      {triggeredAlerts.length > 0 && (
        <div className="ca-section">
          <div className="ca-section-hdr">
            <span>Tetiklendi</span>
            <span className="ca-count triggered">{triggeredAlerts.length}</span>
          </div>
          {triggeredAlerts.map(a => (
            <AlertRow key={a.id} alert={a} currentPrice={prices[a.coin]} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
