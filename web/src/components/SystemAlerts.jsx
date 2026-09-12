import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Bell, BellOff, Activity, LineChart, ArrowLeftRight, Landmark, Flame, Percent, BarChart3, Lock, Calendar,
  Plus, FileText, Users, Compass, Settings, Shield, Star, BellRing, Bitcoin, Fuel,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'
import AssetLogo from './AssetLogo'

const STORAGE_KEY = 'nt_system_alerts_v2'
const LEGACY_KEY  = 'nt_system_alerts'
const CHANNELS    = ['email', 'push', 'inapp']

const CATEGORIES = [
  { id: 'price-alert',   name: 'Price Alerts',          desc: 'Get notified when assets hit your targets',    Icon: LineChart,     legacy: 'price-alert',  defaults: [1, 1, 1] },
  { id: 'big-transfer',  name: 'Large Transfers',       desc: 'Whale movements and large transactions',      Icon: ArrowLeftRight, legacy: 'big-transfer', defaults: [1, 1, 1] },
  { id: 'exchange-flow', name: 'Exchange Flows',        desc: 'Inflow and outflow alerts',                   Icon: Landmark,      defaults: [1, 0, 1] },
  { id: 'liquidations',  name: 'Liquidations',          desc: 'Large liquidations and risk events',          Icon: Flame,         legacy: 'liquidations', defaults: [1, 1, 1] },
  { id: 'funding',       name: 'Funding Rate',          desc: 'Significant funding rate changes',            Icon: Percent,       defaults: [0, 0, 1] },
  { id: 'volume',        name: 'Volume Spikes',         desc: 'Unusual trading volume activity',             Icon: BarChart3,     legacy: 'volume',       defaults: [1, 0, 1] },
  { id: 'token-unlock',  name: 'Token Unlocks',         desc: 'Upcoming token unlock events',                Icon: Lock,          legacy: 'token-unlock', defaults: [1, 0, 1] },
  { id: 'economic',      name: 'Economic Calendar',     desc: 'Key economic events and announcements',       Icon: Calendar,      legacy: 'economic',     defaults: [0, 0, 1] },
  { id: 'listings',      name: 'Listings & Delistings', desc: 'New listings and delistings',                 Icon: Plus,          defaults: [1, 1, 1] },
  { id: 'regulatory',    name: 'Regulatory News',       desc: 'Regulatory updates and compliance news',      Icon: FileText,      defaults: [0, 0, 1] },
  { id: 'smart-money',   name: 'Smart Money',           desc: 'Smart money movements',                       Icon: Users,         legacy: 'wallets',      defaults: [1, 1, 0] },
  { id: 'compass',       name: 'Market Compass',        desc: 'Market regime changes and signals',           Icon: Compass,       defaults: [0, 1, 1] },
  { id: 'system',        name: 'System Updates',        desc: 'Product updates and maintenance',             Icon: Settings,      defaults: [1, 0, 1] },
  { id: 'security',      name: 'Security Alerts',       desc: 'Account and security notifications',          Icon: Shield,        defaults: [1, 1, 1] },
  { id: 'watchlist',     name: 'Watchlist Alerts',      desc: 'Your watchlist activity',                     Icon: Star,          defaults: [1, 0, 1] },
  { id: 'custom',        name: 'Custom Alerts',         desc: 'Your custom alert conditions',                Icon: BellRing,      legacy: 'breaking',     defaults: [1, 1, 1] },
  { id: 'btc-dominance', name: 'BTC Dominance',         desc: 'BTC dominance changes',                       Icon: Bitcoin,       defaults: [0, 0, 1] },
  { id: 'gas',           name: 'ETH Gas Fees',          desc: 'Gas fee thresholds and spikes',               Icon: Fuel,          defaults: [0, 1, 1] },
]

