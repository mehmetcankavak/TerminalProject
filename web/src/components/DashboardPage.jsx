import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { BarChart3, TrendingUp, Bell, Monitor, Users, Plus, X, Search, ChevronDown } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'
import { fetchVolumeMonitorFull, formatUSD } from '../services/api'
import AssetLogo from './AssetLogo'

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const fmtP = p => !p || !isFinite(p) ? '—' : p >= 10000 ? '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 }) : p >= 1 ? '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : p >= 0.001 ? '$' + p.toFixed(4) : '$' + p.toFixed(6)
const fmtChg = c => c == null ? '—' : (c >= 0 ? '+' : '') + c.toFixed(2) + '%'
const fmtUSDShort = v => !v ? '$0' : v >= 1e9 ? '$' + (v / 1e9).toFixed(1) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : '$' + (v / 1e3).toFixed(1) + 'K'
const fmtClock = () => new Date().toTimeString().slice(0, 5) + ' UTC'
const navigate = page => window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page } }))

function useBinanceTicker(symbols) {
  const [tickers, setTickers] = useState({})
  useEffect(() => {
    if (!symbols.length) return
    let dead = false, retryTimer = null, ws = null
    function connect() {
      if (dead) return
      ws = new WebSocket(`wss://stream.binance.com/stream?streams=${symbols.map(s => `${s.toLowerCase()}usdt@miniTicker`).join('/')}`)
      ws.onmessage = e => {
        try {
          const { data } = JSON.parse(e.data)
          if (!data?.s) return
          const price = parseFloat(data.c), open = parseFloat(data.o)
          setTickers(prev => ({ ...prev, [data.s.replace('USDT', '')]: { price, chg: open > 0 ? ((price - open) / open) * 100 : 0 } }))
        } catch { /* ignore */ }
      }
      ws.onclose = () => { if (!dead) retryTimer = setTimeout(connect, 3000) }
      ws.onerror = () => ws.close()
    }
    connect()
    return () => { dead = true; clearTimeout(retryTimer); ws?.close() }
  }, [symbols.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  return tickers
}

function useCmcMeta() {
  const [meta, setMeta] = useState({})
  useEffect(() => {
    fetch(`${API_BASE}/api/market/cmc_top`).then(r => r.json()).then(j => {
      if (j.status !== 'ok') return
      const m = {}
      for (const c of (j.data || [])) m[(c.symbol || '').toUpperCase()] = { id: c.id, name: c.name }
      setMeta(m)
    }).catch(() => {})
  }, [])
  return meta
}

/* ── News strip ──────────────────────────────────────────────────────────── */
function NewsStrip() {
  const [news, setNews] = useState([])
  const [clock, setClock] = useState(fmtClock)
  useEffect(() => {
    const load = () => fetch(`${API_BASE}/api/status`).then(r => r.json()).then(j => setNews((j.news || []).slice(0, 8))).catch(() => {})
    load(); const id = setInterval(load, 60_000); const c = setInterval(() => setClock(fmtClock()), 15_000)
    return () => { clearInterval(id); clearInterval(c) }
  }, [])
  return (
    <div className="db-news">
      <span className="ws-badge ws-badge-lime">NEWS</span>
      <div className="db-news-track">
        {news.length === 0 ? <span className="ws-muted">Waiting for headlines…</span> : news.map((n, i) => <span key={n.id || i} className="db-news-item">{n.headline}</span>)}
      </div>
      <span className="ws-text ws-num" style={{ flexShrink: 0 }}>{clock}</span>
    </div>
  )
}

/* ── Welcome ─────────────────────────────────────────────────────────────── */
const TIPS = [
  { Icon: BarChart3,  title: 'Markets',       desc: 'Explore crypto markets', page: 'spot-markets' },
  { Icon: TrendingUp, title: 'Stocks',        desc: 'Track global stocks',    page: 'stocks' },
  { Icon: Bell,       title: 'Custom Alerts', desc: 'Set price alerts',       page: 'custom-alerts' },
  { Icon: Monitor,    title: 'Terminal',      desc: 'Advanced trading tools', page: 'terminal' },
  { Icon: Users,      title: 'Smart Money',   desc: 'Follow top traders',     page: 'smart-money' },
]
function WelcomeCard() {
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('tt_welcome_dismissed') === '1')
  if (dismissed) return null
  return (
    <div className="ws-card db-welcome">
      <button className="ws-iconbtn db-welcome-x" onClick={() => { localStorage.setItem('tt_welcome_dismissed', '1'); setDismissed(true) }} aria-label="Dismiss"><X size={16} /></button>
      <h2 className="ws-h2" style={{ fontSize: 20 }}>Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}!</h2>
      <p className="ws-muted" style={{ margin: '4px 0 14px' }}>Here’s how to get started with Trading Tools</p>
      <div className="db-tips">
        {TIPS.map(t => (
          <button key={t.page} className="db-tip" onClick={() => navigate(t.page)}>
            <t.Icon size={26} strokeWidth={1.5} />
            <div><div className="db-tip-title">{t.title}</div><div className="db-tip-desc">{t.desc}</div></div>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Coin tiles + watchlist ─────────────────────────────────────────────── */
const TILE_COINS = ['BTC', 'ETH', 'SOL', 'BNB']
const DEFAULT_WATCH = ['BTC', 'ETH', 'SOL']

function CoinTiles({ tickers }) {
  return (
    <div className="ws-grid ws-grid-4">
      {TILE_COINS.map(sym => {
        const t = tickers[sym]
        const up = (t?.chg || 0) >= 0
        return (
          <div key={sym} className="ws-kpi db-tile">
            <span className="ws-asset-logo ws-asset-logo-lg"><AssetLogo symbol={sym} type="crypto" size={36} radius={18} /></span>
            <div className="ws-flex-1"><div className="ws-text ws-small">{sym}</div><div className="ws-mono ws-ink" style={{ fontSize: 18, fontWeight: 600 }}>{t ? fmtP(t.price) : '—'}</div></div>
            <span className={`ws-mono ${up ? 'ws-pos' : 'ws-neg'}`}>{t ? (up ? '▲ ' : '▼ ') + fmtChg(t.chg) : ''}</span>
          </div>
        )
      })}
    </div>
  )
}

function Watchlist({ tickers, meta, list, setList }) {
  const [adding, setAdding] = useState(false)
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)
  useEffect(() => { if (adding) inputRef.current?.focus() }, [adding])
  const save = next => { setList(next); localStorage.setItem('tt_watchlist', JSON.stringify(next)) }
  const add = sym => { const s = sym.toUpperCase().trim(); if (!s || list.includes(s)) return; save([...list, s]); setInput(''); setAdding(false) }
  const suggestions = input ? Object.keys(meta).filter(s => s.startsWith(input.toUpperCase())).slice(0, 6) : []
  const rows = list.filter(s => !query || s.includes(query.toUpperCase().trim()) || meta[s]?.name?.toLowerCase().includes(query.toLowerCase().trim()))
  return (
    <div className="ws-card">
      <div className="ws-card-head">
        <h3 className="ws-h3">Watchlist</h3>
        <div className="ws-row">
          <button className="ws-btn ws-btn-sm ws-btn-icon" title={adding ? 'Close' : 'Add coin'} onClick={() => setAdding(v => !v)}>{adding ? <X size={15} /> : <Plus size={15} />}</button>
          <div className="ws-search" style={{ width: 190 }}><Search size={13} /><input className="ws-input ws-input-sm" placeholder="Search symbols..." value={query} onChange={e => setQuery(e.target.value)} /></div>
        </div>
      </div>
      {adding && (
        <div className="ws-card-body" style={{ padding: '10px 18px', borderBottom: '1px solid var(--ws-line)' }}>
          <input ref={inputRef} className="ws-input ws-input-sm" placeholder="Symbol (e.g. LINK)" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(input); if (e.key === 'Escape') setAdding(false) }} />
          {suggestions.length > 0 && <div className="ws-pills ws-mt-8">{suggestions.map(s => <button key={s} className="ws-pill ws-pill-sm" onClick={() => add(s)}>{s}</button>)}</div>}
        </div>
      )}
      <div className="ws-table-wrap">
        <table className="ws-table ws-table-dense">
          <thead><tr><th>Symbol</th><th className="ws-right">Price</th><th className="ws-right">24h Change</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={4} className="ws-muted">No coins in your watchlist yet.</td></tr> : rows.map(sym => {
              const t = tickers[sym]; const up = (t?.chg || 0) >= 0
              return (
                <tr key={sym} className="ws-table-click" onClick={() => { sessionStorage.setItem('tt_trade_symbol', sym); navigate('spot-markets') }}>
                  <td><div className="ws-asset"><span className="ws-asset-logo ws-asset-logo-sm"><AssetLogo symbol={sym} type="crypto" size={20} radius={10} /></span><span className="ws-asset-sym">{sym}/USDT</span></div></td>
                  <td className="ws-right ws-mono ws-ink">{t ? fmtP(t.price) : '—'}</td>
                  <td className={`ws-right ws-mono ${up ? 'ws-pos' : 'ws-neg'}`}>{t ? fmtChg(t.chg) : '—'}</td>
                  <td className="ws-right"><button className="ws-iconbtn" aria-label={`Remove ${sym}`} onClick={e => { e.stopPropagation(); save(list.filter(s => s !== sym)) }}><X size={14} /></button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Long / Short widget ────────────────────────────────────────────────── */
const LS_PERIODS = [['1h', '1H'], ['4h', '4H'], ['1d', '24H']]
function LongShortWidget() {
  const [period, setPeriod] = useState('1d')
  const [rows, setRows] = useState([])
  useEffect(() => {
    let alive = true
    Promise.all(['BTC', 'ETH', 'SOL'].map(s => fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${s}USDT&period=${period}&limit=1`).then(r => r.json()).then(d => ({ s, long: Array.isArray(d) && d[0] ? parseFloat(d[0].longAccount) * 100 : null })).catch(() => ({ s, long: null }))))
      .then(r => { if (alive) setRows(r) })
    return () => { alive = false }
  }, [period])
  return (
    <div className="ws-card">
      <div className="ws-card-head">
        <h3 className="ws-h3">Long / Short Ratio</h3>
        <div className="ws-row">
          <div className="ws-inline-select" style={{ height: 32, minWidth: 110, fontSize: 12 }}>Binance <ChevronDown size={13} /><select value="binance" onChange={() => {}}><option value="binance">Binance</option></select></div>
          <div className="ws-seg ws-seg-sm">{LS_PERIODS.map(([k, l]) => <button key={k} className={period === k ? 'active' : ''} onClick={() => setPeriod(k)}>{l}</button>)}</div>
        </div>
      </div>
      <div className="ws-table-wrap">
        <table className="ws-table ws-table-dense">
          <thead><tr><th>Symbol</th><th className="ws-pos">Long</th><th className="ws-right ws-neg">Short</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.s}>
                <td><div className="ws-asset"><span className="ws-asset-logo ws-asset-logo-sm"><AssetLogo symbol={r.s} type="crypto" size={20} radius={10} /></span><span className="ws-asset-sym">{r.s}</span></div></td>
                <td colSpan={2}>
                  {r.long == null ? <span className="ws-muted">—</span> : (
                    <div className="ws-split ws-split-lg"><span className="l" style={{ width: `${r.long}%` }}>{r.long.toFixed(1)}%</span><span className="s" style={{ width: `${100 - r.long}%` }}>{(100 - r.long).toFixed(1)}%</span></div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Liquidations widget ────────────────────────────────────────────────── */
function LiquidationsWidget() {
  const [stats, setStats] = useState(null)
  const [coins, setCoins] = useState({})
  useEffect(() => {
    const load = () => fetch(`${API_BASE}/api/liq-stats`).then(r => r.json()).then(d => { if (d?.stats) setStats(d.stats); if (d?.coins) setCoins(d.coins) }).catch(() => {})
    load(); const id = setInterval(load, 180_000); return () => clearInterval(id)
  }, [])
  const h24 = stats?.h24 || { long: 0, short: 0 }
  const total = (h24.long || 0) + (h24.short || 0)
  const top = Object.entries(coins).map(([c, v]) => ({ c, long: v.long || 0, short: v.short || 0 })).sort((a, b) => (b.long + b.short) - (a.long + a.short)).slice(0, 5)
  return (
    <div className="ws-card">
      <div className="ws-card-head">
        <h3 className="ws-h3">Liquidations</h3>
        <div className="ws-row ws-small" style={{ gap: 14 }}><span className="ws-text">Total <b className="ws-ink ws-mono" style={{ fontSize: 15 }}>{fmtUSDShort(total)}</b></span></div>
      </div>
      <div className="ws-card-body" style={{ padding: '8px 18px' }}>
        <div className="ws-row-between ws-small"><span className="ws-text">Long <b className="ws-pos ws-mono">{fmtUSDShort(h24.long)} ({total ? ((h24.long / total) * 100).toFixed(1) : 0}%)</b></span><span className="ws-text">Short <b className="ws-neg ws-mono">{fmtUSDShort(h24.short)} ({total ? ((h24.short / total) * 100).toFixed(1) : 0}%)</b></span></div>
      </div>
      <div className="ws-table-wrap">
        <table className="ws-table ws-table-dense">
          <thead><tr><th>Symbol</th><th>Side</th><th className="ws-right">Value</th><th className="ws-right">Share</th></tr></thead>
          <tbody>
            {top.length === 0 ? <tr><td colSpan={4} className="ws-muted">Loading…</td></tr> : top.map(r => {
              const longSide = r.long >= r.short
              const v = Math.max(r.long, r.short)
              return (
                <tr key={r.c}><td className="ws-ink ws-bold">{r.c}USDT</td><td className={`ws-bold ${longSide ? 'ws-pos' : 'ws-neg'}`}>{longSide ? 'Long' : 'Short'}</td><td className="ws-right ws-mono ws-ink">{fmtUSDShort(v)}</td><td className="ws-right ws-mono ws-text">{total ? (((r.long + r.short) / total) * 100).toFixed(1) : 0}%</td></tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Volume + alerts widgets ────────────────────────────────────────────── */
function VolumeWidget() {
  const [rows, setRows] = useState([])
  useEffect(() => {
    const load = () => fetchVolumeMonitorFull(25).then(r => setRows((r?.items || []).slice(0, 4))).catch(() => {})
    load(); const id = setInterval(load, 60_000); return () => clearInterval(id)
  }, [])
  return (
    <div className="ws-card">
      <div className="ws-card-head"><h3 className="ws-h3">Volume Monitor</h3><button className="ws-link ws-small" onClick={() => navigate('volume-monitor')}>View all</button></div>
      <div className="ws-table-wrap">
        <table className="ws-table ws-table-dense">
          <thead><tr><th>Symbol</th><th className="ws-right">Price</th><th className="ws-right">Volume (24h)</th><th className="ws-right">Change</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={4} className="ws-muted">Loading…</td></tr> : rows.map(r => {
              const sym = r.symbol.replace(/USDT$/, ''); const up = (r.priceChangePct || 0) >= 0
              return <tr key={r.symbol}><td><div className="ws-asset"><span className="ws-asset-logo ws-asset-logo-sm"><AssetLogo symbol={sym} type="crypto" size={20} radius={10} /></span><span className="ws-asset-sym">{sym}/USDT</span></div></td><td className="ws-right ws-mono ws-ink">{fmtP(r.price)}</td><td className="ws-right ws-mono">{formatUSD(r.volume24h)}</td><td className={`ws-right ws-mono ${up ? 'ws-pos' : 'ws-neg'}`}>{fmtChg(r.priceChangePct)}</td></tr>
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AlertsWidget() {
  const { token } = useAuth()
  const [alerts, setAlerts] = useState([])
  const load = useCallback(() => { if (token) fetch(`${API_BASE}/api/alerts`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : []).then(a => setAlerts(Array.isArray(a) ? a : [])).catch(() => {}) }, [token])
  useEffect(() => { load(); const id = setInterval(load, 30_000); return () => clearInterval(id) }, [load])
  const rows = alerts.filter(a => !a.triggered).slice(0, 3)
  return (
    <div className="ws-card">
      <div className="ws-card-head"><h3 className="ws-h3">Alert Monitoring</h3><button className="ws-link ws-small" onClick={() => navigate('custom-alerts')}>Manage</button></div>
      <div className="ws-table-wrap">
        <table className="ws-table ws-table-dense">
          <thead><tr><th>Symbol</th><th>Condition</th><th className="ws-right">Status</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={3} className="ws-muted">No active alerts. Create one in Custom Alerts.</td></tr> : rows.map(a => (
              <tr key={a.id}><td><div className="ws-asset"><span className="ws-asset-logo ws-asset-logo-sm"><AssetLogo symbol={a.coin} type="crypto" size={20} radius={10} /></span><span className="ws-asset-sym">{a.coin}/USDT</span></div></td><td className="ws-num ws-ink">Price {a.direction === 'above' ? '>' : '<'} ${Number(a.target_price).toLocaleString('en-US')}</td><td className="ws-right"><span className="ws-badge ws-badge-pos">Active</span></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Economic calendar widget (TradingView) ─────────────────────────────── */
function CalendarWidget() {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.innerHTML = ''
    const w = document.createElement('div'); w.className = 'tradingview-widget-container__widget'; w.style.height = '100%'; ref.current.appendChild(w)
    const s = document.createElement('script'); s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js'; s.async = true
    s.innerHTML = JSON.stringify({ colorTheme: 'light', isTransparent: true, width: '100%', height: '100%', locale: 'en', importanceFilter: '0,1', countryFilter: 'us,eu,gb,jp,cn' })
    ref.current.appendChild(s)
  }, [])
  return (
    <div className="ws-card">
      <div className="ws-card-head"><h3 className="ws-h3">Economic Calendar</h3><button className="ws-link ws-small" onClick={() => navigate('economic-calendar')}>Full calendar</button></div>
      <div ref={ref} className="tradingview-widget-container" style={{ height: 260 }} />
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [list, setList] = useState(() => { try { return JSON.parse(localStorage.getItem('tt_watchlist') || 'null') || DEFAULT_WATCH } catch { return DEFAULT_WATCH } })
  const symbols = useMemo(() => [...new Set([...TILE_COINS, ...list])], [list])
  const tickers = useBinanceTicker(symbols)
  const meta = useCmcMeta()

  return (
    <div className="ws-page db-page">
      <NewsStrip />
      <WelcomeCard />
      <CoinTiles tickers={tickers} />
      <div className="ws-mt-16"><Watchlist tickers={tickers} meta={meta} list={list} setList={setList} /></div>
      <div className="ws-grid ws-grid-2 ws-mt-16 db-grid">
        <LongShortWidget />
        <LiquidationsWidget />
        <VolumeWidget />
        <AlertsWidget />
      </div>
      <div className="ws-mt-16"><CalendarWidget /></div>
      <div className="ws-right ws-mt-8 ws-xs ws-subtle">Live data · Binance, CoinMarketCap, TradingView</div>
    </div>
  )
}
