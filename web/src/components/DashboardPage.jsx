import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import LongShortRatio from './LongShortRatio'
import LiquidationsStream from './LiquidationsStream'
import VolumeMonitor from './VolumeMonitor'
import AlertMonitoring from './AlertMonitoring'
import EconomicCalendar from './EconomicCalendar'
import DashboardNewsTicker from './DashboardNewsTicker'
import { API_BASE } from '../config'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtP(p) {
  if (!p || !isFinite(p)) return '—'
  if (p >= 10000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (p >= 1)     return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (p >= 0.001) return '$' + p.toFixed(4)
  return '$' + p.toFixed(6)
}
function fmtLg(v) {
  if (!v || !isFinite(v)) return '—'
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T'
  if (v >= 1e9)  return '$' + (v / 1e9).toFixed(2) + 'B'
  return '$' + (v / 1e6).toFixed(0) + 'M'
}

// ─── Binance real-time ticker hook ───────────────────────────────────────────
function useBinanceTicker(symbols) {
  const [tickers, setTickers] = useState({})
  const wsRef    = useRef(null)
  const symRef   = useRef(symbols)
  symRef.current = symbols

  useEffect(() => {
    if (!symbols.length) return
    let dead = false
    let retryTimer = null

    function connect() {
      if (dead) return
      const streams = symbols.map(s => `${s.toLowerCase()}usdt@miniTicker`).join('/')
      const ws = new WebSocket(`wss://stream.binance.com/stream?streams=${streams}`)
      wsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const { data } = JSON.parse(e.data)
          if (!data?.s) return
          const sym   = data.s.replace('USDT', '')
          const price = parseFloat(data.c)
          const open  = parseFloat(data.o)
          const chg   = open > 0 ? ((price - open) / open) * 100 : 0
          setTickers(prev => ({ ...prev, [sym]: { price, chg, open } }))
        } catch {}
      }
      ws.onclose = () => { if (!dead) retryTimer = setTimeout(connect, 3000) }
      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      dead = true
      clearTimeout(retryTimer)
      wsRef.current?.close()
    }
  }, [symbols.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  return tickers
}

// ─── CMC logo/id lookup (fetched once) ───────────────────────────────────────
function useCmcMeta() {
  const [meta, setMeta] = useState({})
  useEffect(() => {
    fetch(`${API_BASE}/api/market/cmc_top`).then(r => r.json()).then(j => {
      if (j.status !== 'ok') return
      const m = {}
      for (const c of (j.data || [])) {
        const sym = (c.symbol || '').toUpperCase()
        m[sym] = { id: c.id, name: c.name }
      }
      setMeta(m)
    }).catch(() => {})
  }, [])
  return meta
}

// ─── Market Overview Strip ────────────────────────────────────────────────────
const STRIP_COINS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP']

const COMMODITY_LABELS = { GOLD: 'Gold', SILVER: 'Silver', BRENTOIL: 'Brent' }

function CommodityIcon({ sym }) {
  if (sym === 'GOLD') return (
    <svg width="16" height="16" viewBox="0 0 18 18" style={{ borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
      <path d="M0 0h18v18H0V0z" fill="#D69A00"/>
      <path d="M4.156 9a.26.26 0 00-.217.107L2.215 11.68c-.096.143.024.32.217.32h6.135c.193 0 .313-.177.217-.32L7.06 9.107A.26.26 0 006.843 9H4.156zm7 0a.26.26 0 00-.217.107L9.215 11.68c-.096.143.024.32.217.32h6.136c.192 0 .312-.177.216-.32L14.06 9.107A.26.26 0 0013.843 9h-2.687zm-3.5-4a.26.26 0 00-.217.107L5.715 7.68c-.096.143.024.32.217.32h6.136c.192 0 .312-.177.216-.32L10.56 5.107A.26.26 0 0010.343 5H7.656z" fill="#fff"/>
    </svg>
  )
  if (sym === 'SILVER') return (
    <svg width="16" height="16" viewBox="0 0 18 18" style={{ borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
      <path d="M0 0h18v18H0V0z" fill="#ADABB8"/>
      <path d="M4.156 9a.26.26 0 00-.216.107L2.215 11.68c-.095.143.025.321.217.321h6.136c.192 0 .313-.178.217-.321L7.06 9.107A.26.26 0 006.844 9H4.156zm7 0a.26.26 0 00-.216.107L9.215 11.68c-.096.143.025.321.217.321h6.136c.192 0 .313-.178.217-.321L14.06 9.107A.26.26 0 0013.844 9h-2.688zm-3.5-4a.26.26 0 00-.216.107L5.715 7.68c-.095.143.025.321.217.321h6.136c.192 0 .313-.178.217-.321L10.56 5.107A.26.26 0 0010.345 5H7.656z" fill="#fff"/>
    </svg>
  )
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" style={{ borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
      <path d="M0 0h18v18H0V0z" fill="#5D606B"/>
      <path d="M9 2.5C9 2.5 4.5 9 4.5 12C4.5 14.485 6.515 16.5 9 16.5C11.485 16.5 13.5 14.485 13.5 12C13.5 9 9 2.5 9 2.5Z" fill="#fff"/>
    </svg>
  )
}

function useCommodities() {
  const [data, setData] = useState({})
  useEffect(() => {
    let dead = false
    const fetch_ = () =>
      fetch(`${API_BASE}/api/commodities`).then(r => r.json())
        .then(j => { if (!dead) setData(prev => ({ ...prev, ...j })) }).catch(() => {})
    fetch_()
    const id = setInterval(fetch_, 2_000)
    return () => { dead = true; clearInterval(id) }
  }, [])
  return data
}

function MarketStrip() {
  const tickers             = useBinanceTicker(STRIP_COINS)
  const meta                = useCmcMeta()
  const commodities         = useCommodities()
  const [global, setGlobal] = useState(null)
  const [fg, setFg]         = useState(null)
  const prevRef             = useRef({})
  const [flash, setFlash]   = useState({})

  useEffect(() => {
    const newFlash = {}
    for (const sym of STRIP_COINS) {
      const px   = tickers[sym]?.price
      const prev = prevRef.current[sym]
      if (px && prev && px !== prev) newFlash[sym] = px > prev ? 'up' : 'dn'
      if (px) prevRef.current[sym] = px
    }
    if (!Object.keys(newFlash).length) return
    setFlash(p => ({ ...p, ...newFlash }))
    const t = setTimeout(() => setFlash(p => { const n = { ...p }; Object.keys(newFlash).forEach(k => delete n[k]); return n }), 600)
    return () => clearTimeout(t)
  }, [tickers])

  useEffect(() => {
    fetch(`${API_BASE}/api/market/global`).then(r => r.json())
      .then(j => { if (j.status === 'ok') setGlobal(j.data) }).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('https://api.alternative.me/fng/?limit=1').then(r => r.json())
      .then(j => setFg(j.data?.[0] || null)).catch(() => {})
  }, [])

  const fgColor = fg ? (parseInt(fg.value) >= 60 ? 'var(--accent)' : parseInt(fg.value) >= 40 ? '#f5a623' : 'var(--danger)') : null

  return (
    <div className="ds-strip">
      {/* Crypto coins */}
      {STRIP_COINS.map(sym => {
        const t   = tickers[sym]
        const m   = meta[sym]
        const chg = t?.chg
        const up  = (chg || 0) >= 0
        const fd  = flash[sym]
        return (
          <div key={sym} className={`ds-strip-coin${fd ? ` ds-flash-${fd}` : ''}`}>
            {m?.id && <img src={`https://s2.coinmarketcap.com/static/img/coins/32x32/${m.id}.png`} alt={sym} className="ds-strip-icon" />}
            <span className="ds-strip-sym">{sym}</span>
            <span className="ds-strip-price">{t ? fmtP(t.price) : '—'}</span>
            {chg != null && (
              <span className={`ds-strip-chg ${up ? 'up' : 'dn'}`}>{(up ? '+' : '') + chg.toFixed(2) + '%'}</span>
            )}
          </div>
        )
      })}

      {/* Commodities: Gold, Silver, Brent */}
      {['GOLD', 'SILVER', 'BRENTOIL'].map(key => {
        const c   = commodities[key]
        const chg = c?.change_24h_pct
        const up  = (chg || 0) >= 0
        return (
          <div key={key} className="ds-strip-coin">
            <CommodityIcon sym={key} />
            <span className="ds-strip-sym">{COMMODITY_LABELS[key]}</span>
            <span className="ds-strip-price">{c?.last_price ? fmtP(c.last_price) : '—'}</span>
            {chg != null && (
              <span className={`ds-strip-chg ${up ? 'up' : 'dn'}`}>{(up ? '+' : '') + chg.toFixed(2) + '%'}</span>
            )}
          </div>
        )
      })}

      <div className="ds-strip-sep" />

      {/* Global stats */}
      {global && (
        <>
          <div className="ds-strip-stat">
            <span className="ds-strip-stat-l">Mkt Cap</span>
            <span className="ds-strip-stat-v">{fmtLg(global.total_market_cap?.usd)}</span>
          </div>
          <div className="ds-strip-stat">
            <span className="ds-strip-stat-l">BTC Dom</span>
            <span className="ds-strip-stat-v">{global.market_cap_percentage?.btc?.toFixed(1)}%</span>
          </div>
          <div className="ds-strip-stat">
            <span className="ds-strip-stat-l">ETH Dom</span>
            <span className="ds-strip-stat-v">{global.market_cap_percentage?.eth?.toFixed(1)}%</span>
          </div>
        </>
      )}
      {fg && (
        <div className="ds-strip-stat">
          <span className="ds-strip-stat-l">Fear &amp; Greed</span>
          <span className="ds-strip-stat-v" style={{ color: fgColor }}>{fg.value} · {fg.value_classification}</span>
        </div>
      )}
    </div>
  )
}

// ─── Watchlist Widget ─────────────────────────────────────────────────────────
const DEFAULT_WATCH = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'AVAX']

function WatchlistWidget() {
  const [list, setList]     = useState(() => {
    try { return JSON.parse(localStorage.getItem('tt_watchlist') || 'null') || DEFAULT_WATCH } catch { return DEFAULT_WATCH }
  })
  const meta              = useCmcMeta()
  const tickers           = useBinanceTicker(list)
  const [adding, setAdding] = useState(false)
  const [input, setInput]   = useState('')
  const inputRef            = useRef(null)

  const allSyms = Object.keys(meta)

  useEffect(() => { if (adding) inputRef.current?.focus() }, [adding])

  const saveList = (next) => {
    setList(next)
    localStorage.setItem('tt_watchlist', JSON.stringify(next))
  }
  const remove = (sym) => saveList(list.filter(s => s !== sym))
  const add = (sym) => {
    const s = sym.toUpperCase().trim()
    if (!s || list.includes(s)) return
    saveList([...list, s])
    setInput(''); setAdding(false)
  }

  const goTo = (sym) => {
    sessionStorage.setItem('tt_trade_symbol', sym)
    window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page: 'spot-markets' } }))
  }

  const suggestions = input.length >= 1
    ? allSyms.filter(s => s.startsWith(input.toUpperCase())).slice(0, 6)
    : []

  return (
    <div className="ds-watch">
      <div className="ds-watch-hdr">
        <span className="ds-watch-title">Watchlist</span>
        <button className="ds-watch-add-btn" onClick={() => setAdding(p => !p)}>
          {adding ? '✕' : '+ Ekle'}
        </button>
      </div>

      {adding && (
        <div className="ds-watch-input-wrap">
          <input ref={inputRef} className="ds-watch-input" placeholder="Coin sembolü (örn: LINK)"
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(input); if (e.key === 'Escape') setAdding(false) }} />
          {suggestions.length > 0 && (
            <div className="ds-watch-suggest">
              {suggestions.map(s => (
                <button key={s} className="ds-watch-sug-item" onClick={() => add(s)}>{s}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="ds-watch-list">
        {list.map(sym => {
          const t   = tickers[sym]
          const m   = meta[sym]
          const chg = t?.chg
          const up  = (chg || 0) >= 0
          return (
            <div key={sym} className="ds-watch-row" onClick={() => goTo(sym)}>
              <div className="ds-watch-row-left">
                {m?.id
                  ? <img src={`https://s2.coinmarketcap.com/static/img/coins/32x32/${m.id}.png`} alt={sym} className="ds-watch-logo" />
                  : <span className="ds-watch-logo-fb">{sym.slice(0, 2)}</span>
                }
                <div>
                  <span className="ds-watch-sym">{sym}</span>
                  {m?.name && <span className="ds-watch-name">{m.name}</span>}
                </div>
              </div>
              <div className="ds-watch-row-right">
                <span className="ds-watch-price">{t ? fmtP(t.price) : '—'}</span>
                {chg != null
                  ? <span className={`ds-watch-chg ${up ? 'up' : 'dn'}`}>{(up ? '+' : '') + chg.toFixed(2) + '%'}</span>
                  : <span className="ds-watch-chg" style={{ color: 'var(--text-3)' }}>—</span>}
              </div>
              <button className="ds-watch-remove" onClick={e => { e.stopPropagation(); remove(sym) }}>✕</button>
            </div>
          )
        })}
        {list.length === 0 && <div className="ds-watch-empty">Henüz coin eklenmedi</div>}
      </div>
    </div>
  )
}

const TIPS = [
  { icon: '📊', title: 'Markets',       desc: 'Real-time prices for 200+ coins', page: 'spot-markets'  },
  { icon: '📈', title: 'Stocks',        desc: 'Track US equities from TradFi futures', page: 'stocks'  },
  { icon: '🔔', title: 'Custom Alerts', desc: 'Set price alerts for any coin',   page: 'custom-alerts' },
  { icon: '📰', title: 'Terminal',      desc: 'Live news feed + trade execution', page: 'terminal'      },
  { icon: '🐋', title: 'Smart Money',   desc: 'Track top trader positions',      page: 'smart-money'   },
]

function WelcomeCard() {
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('tt_welcome_dismissed') === '1')

  if (dismissed) return null

  const dismiss = () => {
    localStorage.setItem('tt_welcome_dismissed', '1')
    setDismissed(true)
  }

  const goTo = (page) => {
    window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page } }))
  }

  return (
    <div className="welcome-card">
      <button className="welcome-dismiss" onClick={dismiss}>✕</button>
      <div className="welcome-header">
        <h2>Welcome{user?.name ? `, ${user.name}` : ''}!</h2>
        <p>Here's how to get started with Trading Tools</p>
      </div>
      <div className="welcome-tips">
        {TIPS.map(tip => (
          <button key={tip.page} className="welcome-tip" onClick={() => goTo(tip.page)}>
            <span className="welcome-tip-icon">{tip.icon}</span>
            <span className="welcome-tip-title">{tip.title}</span>
            <span className="welcome-tip-desc">{tip.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function DashboardPage() {
    return (
        <div className="dashboard-content" style={{ paddingTop: 0 }}>
            <DashboardNewsTicker />
            <WelcomeCard />
            <MarketStrip />

        <div className="dashboard-grid">
                {/* Row 0: Watchlist full width */}
                <div className="dashboard-grid-full">
                    <WatchlistWidget />
                </div>

                {/* Row 1: Long/Short + Liquidations */}
                <LongShortRatio />
                <LiquidationsStream />

                {/* Row 2: Volume Monitor + Alert Monitoring */}
                <VolumeMonitor />
                <AlertMonitoring />

                {/* Row 3: Economic Calendar (full width) */}
                <div className="dashboard-grid-full">
                    <EconomicCalendar />
                </div>
            </div>
        </div>
    )
}
