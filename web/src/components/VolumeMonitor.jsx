import { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, ChevronDown } from 'lucide-react'
import { fetchVolumeMonitorFull, formatUSD } from '../services/api'
import AssetLogo from './AssetLogo'

const fmtPrice = p => !p ? '—' : p >= 1000 ? '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : p >= 1 ? '$' + p.toFixed(2) : '$' + p.toFixed(p < 0.001 ? 7 : 4)
const fmtClock = () => { const d = new Date(); return d.toUTCString().replace(/^(\w+), (\d+) (\w+) (\d+) (\d+:\d+:\d+).*$/, '$1, $3 $2, $4  $5 UTC') }
const SORTS = [['volume', 'Volume (24h)'], ['change', 'Change (24h)'], ['ratio', 'Anomaly ratio'], ['price', 'Price']]

function Sentiment({ sentiment, data }) {
  const bull = sentiment?.bull_volume || 0
  const bear = sentiment?.bear_volume || 0
  const total = bull + bear
  const score = sentiment?.score || 0
  // Neutral shrinks as conviction (|score|) grows; the rest splits by buy / sell share.
  const neutral = (1 - Math.min(1, Math.abs(score))) * 40
  const s = total ? (100 - neutral) * (bull / total) : 0
  const b = total ? (100 - neutral) * (bear / total) : 0
  const n = neutral

  let topBuy = null, topSell = null
  for (const r of data) {
    const v = r.volume24h || 0, p = r.priceChangePct || 0
    if (p >= 0) { if (!topBuy || p * v > topBuy.priceChangePct * topBuy.volume24h) topBuy = r }
    else if (!topSell || p * v < topSell.priceChangePct * topSell.volume24h) topSell = r
  }
  const buyChg = topBuy?.priceChangePct, sellChg = topSell?.priceChangePct

  return (
    <div className="ws-card vm-sentiment">
      <div className="vm-sentiment-main">
        <div className="ws-h4" style={{ fontSize: 14, marginBottom: 14 }}>Sentiment · Volume × Price · 24H</div>
        <div className="vm-split">
          <span style={{ width: `${b}%`, background: '#ef4444' }} />
          <span style={{ width: `${n}%`, background: '#d1d5db' }} />
          <span style={{ width: `${s}%`, background: '#22c55e' }} />
        </div>
        <div className="vm-split-labels">
          <div style={{ width: `${b}%` }}><b className="ws-neg">{b.toFixed(0)}%</b><span className="ws-neg">SELLING</span></div>
          <div style={{ width: `${n}%` }}><b className="ws-muted">{n.toFixed(0)}%</b><span className="ws-muted">NEUTRAL</span></div>
          <div style={{ width: `${s}%` }}><b className="ws-pos">{s.toFixed(0)}%</b><span className="ws-pos">BUYING</span></div>
        </div>
      </div>
      <div className="vm-stat"><div className="ws-caps">Buy Volume</div><div className="vm-stat-val ws-pos">{formatUSD(bull)}</div><div className="ws-pos ws-small">{score >= 0 ? '+' : ''}{(score * 100).toFixed(1)}%</div></div>
      <div className="vm-stat"><div className="ws-caps">Sell Volume</div><div className="vm-stat-val ws-neg">{formatUSD(bear)}</div><div className="ws-neg ws-small">{score <= 0 ? '+' : '-'}{Math.abs(score * 100).toFixed(1)}%</div></div>
      <div className="vm-stat"><div className="ws-caps">Top Buy</div><div className="vm-stat-val ws-ink">{topBuy ? topBuy.symbol.replace(/USDT$/, '') : '—'}</div><div className="ws-pos ws-small ws-mono">{topBuy ? formatUSD(topBuy.volume24h) : ''}{buyChg != null && <span className="ws-muted"> · +{buyChg.toFixed(2)}%</span>}</div></div>
      <div className="vm-stat"><div className="ws-caps">Top Sell</div><div className="vm-stat-val ws-ink">{topSell ? topSell.symbol.replace(/USDT$/, '') : '—'}</div><div className="ws-neg ws-small ws-mono">{topSell ? formatUSD(topSell.volume24h) : ''}{sellChg != null && <span className="ws-muted"> · {sellChg.toFixed(2)}%</span>}</div></div>
    </div>
  )
}

