import { useState, useEffect, useRef, useCallback } from 'react'
import { API_BASE } from '../config'

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
function fmtM(v) {
  if (!v || v === 0) return '$0'
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(0)
}

/* ─────────────────────────────────────────────
   STAT CARD
───────────────────────────────────────────── */
function StatCard({ label, total, long, short }) {
  const longPct  = total > 0 ? (long  / total) * 100 : 50
  const shortPct = total > 0 ? (short / total) * 100 : 50
  return (
    <div className="ldash-card">
      <div className="ldash-card-hdr"><span className="ldash-card-label">{label}</span></div>
      <div className="ldash-card-total">{fmtM(total)}</div>
      <div className="ldash-card-ratio-bar">
        <div style={{ width: longPct  + '%', background: '#22ab94', height: '100%', borderRadius: '3px 0 0 3px', transition: 'width .5s' }} />
        <div style={{ width: shortPct + '%', background: '#f23645', height: '100%', borderRadius: '0 3px 3px 0', transition: 'width .5s' }} />
      </div>
      <div className="ldash-card-rows">
        <div className="ldash-card-row">
          <span className="ldash-card-row-lbl">Long</span>
          <span className="ldash-card-row-val ldash-long">{fmtM(long)}</span>
        </div>
        <div className="ldash-card-row">
          <span className="ldash-card-row-lbl">Short</span>
          <span className="ldash-card-row-val ldash-short">{fmtM(short)}</span>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   EXCHANGE TABLE
───────────────────────────────────────────── */
const EXCHANGE_META = {
  binance:     { label: 'Binance',     icon: '/logos/binance.png' },
  okx:         { label: 'OKX',         icon: '/logos/okx.png' },
  bybit:       { label: 'Bybit',       icon: '/logos/bybit.png' },
  hyperliquid: { label: 'Hyperliquid', icon: 'https://icons.llamao.fi/icons/protocols/hyperliquid' },
}

const PERIODS = [
  { key: 'h1',  label: '1H'  },
  { key: 'h4',  label: '4H'  },
  { key: 'h12', label: '12H' },
  { key: 'h24', label: '24H' },
]

function ExchangeLiquidationsTable({ exchangeMap, wsExchangeMap, stats }) {
  const [period, setPeriod] = useState('h24')

  const base = {}
  for (const [ex, meta] of Object.entries(EXCHANGE_META)) {
    const api = exchangeMap?.[ex]   || { long: 0, short: 0 }
    const ws  = wsExchangeMap?.[ex] || { long: 0, short: 0 }
    base[ex] = { ...meta, long: api.long + ws.long, short: api.short + ws.short }
  }

  const base24Total = Object.values(base).reduce((s, r) => s + r.long + r.short, 0)
  const periodStats = stats?.[period]
  const periodTotal = periodStats ? (periodStats.long || 0) + (periodStats.short || 0) : base24Total
  const scale = base24Total > 0 ? periodTotal / base24Total : 1

  const rows = Object.entries(base).map(([ex, d]) => ({
    ex, ...d,
    long:  d.long  * scale,
    short: d.short * scale,
  }))

  const allLong  = rows.reduce((s, r) => s + r.long,  0)
  const allShort = rows.reduce((s, r) => s + r.short, 0)
  const allTotal = allLong + allShort
  const allIsLong = allLong >= allShort
  return (
    <div className="ldash-ex-table-wrap">
      <div className="ldash-ex-head">
        <span className="ldash-ex-title">BORSA LİKİDASYONLARI</span>
        <div className="ldash-ex-periods">
          {PERIODS.map(p => (
            <button
              key={p.key}
              className={`ldash-ex-period ${period === p.key ? 'active' : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ldash-ex-total-card">
        <div className="ldash-ex-total-top">
          <div className="ldash-ex-total-name">
            ALL EXCHANGES
            <span className={`ldash-ex-side ${allIsLong ? 'is-long' : 'is-short'}`}>
              {allIsLong ? 'LONG' : 'SHORT'}
            </span>
          </div>
          <div className="ldash-ex-total-value">{fmtM(allTotal)}</div>
        </div>
        <div className="ldash-ex-ratio-bar">
          <span className="ldash-ex-ratio-long"  style={{ width: allTotal > 0 ? (allLong  / allTotal * 100) + '%' : '50%' }} />
          <span className="ldash-ex-ratio-short" style={{ width: allTotal > 0 ? (allShort / allTotal * 100) + '%' : '50%' }} />
        </div>
      </div>

      <div className="ldash-ex-list">
        {rows.map(row => {
          const total    = row.long + row.short
          const isLong   = row.long >= row.short
          const longPct  = total > 0 ? (row.long  / total * 100) : 50
          const shortPct = total > 0 ? (row.short / total * 100) : 50
          return (
            <div key={row.ex} className="ldash-ex-row">
              <div className="ldash-ex-name">
                {row.icon && <img src={row.icon} alt={row.label} className="ldash-ex-logo" />}
                {row.label}
              </div>
              <div className="ldash-ex-ratio-bar">
                <span className="ldash-ex-ratio-long"  style={{ width: longPct  + '%' }} />
                <span className="ldash-ex-ratio-short" style={{ width: shortPct + '%' }} />
              </div>
              <div className="ldash-ex-value">{fmtM(total)}</div>
              <div className={`ldash-ex-side ${isLong ? 'is-long' : 'is-short'}`}>
                {isLong ? 'Long' : 'Short'}
              </div>
            </div>
          )
        })}
      </div>

      <div className="ldash-ex-legend">
        <span><span className="ldash-ex-dot long" />Long</span>
        <span><span className="ldash-ex-dot short" />Short</span>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   STATS PANEL (API fetch)
───────────────────────────────────────────── */
function LiquidationStatsPanel({ onStatsUpdate, onExchangesUpdate }) {
  const [stats,  setStats]  = useState(null)
  const LABELS = [
    { key: 'h1',  label: '1h Rekt'  },
    { key: 'h4',  label: '4h Rekt'  },
    { key: 'h12', label: '12h Rekt' },
    { key: 'h24', label: '24h Rekt' },
  ]
  const fetchStats = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/liq-stats`)
      const data = await res.json()
      if (data.error) return
      setStats(data.stats)
      if (onStatsUpdate)                       onStatsUpdate(data.stats)
      if (onExchangesUpdate && data.exchanges) onExchangesUpdate(data.exchanges)
    } catch (err) {
      console.warn('[Liquidations] fetch stats error', err)
    }
  }, [onStatsUpdate, onExchangesUpdate])

  useEffect(() => {
    fetchStats()
    const t = setInterval(fetchStats, 3 * 60_000)
    return () => clearInterval(t)
  }, [fetchStats])

  const cards = stats
    ? LABELS.map(({ key, label }) => ({
        label,
        total: (stats[key]?.long || 0) + (stats[key]?.short || 0),
        long:   stats[key]?.long  || 0,
        short:  stats[key]?.short || 0,
      }))
    : LABELS.map(({ label }) => ({ label, total: 0, long: 0, short: 0 }))

  return (
    <div className="ldash-cards-grid">
      {cards.map(s => <StatCard key={s.label} {...s} />)}
    </div>
  )
}

/* ─────────────────────────────────────────────
   MAIN
───────────────────────────────────────────── */
export default function LiquidationsStream() {
  const [live,           setLive]           = useState(false)
  const [apiExchangeMap, setApiExchangeMap] = useState({})
  const [wsExchangeMap,  setWsExchangeMap]  = useState({ binance: { long: 0, short: 0 } })
  const [stats,          setStats]          = useState(null)

  const wsExchangeRef = useRef({ binance: { long: 0, short: 0 } })
  const wsRef         = useRef(null)
  const timerRef      = useRef(null)

  const addLiq = useCallback((liq) => {
    const exMap = wsExchangeRef.current
    if (!exMap.binance) exMap.binance = { long: 0, short: 0 }
    exMap.binance[liq.side] += liq.usdValue
    setWsExchangeMap({ ...exMap })
  }, [])

  const connect = useCallback(() => {
    clearTimeout(timerRef.current)
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close() }
    const ws = new WebSocket('wss://fstream.binance.com/ws/!forceOrder@arr')
    wsRef.current = ws
    ws.onopen  = () => setLive(true)
    ws.onerror = () => setLive(false)
    ws.onclose = () => {
      setLive(false)
      timerRef.current = setTimeout(connect, 3000)
    }
    ws.onmessage = (e) => {
      try {
        const o = JSON.parse(e.data).o
        if (!o) return
        const side     = o.S === 'SELL' ? 'long' : 'short'
        const price    = parseFloat(o.ap)
        const baseQty  = parseFloat(o.z)
        const usdValue = price * baseQty
        if (!price || !baseQty || usdValue < 100) return
        addLiq({ side, usdValue })
      } catch (err) { console.warn('[Liquidations] WS parse error', err) }
    }
  }, [addLiq])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(timerRef.current)
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close() }
    }
  }, [connect])

  return (
    <div className="ldash-page">
      <div className="ldash-layout">
        <div className="ldash-stats-wrap" style={{ marginBottom: 16 }}>
          <div className="ldash-section-hdr" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="ldash-section-title">Total Liquidations</span>
            <span className={`ldash-live-badge ${live ? 'ldash-live-on' : ''}`}>
              <span className="ldash-live-dot" />{live ? 'LIVE' : 'BAĞLANIYOR'}
            </span>
          </div>
          <LiquidationStatsPanel
            onStatsUpdate={setStats}
            onExchangesUpdate={setApiExchangeMap}
          />
        </div>

        <div className="ldash-bottom-row">
          <ExchangeLiquidationsTable
            exchangeMap={apiExchangeMap}
            wsExchangeMap={wsExchangeMap}
            stats={stats}
          />
        </div>
      </div>
    </div>
  )
}
