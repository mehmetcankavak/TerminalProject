import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { haptic } from '../../capacitor'
import { API_BASE } from '../../config'
import { useWatchlist, WATCHLIST_DEFAULT } from '../../hooks/useWatchlist'

const ACTIONS = [
  { id: 'custom-alerts',  icon: '🔔', label: 'Alerts' },
  { id: 'smart-money',    icon: '🐋', label: 'Whales' },
  { id: 'markets',        icon: '◈',  label: 'Markets' },
  { id: 'big-transfers',  icon: '💸', label: 'Transfers' },
  { id: 'funding-rate',   icon: '📊', label: 'Funding' },
  { id: 'volume-monitor', icon: '📈', label: 'Volume' },
  { id: 'portfolio',      icon: '◎',  label: 'Portfolio' },
  { id: 'upgrade',        icon: '✦',  label: 'Upgrade' },
]

function fmt(price) {
  if (price >= 1000) return '$' + price.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (price >= 1)    return '$' + price.toLocaleString('en-US', { maximumFractionDigits: 3 })
  return '$' + price.toLocaleString('en-US', { maximumFractionDigits: 6 })
}

function usePrices(symbols) {
  const [prices, setPrices] = useState({})
  const [flash, setFlash]   = useState({})
  const prevRef = useRef({})
  const streamsKey = symbols.join(',')

  useEffect(() => {
    if (!symbols.length) return
    const streams = symbols.map(s => `${s.toLowerCase()}usdt@miniTicker`).join('/')
    let ws
    const connect = () => {
      ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`)
      ws.onmessage = (e) => {
        const { data: d } = JSON.parse(e.data)
        if (!d) return
        const sym = d.s.replace('USDT', '')
        const price = parseFloat(d.c)
        const change = parseFloat(d.P)
        const prev = prevRef.current[sym]
        if (prev !== undefined && prev !== price) {
          const dir = price > prev ? 'up' : 'down'
          setFlash(f => ({ ...f, [sym]: dir }))
          setTimeout(() => setFlash(f => { const n = { ...f }; delete n[sym]; return n }), 600)
        }
        prevRef.current[sym] = price
        setPrices(p => ({ ...p, [sym]: { price, change } }))
      }
      ws.onerror = () => {}
    }
    connect()
    return () => ws?.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamsKey])

  return { prices, flash }
}

function PortfolioHero({ token }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/api/portfolio/summary`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setData(d))
      .catch(() => {})
  }, [token])

  const equity = data?.equity
  const pnl    = data?.pnl
  const pct    = data?.pnl_pct
  const isUp   = (pnl ?? 0) >= 0

  return (
    <div className="home-hero">
      <div className="home-hero-label">Total Portfolio</div>
      <div className="home-hero-value">
        {equity != null
          ? `$${Number(equity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : <span className="home-hero-empty">Connect exchange to start</span>
        }
      </div>
      {pnl != null && (
        <div className={`home-hero-pnl ${isUp ? 'up' : 'down'}`}>
          <span>{isUp ? '▲' : '▼'}</span>
          <span>${Math.abs(pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          {pct != null && <span>({isUp ? '+' : ''}{Number(pct).toFixed(2)}%)</span>}
          <span className="home-hero-pnl-tag">Today</span>
        </div>
      )}
    </div>
  )
}

function RecentAlerts({ token }) {
  const [alerts, setAlerts] = useState([])

  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/api/alert-monitoring?limit=4`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => Array.isArray(d) ? setAlerts(d.slice(0, 4)) : {})
      .catch(() => {})
  }, [token])

  if (!alerts.length) return null

  return (
    <div className="ms-section" style={{ paddingTop: 16 }}>
      <div className="ms-section-label">Recent Alerts</div>
      <div className="home-alert-list">
        {alerts.map((a, i) => {
          const isAbove = a.direction === 'above'
          return (
            <div key={i} className="home-alert-row">
              <div className="home-alert-dot" style={{ background: isAbove ? 'var(--green)' : 'var(--red)' }} />
              <div className="home-alert-body">
                <span className="home-alert-sym">{a.symbol} </span>
                <span className="home-alert-msg">{a.message || `hit $${a.price}`}</span>
              </div>
              <div className="home-alert-time">
                {a.triggered_at
                  ? new Date(a.triggered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : ''}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function HomeScreen({ onNavigate, plan }) {
  const { token } = useAuth()
  const { list: watchlist } = useWatchlist()
  const tickerSyms = useMemo(
    () => (watchlist.length ? watchlist : WATCHLIST_DEFAULT).slice(0, 12),
    [watchlist]
  )
  const { prices, flash } = usePrices(tickerSyms)

  return (
    <div className="m-pb">
      <PortfolioHero token={token} />

      {/* Live ticker strip */}
      <div style={{ padding: '16px 0 0' }}>
        <div className="home-tickers">
          {tickerSyms.map((sym) => {
            const d = prices[sym]
            const isUp = (d?.change ?? 0) >= 0
            return (
              <div
                key={sym}
                className={`home-ticker-chip ${flash[sym] ? `flash-${flash[sym]}` : ''}`}
                onClick={() => { haptic('light'); onNavigate('chart', { sym, type: 'crypto', name: sym, price: d?.price, change: d?.change }) }}
              >
                <div className="home-ticker-sym">{sym}</div>
                <div className={`home-ticker-price ${isUp ? 'up' : 'down'}`}>
                  {d ? fmt(d.price) : '—'}
                </div>
                <div className={`home-ticker-chg ${isUp ? 'up' : 'down'}`}>
                  {d ? `${isUp ? '+' : ''}${d.change.toFixed(2)}%` : '—'}
                </div>
              </div>
            )
          })}
          <div
            className="home-ticker-chip"
            onClick={() => {
              haptic('light')
              try {
                localStorage.setItem('tt_markets_sort', 'watchlist')
                window.dispatchEvent(new CustomEvent('tt_markets_sort_change', { detail: 'watchlist' }))
              } catch {}
              onNavigate('markets')
            }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 60, color: 'var(--text-2)' }}
            aria-label="Edit watchlist"
          >
            <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>＋</div>
            <div style={{ fontSize: 10, marginTop: 2, fontWeight: 600 }}>Edit</div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="ms-section" style={{ paddingTop: 20 }}>
        <div className="ms-section-label">Quick Access</div>
        <div className="home-actions">
          {ACTIONS.map(a => (
            <button key={a.id} className="home-action-btn" onClick={() => { haptic('light'); onNavigate(a.id) }}>
              <span className="home-action-icon">{a.icon}</span>
              <span className="home-action-label">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Upgrade banner for free users */}
      {plan !== 'pro' && (
        <div className="upgrade-banner" onClick={() => { haptic('light'); onNavigate('upgrade') }}>
          <span className="upgrade-banner-icon">✦</span>
          <div className="upgrade-banner-text">
            <div className="upgrade-banner-title">Unlock Pro Features</div>
            <div className="upgrade-banner-sub">Alerts, Smart Money, Terminal & more</div>
          </div>
          <span className="upgrade-banner-arrow">›</span>
        </div>
      )}

      {/* Recent alerts */}
      <RecentAlerts token={token} />
    </div>
  )
}
