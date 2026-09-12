import { useEffect, useMemo, useRef, useState } from 'react'
import { createChart, CrosshairMode, CandlestickSeries, HistogramSeries } from 'lightweight-charts'
import { Search, Bell, ChevronDown } from 'lucide-react'
import AssetLogo from './AssetLogo'
import { API_BASE } from '../config'
const STOCK_UNIVERSE = [
  { symbol: 'MSTRUSDT', ticker: 'MSTR', name: 'Strategy (MicroStrategy)', sector: 'Bitcoin Proxy' },
  { symbol: 'TSLAUSDT', ticker: 'TSLA', name: 'Tesla', sector: 'EV' },
  { symbol: 'NVDAUSDT', ticker: 'NVDA', name: 'NVIDIA', sector: 'Semiconductors' },
  { symbol: 'AAPLUSDT', ticker: 'AAPL', name: 'Apple', sector: 'Technology' },
  { symbol: 'GOOGLUSDT', ticker: 'GOOGL', name: 'Alphabet', sector: 'Technology' },
  { symbol: 'AMZNUSDT', ticker: 'AMZN', name: 'Amazon', sector: 'E-commerce' },
  { symbol: 'METAUSDT', ticker: 'META', name: 'Meta', sector: 'Technology' },
  { symbol: 'COINUSDT', ticker: 'COIN', name: 'Coinbase', sector: 'Crypto Exchange' },
  { symbol: 'HOODUSDT', ticker: 'HOOD', name: 'Robinhood', sector: 'Brokerage' },
  { symbol: 'PLTRUSDT', ticker: 'PLTR', name: 'Palantir', sector: 'AI / Data' },
  { symbol: 'INTCUSDT', ticker: 'INTC', name: 'Intel', sector: 'Semiconductors' },
  { symbol: 'MUUSDT', ticker: 'MU', name: 'Micron', sector: 'Semiconductors' },
  { symbol: 'SNKDUSDT', ticker: 'SNDK', name: 'SanDisk', sector: 'Semiconductors' },
  { symbol: 'CRCLUSDT', ticker: 'CRCL', name: 'Circle', sector: 'Fintech' },
  { symbol: 'QQQUSDT', ticker: 'QQQ', name: 'Invesco QQQ', sector: 'ETF' },
  { symbol: 'SPYUSDT', ticker: 'SPY', name: 'SPDR S&P 500', sector: 'ETF' },
]

const PRECIOUS_METALS = new Set([
  'GOLD','SILVER','PLATINUM','PALLADIUM','COPPER','RHODIUM','IRIDIUM','RUTHENIUM','OSMIUM',
  'GLD','SLV','GDX','GDXJ','IAU','SGOL','PHYS','PSLV','PPLT','PALL',
])

const CRYPTO_CODES = new Set([
  'BTC','ETH','XRP','BNB','SOL','USDT','USDC','ADA','AVAX','DOGE','TRX','LINK','DOT',
  'MATIC','SHIB','LTC','BCH','UNI','ATOM','XLM','ICP','ETC','FIL','APT','ARB',
  'OP','NEAR','ALGO','VET','HBAR','GRT','QNT','AAVE','MKR','SAND','MANA','AXS',
  'CRO','FTM','EGLD','THETA','EOS','XTZ','NEO','ZEC','DASH','WAVES','IOTA',
  'XMR','MIOTA','CHZ','ENJ','BAT','ZIL','ONT','BTT','HT','OKB','LEO','BUSD',
  'DAI','FDUSD','TUSD','USDD','USDP','FRAX','PYUSD','SUI','TON','PEPE','WIF',
  'BONK','FLOKI','ARB','RUNE','CFX','AGIX','FET','OCEAN','RENDER','IMX',
  'LUNC','LUNA','GLMR','MOVR','KSM','FLOW','ROSE','GMT','GST','BLUR','HOOK',
  'STX','AUDIO','ANKR','CKB','ICX','ZRX','CELO','CTSI','BAND','NMR',
  'SNX','1INCH','SUSHI','COMP','YFI','CRV','BAL','BNT','UMA','REN',
  'XEM','NANO','SC','DCR','LSK','BCN','DGB','XVG','RVN','QTUM',
])

