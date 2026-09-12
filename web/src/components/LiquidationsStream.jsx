import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { RotateCcw, ChevronDown } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'
import { useWebSocket } from '../hooks/useWebSocket'

// Global 24H totals + per-coin breakdown come from the backend (/api/liq-stats, 3 min refresh).
// The timeline and the recent table are built from the live liquidation stream the backend
// broadcasts over the WS (OKX + Bybit perps, everything under $10K filtered server-side).

const PERIODS = [['h1', '1H', 1], ['h4', '4H', 4], ['h12', '12H', 12], ['h24', '24H', 24]]
const fmtUSD = v => !v ? '$0' : '$' + Math.round(v).toLocaleString('en-US')
const fmtUSDShort = v => !v ? '$0' : v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(0) + 'M' : '$' + (v / 1e3).toFixed(0) + 'K'
const fmtPrice = p => p >= 1000 ? p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : p >= 1 ? p.toFixed(2) : p.toFixed(4)
const fmtQty = q => q >= 1000 ? Math.round(q).toLocaleString('en-US') : q.toFixed(2)
const fmtTime = ts => { const d = new Date(ts); return d.toISOString().slice(0, 10) + ' ' + d.toTimeString().slice(0, 8) }
const fmtClock = () => { const d = new Date(); return d.toUTCString().replace(/^(\w+), (\d+) (\w+) (\d+) (\d+:\d+:\d+).*$/, '$1, $3 $2, $4  $5 UTC') }
const isLong = side => /long|buy/i.test(side || '')

