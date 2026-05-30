import { useState, useEffect, useCallback } from 'react'

const SYMBOLS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','DOGEUSDT',
  'AVAXUSDT','LINKUSDT','ADAUSDT','DOTUSDT','MATICUSDT','LTCUSDT',
  'NEARUSDT','APTUSDT','ARBUSDT','OPUSDT','INJUSDT','SUIUSDT',
]

const PERIODS = ['5m', '15m', '1h', '4h', '1d']

async function fetchRatio(symbol, period) {
  try {
    const [globalRes, topRes] = await Promise.all([
      fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=1`),
      fetch(`https://fapi.binance.com/futures/data/topLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=1`),
    ])
    const [global, top] = await Promise.all([globalRes.json(), topRes.json()])
    const g = Array.isArray(global) ? global[0] : null
    const t = Array.isArray(top)    ? top[0]    : null
    return {
      symbol,
      longPct:     g ? parseFloat(g.longAccount)  * 100 : null,
      shortPct:    g ? parseFloat(g.shortAccount) * 100 : null,
      topLongPct:  t ? parseFloat(t.longAccount)  * 100 : null,
      topShortPct: t ? parseFloat(t.shortAccount) * 100 : null,
    }
  } catch {
    return { symbol, longPct: null, shortPct: null, topLongPct: null, topShortPct: null }
  }
}

/* ── Horizontal gauge bar ───────────────────────────────────────── */
function GaugeBar({ longPct, size = 'normal' }) {
  if (longPct === null) return <div className="lsr2-gauge-empty">Loading…</div>
  const shortPct = 100 - longPct
  const tone     = longPct > 52 ? '#00e87a' : longPct < 48 ? '#f43f5e' : '#fbbf24'
  const isLarge  = size === 'large'

  return (
    <div className={`lsr2-gauge ${isLarge ? 'lsr2-gauge-large' : ''}`}>

      {/* Track */}
      <div className="lsr2-gauge-track" style={{ height: isLarge ? 10 : 6 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: isLarge ? 5 : 3,
          background: 'linear-gradient(to right, rgba(244,63,94,0.45) 0%, rgba(244,63,94,0.12) 35%, rgba(255,255,255,0.05) 50%, rgba(0,232,122,0.12) 65%, rgba(0,232,122,0.45) 100%)',
        }} />
        <div style={{
          position: 'absolute', top: -2, bottom: -2, left: '50%',
          width: 1, background: 'rgba(255,255,255,0.15)', transform: 'translateX(-50%)',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: longPct + '%',
          width: isLarge ? 16 : 10, height: isLarge ? 16 : 10,
          borderRadius: '50%', background: tone,
          boxShadow: `0 0 ${isLarge ? 12 : 7}px ${tone}99`,
          border: `${isLarge ? 2.5 : 1.5}px solid #000`,
          transform: 'translate(-50%, -50%)',
          transition: 'left 0.4s cubic-bezier(0.25,0.46,0.45,0.94)',
        }} />
      </div>

      {/* Corner labels — SHORT% left · LONG% right */}
      <div className="lsr2-gauge-corners">
        <span style={{ color: '#f43f5e' }}>SHORT {shortPct.toFixed(1)}%</span>
        {isLarge && <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9 }}>NEUTRAL</span>}
        <span style={{ color: '#00e87a' }}>LONG {longPct.toFixed(1)}%</span>
      </div>

    </div>
  )
}

