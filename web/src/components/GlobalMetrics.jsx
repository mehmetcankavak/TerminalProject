import { useState, useEffect, useRef } from 'react'
import { Info, Search, ChevronRight } from 'lucide-react'

const COINGECKO  = 'https://api.coingecko.com/api/v3'
const FEAR_GREED = 'https://api.alternative.me/fng/'

const fmtB = n => n == null || !isFinite(n) ? '—' : Math.abs(n) >= 1e12 ? '$' + (n / 1e12).toFixed(2) + 'T' : Math.abs(n) >= 1e9 ? '$' + (n / 1e9).toFixed(1) + 'B' : '$' + (n / 1e6).toFixed(0) + 'M'
const fmtPct = (n, sign = false) => n == null || !isFinite(n) ? '—' : (sign && n >= 0 ? '+' : '') + n.toFixed(1) + '%'
const fmtPrice = p => p == null ? '—' : p >= 1000 ? '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 }) : p >= 1 ? '$' + p.toFixed(2) : '$' + p.toPrecision(3)
const fmtClock = () => { const d = new Date(); return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toTimeString().slice(0, 5) + ' UTC' }
const CHART_RANGES = [['7D', '60'], ['30D', '240'], ['90D', 'D'], ['1Y', 'W']]

/* ── Fear & Greed gauge ───────────────────────────────────────────────── */
function FearGreedGauge({ value, label }) {
  const angle = -90 + ((value ?? 50) / 100) * 180
  const segs = [['#ef4444', 0, 25], ['#f97316', 25, 45], ['#d1d5db', 45, 55], ['#84cc16', 55, 75], ['#16a34a', 75, 100]]
  const arc = (a0, a1) => {
    const r = 62, cx = 80, cy = 78
    const p = a => [cx + r * Math.cos((a - 180) * Math.PI / 180), cy + r * Math.sin((a - 180) * Math.PI / 180)]
    const [x0, y0] = p(a0 * 1.8), [x1, y1] = p(a1 * 1.8)
    return `M${x0},${y0} A${r},${r} 0 ${a1 - a0 > 50 ? 1 : 0} 1 ${x1},${y1}`
  }
  return (
    <div className="gm-gauge">
      <svg viewBox="0 0 160 92" width="160" height="92">
        {segs.map(([c, a0, a1]) => <path key={c} d={arc(a0, a1)} fill="none" stroke={c} strokeWidth="14" />)}
        <line x1="80" y1="78" x2={80 + 48 * Math.cos((angle - 90) * Math.PI / 180)} y2={78 + 48 * Math.sin((angle - 90) * Math.PI / 180)} stroke="#111827" strokeWidth="3" strokeLinecap="round" />
        <circle cx="80" cy="78" r="4" fill="#111827" />
      </svg>
      <div className="gm-gauge-val"><b>{value ?? '—'}</b><span>{label || ''}</span></div>
      <div className="gm-gauge-ends"><span>Extreme Fear</span><span>Extreme Greed</span></div>
    </div>
  )
}

/* ── TradingView chart card ─────────────────────────────────────────────── */
function TVChart({ symbol, interval, height = 200 }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.innerHTML = ''
    const container = document.createElement('div')
    container.style.height = '100%'
    ref.current.appendChild(container)
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js'
    script.async = true
    script.innerHTML = JSON.stringify({ symbol, width: '100%', height: '100%', locale: 'en', dateRange: interval === '60' ? '1D' : interval === '240' ? '1M' : interval === 'D' ? '3M' : '12M', colorTheme: 'light', isTransparent: true, autosize: true, largeChartUrl: '', noTimeScale: false, chartOnly: true })
    container.appendChild(script)
  }, [symbol, interval])
  return <div ref={ref} style={{ width: '100%', height }} />
}

function ChartCard({ title, symbol, value, change }) {
  const [range, setRange] = useState('7D')
  const interval = CHART_RANGES.find(r => r[0] === range)[1]
  return (
    <div className="ws-card">
      <div className="ws-card-body" style={{ paddingBottom: 8 }}>
        <div className="ws-row-between">
          <div className="ws-h4 ws-row" style={{ gap: 6 }}>{title} <Info size={13} className="ws-subtle" /></div>
          <div className="ws-pills">{CHART_RANGES.map(([r]) => <button key={r} className={`ws-pill ws-pill-sm ${range === r ? 'active' : ''}`} onClick={() => setRange(r)}>{r}</button>)}</div>
        </div>
        <div className="ws-row ws-mt-8" style={{ gap: 10 }}><span className="ws-strong" style={{ fontSize: 20 }}>{value}</span>{change != null && <span className={`ws-num ${change >= 0 ? 'ws-pos' : 'ws-neg'}`}>{fmtPct(change, true)} (24h)</span>}</div>
        <TVChart symbol={symbol} interval={interval} />
      </div>
    </div>
  )
}

