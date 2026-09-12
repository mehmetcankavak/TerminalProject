import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createChart, CrosshairMode, CandlestickSeries, HistogramSeries } from 'lightweight-charts'
import { Search, Star, BarChart2, Bell, MoreHorizontal, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { API_BASE } from '../config'

/* ── Formatters ─────────────────────────────────────────────────────────── */
const fmtPrice = p => p == null || !isFinite(p) || p <= 0 ? '—' : p >= 1 ? '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : p >= 0.001 ? '$' + p.toFixed(4) : '$' + p.toFixed(8)
const fmtLarge = v => !v || !isFinite(v) || v <= 0 ? '—' : v >= 1e12 ? '$' + (v / 1e12).toFixed(2) + 'T' : v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 })
const fmtChg = v => v == null || !isFinite(v) ? null : (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
const fmtClock = () => { const d = new Date(); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toTimeString().slice(0, 5) + ' UTC' }

const FALLBACK_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#f97316']
const symColor = s => FALLBACK_COLORS[(s.charCodeAt(0) + (s.charCodeAt(1) || 0)) % FALLBACK_COLORS.length]

function CoinLogo({ cmcId, sym, size = 28 }) {
  const [err, setErr] = useState(false)
  const src = cmcId ? `https://s2.coinmarketcap.com/static/img/coins/64x64/${cmcId}.png` : null
  if (!src || err) return <span className="ws-asset-logo" style={{ width: size, height: size, background: symColor(sym || '?'), color: '#fff', fontSize: Math.floor(size * 0.34) }}>{(sym || '?').slice(0, 3)}</span>
  return <img src={src} alt={sym} width={size} height={size} style={{ borderRadius: '50%', flexShrink: 0, objectFit: 'contain' }} onError={() => setErr(true)} />
}

function Sparkline({ prices }) {
  if (!prices?.length || prices.length < 2) return <span className="ws-subtle">—</span>
  const up = prices[prices.length - 1] >= prices[0]
  const min = Math.min(...prices), max = Math.max(...prices), range = max - min || 1
  const W = 130, H = 40
  const step = Math.max(1, Math.floor(prices.length / 60))
  const arr = prices.filter((_, i) => i % step === 0 || i === prices.length - 1)
  const pts = arr.map((p, i) => `${((i / (arr.length - 1)) * W).toFixed(1)},${(H - 3 - ((p - min) / range) * (H - 6)).toFixed(1)}`)
  const c = up ? '#16a34a' : '#dc2626'
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <defs><linearGradient id={`mk-${up ? 'u' : 'd'}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity="0.22" /><stop offset="100%" stopColor={c} stopOpacity="0" /></linearGradient></defs>
      <polygon points={`0,${H} ${pts.join(' ')} ${W},${H}`} fill={`url(#mk-${up ? 'u' : 'd'})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/* ── Category chips ────────────────────────────────────────────────────── */
const CATEGORIES = [['all', 'All'], ['favorites', 'Favorites'], ['defi', 'DeFi'], ['ai', 'AI'], ['meme', 'Meme'], ['layer1', 'Layer 1'], ['layer2', 'Layer 2'], ['gaming', 'Gaming'], ['rwa', 'RWA'], ['stable', 'Stablecoins']]
const TAG_CAT = { 'defi': 'defi', 'decentralized-finance-defi': 'defi', 'artificial-intelligence': 'ai', 'ai-big-data': 'ai', 'memes': 'meme', 'meme-token': 'meme', 'layer-1': 'layer1', 'proof-of-work': 'layer1', 'layer-2': 'layer2', 'scaling': 'layer2', 'gaming': 'gaming', 'play-to-earn': 'gaming', 'metaverse': 'gaming', 'real-world-assets': 'rwa', 'stablecoin': 'stable', 'stablecoins': 'stable' }
const STABLE_SET = new Set(['USDT', 'USDC', 'FDUSD', 'BUSD', 'TUSD', 'DAI', 'PYUSD', 'USDD', 'USDP', 'FRAX'])
const ITEMS_PER_PAGE = 20

/* ── Coin detail modal (candles + stats) ───────────────────────────────── */
const RANGES = [['1H', '5m', 60], ['4H', '15m', 64], ['1D', '1h', 24], ['1W', '4h', 42], ['1M', '1d', 30]]

function CoinCandleChart({ symbol }) {
  const containerRef = useRef(null), chartRef = useRef(null), candleRef = useRef(null), volRef = useRef(null)
  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('4H')

  useEffect(() => {
    if (!symbol) return
    let alive = true
    setLoading(true)
    const [, interval, limit] = RANGES.find(r => r[0] === range)
    fetch(`${API_BASE}/api/binance/klines?symbol=${symbol}USDT&interval=${interval}&limit=${limit}`).then(r => r.json()).then(payload => {
      if (!alive) return
      const data = Array.isArray(payload?.data) ? payload.data : []
      setCandles(data.map(d => ({ time: Number(d[0]) / 1000, open: Number(d[1]), high: Number(d[2]), low: Number(d[3]), close: Number(d[4]), volume: Number(d[5]) })).filter(x => Number.isFinite(x.time)))
      setLoading(false)
    }).catch(() => alive && setLoading(false))
    return () => { alive = false }
  }, [symbol, range])

  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      layout: { background: { type: 'solid', color: '#ffffff' }, textColor: '#6b7280', fontFamily: 'Inter, system-ui, sans-serif' },
      grid: { vertLines: { color: '#f1f3f5' }, horzLines: { color: '#f1f3f5' } },
      rightPriceScale: { borderColor: '#e5e7eb' }, timeScale: { borderColor: '#e5e7eb', timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal }, handleScroll: true, handleScale: true, height: 260,
    })
    const cs = chart.addSeries(CandlestickSeries, { upColor: '#16a34a', downColor: '#dc2626', borderVisible: false, wickUpColor: '#16a34a', wickDownColor: '#dc2626' })
    const vs = chart.addSeries(HistogramSeries, { priceScaleId: '', priceFormat: { type: 'volume' }, color: 'rgba(22,163,74,0.3)' })
    chart.priceScale('').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } })
    const obs = new ResizeObserver(() => { if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth }) })
    obs.observe(containerRef.current)
    chartRef.current = chart; candleRef.current = cs; volRef.current = vs
    return () => { obs.disconnect(); chart.remove() }
  }, [])

  useEffect(() => {
    if (!candleRef.current || !volRef.current) return
    candleRef.current.setData(candles)
    volRef.current.setData(candles.map(c => ({ time: c.time, value: c.volume, color: c.close >= c.open ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)' })))
    chartRef.current?.timeScale().fitContent()
  }, [candles])

  return (
    <div>
      <div className="ws-pills" style={{ marginBottom: 8 }}>{RANGES.map(([r]) => <button key={r} className={`ws-pill ws-pill-plain ws-pill-sm ${range === r ? 'active' : ''}`} onClick={() => setRange(r)}>{r}</button>)}</div>
      <div style={{ position: 'relative' }}>
        <div ref={containerRef} style={{ width: '100%', height: 260 }} />
        {loading && <div className="ws-loading" style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.6)' }}><span className="ws-spinner" /></div>}
      </div>
    </div>
  )
}

function CoinDetailModal({ coin, onClose }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [onClose])
  const goTrade = () => { sessionStorage.setItem('tt_trade_symbol', coin.sym); window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page: 'terminal', symbol: coin.sym } })); onClose() }
  const goAlert = () => { try { sessionStorage.setItem('ca_prefill_coin', coin.sym) } catch { /* blocked */ } window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page: 'custom-alerts' } })); onClose() }
  const stats = [['Market Cap', fmtLarge(coin.mcap)], ['24h Volume', fmtLarge(coin.vol24h)], ['Circulating Supply', coin.supply ? coin.supply.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' ' + coin.sym : '—'], ['Max Supply', coin.maxSup > 0 ? coin.maxSup.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' ' + coin.sym : '∞'], ['1h Change', fmtChg(coin.chg1h) || '—'], ['7d Change', fmtChg(coin.chg7d) || '—']]
  return (
    <div className="ws-modal-overlay" onClick={onClose}>
      <div className="ws-modal ws-modal-lg" onClick={e => e.stopPropagation()}>
        <div className="ws-modal-head">
          <div className="ws-row" style={{ gap: 12 }}>
            <CoinLogo cmcId={coin.id} sym={coin.sym} size={36} />
            <div><div className="ws-strong" style={{ fontSize: 16 }}>{coin.name} <span className="ws-muted" style={{ fontWeight: 400 }}>{coin.sym}</span></div><div className="ws-row" style={{ gap: 8 }}><span className="ws-num ws-ink">{fmtPrice(coin.price)}</span><span className={`ws-num ${(coin.chg24h || 0) >= 0 ? 'ws-pos' : 'ws-neg'}`}>{fmtChg(coin.chg24h)}</span></div></div>
          </div>
          <div className="ws-row"><button className="ws-btn ws-btn-sm" onClick={goAlert}><Bell size={14} /> Alert</button><button className="ws-btn ws-btn-sm ws-btn-primary" onClick={goTrade}>Trade</button><button className="ws-iconbtn" onClick={onClose}><X size={16} /></button></div>
        </div>
        <div className="ws-modal-body">
          <CoinCandleChart symbol={coin.sym} />
          <div className="ws-grid ws-grid-3 ws-mt-16" style={{ gap: 10 }}>
            {stats.map(([k, v]) => <div key={k} className="ws-kpi" style={{ padding: '10px 14px', boxShadow: 'none' }}><div className="ws-kpi-label" style={{ fontSize: 12, marginBottom: 4 }}>{k}</div><div className="ws-num ws-ink ws-bold" style={{ fontSize: 15 }}>{v}</div></div>)}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function MarketsPage() {
  const [coins, setCoins] = useState([])
  const [sparkMap, setSparkMap] = useState({})
  const [globalData, setGlobalData] = useState(null)
  const [fearGreed, setFearGreed] = useState(null)
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('rank')
  const [sortDir, setSortDir] = useState(1)
  const [page, setPage] = useState(1)
  const [selectedCoin, setSelectedCoin] = useState(null)
  const [favorites, setFavorites] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('cmcx_fav') || '[]')) } catch { return new Set() } })

  const fetchCoins = useCallback(async () => {
    try {
      const json = await (await fetch(`${API_BASE}/api/market/cmc_top`)).json()
      if (json.status !== 'ok') return
      setCoins((json.data || []).map(c => {
        const q = (c.quotes || []).find(x => x.name === 'USD') || {}
        return { id: c.id, rank: c.cmcRank || 9999, name: c.name || c.symbol, sym: (c.symbol || '').toUpperCase(), price: q.price || 0, chg1h: q.percentChange1h, chg24h: q.percentChange24h, chg7d: q.percentChange7d, mcap: q.marketCap || 0, vol24h: q.volume24h || 0, supply: c.circulatingSupply || 0, maxSup: c.maxSupply || 0, tags: (c.tags || []).map(t => typeof t === 'string' ? t : (t?.slug || '')) }
      }))
      setLoading(false)
    } catch { setLoading(false) }
  }, [])
  useEffect(() => { fetchCoins(); const id = setInterval(fetchCoins, 30_000); return () => clearInterval(id) }, [fetchCoins])

  useEffect(() => {
    let alive = true
    const load = () => fetch(`${API_BASE}/api/market/sparklines`).then(r => r.json()).then(j => { if (alive && j.status === 'ok') setSparkMap(Object.fromEntries((j.data || []).map(c => [c.symbol, c]))) }).catch(() => {})
    load(); const id = setInterval(load, 10 * 60_000)
    return () => { alive = false; clearInterval(id) }
  }, [])
  useEffect(() => {
    let alive = true
    const load = () => fetch(`${API_BASE}/api/market/global`).then(r => r.json()).then(j => { if (alive && j.status === 'ok') setGlobalData(j.data) }).catch(() => {})
    load(); const id = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(id) }
  }, [])
  useEffect(() => { fetch('https://api.alternative.me/fng/?limit=1').then(r => r.json()).then(j => setFearGreed(j.data?.[0] || null)).catch(() => {}) }, [])

  const handleSort = key => { setSortKey(prev => { if (prev === key) { setSortDir(d => -d); return key } setSortDir(key === 'rank' || key === 'name' ? 1 : -1); return key }); setPage(1) }
  const toggleFav = (sym, e) => { e.stopPropagation(); setFavorites(prev => { const n = new Set(prev); n.has(sym) ? n.delete(sym) : n.add(sym); localStorage.setItem('cmcx_fav', JSON.stringify([...n])); return n }) }
  const goTrade = (sym, e) => { e.stopPropagation(); sessionStorage.setItem('tt_trade_symbol', sym); window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page: 'terminal', symbol: sym } })) }
  const goAlert = (sym, e) => { e.stopPropagation(); try { sessionStorage.setItem('ca_prefill_coin', sym) } catch { /* blocked */ } window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page: 'custom-alerts' } })) }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = coins
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || c.sym.toLowerCase().includes(q))
    if (category === 'favorites') list = list.filter(c => favorites.has(c.sym))
    else if (category === 'stable') list = list.filter(c => STABLE_SET.has(c.sym))
    else if (category !== 'all') list = list.filter(c => c.tags.some(t => TAG_CAT[t] === category))
    return [...list].sort((a, b) => {
      const sa = sparkMap[a.sym] || {}, sb = sparkMap[b.sym] || {}
      const v = { rank: [a.rank, b.rank], name: [a.name.toLowerCase(), b.name.toLowerCase()], price: [a.price, b.price], chg1h: [(sa.chg1h ?? a.chg1h) || 0, (sb.chg1h ?? b.chg1h) || 0], chg24h: [a.chg24h || 0, b.chg24h || 0], chg7d: [(sa.chg7d ?? a.chg7d) || 0, (sb.chg7d ?? b.chg7d) || 0], mcap: [a.mcap, b.mcap], vol: [a.vol24h, b.vol24h] }[sortKey] || [a.rank, b.rank]
      return v[0] < v[1] ? -sortDir : v[0] > v[1] ? sortDir : 0
    })
  }, [coins, search, category, sortKey, sortDir, favorites, sparkMap])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paged = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)
  useEffect(() => setPage(1), [search, category])

  const g = globalData
  const fgVal = fearGreed ? parseInt(fearGreed.value) : null
  const stats = [
    ['Market Cap', fmtLarge(g?.total_market_cap?.usd), g?.market_cap_change_percentage_24h_usd],
    ['24h Volume', fmtLarge(g?.total_volume?.usd), null],
    ['BTC Dominance', g?.market_cap_percentage?.btc != null ? g.market_cap_percentage.btc.toFixed(1) + '%' : '—', null],
    ['ETH Dominance', g?.market_cap_percentage?.eth != null ? g.market_cap_percentage.eth.toFixed(1) + '%' : '—', null],
    ['Fear & Greed', fgVal ?? '—', null, fearGreed?.value_classification],
    ['Active Coins', g?.active_cryptocurrencies?.toLocaleString('en-US') || '—', null],
  ]
  const SortIcon = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M7 15l5 5 5-5M7 9l5-5 5 5" /></svg>
  const TH = ({ k, children, right }) => <th className={right ? 'ws-right' : ''}><span className="ws-th-sort" onClick={() => k && handleSort(k)}>{children}{k && sortKey === k && <SortIcon />}</span></th>

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <div className="ws-page-head-left"><h1 className="ws-title">Spot Markets</h1></div>
        <div className="ws-page-head-right"><span className="ws-meta-stamp">{fmtClock()}</span></div>
      </div>

      <div className="ws-kpi-strip ws-kpi-strip-bare mk-stats">
        {stats.map(([label, val, chg, sub]) => (
          <div key={label}>
            <div className="ws-text" style={{ fontSize: 13 }}>{label}</div>
            <div className="ws-row" style={{ gap: 8, marginTop: 6 }}><span className="ws-strong ws-num" style={{ fontSize: 22 }}>{val}</span>{chg != null && <span className={`ws-num ${chg >= 0 ? 'ws-pos' : 'ws-neg'}`}>{fmtChg(chg)}</span>}{sub && <span className={`ws-num ${fgVal >= 60 ? 'ws-pos' : fgVal >= 40 ? 'ws-warn' : 'ws-neg'}`}>{sub}</span>}</div>
          </div>
        ))}
      </div>

      <div className="ws-row-between mk-toolbar">
        <div className="ws-pills">{CATEGORIES.map(([id, l]) => <button key={id} className={`ws-pill ws-pill-plain ${category === id ? 'active' : ''}`} onClick={() => setCategory(id)}>{l}</button>)}</div>
        <div className="ws-search" style={{ width: 330 }}><Search size={15} /><input className="ws-input ws-input-lg" placeholder="Search coins, symbols or categories..." value={search} onChange={e => setSearch(e.target.value)} /></div>
      </div>

      <div className="ws-card">
        <div className="ws-table-wrap">
          <table className="ws-table ws-table-tall mk-table">
            <thead>
              <tr><TH k="rank">#</TH><th className="ws-center"><Star size={14} className="ws-subtle" /></th><TH k="name">Coin</TH><TH k="price" right>Price</TH><TH k="chg1h" right>1h %</TH><TH k="chg24h" right>24h %</TH><TH k="chg7d" right>7d %</TH><TH k="mcap" right>Market Cap</TH><TH k="vol" right>Volume (24h)</TH><th className="ws-center">Last 7 Days</th><th className="ws-right">Action</th></tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={11}><div className="ws-loading"><span className="ws-spinner" /> Loading markets…</div></td></tr>
              : paged.length === 0 ? <tr><td colSpan={11}><div className="ws-empty"><div className="ws-empty-title">{search ? `No results for "${search}"` : 'No coins in this category.'}</div></div></td></tr>
              : paged.map((c, idx) => {
                const sp = sparkMap[c.sym] || {}
                const chg1h = sp.chg1h ?? c.chg1h, chg7d = sp.chg7d ?? c.chg7d
                const cls = v => v == null ? 'ws-subtle' : v >= 0 ? 'ws-pos' : 'ws-neg'
                return (
                  <tr key={c.sym} className="ws-table-click" onClick={() => setSelectedCoin(c)}>
                    <td className="ws-muted">{(page - 1) * ITEMS_PER_PAGE + idx + 1}</td>
                    <td className="ws-center"><button className="ws-iconbtn" onClick={e => toggleFav(c.sym, e)}><Star size={16} fill={favorites.has(c.sym) ? '#f59e0b' : 'none'} color={favorites.has(c.sym) ? '#f59e0b' : undefined} /></button></td>
                    <td><div className="ws-asset"><span className="ws-asset-logo ws-asset-logo-lg"><CoinLogo cmcId={c.id} sym={c.sym} size={36} /></span><div className="ws-asset-stack"><span className="ws-asset-sym" style={{ fontSize: 14 }}>{c.name}</span><span className="ws-asset-name" style={{ fontSize: 13 }}>{c.sym}</span></div></div></td>
                    <td className="ws-right ws-num ws-ink" style={{ fontSize: 14 }}>{fmtPrice(c.price)}</td>
                    <td className={`ws-right ws-num ${cls(chg1h)}`}>{fmtChg(chg1h) || '—'}</td>
                    <td className={`ws-right ws-num ${cls(c.chg24h)}`}>{fmtChg(c.chg24h) || '—'}</td>
                    <td className={`ws-right ws-num ${cls(chg7d)}`}>{fmtChg(chg7d) || '—'}</td>
                    <td className="ws-right ws-num ws-ink">{fmtLarge(c.mcap)}</td>
                    <td className="ws-right ws-num ws-ink">{fmtLarge(c.vol24h)}</td>
                    <td className="ws-center"><div style={{ display: 'inline-block' }}><Sparkline prices={sp.sparkline} /></div></td>
                    <td className="ws-right"><div className="ws-row" style={{ justifyContent: 'flex-end', gap: 2 }}><button className="ws-iconbtn" title="Chart" onClick={e => { e.stopPropagation(); setSelectedCoin(c) }}><BarChart2 size={16} /></button><button className="ws-iconbtn" title="Alert" onClick={e => goAlert(c.sym, e)}><Bell size={16} /></button><button className="ws-iconbtn" title="Trade" onClick={e => goTrade(c.sym, e)}><MoreHorizontal size={16} /></button></div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && totalPages > 1 && (
        <div className="ws-row-between ws-mt-16">
          <span className="ws-text">Showing {(page - 1) * ITEMS_PER_PAGE + 1} – {Math.min(page * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} coins</span>
          <div className="ws-pager">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} /></button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => totalPages <= 7 || Math.abs(p - page) <= 2 || p === 1 || p === totalPages).map((p, i, arr) => (
              <span key={p} style={{ display: 'contents' }}>{i > 0 && arr[i - 1] !== p - 1 && <span>…</span>}<button className={page === p ? 'active' : ''} onClick={() => setPage(p)}>{p}</button></span>
            ))}
            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></button>
          </div>
        </div>
      )}

      {selectedCoin && <CoinDetailModal coin={selectedCoin} onClose={() => setSelectedCoin(null)} />}
    </div>
  )
}