const ETF_CODES = new Set([
  'SPY','QQQ','VOO','VTI','IWM','DIA','GLD','SLV','IAU','TLT','HYG','LQD',
  'EEM','EFA','VEA','VWO','ARKK','ARKG','ARKW','ARKF','ARKQ','ARKX',
  'XLF','XLE','XLK','XLV','XLI','XLY','XLP','XLB','XLU','XLRE',
  'SCHD','VIG','DVY','DGRO','HDV','SDY','VYM','NOBL',
  'TNA','SOXL','SOXS','TQQQ','SQQQ','SPXL','SPXS','UVXY','VIXY',
  'BITO','GBTC','IBIT','FBTC','ARKB','BTCO','EZBC','HODL',
  'ETHA','ETHW','CETH','FETH',
  'SGOV','USFR','BIL','SHV','JPST','NEAR',
  'JEPI','JEPQ','DIVO','XYLD','QYLD','RYLD',
])

function getAssetCategory(code = '', name = '') {
  const c = code.toUpperCase()
  const n = name.toLowerCase()
  if (PRECIOUS_METALS.has(c) || n.includes('gold') || n.includes('silver') || n.includes('platinum') || n.includes('palladium') || n.includes('copper')) return 'metal'
  if (CRYPTO_CODES.has(c) || n.includes('bitcoin') || n.includes('ethereum') || n.includes('crypto') || n.includes('coin') || n.includes('token')) return 'crypto'
  if (ETF_CODES.has(c) || n.includes(' etf') || n.includes('fund') || n.includes('trust') || n.includes('ishares') || n.includes('vanguard') || n.includes('spdr') || n.includes('invesco') || n.includes('xtrackers') || n.includes('wisdomtree')) return 'etf'
  return 'stock'
}

const INDEX_SYMBOLS = [
  { symbol: 'SPYUSDT', label: 'S&P 500' },
  { symbol: 'QQQUSDT', label: 'NASDAQ' },
  { symbol: 'DIAUSDT', label: 'DOW' },
  { symbol: 'DXYUSDT', label: 'ABD Doları' },
]

const LOGO_DOMAINS = {
  MSTR: 'strategy.com',
  TSLA: 'tesla.com',
  NVDA: 'nvidia.com',
  AAPL: 'apple.com',
  GOOGL: 'google.com',
  AMZN: 'amazon.com',
  META: 'meta.com',
  COIN: 'coinbase.com',
  HOOD: 'robinhood.com',
  PLTR: 'palantir.com',
  INTC: 'intel.com',
  MU: 'micron.com',
  SNDK: 'sandisk.com',
  CRCL: 'circle.com',
  QQQ: 'invesco.com',
  SPY: 'ssga.com',
}

const PREFERRED_LOGOS = {
  CRCL: 'https://logo.clearbit.com/circle.com',
  INTC: 'https://logo.clearbit.com/intel.com',
}

const LOCAL_LOGO_DATA = {
  CRCL:
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b1020"/><circle cx="32" cy="32" r="20" fill="none" stroke="#3b82f6" stroke-width="6"/><circle cx="32" cy="32" r="10" fill="#3b82f6"/><circle cx="32" cy="32" r="5" fill="#0b1020"/></svg>',
    ),
  INTC:
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0068b5"/><ellipse cx="32" cy="32" rx="23" ry="13" fill="none" stroke="white" stroke-width="2.4"/><text x="32" y="37" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" fill="white">intel</text></svg>',
    ),
}