export default function VolumeMonitor() {
  const [data, setData]           = useState([])
  const [sentiment, setSentiment] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [limit, setLimit]         = useState(50)
  const [query, setQuery]         = useState('')
  const [sortKey, setSortKey]     = useState('volume')
  const [clock, setClock]         = useState(fmtClock)

  useEffect(() => { const id = setInterval(() => setClock(fmtClock()), 1000); return () => clearInterval(id) }, [])

  const load = useCallback(async () => {
    try {
      const result = await fetchVolumeMonitorFull(limit)
      if (result?.items?.length) { setData(result.items); setSentiment(result.sentiment || null) }
    } catch (e) { console.warn('Volume fetch error:', e) }
    finally { setLoading(false) }
  }, [limit])

  useEffect(() => { setLoading(true); load(); const id = setInterval(load, 30_000); return () => clearInterval(id) }, [load])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = data.filter(r => !q || r.symbol.toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q))
    list.sort((a, b) => sortKey === 'change' ? (b.priceChangePct || 0) - (a.priceChangePct || 0) : sortKey === 'ratio' ? (b.ratio || 0) - (a.ratio || 0) : sortKey === 'price' ? (b.price || 0) - (a.price || 0) : (b.volume24h || 0) - (a.volume24h || 0))
    return list
  }, [data, query, sortKey])
  const maxVolume = data.length ? Math.max(...data.map(d => d.volume24h)) : 1

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <div className="ws-page-head-left"><h1 className="ws-title">Volume Monitor</h1></div>
        <div className="ws-page-head-right"><span className="ws-meta-stamp">{clock}</span></div>
      </div>

      <Sentiment sentiment={sentiment} data={data} />

      <div className="ws-row ws-mt-16" style={{ marginBottom: 14 }}>
        <div className="ws-search" style={{ width: 330 }}><Search size={16} /><input className="ws-input ws-input-lg" placeholder="Search symbol..." value={query} onChange={e => setQuery(e.target.value)} /></div>
        <div className="ws-row" style={{ marginLeft: 'auto' }}>
          <span className="ws-text">Sort by</span>
          <div className="ws-inline-select" style={{ minWidth: 190, height: 44 }}>{SORTS.find(s => s[0] === sortKey)[1]}<ChevronDown size={15} />
            <select value={sortKey} onChange={e => setSortKey(e.target.value)}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </div>
          <div className="ws-inline-select" style={{ minWidth: 110, height: 44 }}>Top {limit}<ChevronDown size={15} />
            <select value={limit} onChange={e => setLimit(Number(e.target.value))}>{[25, 50, 75, 100].map(n => <option key={n} value={n}>Top {n}</option>)}</select>
          </div>
        </div>
      </div>

      <div className="ws-table-wrap">
        <table className="ws-table ws-table-tall vm-table">
          <thead><tr><th className="ws-th-caps">#</th><th className="ws-th-caps">Symbol</th><th className="ws-th-caps" colSpan={2}><span className="ws-th-sort" onClick={() => setSortKey('volume')}>Volume (24h) <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M7 15l5 5 5-5M7 9l5-5 5 5" /></svg></span></th><th className="ws-th-caps ws-right">Price</th><th className="ws-th-caps ws-right">Change (24h)</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6}><div className="ws-loading"><span className="ws-spinner" /> Loading volumes…</div></td></tr>
            : rows.length === 0 ? <tr><td colSpan={6}><div className="ws-empty"><div className="ws-empty-title">No symbols match.</div></div></td></tr>
            : rows.map((r, i) => {
              const up = (r.priceChangePct || 0) >= 0
              const sym = r.symbol.replace(/USDT$/, '')
              return (
                <tr key={r.symbol}>
                  <td className="ws-muted">{i + 1}</td>
                  <td><div className="ws-asset"><span className="ws-asset-logo"><AssetLogo symbol={sym} type="crypto" size={28} radius={14} /></span><span className="ws-asset-sym">{sym}</span><span className="ws-asset-name" style={{ fontSize: 13 }}>{r.name || ''}</span></div></td>
                  <td className="ws-mono ws-ink" style={{ width: 90 }}>{formatUSD(r.volume24h)}</td>
                  <td style={{ width: '32%' }}><div className="ws-bar ws-bar-xl" style={{ height: 22 }}><div className={`ws-bar-fill ${up ? '' : 'neg'}`} style={{ width: `${Math.max(2, (r.volume24h / maxVolume) * 100)}%` }} /></div></td>
                  <td className="ws-right ws-mono ws-ink">{fmtPrice(r.price)}</td>
                  <td className={`ws-right ws-mono ${up ? 'ws-pos' : 'ws-neg'}`}>{up ? '+' : ''}{(r.priceChangePct || 0).toFixed(2)}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