function loadPrefs() {
  const fromDefaults = () => Object.fromEntries(CATEGORIES.map(c => [c.id, { email: !!c.defaults[0], push: !!c.defaults[1], inapp: !!c.defaults[2] }]))
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (saved && typeof saved === 'object') {
      const base = fromDefaults()
      for (const id of Object.keys(base)) if (saved[id]) base[id] = { ...base[id], ...saved[id] }
      return base
    }
    // migrate the single-toggle preferences from the previous version
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null')
    const base = fromDefaults()
    if (legacy && typeof legacy === 'object') {
      for (const c of CATEGORIES) if (c.legacy && c.legacy in legacy) base[c.id] = { email: !!legacy[c.legacy], push: !!legacy[c.legacy], inapp: true }
    }
    return base
  } catch {
    return fromDefaults()
  }
}

function Toggle({ value, onChange }) {
  return <button type="button" role="switch" aria-checked={!!value} className={`ws-toggle ws-toggle-sm ${value ? 'on' : ''}`} onClick={() => onChange(!value)} />
}

const fmtPrice = n => {
  if (!n && n !== 0) return '—'
  const v = Number(n)
  if (v >= 1000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (v >= 1) return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return '$' + v.toFixed(4)
}
const fmtCond = a => `${a.direction === 'above' ? '≥' : '≤'} ${fmtPrice(a.target_price)}`
const fmtStamp = ts => {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function CoinCell({ coin }) {
  return (
    <div className="ws-asset">
      <span className="ws-asset-logo ws-asset-logo-sm"><AssetLogo symbol={coin} type="crypto" size={20} radius={10} /></span>
      <span className="ws-asset-sym">{coin}</span>
    </div>
  )
}

export default function SystemAlerts() {
  const { token } = useAuth()
  const [prefs, setPrefs] = useState(loadPrefs)
  const [priceAlerts, setPriceAlerts] = useState([])
  const [prices, setPrices] = useState({})

  const fetchPriceAlerts = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/api/alerts`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) setPriceAlerts(await res.json())
    } catch { /* keep the previous list */ }
  }, [token])

  useEffect(() => { fetchPriceAlerts() }, [fetchPriceAlerts])

  const watching  = useMemo(() => priceAlerts.filter(a => !a.triggered), [priceAlerts])
  const triggered = useMemo(() => priceAlerts.filter(a =>  a.triggered), [priceAlerts])

  // current prices for the watched coins (public Binance ticker)
  useEffect(() => {
    const coins = [...new Set(watching.map(a => a.coin))]
    if (!coins.length) return
    let alive = true
    const symbols = JSON.stringify(coins.map(c => `${c}USDT`))
    fetch(`https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(symbols)}`)
      .then(r => r.ok ? r.json() : [])
      .then(rows => { if (alive && Array.isArray(rows)) setPrices(Object.fromEntries(rows.map(r => [r.symbol.replace('USDT', ''), parseFloat(r.price)]))) })
      .catch(() => {})
    return () => { alive = false }
  }, [watching])

  const setPref = (id, channel, value) => {
    setPrefs(prev => {
      const next = { ...prev, [id]: { ...prev[id], [channel]: value } }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* private mode */ }
      return next
    })
  }

  const enabledCount = CATEGORIES.filter(c => CHANNELS.some(ch => prefs[c.id]?.[ch])).length
  const disabledCount = CATEGORIES.length - enabledCount

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <div className="ws-page-head-left">
          <h1 className="ws-title">System Alerts</h1>
          <p className="ws-subtitle" style={{ fontSize: 15 }}>Manage your notification preferences and price alerts</p>
        </div>
      </div>

      {/* Stat strip */}
      <div className="sa-strip">
        <div className="sa-stat">
          <Bell size={30} strokeWidth={1.5} className="sa-stat-icon" />
          <div>
            <div className="sa-stat-label">Enabled Alerts</div>
            <div className="sa-stat-value">{enabledCount}</div>
            <div className="sa-stat-sub">of {CATEGORIES.length} categories</div>
          </div>
        </div>
        <div className="sa-stat">
          <BellOff size={30} strokeWidth={1.5} className="sa-stat-icon" />
          <div>
            <div className="sa-stat-label">Disabled Alerts</div>
            <div className="sa-stat-value">{disabledCount}</div>
            <div className="sa-stat-sub">of {CATEGORIES.length} categories</div>
          </div>
        </div>
        <div className="sa-stat">
          <Activity size={30} strokeWidth={1.5} className="sa-stat-icon" />
          <div>
            <div className="sa-stat-label">Price Alerts Active</div>
            <div className="sa-stat-value">{priceAlerts.length}</div>
            <div className="sa-stat-sub">{watching.length} watching · {triggered.length} triggered</div>
          </div>
        </div>
      </div>

      <div className="sa-grid">
        {/* Preferences */}
        <div>
          <h2 className="ws-h3 sa-section-title">NOTIFICATION PREFERENCES</h2>
          <div className="ws-table-wrap">
            <table className="ws-table sa-pref-table">
              <thead>
                <tr><th>Alert Category</th><th className="ws-center">Email</th><th className="ws-center">Push</th><th className="ws-center">In-App</th></tr>
              </thead>
              <tbody>
                {CATEGORIES.map(c => (
                  <tr key={c.id}>
                    <td style={{ whiteSpace: 'normal' }}>
                      <div className="sa-cat">
                        <c.Icon size={17} strokeWidth={1.6} className="sa-cat-icon" />
                        <div>
                          <div className="sa-cat-name">{c.name}</div>
                          <div className="sa-cat-desc">{c.desc}</div>
                        </div>
                      </div>
                    </td>
                    {CHANNELS.map(ch => (
                      <td key={ch} className="ws-center"><Toggle value={prefs[c.id]?.[ch]} onChange={v => setPref(c.id, ch, v)} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Price alerts */}
        <div>
          <h2 className="ws-h3 sa-section-title">PRICE ALERTS</h2>

          <div className="sa-sub-title">TRIGGERED ({triggered.length})</div>
          <div className="ws-table-wrap">
            <table className="ws-table sa-price-table">
              <thead><tr><th>Coin</th><th>Alert Condition</th><th>Triggered At</th><th>Status</th></tr></thead>
              <tbody>
                {triggered.length === 0 ? (
                  <tr><td colSpan={4} className="ws-muted">No triggered alerts yet.</td></tr>
                ) : triggered.map(a => (
                  <tr key={a.id}>
                    <td><CoinCell coin={a.coin} /></td>
                    <td className="ws-ink ws-num">{fmtCond(a)}</td>
                    <td className="ws-num">{fmtStamp(a.triggered_at || a.created_at)}</td>
                    <td><span className="ws-badge ws-badge-neg">Triggered</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sa-sub-title" style={{ marginTop: 26 }}>WATCHING ({watching.length})</div>
          <div className="ws-table-wrap">
            <table className="ws-table sa-price-table">
              <thead><tr><th>Coin</th><th>Alert Condition</th><th>Current Price</th><th>Status</th></tr></thead>
              <tbody>
                {watching.length === 0 ? (
                  <tr><td colSpan={4} className="ws-muted">No active price alerts. Create one in Custom Alerts.</td></tr>
                ) : watching.map(a => {
                  const p = prices[a.coin]
                  const near = p && Math.abs(p - a.target_price) / a.target_price < 0.05
                  return (
                    <tr key={a.id}>
                      <td><CoinCell coin={a.coin} /></td>
                      <td className="ws-ink ws-num">{fmtCond(a)}</td>
                      <td className={`ws-mono ${near ? 'ws-pos' : 'ws-ink'}`}>{p ? fmtPrice(p) : '—'}</td>
                      <td><span className="ws-badge ws-badge-lime" style={{ background: '#eefbc8', color: '#3f6212', fontWeight: 500 }}>Watching</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