const ASSET_TO_TERMINAL_MAP = {
  'GOLD': 'XAUUSDT',
  'SILVER': 'XAGUSDT',
  'BTC': 'BTCUSDT',
  'ETH': 'ETHUSDT',
  'SOL': 'SOLUSDT',
  'BNB': 'BNBUSDT',
  'XRP': 'XRPUSDT',
  'AAPL': 'AAPLUSDT',
  'TSLA': 'TSLAUSDT',
  'NVDA': 'NVDAUSDT',
  'MSTR': 'MSTRUSDT',
  'GOOG': 'GOOGLUSDT',
  'GOOGL': 'GOOGLUSDT',
  'AMZN': 'AMZNUSDT',
  'META': 'METAUSDT',
  'COIN': 'COINUSDT',
  'HOOD': 'HOODUSDT',
  'PLTR': 'PLTRUSDT',
  'INTC': 'INTCUSDT',
  'MU': 'MUUSDT',
  'SNDK': 'SNKDUSDT',
  'CRCL': 'CRCLUSDT',
  'QQQ': 'QQQUSDT',
  'SPY': 'SPYUSDT',
  'BROADCOM': 'AVGOUSDT',
  'AVGO': 'AVGOUSDT',
  'TSM': 'TSMUSDT',
  'TSMC': 'TSMUSDT',
}

const RANGE_OPTIONS = [
  { id: '15M', label: '15m', interval: '15m', limit: 120 },
  { id: '30M', label: '30m', interval: '30m', limit: 120 },
  { id: '45M', label: '45m', interval: '45m', limit: 120 },
  { id: '1H0', label: '1h', interval: '1h', limit: 120 },
  { id: '4H0', label: '4h', interval: '4h', limit: 120 },
  { id: '24H', label: '24H', interval: '15m', limit: 96 },
  { id: '1D', label: '1D', interval: '30m', limit: 48 },
  { id: '1W', label: '1W', interval: '1h', limit: 168 },
  { id: '1M', label: '1M', interval: '4h', limit: 180 },
  { id: '3M', label: '3M', interval: '1d', limit: 90 },
  { id: '1Y', label: '1Y', interval: '1d', limit: 365 },
  { id: '5Y', label: '5Y', interval: '1w', limit: 260 },
]

function yahooChartParams(rangeId) {
  return ({
    '15M': { interval: '1m', range: '1d' },
    '30M': { interval: '2m', range: '1d' },
    '45M': { interval: '5m', range: '1d' },
    '1H0': { interval: '5m', range: '1d' },
    '4H0': { interval: '15m', range: '5d' },
    '24H': { interval: '15m', range: '5d' },
    '1D': { interval: '30m', range: '5d' },
    '1W': { interval: '60m', range: '1mo' },
    '1M': { interval: '1d', range: '3mo' },
    '3M': { interval: '1d', range: '6mo' },
    '1Y': { interval: '1d', range: '1y' },
    '5Y': { interval: '1wk', range: '5y' },
  })[rangeId] || { interval: '1d', range: '1y' }
}

const TV_EXCHANGE_BY_SUFFIX = {
  '.KS': 'KRX',
  '.KQ': 'KOSDAQ',
  '.TW': 'TWSE',
  '.T': 'TSE',
  '.SR': 'TADAWUL',
  '.HK': 'HKEX',
  '.SS': 'SSE',
  '.SZ': 'SZSE',
  '.L': 'LSE',
  '.PA': 'EURONEXT',
  '.AS': 'EURONEXT',
  '.BR': 'EURONEXT',
  '.MI': 'MIL',
  '.SW': 'SIX',
  '.TO': 'TSX',
  '.V': 'TSXV',
  '.AX': 'ASX',
  '.NS': 'NSE',
  '.BO': 'BSE',
}

const TV_EXCHANGE_BY_CODE = {
  AAPL: 'NASDAQ',
  AMZN: 'NASDAQ',
  AVGO: 'NASDAQ',
  COIN: 'NASDAQ',
  CRCL: 'NYSE',
  DIA: 'AMEX',
  GLD: 'AMEX',
  GOOGL: 'NASDAQ',
  GOOG: 'NASDAQ',
  HOOD: 'NASDAQ',
  INTC: 'NASDAQ',
  MA: 'NYSE',
  META: 'NASDAQ',
  MSTR: 'NASDAQ',
  MU: 'NASDAQ',
  NVDA: 'NASDAQ',
  PLTR: 'NASDAQ',
  QQQ: 'NASDAQ',
  SLV: 'AMEX',
  SPY: 'AMEX',
  TSLA: 'NASDAQ',
  TSM: 'NYSE',
  VOO: 'AMEX',
  VTI: 'AMEX',
}