/* ── BTC Spotlight ──────────────────────────────────────────────── */
function BtcSpotlight({ btc }) {
  if (!btc) {
    return (
      <div className="lsr2-spotlight lsr2-spotlight-loading">
        <div className="lsr2-section-hdr">BTC/USDT · LOADING…</div>
      </div>
    )
  }
  const tone = btc.longPct > 52 ? '#00e87a' : btc.longPct < 48 ? '#f43f5e' : '#fbbf24'

  return (
    <div className="lsr2-spotlight">
      <div className="lsr2-spotlight-top">
        <div className="lsr2-section-hdr">BTC/USDT · LONG/SHORT RATIO</div>
        <span className="lsr2-spot-badge" style={{ color: tone, borderColor: tone + '55', background: tone + '18' }}>
          {btc.longPct > 52 ? 'LONG HEAVY' : btc.longPct < 48 ? 'SHORT HEAVY' : 'NEUTRAL'}
        </span>
      </div>

      <GaugeBar longPct={btc.longPct} size="large" />

      <div className="lsr2-stat-grid">
        {[
          { label: 'All Acct · Long',   val: btc.longPct,              color: '#00e87a' },
          { label: 'All Acct · Short',  val: btc.longPct != null ? 100 - btc.longPct : null, color: '#f43f5e' },
          { label: 'Top Trader · Long', val: btc.topLongPct,           color: '#6ee7d8' },
          { label: 'Top Trader · Short',val: btc.topShortPct,          color: '#fca5a5' },
        ].map(({ label, val, color }) => (
          <div key={label} className="lsr2-stat-card">
            <div className="lsr2-stat-label">{label}</div>
            <div className="lsr2-stat-val" style={{ color }}>{val != null ? val.toFixed(2) + '%' : '—'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Coin Card ──────────────────────────────────────────────────── */
function CoinCard({ row }) {
  const sym     = row.symbol.replace('USDT', '')
  const tone    = row.longPct > 55 ? '#00e87a' : row.longPct < 45 ? '#f43f5e' : '#fbbf24'
  const verdict = row.longPct > 55 ? 'LONG' : row.longPct < 45 ? 'SHORT' : 'NEUTRAL'
  return (
    <div className="lsr2-coin-card">
      {/* col 1: symbol */}
      <div className="lsr2-coin-sym">
        <span>{sym}</span>
        <span className="lsr2-coin-pair">/USDT</span>
      </div>
      {/* col 2: gauge bar — S% left corner / L% right corner */}
      <GaugeBar longPct={row.longPct} />
      {/* col 3: verdict badge */}
      <span className="lsr2-signal-badge" style={{ color: tone, borderColor: tone + '55', background: tone + '18' }}>
        {verdict}
      </span>
    </div>
  )
}

/* ── Main ───────────────────────────────────────────────────────── */
export default function LongShortRatio() {
  const [period,  setPeriod]  = useState('1h')
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUp,  setLastUp]  = useState(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    const results = await Promise.all(SYMBOLS.map(s => fetchRatio(s, period)))
    setRows(results.filter(r => r.longPct !== null))
    setLastUp(new Date())
    setLoading(false)
  }, [period])

  useEffect(() => {
    loadAll()
    const t = setInterval(loadAll, 60_000)
    return () => clearInterval(t)
  }, [loadAll])

  const btc = rows.find(r => r.symbol === 'BTCUSDT')
  const others = rows.filter(r => r.symbol !== 'BTCUSDT')

  return (
    <div className="lsr2-page">

      {/* Header */}
      <div className="lsr2-page-header">
        <div>
          <div className="lsr2-page-title">Long / Short Ratio</div>
          <div className="lsr2-page-subtitle">
            <span className="lsr2-live-dot" />
            Binance FAPI · All Accounts + Top Traders
          </div>
        </div>
        <div className="lsr2-toolbar-right">
          {lastUp && <span className="lsr2-updated">↻ {lastUp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>}
          <div className="lsr2-periods">
            {PERIODS.map(p => (
              <button key={p} className={`lsr2-period-btn ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* BTC Spotlight */}
      <BtcSpotlight btc={btc} />

      {/* Coin grid */}
      <div className="lsr2-section">
        <div className="lsr2-section-hdr lsr2-section-hdr-row">
          <span>ALL PAIRS · {period.toUpperCase()}</span>
          {loading && <span className="lsr2-updating">updating…</span>}
        </div>
        {loading && rows.length === 0 ? (
          <div className="lsr2-loading">
            <div className="ldash-spinner" />
            <span>Loading data…</span>
          </div>
        ) : (
          <div className="lsr2-coin-grid">
            {others.map(r => <CoinCard key={r.symbol} row={r} />)}
          </div>
        )}
      </div>

    </div>
  )
}