/* ── Timeline (bucketed live events) ───────────────────────────────────── */
function Timeline({ feed, hours }) {
  const buckets = useMemo(() => {
    const n = hours <= 1 ? 12 : hours <= 4 ? 16 : hours <= 12 ? 24 : 48
    const span = hours * 3600000
    const now = Date.now()
    const arr = Array.from({ length: n }, (_, i) => ({ t: now - span + (i + 0.5) * (span / n), long: 0, short: 0 }))
    for (const e of feed) {
      const idx = Math.floor((e.ts - (now - span)) / (span / n))
      if (idx < 0 || idx >= n) continue
      if (isLong(e.side)) arr[idx].long += e.usd; else arr[idx].short += e.usd
    }
    return arr
  }, [feed, hours])

  const max = Math.max(...buckets.map(b => Math.max(b.long, b.short)), 1)
  const W = 1000, H = 220, mid = H / 2, pad = 6
  const bw = W / buckets.length
  const ticks = [1, 0.5, 0, -0.5, -1]
  const labelEvery = Math.max(1, Math.round(buckets.length / 8))

  if (!feed.length) {
    return <div className="ws-empty" style={{ padding: '60px 20px' }}><div className="ws-empty-title">Collecting live liquidations…</div><div className="ws-empty-sub">The timeline fills as OKX / Bybit events stream in ($10K+ only).</div></div>
  }

  return (
    <div className="liq-timeline">
      <div className="liq-timeline-y">
        {ticks.map(t => <span key={t}>{t === 0 ? '$0' : (t > 0 ? '' : '-') + fmtUSDShort(Math.abs(t) * max).replace('$', '$')}</span>)}
      </div>
      <div className="liq-timeline-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
          {ticks.map(t => <line key={t} x1="0" x2={W} y1={mid - t * (mid - pad)} y2={mid - t * (mid - pad)} stroke="#e5e7eb" strokeWidth="1" strokeDasharray={t === 0 ? '' : '3 4'} />)}
          {buckets.map((b, i) => {
            const lh = (b.long / max) * (mid - pad)
            const sh = (b.short / max) * (mid - pad)
            return (
              <g key={i}>
                {lh > 0 && <rect x={i * bw + bw * 0.2} y={mid - lh} width={bw * 0.6} height={lh} fill="#22c55e" rx="1" />}
                {sh > 0 && <rect x={i * bw + bw * 0.2} y={mid} width={bw * 0.6} height={sh} fill="#ef4444" rx="1" />}
              </g>
            )
          })}
        </svg>
        <div className="liq-timeline-x">
          {buckets.map((b, i) => i % labelEvery === 0 ? (
            <span key={i} style={{ left: `${(i + 0.5) / buckets.length * 100}%` }}>
              {new Date(b.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}<br />{new Date(b.t).toTimeString().slice(0, 5)}
            </span>
          ) : null)}
        </div>
      </div>
    </div>
  )
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function LiquidationsStream() {
  const { token } = useAuth()
  const [stats, setStats]     = useState(null)
  const [period, setPeriod]   = useState('h24')
  const [feed, setFeed]       = useState([])
  const [symbol, setSymbol]   = useState('ALL')
  const [side, setSide]       = useState('ALL')
  const [minUsd, setMinUsd]   = useState('')
  const [clock, setClock]     = useState(fmtClock)
  const seenRef = useRef(new Set())

  useEffect(() => { const id = setInterval(() => setClock(fmtClock()), 1000); return () => clearInterval(id) }, [])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/liq-stats`)
      const data = await res.json()
      if (data?.stats) setStats(data.stats)
    } catch { /* keep the last snapshot */ }
  }, [])
  useEffect(() => { fetchStats(); const id = setInterval(fetchStats, 3 * 60_000); return () => clearInterval(id) }, [fetchStats])

  const onWsMessage = useCallback(msg => {
    if (!msg || msg.type !== 'liquidation') return
    const key = `${msg.exchange}:${msg.symbol}:${msg.ts}:${msg.usd}`
    if (seenRef.current.has(key)) return
    seenRef.current.add(key)
    setFeed(prev => [msg, ...prev].slice(0, 2000))
  }, [])
  useWebSocket(onWsMessage, [], { token })

  const p = stats?.[period] || { long: 0, short: 0 }
  const total = (p.long || 0) + (p.short || 0)
  const longPct = total > 0 ? (p.long / total) * 100 : 50
  const hours = PERIODS.find(x => x[0] === period)[2]

  const symbols = useMemo(() => [...new Set(feed.map(e => e.symbol))].sort(), [feed])
  const rows = useMemo(() => {
    const min = parseFloat(minUsd) || 0
    return feed
      .filter(e => symbol === 'ALL' || e.symbol === symbol)
      .filter(e => side === 'ALL' || (side === 'long' ? isLong(e.side) : !isLong(e.side)))
      .filter(e => e.usd >= min)
      .slice(0, 50)
  }, [feed, symbol, side, minUsd])

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <div className="ws-page-head-left"><h1 className="ws-title">Liquidations</h1></div>
        <div className="ws-page-head-right"><span className="ws-meta-stamp">{clock}</span></div>
      </div>

      {/* KPI cards */}
      <div className="ws-grid ws-grid-4">
        <div className="ws-kpi">
          <div className="ws-kpi-label">Total Liquidation Value</div>
          <div className="ws-kpi-value ws-kpi-mono">{stats ? fmtUSD(total) : '—'}</div>
          <div className="ws-kpi-sub"><span className={longPct >= 50 ? 'ws-pos' : 'ws-neg'}>{longPct >= 50 ? '▲' : '▼'} {longPct >= 50 ? 'long-heavy' : 'short-heavy'}</span> last {hours}h · all exchanges</div>
        </div>
        <div className="ws-kpi">
          <div className="ws-kpi-label">Long Liquidations</div>
          <div className="ws-kpi-value ws-kpi-mono">{stats ? fmtUSD(p.long) : '—'}</div>
          <div className="ws-kpi-sub"><span className="ws-pos">▲ {longPct.toFixed(1)}%</span></div>
        </div>
        <div className="ws-kpi">
          <div className="ws-kpi-label">Short Liquidations</div>
          <div className="ws-kpi-value ws-kpi-mono">{stats ? fmtUSD(p.short) : '—'}</div>
          <div className="ws-kpi-sub"><span className="ws-neg">▲ {(100 - longPct).toFixed(1)}%</span></div>
        </div>
        <div className="ws-kpi">
          <div className="ws-kpi-label">Long / Short Ratio</div>
          <div className="ws-split ws-split-lg" style={{ marginTop: 10 }}>
            <span className="l" style={{ width: `${longPct}%` }}>{longPct.toFixed(1)}%</span>
            <span className="s" style={{ width: `${100 - longPct}%` }}>{(100 - longPct).toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="ws-card ws-mt-16">
        <div className="ws-card-head">
          <h3 className="ws-h3">Liquidations Timeline</h3>
          <div className="ws-seg">{PERIODS.map(([k, l]) => <button key={k} className={period === k ? 'active' : ''} onClick={() => setPeriod(k)}>{l}</button>)}</div>
        </div>
        <div className="ws-card-body">
          <Timeline feed={feed} hours={hours} />
          <div className="ws-chart-legend" style={{ justifyContent: 'center', marginTop: 14 }}>
            <span><i style={{ background: '#22c55e' }} /> Long Liquidations</span>
            <span><i style={{ background: '#ef4444' }} /> Short Liquidations</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="ws-card ws-mt-16">
        <div className="ws-card-body liq-filters">
          <span className="ws-text">Symbol</span>
          <div className="ws-inline-select" style={{ minWidth: 190 }}>{symbol === 'ALL' ? 'All Symbols' : symbol}<ChevronDown size={14} />
            <select value={symbol} onChange={e => setSymbol(e.target.value)}><option value="ALL">All Symbols</option>{symbols.map(s => <option key={s} value={s}>{s}</option>)}</select>
          </div>
          <span className="ws-text">Side</span>
          <div className="ws-inline-select" style={{ minWidth: 150 }}>{side === 'ALL' ? 'All' : side === 'long' ? 'Long' : 'Short'}<ChevronDown size={14} />
            <select value={side} onChange={e => setSide(e.target.value)}><option value="ALL">All</option><option value="long">Long</option><option value="short">Short</option></select>
          </div>
          <span className="ws-text">Min. Value (USD)</span>
          <input className="ws-input ws-mono" style={{ width: 180 }} placeholder="1,000,000" value={minUsd} onChange={e => setMinUsd(e.target.value)} />
          <button className="ws-btn" style={{ marginLeft: 'auto' }} onClick={() => { setSymbol('ALL'); setSide('ALL'); setMinUsd('') }}><RotateCcw size={14} /> Reset</button>
        </div>
      </div>

      {/* Recent */}
      <div className="ws-card ws-mt-16">
        <div className="ws-card-head"><h3 className="ws-h3">Recent Liquidations</h3><span className="ws-meta">{feed.length} live events</span></div>
        <div className="ws-table-wrap">
          <table className="ws-table ws-table-dense">
            <thead><tr><th>#</th><th>Symbol</th><th>Side</th><th className="ws-right">Price (USD)</th><th className="ws-right">Amount</th><th className="ws-right">Value (USD)</th><th>Time</th></tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7}><div className="ws-empty"><div className="ws-empty-title">Waiting for live liquidations…</div><div className="ws-empty-sub">Events above $10K appear here as OKX / Bybit publish them.</div></div></td></tr>
              ) : rows.map((e, i) => (
                <tr key={`${e.exchange}:${e.symbol}:${e.ts}:${i}`}>
                  <td className="ws-muted">{i + 1}</td>
                  <td className="ws-ink ws-bold">{e.symbol}</td>
                  <td><span className={`ws-badge ${isLong(e.side) ? 'ws-badge-pos' : 'ws-badge-neg'}`}>{isLong(e.side) ? 'Long' : 'Short'}</span></td>
                  <td className="ws-right ws-mono ws-ink">{fmtPrice(e.price || 0)}</td>
                  <td className="ws-right ws-mono ws-text">{fmtQty(e.qty || 0)} {String(e.symbol || '').replace(/USDT$|USD$/, '')}</td>
                  <td className="ws-right ws-mono ws-ink">{Math.round(e.usd).toLocaleString('en-US')}</td>
                  <td className="ws-mono ws-text">{fmtTime(e.ts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
