import { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, ChevronDown } from 'lucide-react'
import { API_BASE } from '../config'
import AssetLogo from './AssetLogo'

const REFRESH_MS = 30_000

const COINS = [
  'BTC','ETH','SOL','XRP','DOGE','AVAX','LINK','BNB','ADA','HYPE','SUI',
  'DOT','TON','TRX','NEAR','APT','LTC','BCH','UNI','ARB',
  'OP','ATOM','POL','INJ','TIA','SEI','JUP','PYTH','WIF','PEPE',
  'RNDR','IMX','LDO','STX','ORDI','WLD','PENDLE','GMX','DYDX','AAVE',
  'SNX','CRV','ENA','COMP','SUSHI','ENS','BLUR','GALA','SAND','AXS',
  'ICP','S','ALGO','HBAR','ETC','XLM','TAO','EIGEN','CELO','IOTA',
  'NEO','ZEC','DASH','STRK','JTO','ONDO',
  'SKY','W','APE','AR','NOT','CFX','GMT','MINA','TRB','RSR',
  'YGG','VIRTUAL','AERO','ZRO','BERA','PNUT','ETHFI','MOVE','BOME','BRETT',
  'MEW','PENGU','POPCAT','PEOPLE','ZETA','TURBO','KAITO','GRASS','MOODENG','ME','SPX',
]

const EXCHANGES = [
  { key: 'binance',     label: 'Binance',  logo: 'https://s2.coinmarketcap.com/static/img/exchanges/64x64/270.png', interval: 8 },
  { key: 'okx',         label: 'OKX',      logo: 'https://s2.coinmarketcap.com/static/img/exchanges/64x64/294.png', interval: 8 },
  { key: 'bybit',       label: 'Bybit',    logo: 'https://s2.coinmarketcap.com/static/img/exchanges/64x64/521.png', interval: 8 },
  { key: 'bitget',      label: 'Bitget',   logo: 'https://s2.coinmarketcap.com/static/img/exchanges/64x64/513.png', interval: 8 },
  { key: 'hyperliquid', label: 'HyperLiq', logo: 'https://app.hyperliquid.xyz/apple-touch-icon.png',                interval: 1 },
]
const INTERVALS = [[1, '1 hour'], [4, '4 hours'], [8, '8 hours']]
const COIN_NAMES = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XRP: 'XRP', DOGE: 'Dogecoin', AVAX: 'Avalanche', LINK: 'Chainlink', BNB: 'BNB', ADA: 'Cardano', HYPE: 'Hyperliquid', SUI: 'Sui', DOT: 'Polkadot', TON: 'Toncoin', TRX: 'TRON', NEAR: 'NEAR', APT: 'Aptos', LTC: 'Litecoin' }

const SYM_ALIAS = { RENDER: 'RNDR', XBT: 'BTC', MATIC: 'POL', FTM: 'S', SONIC: 'S', kPEPE: 'PEPE' }
function normSym(raw) {
  let s = raw
  if (s.startsWith('1000000')) s = s.slice(7)
  else if (s.startsWith('1000')) s = s.slice(4)
  if (s.endsWith('1000')) s = s.slice(0, -4)
  return SYM_ALIAS[s] ?? s
}

// Funding rates are quoted per exchange interval; scale to the selected display interval.
const fmtRate = (r, mult = 1) => r == null || isNaN(r) ? '—' : (r >= 0 ? '+' : '') + (r * mult * 100).toFixed(4) + '%'
const rateCls = r => r == null || isNaN(r) ? 'ws-subtle' : r > 0 ? 'ws-pos' : r < 0 ? 'ws-neg' : 'ws-muted'
const msUntilNext = h => { const ms = h * 3_600_000; return ms - (Date.now() % ms) }
const fmtCountdown = ms => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
const fmtClock = () => { const d = new Date(); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' | ' + d.toTimeString().slice(0, 5) + ' UTC' }

