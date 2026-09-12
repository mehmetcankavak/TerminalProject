import { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import AssetLogo from './AssetLogo'

const SYMBOLS = ['BTC','ETH','SOL','XRP','BNB','DOGE','ADA','TRX','AVAX','LINK','DOT','LTC','NEAR','APT','ARB','OP','INJ','SUI']
const PERIODS = [['1h', '1H'], ['4h', '4H'], ['1d', '24H'], ['7d', '7D'], ['30d', '30D']]
// Binance FAPI only serves ratio history down to 5m…1d candles; 7D/30D use 1d rows over a wider window.
const PERIOD_QUERY = { '1h': ['1h', 48], '4h': ['4h', 42], '1d': ['1d', 30], '7d': ['1d', 60], '30d': ['1d', 120] }
const FAPI = 'https://fapi.binance.com'

async function fetchHistory(symbol, period) {
  const [p, limit] = PERIOD_QUERY[period]
  const [g, t] = await Promise.all([
    fetch(`${FAPI}/futures/data/globalLongShortAccountRatio?symbol=${symbol}USDT&period=${p}&limit=${limit}`).then(r => r.json()).catch(() => []),
    fetch(`${FAPI}/futures/data/topLongShortAccountRatio?symbol=${symbol}USDT&period=${p}&limit=${limit}`).then(r => r.json()).catch(() => []),
  ])
  const global = Array.isArray(g) ? g : [], top = Array.isArray(t) ? t : []
  return global.map((row, i) => ({
    ts: Number(row.timestamp),
    long: parseFloat(row.longAccount) * 100, short: parseFloat(row.shortAccount) * 100,
    topLong: top[i] ? parseFloat(top[i].longAccount) * 100 : null, topShort: top[i] ? parseFloat(top[i].shortAccount) * 100 : null,
  }))
}

const pct = v => v == null || isNaN(v) ? '—' : v.toFixed(1) + '%'
const fmtPrice = v => v >= 1000 ? '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v >= 1 ? '$' + v.toFixed(2) : '$' + v.toFixed(4)

/* ── Ratio line chart (SVG) ─────────────────────────────────────────────── */
function RatioChart({ rows }) {
  const W = 1000, H = 190, padL = 0, padR = 60, padT = 10, padB = 10
  const n = rows.length
  if (n < 2) return <div className="ws-empty" style={{ padding: '50px 20px' }}><div className="ws-empty-title">Loading ratio history…</div></div>
  const x = i => padL + (i / (n - 1)) * (W - padL - padR)
  const y = v => padT + (1 - v / 100) * (H - padT - padB)
  const path = key => rows.map((r, i) => r[key] == null ? null : `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(r[key]).toFixed(1)}`).filter(Boolean).join(' ')
  const last = rows[n - 1]
  const series = [['long', '#16a34a', false, 'All Accounts Long %'], ['short', '#dc2626', false, 'All Accounts Short %'], ['topLong', '#16a34a', true, 'Top Traders Long %'], ['topShort', '#dc2626', true, 'Top Traders Short %']]
  const labelEvery = Math.max(1, Math.round(n / 7))
  return (
    <div className="lsr-chart">
      <div className="lsr-chart-y">{[100, 75, 50, 25, 0].map(v => <span key={v}>{v}%</span>)}</div>
      <div className="lsr-chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
          {[0, 25, 50, 75, 100].map(v => <line key={v} x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#e5e7eb" strokeDasharray="3 4" />)}
          <path d={`${path('long')} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="rgba(22,163,74,0.08)" />
          {series.map(([k, c, dash]) => <path key={k} d={path(k)} fill="none" stroke={c} strokeWidth={dash ? 1.5 : 2.2} strokeDasharray={dash ? '6 5' : ''} vectorEffect="non-scaling-stroke" />)}
          {series.map(([k, c]) => last[k] != null && <circle key={k} cx={x(n - 1)} cy={y(last[k])} r="3.5" fill={c} />)}
        </svg>
        {series.map(([k, c]) => last[k] != null && (
          <span key={k} className="lsr-chart-tag" style={{ top: `${(y(last[k]) / H) * 100}%`, background: c }}>{last[k].toFixed(1)}%</span>
        ))}
        <div className="lsr-chart-x">
          {rows.map((r, i) => i % labelEvery === 0 ? <span key={i} style={{ left: `${(x(i) / W) * 100}%` }}>{new Date(r.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {new Date(r.ts).toTimeString().slice(0, 5)}</span> : null)}
        </div>
      </div>
    </div>
  )
}

function Bar({ v, neg }) {
  return <div className="ws-row" style={{ gap: 8 }}><span className={`ws-num ${neg ? 'ws-neg' : 'ws-pos'}`} style={{ width: 46 }}>{pct(v)}</span><div className="ws-bar ws-bar-lg" style={{ width: 120 }}><div className={`ws-bar-fill ${neg ? 'neg' : ''}`} style={{ width: `${v || 0}%` }} /></div></div>
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function LongShortRatio() {
  const [symbol, setSymbol]   = useState('BTC')
  const [period, setPeriod]   = useState('1d')
  const [history, setHistory] = useState([])
  const [table, setTable]     = useState([])
  const [tickers, setTickers] = useState({})
  const [lastUp, setLastUp]   = useState(null)

  const loadHistory = useCallback(async () => {
    setHistory(await fetchHistory(symbol, period))
    setLastUp(new Date())
  }, [symbol, period])

  const loadTable = useCallback(async () => {
    const [p] = PERIOD_QUERY[period]
    const rows = await Promise.all(SYMBOLS.map(async s => {
      const [g, t] = await Promise.all([
        fetch(`${FAPI}/futures/data/globalLongShortAccountRatio?symbol=${s}USDT&period=${p}&limit=1`).then(r => r.json()).catch(() => []),
        fetch(`${FAPI}/futures/data/topLongShortAccountRatio?symbol=${s}USDT&period=${p}&limit=1`).then(r => r.json()).catch(() => []),
      ])
      const gg = Array.isArray(g) ? g[0] : null, tt = Array.isArray(t) ? t[0] : null
      return { symbol: s, long: gg ? parseFloat(gg.longAccount) * 100 : null, short: gg ? parseFloat(gg.shortAccount) * 100 : null, topLong: tt ? parseFloat(tt.longAccount) * 100 : null, topShort: tt ? parseFloat(tt.shortAccount) * 100 : null }
    }))
    setTable(rows.filter(r => r.long != null))
  }, [period])

  useEffect(() => {
    fetch(`${FAPI}/fapi/v1/ticker/24hr`).then(r => r.json()).then(list => {
      if (!Array.isArray(list)) return
      const m = {}
      for (const t of list) if (t.symbol?.endsWith('USDT')) m[t.symbol.replace('USDT', '')] = { price: parseFloat(t.lastPrice), change: parseFloat(t.priceChangePercent) }
      setTickers(m)
    }).catch(() => {})
  }, [])

  useEffect(() => { loadHistory(); const id = setInterval(loadHistory, 60_000); return () => clearInterval(id) }, [loadHistory])
  useEffect(() => { loadTable(); const id = setInterval(loadTable, 120_000); return () => clearInterval(id) }, [loadTable])

  const cur = useMemo(() => table.find(r => r.symbol === symbol) || (history.length ? history[history.length - 1] : null), [table, symbol, history])
  const periodLabel = PERIODS.find(p => p[0] === period)[1]

  const kpis = cur ? [
    ['All Accounts Long', cur.long, false], ['All Accounts Short', cur.short, true],
    ['Top Trader Long', cur.topLong, false], ['Top Trader Short', cur.topShort, true],
  ] : []

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <div className="ws-page-head-left"><h1 className="ws-title">Long / Short</h1></div>
        <div className="ws-page-head-right"><span className="ws-meta">Last updated: {lastUp ? lastUp.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) + ' UTC' : '—'}</span></div>
      </div>

      {/* Controls */}
      <div className="lsr-controls">
        <div className="ws-field">
          <label>Symbol</label>
          <div className="ws-inline-select" style={{ minWidth: 190 }}>
            <span className="ws-asset-logo ws-asset-logo-sm"><AssetLogo symbol={symbol} type="crypto" size={20} radius={10} /></span>
            <span className="ws-flex-1 ws-bold">{symbol}</span><ChevronDown size={15} />
            <select value={symbol} onChange={e => setSymbol(e.target.value)}>{SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}</select>
          </div>
        </div>
        <div className="ws-field">
          <label>Period</label>
          <div className="ws-row">
            <div className="ws-inline-select" style={{ minWidth: 90 }}>{periodLabel}<ChevronDown size={15} />
              <select value={period} onChange={e => setPeriod(e.target.value)}>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </div>
            <div className="ws-seg">{PERIODS.map(([k, l]) => <button key={k} className={period === k ? 'active' : ''} onClick={() => setPeriod(k)}>{l}</button>)}</div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="ws-grid ws-grid-4 ws-mt-16">
        {(kpis.length ? kpis : [['All Accounts Long', null], ['All Accounts Short', null, true], ['Top Trader Long', null], ['Top Trader Short', null, true]]).map(([label, v, neg]) => {
          const l = neg ? 100 - (v ?? 50) : (v ?? 50)
          return (
            <div key={label} className="ws-kpi">
              <div className="ws-kpi-label" style={{ color: 'var(--ws-ink)', fontWeight: 600, fontSize: 15 }}>{label}</div>
              <div className={`ws-kpi-value ${neg ? 'ws-neg' : 'ws-pos'}`}>{pct(v)}</div>
              <div className="ws-split ws-mt-8"><span className="l" style={{ width: `${l}%` }} /><span className="s" style={{ width: `${100 - l}%` }} /></div>
              <div className="ws-row-between ws-mt-8 ws-small"><span className="ws-text">Long</span><span className="ws-ink ws-num">{pct(neg ? 100 - (v ?? 0) : v)}</span></div>
              <div className="ws-row-between ws-small"><span className="ws-text">Short</span><span className="ws-ink ws-num">{pct(neg ? v : 100 - (v ?? 0))}</span></div>
            </div>
          )
        })}
      </div>

      {/* Chart */}
      <div className="ws-card ws-mt-16">
        <div className="ws-card-head">
          <h3 className="ws-h3">{symbol} Long / Short Ratio (All Accounts vs Top Traders)</h3>
          <div className="ws-chart-legend">
            <span><i style={{ background: '#16a34a' }} /> All Accounts Long %</span>
            <span><i style={{ background: '#dc2626' }} /> All Accounts Short %</span>
            <span style={{ color: '#16a34a' }}><i className="dash" /> <span className="ws-text">Top Traders Long %</span></span>
            <span style={{ color: '#dc2626' }}><i className="dash" /> <span className="ws-text">Top Traders Short %</span></span>
          </div>
        </div>
        <div className="ws-card-body"><RatioChart rows={history} /></div>
      </div>

      {/* Table */}
      <div className="ws-card ws-mt-16">
        <div className="ws-card-head"><h3 className="ws-h3">Coin Long / Short Ratio</h3></div>
        <div className="ws-table-wrap">
          <table className="ws-table ws-table-bordered ws-table-dense">
            <thead><tr><th>#</th><th>Coin</th><th>Price</th><th>All Accounts Long %</th><th>All Accounts Short %</th><th>Top Traders Long %</th><th>Top Traders Short %</th><th>24H Change</th></tr></thead>
            <tbody>
              {table.length === 0 ? <tr><td colSpan={8}><div className="ws-loading"><span className="ws-spinner" /> Loading pairs…</div></td></tr> : table.map((r, i) => {
                const t = tickers[r.symbol]
                return (
                  <tr key={r.symbol} className={r.symbol === symbol ? 'lsr-row-active' : ''} onClick={() => setSymbol(r.symbol)} style={{ cursor: 'pointer' }}>
                    <td className="ws-muted">{i + 1}</td>
                    <td><div className="ws-asset"><span className="ws-asset-logo ws-asset-logo-sm"><AssetLogo symbol={r.symbol} type="crypto" size={20} radius={10} /></span><span className="ws-asset-sym">{r.symbol}</span></div></td>
                    <td className="ws-num ws-ink">{t ? fmtPrice(t.price) : '—'}</td>
                    <td><Bar v={r.long} /></td>
                    <td><Bar v={r.short} neg /></td>
                    <td><Bar v={r.topLong} /></td>
                    <td><Bar v={r.topShort} neg /></td>
                    <td className={`ws-num ${t && t.change < 0 ? 'ws-neg' : 'ws-pos'}`}>{t ? (t.change >= 0 ? '+' : '') + t.change.toFixed(1) + '%' : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
