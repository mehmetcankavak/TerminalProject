import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { haptic } from '../capacitor'
import { API_BASE } from '../config'

const QUICK_ACTIONS = [
  { id: 'terminal',       icon: '⚡', label: 'Trade' },
  { id: 'custom-alerts',  icon: '🔔', label: 'Alerts' },
  { id: 'smart-money',    icon: '🐋', label: 'Whales' },
  { id: 'markets',        icon: '◈',  label: 'Markets' },
  { id: 'funding-rate',   icon: '📊', label: 'Funding' },
  { id: 'volume-monitor', icon: '📈', label: 'Volume' },
  { id: 'big-transfers',  icon: '💸', label: 'Transfers' },
  { id: 'portfolio',      icon: '◎',  label: 'Portfolio' },
]

const TOP_COINS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP']

function useTicker() {
  const [prices, setPrices] = useState({})
  const [prev, setPrev]     = useState({})

  useEffect(() => {
    let ws
    const connect = () => {
      try {
        ws = new WebSocket('wss://stream.binance.com:9443/stream?streams=btcusdt@miniTicker/ethusdt@miniTicker/solusdt@miniTicker/bnbusdt@miniTicker/xrpusdt@miniTicker')
        ws.onmessage = (e) => {
          const { data: d } = JSON.parse(e.data)
          if (!d) return
          const sym = d.s.replace('USDT', '')
          const price = parseFloat(d.c)
          const change = parseFloat(d.P)
          setPrev(p => ({ ...p, [sym]: prices[sym]?.price }))
          setPrices(p => ({ ...p, [sym]: { price, change } }))
        }
      } catch {}
    }
    connect()
    return () => ws?.close()
  }, [])

  return { prices, prev }
}

function TickerCard({ sym, data, prevPrice }) {
  const isUp    = (data?.change ?? 0) >= 0
  const flashed = prevPrice !== undefined && prevPrice !== data?.price

  return (
    <div className={`m-ticker-card ${flashed ? (isUp ? 'flash-up' : 'flash-down') : ''}`}>
      <div className="m-ticker-sym">{sym}</div>
      <div className={`m-ticker-price ${isUp ? 'up' : 'down'}`}>
        {data?.price
          ? data.price >= 1000
            ? `$${data.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
            : `$${data.price.toLocaleString('en-US', { maximumFractionDigits: 4 })}`
          : '—'
        }
      </div>
      <div className={`m-ticker-chg ${isUp ? 'up' : 'down'}`}>
        {data?.change !== undefined ? `${isUp ? '+' : ''}${data.change.toFixed(2)}%` : '—'}
      </div>
    </div>
  )
}

function PortfolioHero({ token }) {
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/api/portfolio/summary`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setSummary(d))
      .catch(() => {})
  }, [token])

  const equity   = summary?.equity   ?? null
  const pnl      = summary?.pnl      ?? null
  const pnlPct   = summary?.pnl_pct  ?? null
  const isUp     = (pnl ?? 0) >= 0

  return (
    <div className="m-hero">
      <div className="m-hero-label">Portfolio Value</div>
      <div className="m-hero-value">
        {equity !== null
          ? `$${Number(equity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : <span className="m-hero-empty">Connect exchange</span>
        }
      </div>
      {pnl !== null && (
        <div className={`m-hero-pnl ${isUp ? 'up' : 'down'}`}>
          <span>{isUp ? '▲' : '▼'}</span>
          <span>${Math.abs(pnl).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          {pnlPct !== null && <span>({isUp ? '+' : ''}{pnlPct.toFixed(2)}%)</span>}
          <span className="m-hero-pnl-label">Today</span>
        </div>
      )}
      <div className="m-hero-glow" />
    </div>
  )
}

function RecentAlerts({ token }) {
  const [alerts, setAlerts] = useState([])

  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/api/alert-monitoring?limit=5`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : [])
      .then(d => Array.isArray(d) ? setAlerts(d.slice(0, 5)) : setAlerts([]))
      .catch(() => {})
  }, [token])

  if (!alerts.length) return null

  return (
    <div className="m-section">
      <div className="m-section-title">Recent Alerts</div>
      <div className="m-alerts-list">
        {alerts.map((a, i) => (
          <div key={i} className="m-alert-row">
            <div className="m-alert-dot" style={{ background: a.direction === 'above' ? '#00d992' : '#ef4444' }} />
            <div className="m-alert-body">
              <span className="m-alert-sym">{a.symbol}</span>
              <span className="m-alert-msg">{a.message || `Hit $${a.price}`}</span>
            </div>
            <div className="m-alert-time">
              {a.triggered_at ? new Date(a.triggered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function MobileDashboard({ onNavigate }) {
  const { token } = useAuth()
  const { prices, prev } = useTicker()

  const handleAction = (id) => {
    haptic('light')
    onNavigate(id)
  }

  return (
    <div className="m-dashboard">
      {/* Portfolio hero */}
      <PortfolioHero token={token} />

      {/* Quick actions */}
      <div className="m-section">
        <div className="m-section-title">Quick Access</div>
        <div className="m-quick-grid">
          {QUICK_ACTIONS.map(a => (
            <button key={a.id} className="m-quick-btn" onClick={() => handleAction(a.id)}>
              <span className="m-quick-icon">{a.icon}</span>
              <span className="m-quick-label">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Live prices */}
      <div className="m-section">
        <div className="m-section-title">Live Prices</div>
        <div className="m-ticker-row">
          {TOP_COINS.map(sym => (
            <TickerCard key={sym} sym={sym} data={prices[sym]} prevPrice={prev[sym]?.price} />
          ))}
        </div>
      </div>

      {/* Recent alerts */}
      <RecentAlerts token={token} />

      <div style={{ height: 16 }} />
    </div>
  )
}