const fmtUsd = (v, d = 2) => {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`
}

const fmtPct = (v) => {
  const n = Number(v || 0)
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

const fmtCap = (v) => {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return '—'
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  return `$${n.toLocaleString('en-US')}`
}

const fmtRatio = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

let _stocksAudioCtx = null
function aggregateCandlesTo45m(candles15m = []) {
  if (!Array.isArray(candles15m) || candles15m.length === 0) return []
  const buckets = new Map()
  candles15m.forEach((c) => {
    const t = Number(c.time || 0)
    if (!Number.isFinite(t) || t <= 0) return
    const bucket = Math.floor(t / 2700) * 2700 
    const prev = buckets.get(bucket)
    if (!prev) {
      buckets.set(bucket, { ...c, time: bucket })
      return
    }
    buckets.set(bucket, {
      time: bucket,
      open: prev.open,
      high: Math.max(prev.high, c.high),
      low: Math.min(prev.low, c.low),
      close: c.close,
      volume: (prev.volume || 0) + (c.volume || 0),
    })
  })
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v)
}

function StockLogo({ ticker, size = 20, cmcIcon = null }) {
  const [sourceIndex, setSourceIndex] = useState(0)
  const domain = LOGO_DOMAINS[ticker]
  const localLogo = LOCAL_LOGO_DATA[ticker] || null
  const sources = []
  if (cmcIcon && cmcIcon.startsWith('/')) {
    sources.push(`https://companiesmarketcap.com${cmcIcon}`)
  } else if (cmcIcon) {
    sources.push(cmcIcon)
  }
  sources.push(
    localLogo,
    PREFERRED_LOGOS[ticker] || null,
    `https://financialmodelingprep.com/image-stock/${ticker}.png`,
    domain ? `https://api.faviconkit.com/${domain}/64` : null,
    domain ? `https://logo.clearbit.com/${domain}` : null
  )
  const validSources = sources.filter(Boolean)

  useEffect(() => {
    setSourceIndex(0)
  }, [ticker])

  if (!validSources.length || sourceIndex >= validSources.length) {
    return (
      <span
        className="stocks-logo-fallback"
        style={{ width: size, height: size, fontSize: Math.max(8, Math.floor(size * 0.42)) }}
      >
        {ticker ? ticker.slice(0, 1) : '?'}
      </span>
    )
  }
  return (
    <img
      src={validSources[sourceIndex]}
      alt={ticker}
      width={size}
      height={size}
      className={`stocks-logo ${ticker === 'INTC' ? 'is-intc' : ''} ${ticker === 'CRCL' ? 'is-crcl' : ''}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setSourceIndex((i) => i + 1)}
    />
  )
}
function parseMktCap(s = '') {
  const n = parseFloat(s.replace(/[$,\s]/g, ''))
  if (!isFinite(n)) return 0
  if (s.includes('T')) return n * 1e12
  if (s.includes('B')) return n * 1e9
  if (s.includes('M')) return n * 1e6
  return n
}
function parsePrice(s = '') {
  return parseFloat(s.replace(/[$,\s]/g, '')) || 0
}
function parseToday(s = '') {
  return parseFloat(s.replace(/[%+\s]/g, '')) || 0
}


/* ── Candle chart (lightweight-charts, light palette) ────────────────── */
function CandleChart({ candles = [], loading = false, height = 260 }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const candleRef = useRef(null)
  const volRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      layout: { background: { type: 'solid', color: '#ffffff' }, textColor: '#6b7280', fontFamily: 'Inter, system-ui, sans-serif' },
      grid: { vertLines: { color: '#f1f3f5' }, horzLines: { color: '#f1f3f5' } },
      rightPriceScale: { borderColor: '#e5e7eb' },
      timeScale: { borderColor: '#e5e7eb', timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: true, handleScale: true, height,
    })
    const cs = chart.addSeries(CandlestickSeries, { upColor: '#16a34a', downColor: '#dc2626', borderVisible: false, wickUpColor: '#16a34a', wickDownColor: '#dc2626' })
    const vs = chart.addSeries(HistogramSeries, { priceScaleId: '', priceFormat: { type: 'volume' }, color: 'rgba(22,163,74,0.3)' })
    chart.priceScale('').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } })
    chartRef.current = chart; candleRef.current = cs; volRef.current = vs
    const obs = new ResizeObserver(() => { if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth }) })
    obs.observe(containerRef.current)
    return () => { obs.disconnect(); chart.remove(); chartRef.current = null }
  }, [height])

  useEffect(() => {
    if (!candleRef.current || !volRef.current) return
    candleRef.current.setData(candles)
    volRef.current.setData(candles.map(c => ({ time: c.time, value: c.volume || 0, color: c.close >= c.open ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)' })))
    chartRef.current?.timeScale().fitContent()
  }, [candles])

  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height }} />
      {loading && <div className="ws-loading" style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.6)' }}><span className="ws-spinner" /></div>}
      {!loading && candles.length === 0 && <div className="ws-empty" style={{ position: 'absolute', inset: 0 }}><div className="ws-empty-title">No chart data found</div></div>}
    </div>
  )
}

/* ── Index cards (SPY / QQQ / DIA / DXY) ──────────────────────────────── */
const INDEX_CARDS = [['SPY', 'S&P 500'], ['QQQ', 'NASDAQ 100'], ['DIA', 'DOW JONES'], ['DX-Y.NYB', 'US DOLLAR INDEX', 'DXY']]

function Spark({ points, up }) {
  if (!points || points.length < 2) return <svg width="120" height="44" />
  const min = Math.min(...points), max = Math.max(...points), r = max - min || 1
  const W = 120, H = 44
  const pts = points.map((p, i) => `${(i / (points.length - 1)) * W},${H - 4 - ((p - min) / r) * (H - 10)}`)
  const c = up ? '#16a34a' : '#dc2626'
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <defs><linearGradient id={`sp-${up ? 'u' : 'd'}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity="0.25" /><stop offset="100%" stopColor={c} stopOpacity="0" /></linearGradient></defs>
      <polygon points={`0,${H} ${pts.join(' ')} ${W},${H}`} fill={`url(#sp-${up ? 'u' : 'd'})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={c} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function IndexCards() {
  const [data, setData] = useState({})
  useEffect(() => {
    let alive = true
    const load = () => Promise.all(INDEX_CARDS.map(async ([sym]) => {
      try {
        const r = await fetch(`${API_BASE}/api/stocks/chart?symbol=${encodeURIComponent(sym)}&interval=15m&range=1d`)
        const j = await r.json()
        const rows = Array.isArray(j?.data) ? j.data : []
        return [sym, rows]
      } catch { return [sym, []] }
    })).then(entries => { if (alive) setData(Object.fromEntries(entries)) })
    load(); const id = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(id) }
  }, [])
  return (
    <div className="ws-grid ws-grid-4">
      {INDEX_CARDS.map(([sym, name, label]) => {
        const rows = data[sym] || []
        const closes = rows.map(r => r.close).filter(Number.isFinite)
        const last = closes[closes.length - 1], first = rows[0]?.open ?? closes[0]
        const chg = last != null && first ? last - first : null
        const pct = chg != null && first ? (chg / first) * 100 : null
        const up = (chg || 0) >= 0
        return (
          <div key={sym} className="ws-kpi st-index">
            <div className="ws-flex-1">
              <div className="ws-row" style={{ gap: 8 }}><span className="ws-strong" style={{ fontSize: 17 }}>{label || sym}</span><span className="ws-muted ws-xs">{name}</span></div>
              <div className="ws-num ws-ink" style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>{last != null ? last.toFixed(2) : '—'}</div>
              <div className={`ws-num ${up ? 'ws-pos' : 'ws-neg'}`} style={{ marginTop: 4 }}>{chg != null ? `${up ? '▲' : '▼'} ${chg >= 0 ? '+' : ''}${chg.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)` : '—'}</div>
            </div>
            <Spark points={closes} up={up} />
          </div>
        )
      })}
    </div>
  )
}

/* ── Selected asset detail ───────────────────────────────────────────── */
const DETAIL_RANGES = [['1D', '1D'], ['1W', '1W'], ['1M', '1M'], ['3M', '3M'], ['6M', '1Y'], ['1Y', '1Y'], ['5Y', '5Y'], ['All', '5Y']]

function AssetDetail({ asset, onAlert }) {
  const [rangeLabel, setRangeLabel] = useState('1D')
  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(false)
  const [ticker, setTicker] = useState(null)
  const [fund, setFund] = useState({})
  const rangeId = DETAIL_RANGES.find(r => r[0] === rangeLabel)[1]
  const code = asset.code
  const tradeSymbol = asset.tradeSymbol
  const universe = STOCK_UNIVERSE.find(x => x.ticker === code)

  useEffect(() => {
    let alive = true
    const fetchTicker = async () => {
      if (!tradeSymbol) { setTicker(null); return }
      try {
        const res = await fetch(`${API_BASE}/api/binance/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify([tradeSymbol]))}`)
        const d = await res.json()
        const row = Array.isArray(d) ? d[0] : null
        if (alive && row) setTicker({ price: Number(row.lastPrice), chg: Number(row.priceChangePercent), change: Number(row.priceChange) })
      } catch { /* keep ranking values */ }
    }
    fetchTicker(); const id = setInterval(fetchTicker, 10_000)
    return () => { alive = false; clearInterval(id) }
  }, [tradeSymbol])

  useEffect(() => {
    let alive = true
    fetch(`${API_BASE}/api/stocks/fundamentals?symbols=${encodeURIComponent(code)}`).then(r => r.json()).then(d => { if (alive && d) setFund(d[code] || {}) }).catch(() => {})
    return () => { alive = false }
  }, [code])

  useEffect(() => {
    let alive = true
    const range = RANGE_OPTIONS.find(x => x.id === rangeId) || RANGE_OPTIONS[0]
    const load = async () => {
      setLoading(true)
      try {
        let parsed = []
        if (tradeSymbol) {
          const res = await fetch(`${API_BASE}/api/binance/klines?symbol=${tradeSymbol}&interval=${range.interval}&limit=${range.limit}`)
          const payload = await res.json()
          parsed = (Array.isArray(payload?.data) ? payload.data : []).map(d => ({ time: Number(d[0]) / 1000, open: Number(d[1]), high: Number(d[2]), low: Number(d[3]), close: Number(d[4]), volume: Number(d[5]) })).filter(x => Number.isFinite(x.time))
        }
        if (!parsed.length) {
          const p = yahooChartParams(rangeId)
          const res = await fetch(`${API_BASE}/api/stocks/chart?symbol=${encodeURIComponent(code)}&interval=${encodeURIComponent(p.interval)}&range=${encodeURIComponent(p.range)}`)
          const payload = await res.json()
          parsed = Array.isArray(payload?.data) ? payload.data : []
        }
        if (alive) setCandles(parsed)
      } catch { if (alive) setCandles([]) }
      finally { if (alive) setLoading(false) }
    }
    load(); const id = setInterval(load, 30_000)
    return () => { alive = false; clearInterval(id) }
  }, [code, tradeSymbol, rangeId])

  const price = ticker?.price ?? parsePrice(asset.row?.price || '')
  const chgPct = ticker?.chg ?? parseToday(asset.row?.today || '') * (asset.row?.today_dir === 'down' ? -1 : 1)
  const chgAbs = ticker?.change ?? (price && chgPct != null ? price - price / (1 + chgPct / 100) : null)
  const up = (chgPct || 0) >= 0
  const mcap = fund.marketCap ? fmtCap(fund.marketCap) : asset.row?.market_cap || '—'
  const sector = universe?.sector || (asset.category === 'etf' ? 'ETF' : asset.category === 'crypto' ? 'Crypto' : asset.category === 'metal' ? 'Commodity' : 'Equity')
  const exchange = TV_EXCHANGE_BY_CODE[code] || (asset.category === 'crypto' ? 'Binance' : 'NYSE')

  return (
    <div className="ws-card ws-mt-16">
      <div className="ws-card-body" style={{ paddingBottom: 10 }}>
        <div className="ws-row-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="ws-row" style={{ gap: 10 }}><span className="ws-strong" style={{ fontSize: 24 }}>{code}</span><span className="ws-text" style={{ fontSize: 15 }}>{asset.name}</span></div>
            <div className="ws-row" style={{ gap: 12, marginTop: 4 }}>
              <span className="ws-strong ws-num" style={{ fontSize: 32 }}>{price ? price.toFixed(2) : '—'}</span>
              <span className={`ws-num ${up ? 'ws-pos' : 'ws-neg'}`} style={{ fontSize: 18 }}>{chgAbs != null ? `${up ? '▲' : '▼'} ${chgAbs >= 0 ? '+' : ''}${chgAbs.toFixed(2)}  (${chgPct >= 0 ? '+' : ''}${(chgPct || 0).toFixed(2)}%)` : ''}</span>
            </div>
            <div className="st-meta">
              <div><span>Market Cap</span><b>{mcap}</b></div>
              <div><span>Sector</span><b>{sector}</b></div>
              <div><span>Country</span><b>{asset.row?.country || 'USA'}</b></div>
              <div><span>Exchange</span><b>{exchange}</b></div>
            </div>
          </div>
          <button className="ws-btn ws-btn-ghost" onClick={() => onAlert(asset)}><Bell size={16} /> Add Alert</button>
        </div>
        <div className="ws-pills ws-mt-16" style={{ marginBottom: 10 }}>{DETAIL_RANGES.map(([l]) => <button key={l} className={`ws-pill ws-pill-plain ws-pill-sm ${rangeLabel === l ? 'active' : ''}`} onClick={() => setRangeLabel(l)}>{l}</button>)}</div>
        <CandleChart candles={candles} loading={loading} height={250} />
      </div>
    </div>
  )
}

/* ── Page ───────────────────────────────────────────────────────────────── */
const SORTS = [['market_cap', 'Market Cap (High to Low)'], ['price', 'Price (High to Low)'], ['today', '24h Change'], ['name', 'Name (A–Z)']]

export default function StocksPage() {
  const [rankingData, setRankingData] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('market_cap')
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    const fetchRanking = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/stocks/assets_ranking?_t=${Date.now()}`)
        const json = await res.json()
        if (mounted && json.status === 'ok') { setRankingData(json.data || []); setError(json.data?.length ? null : 'No ranking data available.') }
        else if (mounted) setError('Ranking unavailable (' + json.status + ')')
      } catch (err) { if (mounted) setError(String(err)) }
      finally { if (mounted) setLoading(false) }
    }
    fetchRanking(); const id = setInterval(fetchRanking, 60_000)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = rankingData.filter(r => !q || (r.name || '').toLowerCase().includes(q) || (r.code || '').toLowerCase().includes(q))
    const dir = sortKey === 'name' ? 1 : -1
    return [...list].sort((a, b) => {
      let va, vb
      if (sortKey === 'market_cap') { va = parseMktCap(a.market_cap); vb = parseMktCap(b.market_cap) }
      else if (sortKey === 'price') { va = parsePrice(a.price); vb = parsePrice(b.price) }
      else if (sortKey === 'today') { va = parseToday(a.today) * (a.today_dir === 'down' ? -1 : 1); vb = parseToday(b.today) * (b.today_dir === 'down' ? -1 : 1) }
      else { va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase() }
      return va < vb ? -dir : va > vb ? dir : 0
    })
  }, [query, rankingData, sortKey])

  const toAsset = row => {
    let tradeSymbol = ASSET_TO_TERMINAL_MAP[row.code]
    if (!tradeSymbol && STOCK_UNIVERSE.find(x => x.ticker === row.code)) tradeSymbol = row.code + 'USDT'
    return { code: row.code, name: row.name, tradeSymbol: tradeSymbol || null, row, category: getAssetCategory(row.code, row.name) }
  }
  const current = selected || (rankingData.length ? toAsset(rankingData.find(r => r.code === 'AAPL') || rankingData[0]) : null)

  const addAlert = asset => {
    if (asset.tradeSymbol && getAssetCategory(asset.code, asset.name) === 'crypto') { try { sessionStorage.setItem('ca_prefill_coin', asset.code) } catch { /* blocked */ } }
    window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page: 'custom-alerts' } }))
  }

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <div className="ws-page-head-left"><h1 className="ws-title">Stocks</h1></div>
        <div className="ws-page-head-right">
          <div className="ws-search" style={{ width: 400 }}><Search size={15} /><input className="ws-input ws-input-lg" placeholder="Search symbols, e.g. AAPL, MSFT..." value={query} onChange={e => setQuery(e.target.value)} /></div>
          <span className="ws-meta-stamp">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} <span>|</span> {new Date().toTimeString().slice(0, 8)} (ET)</span>
        </div>
      </div>

      <IndexCards />
      {current && <AssetDetail asset={current} onAlert={addAlert} />}

      <div className="ws-card ws-mt-16">
        <div className="ws-card-head">
          <h3 className="ws-h3">Top Stocks</h3>
          <div className="ws-inline-select" style={{ minWidth: 220 }}>{SORTS.find(s => s[0] === sortKey)[1]}<ChevronDown size={14} />
            <select value={sortKey} onChange={e => setSortKey(e.target.value)}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </div>
        </div>
        <div className="ws-table-wrap">
          <table className="ws-table ws-table-tall st-table">
            <thead><tr><th>#</th><th>Name</th><th className="ws-right">Market Cap</th><th className="ws-right">Price</th><th className="ws-right">24h</th><th>Country</th><th className="ws-right">Action</th></tr></thead>
            <tbody>
              {loading && rankingData.length === 0 ? <tr><td colSpan={7}><div className="ws-loading"><span className="ws-spinner" /> Loading…</div></td></tr>
              : rows.length === 0 ? <tr><td colSpan={7}><div className="ws-empty"><div className="ws-empty-title">{error || 'No assets match.'}</div></div></td></tr>
              : rows.slice(0, 100).map((r, i) => {
                const a = toAsset(r)
                const up = r.today_dir === 'up', down = r.today_dir === 'down'
                return (
                  <tr key={`${r.rank}-${r.code}`} className={`ws-table-click ${current?.code === r.code ? 'lsr-row-active' : ''}`} onClick={() => setSelected(a)}>
                    <td className="ws-muted">{i + 1}</td>
                    <td><div className="ws-asset"><span className="ws-asset-logo" style={{ background: 'transparent' }}>{a.category === 'crypto' ? <AssetLogo symbol={r.code} type="crypto" size={28} radius={14} /> : <StockLogo ticker={r.code} cmcIcon={r.icon} size={26} />}</span><span className="ws-asset-sym">{r.code}</span><span className="ws-asset-name" style={{ fontSize: 13 }}>{r.name}</span></div></td>
                    <td className="ws-right ws-num ws-ink">{r.market_cap}</td>
                    <td className="ws-right ws-num ws-ink">{String(r.price || '').replace(/^\$/, '')}</td>
                    <td className={`ws-right ws-num ${up ? 'ws-pos' : down ? 'ws-neg' : 'ws-text'}`}>{up ? '+' : down ? '-' : ''}{String(r.today || '').replace(/^[+-]/, '')}</td>
                    <td className="ws-text">{r.country || '—'}</td>
                    <td className="ws-right"><button className="ws-iconbtn" title="Add alert" onClick={e => { e.stopPropagation(); addAlert(a) }}><Bell size={17} /></button></td>
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