/* ── Fallback direct fetchers (used only when the backend snapshot is unavailable) ── */
async function fetchBinance() {
  const data = await (await fetch('https://fapi.binance.com/fapi/v1/premiumIndex')).json()
  const out = {}
  for (const d of data) out[normSym(d.symbol.replace('USDT', '').replace('BUSD', ''))] = { rate: parseFloat(d.lastFundingRate) }
  return out
}
async function fetchBybit() {
  const json = await (await fetch('https://api.bybit.com/v5/market/tickers?category=linear&limit=300')).json()
  const out = {}
  for (const d of (json.result?.list ?? [])) if (d.symbol.endsWith('USDT') && d.fundingRate) out[normSym(d.symbol.replace('USDT', ''))] = { rate: parseFloat(d.fundingRate) }
  return out
}
async function fetchOKX() {
  const out = {}
  await Promise.allSettled(COINS.slice(0, 40).map(async coin => {
    try {
      const j = await (await fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${coin}-USDT-SWAP`)).json()
      const d = j.data?.[0]
      if (d?.fundingRate != null) out[coin] = { rate: parseFloat(d.fundingRate) }
    } catch { /* skip */ }
  }))
  return out
}
async function fetchHL() {
  const [meta, ctxs] = await (await fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'metaAndAssetCtxs' }) })).json()
  const out = {}
  meta.universe.forEach((asset, i) => { if (ctxs[i]?.funding != null) out[normSym(asset.name)] = { rate: parseFloat(ctxs[i].funding) } })
  return out
}
async function fetchBitget() {
  try {
    const json = await (await fetch('https://api.bitget.com/api/v2/mix/market/tickers?productType=usdt-futures')).json()
    const out = {}
    for (const d of (json.data || [])) { const raw = d.symbol?.replace('USDT', ''); if (raw && d.fundingRate != null) out[normSym(raw)] = { rate: parseFloat(d.fundingRate) } }
    return out
  } catch { return {} }
}
const FETCHERS = { binance: fetchBinance, okx: fetchOKX, bybit: fetchBybit, bitget: fetchBitget, hyperliquid: fetchHL }

/* ── History chart ──────────────────────────────────────────────────────── */
const RANGES = [['1D', 3], ['7D', 21], ['30D', 90], ['90D', 270]]

function HistoryChart({ coin, range }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [hover, setHover] = useState(null)
  const limit = RANGES.find(r => r[0] === range)[1]

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${coin}USDT&limit=${Math.min(limit, 1000)}`)
      .then(r => r.json())
      .then(data => { if (alive) { setHistory(Array.isArray(data) ? data.map(d => ({ time: d.fundingTime, rate: parseFloat(d.fundingRate) })) : []); setLoading(false) } })
      .catch(() => alive && setLoading(false))
    return () => { alive = false }
  }, [coin, limit])

  if (loading) return <div className="ws-loading"><span className="ws-spinner" /> Loading history…</div>
  if (!history.length) return <div className="ws-empty"><div className="ws-empty-title">No funding history for {coin} on Binance.</div></div>

  const W = 1000, H = 180, mid = H / 2
  const maxAbs = Math.max(...history.map(d => Math.abs(d.rate)), 0.0001)
  const bw = W / history.length
  const ticks = [1, 0.5, 0, -0.5, -1]
  const labelEvery = Math.max(1, Math.round(history.length / 8))
  return (
    <div className="fr-chart" onMouseLeave={() => setHover(null)}>
      <div className="fr-chart-y">{ticks.map(t => <span key={t}>{(t * maxAbs * 100).toFixed(3)}%</span>)}</div>
      <div className="fr-chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
          {ticks.map(t => <line key={t} x1="0" x2={W} y1={mid - t * (mid - 4)} y2={mid - t * (mid - 4)} stroke="#e5e7eb" strokeDasharray={t === 0 ? '' : '3 4'} />)}
          {history.map((d, i) => {
            const h = (Math.abs(d.rate) / maxAbs) * (mid - 4)
            return <rect key={i} x={i * bw + bw * 0.15} y={d.rate >= 0 ? mid - h : mid} width={bw * 0.7} height={Math.max(1, h)} fill={d.rate >= 0 ? '#22c55e' : '#ef4444'} onMouseEnter={() => setHover(i)} />
          })}
        </svg>
        {hover != null && (
          <div className="fr-chart-tip" style={{ left: `${((hover + 0.5) / history.length) * 100}%` }}>
            <div className="ws-muted ws-xs">{new Date(history[hover].time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</div>
            <div className={`ws-bold ${rateCls(history[hover].rate)}`}>{fmtRate(history[hover].rate)}</div>
          </div>
        )}
        <div className="fr-chart-x">
          {history.map((d, i) => i % labelEvery === 0 ? <span key={i} style={{ left: `${((i + 0.5) / history.length) * 100}%` }}>{new Date(d.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span> : null)}
        </div>
      </div>
    </div>
  )
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function FundingRate() {
  const [data, setData]         = useState({})
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [interval, setIntervalH] = useState(8)
  const [selected, setSelected] = useState('BTC')
  const [chartEx, setChartEx]   = useState('binance')
  const [range, setRange]       = useState('7D')
  const [tick, setTick]         = useState(0)
  const [sortDir, setSortDir]   = useState(null)

  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(id) }, [])

  const fetchAll = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/funding/snapshot`)
      if (!r.ok) throw new Error('http_' + r.status)
      const json = await r.json()
      const out = {}
      EXCHANGES.forEach(ex => { out[ex.key] = {} })
      for (const [coin, byEx] of Object.entries(json.rates || {})) for (const [exKey, payload] of Object.entries(byEx)) { if (!out[exKey]) out[exKey] = {}; out[exKey][coin] = { rate: payload.rate } }
      setData(out)
    } catch {
      const results = await Promise.allSettled(EXCHANGES.map(ex => FETCHERS[ex.key]()))
      const next = {}
      EXCHANGES.forEach((ex, i) => { next[ex.key] = results[i].status === 'fulfilled' ? results[i].value : {} })
      setData(next)
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { fetchAll(); const t = setInterval(fetchAll, REFRESH_MS); return () => clearInterval(t) }, [fetchAll])

  const mult = ex => interval / ex.interval
  const rateOf = (coin, ex) => { const r = data[ex.key]?.[coin]?.rate; return r == null ? null : r * mult(ex) }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = COINS.filter(c => !q || c.toLowerCase().includes(q) || (COIN_NAMES[c] || '').toLowerCase().includes(q))
      .map(c => ({ coin: c, rates: EXCHANGES.map(ex => rateOf(c, ex)) }))
      .filter(r => r.rates.some(v => v != null))
    if (sortDir) list = [...list].sort((a, b) => sortDir === 'asc' ? a.coin.localeCompare(b.coin) : b.coin.localeCompare(a.coin))
    return list
  }, [search, data, interval, sortDir]) // eslint-disable-line react-hooks/exhaustive-deps

  const colStats = useMemo(() => EXCHANGES.map((ex, i) => {
    const vals = rows.map(r => r.rates[i]).filter(v => v != null)
    if (!vals.length) return { avg: null, max: null, min: null, spread: null }
    const max = Math.max(...vals), min = Math.min(...vals)
    return { avg: vals.reduce((a, b) => a + b, 0) / vals.length, max, min, spread: max - min }
  }), [rows])

  const selectedRates = EXCHANGES.map(ex => ({ ...ex, rate: rateOf(selected, ex) }))
  const nextFunding = fmtCountdown(msUntilNext(interval))
  void tick

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <div className="ws-page-head-left"><h1 className="ws-title">Funding Rate</h1></div>
        <div className="ws-page-head-right"><span className="ws-meta-stamp">{fmtClock()}</span></div>
      </div>

      <div className="ws-row" style={{ marginBottom: 14 }}>
        <div className="ws-search" style={{ width: 300 }}><Search size={15} /><input className="ws-input" placeholder="Search coin..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="ws-row" style={{ marginLeft: 'auto' }}>
          <span className="ws-text">Interval</span>
          <div className="ws-inline-select" style={{ minWidth: 160 }}>{INTERVALS.find(i => i[0] === interval)[1]}<ChevronDown size={15} />
            <select value={interval} onChange={e => setIntervalH(Number(e.target.value))}>{INTERVALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
        </div>
      </div>

      {/* Matrix */}
      <div className="ws-card">
        <div className="ws-table-wrap">
          <table className="ws-table ws-table-bordered fr-table">
            <thead>
              <tr>
                <th><span className="ws-th-sort" onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}>Coin <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M7 15l5 5 5-5M7 9l5-5 5 5" /></svg></span></th>
                {EXCHANGES.map(ex => <th key={ex.key} className="ws-center"><span className="ws-row" style={{ justifyContent: 'center', gap: 8 }}><img src={ex.logo} alt="" width={18} height={18} style={{ borderRadius: 4 }} onError={e => { e.target.style.display = 'none' }} />{ex.label}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={6}><div className="ws-loading"><span className="ws-spinner" /> Loading funding rates…</div></td></tr>
              : rows.length === 0 ? <tr><td colSpan={6}><div className="ws-empty"><div className="ws-empty-title">No coins match.</div></div></td></tr>
              : rows.map(r => (
                <tr key={r.coin} className={r.coin === selected ? 'fr-row-active' : ''} onClick={() => setSelected(r.coin)} style={{ cursor: 'pointer' }}>
                  <td><div className="ws-asset"><span className="ws-asset-logo ws-asset-logo-sm"><AssetLogo symbol={r.coin} type="crypto" size={22} radius={11} /></span><span className="ws-asset-sym">{r.coin}</span></div></td>
                  {r.rates.map((v, i) => <td key={i} className={`ws-center ws-num ${rateCls(v)}`}>{fmtRate(v)}</td>)}
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr><td className="ws-caps">Avg Rate</td>{colStats.map((s, i) => <td key={i} className={`ws-center ws-num ${rateCls(s.avg)}`}>{fmtRate(s.avg)}</td>)}</tr>
                <tr><td className="ws-caps">Highest</td>{colStats.map((s, i) => <td key={i} className={`ws-center ws-num ${rateCls(s.max)}`}>{fmtRate(s.max)}</td>)}</tr>
                <tr><td className="ws-caps">Lowest</td>{colStats.map((s, i) => <td key={i} className={`ws-center ws-num ${rateCls(s.min)}`}>{fmtRate(s.min)}</td>)}</tr>
                <tr><td className="ws-caps">Spread</td>{colStats.map((s, i) => <td key={i} className="ws-center ws-num ws-ink">{s.spread == null ? '—' : (s.spread * 100).toFixed(4) + '%'}</td>)}</tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Selected coin */}
      <div className="ws-card ws-mt-16">
        <div className="fr-selected">
          <div className="ws-row" style={{ gap: 14, minWidth: 200 }}>
            <span className="ws-asset-logo" style={{ width: 44, height: 44 }}><AssetLogo symbol={selected} type="crypto" size={44} radius={22} /></span>
            <div><div className="ws-strong" style={{ fontSize: 22 }}>{selected}</div><div className="ws-muted" style={{ fontSize: 15 }}>{COIN_NAMES[selected] || `${selected} perpetual`}</div></div>
          </div>
          {selectedRates.map(ex => (
            <div key={ex.key} className="fr-selected-cell"><div className="ws-text" style={{ fontSize: 13 }}>{ex.label}</div><div className={`ws-num ws-strong ${rateCls(ex.rate)}`} style={{ fontSize: 20 }}>{fmtRate(ex.rate)}</div></div>
          ))}
          <div className="fr-selected-cell fr-selected-next"><div className="ws-text" style={{ fontSize: 13 }}>Next Funding In</div><div className="ws-mono ws-strong ws-ink" style={{ fontSize: 22 }}>{nextFunding}</div></div>
        </div>
        <div className="ws-card-body" style={{ borderTop: '1px solid var(--ws-line)' }}>
          <div className="ws-row-between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <h3 className="ws-h3">{selected} Funding Rate History ({EXCHANGES.find(e => e.key === chartEx)?.label})</h3>
            <div className="ws-row">
              <div className="ws-inline-select" style={{ minWidth: 130 }}>{EXCHANGES.find(e => e.key === chartEx)?.label}<ChevronDown size={14} />
                <select value={chartEx} onChange={e => setChartEx(e.target.value)}>{EXCHANGES.map(ex => <option key={ex.key} value={ex.key}>{ex.label}</option>)}</select>
              </div>
              <div className="ws-inline-select" style={{ minWidth: 120 }}>{INTERVALS.find(i => i[0] === interval)[1]}<ChevronDown size={14} />
                <select value={interval} onChange={e => setIntervalH(Number(e.target.value))}>{INTERVALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </div>
              <div className="ws-pills">{RANGES.map(([r]) => <button key={r} className={`ws-pill ws-pill-plain ws-pill-sm ${range === r ? 'active' : ''}`} onClick={() => setRange(r)}>{r}</button>)}</div>
            </div>
          </div>
          {chartEx !== 'binance' && <div className="ws-note ws-mb-16">Historical funding is available from Binance only; showing Binance history for {selected}.</div>}
          <HistoryChart coin={selected} range={range} />
        </div>
      </div>
    </div>
  )
}