function CoinTable({ title, rows, valueKey, valueLabel, tone }) {
  return (
    <div className="ws-card">
      <div className="ws-card-body" style={{ padding: '14px 16px 6px' }}>
        <div className="ws-h3" style={{ fontSize: 15, marginBottom: 8 }}>{title}</div>
        <table className="ws-table ws-table-dense gm-mini-table">
          <thead><tr><th>#</th><th>Name</th><th className="ws-right">Price</th><th className="ws-right">24h %</th><th className="ws-right">{valueLabel}</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={5} className="ws-muted">Loading…</td></tr> : rows.map((c, i) => (
              <tr key={c.id || c.symbol}>
                <td className="ws-muted">{i + 1}</td>
                <td><div className="ws-asset"><span className="ws-asset-logo ws-asset-logo-sm">{c.image && <img src={c.image} alt="" />}</span><div className="ws-asset-stack"><span className="ws-asset-sym" style={{ fontSize: 12 }}>{c.symbol?.toUpperCase()}</span><span className="ws-asset-name" style={{ fontSize: 11 }}>{c.name}</span></div></div></td>
                <td className="ws-right ws-num ws-ink">{fmtPrice(c.current_price)}</td>
                <td className={`ws-right ws-num ${(c.price_change_percentage_24h || 0) >= 0 ? 'ws-pos' : 'ws-neg'}`}>{fmtPct(c.price_change_percentage_24h, true)}</td>
                <td className={`ws-right ws-num ${tone || 'ws-text'}`}>{valueKey(c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function GlobalMetrics() {
  const [global, setGlobal]     = useState(null)
  const [fg, setFg]             = useState(null)
  const [topCoins, setTopCoins] = useState([])
  const [trending, setTrending] = useState([])
  const [query, setQuery]       = useState('')

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [g, f, m, t] = await Promise.all([
          fetch(`${COINGECKO}/global`).then(r => r.json()).catch(() => null),
          fetch(`${FEAR_GREED}?limit=1`).then(r => r.json()).catch(() => null),
          fetch(`${COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&price_change_percentage=24h`).then(r => r.json()).catch(() => []),
          fetch(`${COINGECKO}/search/trending`).then(r => r.json()).catch(() => null),
        ])
        if (!alive) return
        if (g?.data) setGlobal(g.data)
        const fe = f?.data?.[0]
        if (fe) setFg({ value: parseInt(fe.value), label: fe.value_classification })
        if (Array.isArray(m)) setTopCoins(m)
        if (Array.isArray(t?.coins)) setTrending(t.coins.slice(0, 5).map(c => c.item))
      } catch (e) { console.error('GlobalMetrics fetch error', e) }
    }
    load()
    const id = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const gainers = [...topCoins].filter(c => (c.price_change_percentage_24h || 0) > 0).sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h).slice(0, 5)
  const losers = [...topCoins].filter(c => (c.price_change_percentage_24h || 0) < 0).sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h).slice(0, 5)
  const trendRows = trending.map(t => {
    const m = topCoins.find(c => c.id === t.id)
    const fallbackPrice = t.data && t.data.price ? parseFloat(t.data.price) : null
    const fallbackChg = t.data && t.data.price_change_percentage_24h ? t.data.price_change_percentage_24h.usd : null
    return {
      id: t.id,
      symbol: t.symbol,
      name: t.name,
      image: t.thumb,
      current_price: m ? m.current_price : fallbackPrice,
      price_change_percentage_24h: m ? m.price_change_percentage_24h : fallbackChg,
      rank: t.market_cap_rank,
      score: t.score,
    }
  })

  const mcap = global?.total_market_cap?.usd
  const vol = global?.total_volume?.usd
  const chg = global?.market_cap_change_percentage_24h_usd
  const btcDom = global?.market_cap_percentage?.btc
  const ethDom = global?.market_cap_percentage?.eth
  const stableDom = (global?.market_cap_percentage?.usdt || 0) + (global?.market_cap_percentage?.usdc || 0)
  const others = Math.max(0, 100 - (btcDom || 0) - (ethDom || 0) - stableDom)
  const dom = [['Bitcoin', btcDom, '#f7931a'], ['Ethereum', ethDom, '#a855f7'], ['Stablecoins', stableDom, '#3b82f6'], ['Others', others, '#6b7280']]

  return (
    <div className="ws-page">
      <div className="ws-row-between" style={{ marginBottom: 14 }}>
        <div className="ws-row ws-small ws-muted"><span>Markets</span><ChevronRight size={13} /><span className="ws-text">Global Metrics</span></div>
        <div className="ws-search" style={{ width: 300 }}><Search size={14} /><input className="ws-input ws-input-sm" placeholder="Search assets, pairs, or symbols..." value={query} onChange={e => setQuery(e.target.value)} /></div>
      </div>
      <div className="ws-page-head">
        <div className="ws-page-head-left"><h1 className="ws-title">Global Metrics</h1><p className="ws-subtitle" style={{ fontSize: 15 }}>Market Cap • Dominance • Sentiment</p></div>
        <div className="ws-page-head-right"><span className="ws-meta-stamp">{fmtClock()}</span></div>
      </div>

      {/* Row 1 */}
      <div className="gm-top">
        <div className="ws-card gm-sent"><div className="ws-card-body"><div className="ws-h4 ws-row" style={{ gap: 6, textTransform: 'none', fontSize: 14 }}>Market Sentiment <Info size={13} className="ws-subtle" /></div><FearGreedGauge value={fg?.value} label={fg?.label} /></div></div>
        {[['TOTAL MCAP', fmtB(mcap), chg, '24H'], ['24H VOLUME', fmtB(vol), vol && mcap ? null : null, '24H'], ['BTC DOM', fmtPct(btcDom), null, '24H'], ['FEAR & GREED', fg?.value ?? '—', null, fg?.label || '']].map(([label, val, delta, sub], i) => (
          <div key={label} className="ws-kpi">
            <div className="ws-kpi-label ws-caps ws-row" style={{ gap: 6, justifyContent: 'flex-start' }}>{label} <Info size={12} className="ws-subtle" /></div>
            <div className="ws-kpi-value" style={{ fontSize: 28 }}>{val}</div>
            <div className="ws-kpi-sub">{delta != null ? <span className={delta >= 0 ? 'ws-pos' : 'ws-neg'}>{delta >= 0 ? '▲' : '▼'} {fmtPct(delta, true)}</span> : i === 3 ? <span className="ws-muted" style={{ fontSize: 14 }}>{sub}</span> : null}{delta != null && <span className="ws-muted"> {sub}</span>}</div>
          </div>
        ))}
      </div>

      {/* Dominance */}
      <div className="ws-card ws-mt-16">
        <div className="ws-card-body" style={{ padding: '14px 16px' }}>
          <div className="ws-h4 ws-row" style={{ gap: 6, textTransform: 'none', fontSize: 14, marginBottom: 12 }}>Market Dominance (by Market Cap) <Info size={13} className="ws-subtle" /></div>
          <div className="gm-dom">{dom.map(([n, v, c]) => v > 0 && <span key={n} style={{ width: `${v}%`, background: c }}>{v > 6 ? fmtPct(v) : ''}</span>)}</div>
          <div className="ws-chart-legend ws-mt-8">{dom.map(([n, v, c]) => <span key={n}><i style={{ background: c }} /> {n} ({fmtPct(v)})</span>)}</div>
        </div>
      </div>

      {/* Tables */}
      <div className="ws-grid ws-grid-3 ws-mt-16">
        <CoinTable title="Top Gainers (24h)" rows={gainers} valueLabel="Market Cap" valueKey={c => fmtB(c.market_cap)} />
        <CoinTable title="Top Losers (24h)" rows={losers} valueLabel="Market Cap" valueKey={c => fmtB(c.market_cap)} />
        <CoinTable title="Trending Now" rows={trendRows} valueLabel="Rank" valueKey={c => c.rank ? '#' + c.rank : '—'} />
      </div>

      {/* Charts */}
      <div className="ws-grid ws-grid-3 ws-mt-16">
        <ChartCard title="BTC Dominance" symbol="CRYPTOCAP:BTC.D" value={fmtPct(btcDom)} change={null} />
        <ChartCard title="Total Crypto Market Cap" symbol="CRYPTOCAP:TOTAL" value={fmtB(mcap)} change={chg} />
        <ChartCard title="Altcoin Market Cap (ex-BTC)" symbol="CRYPTOCAP:TOTAL2" value={mcap && btcDom != null ? fmtB(mcap * (1 - btcDom / 100)) : '—'} change={null} />
      </div>
    </div>
  )
}
