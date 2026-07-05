import { useEffect, useMemo, useRef, useState } from 'react'
import { createChart, CrosshairMode, CandlestickSeries, HistogramSeries } from 'lightweight-charts'
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
function getStocksAudioCtx() {
  if (!_stocksAudioCtx) {
    _stocksAudioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return _stocksAudioCtx
}

function playMoneyAlarmTone() {
  try {
    const ctx = getStocksAudioCtx()
    if (ctx.state === 'suspended') ctx.resume()
    const tone = (at, freq, gainV, dur = 0.16, type = 'triangle') => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      osc.frequency.value = freq
      gain.gain.setValueAtTime(gainV, at)
      gain.gain.exponentialRampToValueAtTime(0.001, at + dur)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(at)
      osc.stop(at + dur)
    }
    tone(ctx.currentTime, 1046, 0.16, 0.12, 'square')
    tone(ctx.currentTime + 0.14, 1318, 0.15, 0.12, 'square')
    tone(ctx.currentTime + 0.30, 1567, 0.14, 0.16, 'triangle')
  } catch (err) {}
}

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

function CandleChart({ candles = [], loading = false, alertLines = [] }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const candleSeriesRef = useRef(null)
  const volumeSeriesRef = useRef(null)
  const alertPriceLinesRef = useRef([])

  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#8b9eb7' },
      grid: {
        vertLines: { color: 'rgba(26, 28, 37, 0.45)' },
        horzLines: { color: 'rgba(26, 28, 37, 0.45)' },
      },
      rightPriceScale: { borderColor: 'rgba(26, 28, 37, 0.8)' },
      timeScale: { borderColor: 'rgba(26, 28, 37, 0.8)', timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: true,
      handleScale: true,
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00d992',
      downColor: '#ff3b5c',
      borderVisible: false,
      wickUpColor: '#00d992',
      wickDownColor: '#ff3b5c',
    })
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: '',
      priceFormat: { type: 'volume' },
      color: 'rgba(0, 217, 146, 0.35)',
    })
    chart.priceScale('').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } })

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries

    const onResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth, height: 230 })
      }
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
    }
  }, [])

  useEffect(() => {
    const candleSeries = candleSeriesRef.current
    const volumeSeries = volumeSeriesRef.current
    const chart = chartRef.current
    if (!candleSeries || !volumeSeries || !chart) return
    candleSeries.setData(candles)
    volumeSeries.setData(
      candles.map(c => ({
        time: c.time,
        value: c.volume || 0,
        color: c.close >= c.open ? 'rgba(0, 217, 146, 0.45)' : 'rgba(255, 59, 92, 0.45)',
      })),
    )
    chart.timeScale().fitContent()
  }, [candles])

  useEffect(() => {
    const candleSeries = candleSeriesRef.current
    if (!candleSeries) return
    alertPriceLinesRef.current.forEach((ln) => {
      try { candleSeries.removePriceLine(ln) } catch { /* no-op */ }
    })
    alertPriceLinesRef.current = []
    alertLines.forEach((a) => {
      const ln = candleSeries.createPriceLine({
        price: a.price,
        color: a.triggered ? '#f5a623' : (a.direction === 'above' ? '#00d992' : '#ff3b5c'),
        lineWidth: a.triggered ? 1 : 2,
        lineStyle: a.triggered ? 1 : 2,
        axisLabelVisible: true,
        title: a.triggered
          ? `ALARM ✓ ${a.direction === 'above' ? '▲' : '▼'}`
          : `ALARM ${a.direction === 'above' ? '▲' : '▼'}`,
      })
      alertPriceLinesRef.current.push(ln)
    })
  }, [alertLines])

  return (
    <div className="stx-candle-wrap">
      <div ref={containerRef} className="stx-candle-chart" />
      {loading && <div className="stx-chart-overlay">Loading chart...</div>}
      {!loading && candles.length === 0 && <div className="stx-chart-overlay">No chart data found</div>}
    </div>
  )
}

function getTradingViewSymbol(asset = {}) {
  const row = asset.row || {}
  const code = String(asset.code || row.code || '').toUpperCase()
  const category = asset.category || getAssetCategory(code, row.name || '')
  if (!code) return 'NASDAQ:AAPL'
  if (code === 'GOLD') return 'TVC:GOLD'
  if (code === 'SILVER') return 'TVC:SILVER'
  if (category === 'crypto') return `BINANCE:${code}USDT`
  const matchedSuffix = Object.keys(TV_EXCHANGE_BY_SUFFIX).find((suffix) => code.endsWith(suffix))
  if (matchedSuffix) {
    return `${TV_EXCHANGE_BY_SUFFIX[matchedSuffix]}:${code.slice(0, -matchedSuffix.length)}`
  }
  if (TV_EXCHANGE_BY_CODE[code]) {
    return `${TV_EXCHANGE_BY_CODE[code]}:${code}`
  }
  return `NYSE:${code}`
}

function tvInterval(rangeId) {
  return ({
    '15M': '15',
    '30M': '30',
    '45M': '45',
    '1H0': '60',
    '4H0': '240',
    '24H': '15',
    '1D': '30',
    '1W': '60',
    '1M': 'D',
    '3M': 'D',
    '1Y': 'D',
    '5Y': 'W',
  })[rangeId] || 'D'
}

function TradingViewEmbed({ asset, rangeId }) {
  const symbol = getTradingViewSymbol(asset)
  const params = new URLSearchParams({
    frameElementId: `tv_${symbol.replace(/[^a-z0-9]/gi, '_')}`,
    symbol,
    interval: tvInterval(rangeId),
    hidesidetoolbar: '1',
    symboledit: '1',
    saveimage: '0',
    toolbarbg: '000000',
    theme: 'dark',
    style: '1',
    timezone: 'Etc/UTC',
    withdateranges: '1',
    hideideas: '1',
    locale: 'en',
  })
  return (
    <div className="stx-candle-wrap">
      <iframe
        title={`${symbol} TradingView chart`}
        className="stx-tv-frame"
        src={`https://s.tradingview.com/widgetembed/?${params.toString()}`}
        allowFullScreen
      />
    </div>
  )
}

function StocksDetailModal({ asset, onClose }) {
  const modalAsset = typeof asset === 'string'
    ? { tradeSymbol: asset, code: asset.replace(/USDT$/, ''), name: asset.replace(/USDT$/, ''), row: null, category: 'stock' }
    : asset
  const selected = modalAsset.tradeSymbol || modalAsset.code
  const alertKey = modalAsset.tradeSymbol || `asset:${modalAsset.code}`
  const isTradeable = Boolean(modalAsset.tradeSymbol)
  const rowAsset = modalAsset.row || {}
  const [tickers, setTickers] = useState({})
  const [fundamentals, setFundamentals] = useState({})
  const [rangeId, setRangeId] = useState('15M')
  const [candles, setCandles] = useState([])
  const [chartLoading, setChartLoading] = useState(false)
  const [alertSoundOn, setAlertSoundOn] = useState(() => {
    try { return localStorage.getItem('stocks_alert_sound_on') !== '0' } catch { return true }
  })
  const [alertsBySymbol, setAlertsBySymbol] = useState(() => {
    try { return JSON.parse(localStorage.getItem('stocks_alerts_v1')) || {} } catch { return {} }
  })
  const [alertPriceInput, setAlertPriceInput] = useState('')
  const [alertDirection, setAlertDirection] = useState('above')

  useEffect(() => {
    if (!isTradeable) {
      setTickers({
        [selected]: {
          price: parsePrice(rowAsset.price || ''),
          chg: parseToday(rowAsset.today || ''),
          high: null,
          low: null,
          open: null,
          volume: null,
          trades: null,
        },
      })
      return
    }
    let mounted = true
    const fetchTickers = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/binance/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify([selected]))}`)
        const data = await res.json()
        if (!mounted) return
        const arr = Array.isArray(data) ? data : []
        const map = {}
        arr.forEach((row) => {
          map[row.symbol] = {
            price: Number(row.lastPrice || 0),
            chg: Number(row.priceChangePercent || 0),
            high: Number(row.highPrice || 0),
            low: Number(row.lowPrice || 0),
            open: Number(row.openPrice || 0),
            prevClose: Number(row.prevClosePrice || 0),
            volume: Number(row.quoteVolume || 0),
            trades: Number(row.count || 0),
          }
        })
        setTickers(map)
      } catch (err) {}
    }
    fetchTickers()
    const id = setInterval(fetchTickers, 10_000)
    return () => { mounted = false; clearInterval(id) }
  }, [selected, isTradeable, rowAsset.price, rowAsset.today])

  useEffect(() => {
    let mounted = true
    const targetTicker = selected.replace('USDT', '')
    const fetchFundamentals = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/stocks/fundamentals?symbols=${encodeURIComponent(targetTicker)}`)
        const data = await res.json()
        if (mounted && data) setFundamentals(data)
      } catch (err) {}
    }
    fetchFundamentals()
  }, [selected])

  useEffect(() => {
    let mounted = true
    const range = RANGE_OPTIONS.find(x => x.id === rangeId) || RANGE_OPTIONS[0]
    const fetchKlines = async () => {
      setChartLoading(true)
      try {
        let parsed = []
        if (isTradeable) {
          const requestInterval = range.interval === '45m' ? '15m' : range.interval
          const requestLimit = range.interval === '45m' ? Math.max(60, range.limit * 3) : range.limit
          const res = await fetch(`${API_BASE}/api/binance/klines?symbol=${selected}&interval=${requestInterval}&limit=${requestLimit}`)
          const payload = await res.json()
          const data = Array.isArray(payload?.data) ? payload.data : []
          parsed = data
            .map((d) => ({
              time: Number(d[0]) / 1000,
              open: Number(d[1]),
              high: Number(d[2]),
              low: Number(d[3]),
              close: Number(d[4]),
              volume: Number(d[5]),
            }))
            .filter(x => Number.isFinite(x.time))
          if (range.interval === '45m') {
            parsed = aggregateCandlesTo45m(parsed).slice(-range.limit)
          }
        } else {
          const params = yahooChartParams(rangeId)
          const res = await fetch(`${API_BASE}/api/stocks/chart?symbol=${encodeURIComponent(targetTicker)}&interval=${encodeURIComponent(params.interval)}&range=${encodeURIComponent(params.range)}`)
          const payload = await res.json()
          parsed = Array.isArray(payload?.data) ? payload.data : []
        }
        if (mounted) setCandles(parsed)
      } catch (err) {
        if (mounted) setCandles([])
      } finally {
        if (mounted) setChartLoading(false)
      }
    }
    fetchKlines()
    const id = setInterval(fetchKlines, 15_000)
    return () => { mounted = false; clearInterval(id) }
  }, [selected, rangeId, isTradeable])

  const targetTicker = selected.replace('USDT', '')
  const selectedTicker = tickers[selected] || {
    price: parsePrice(rowAsset.price || ''),
    chg: parseToday(rowAsset.today || ''),
  }
  const selectedFund = fundamentals[targetTicker] || {}
  const fallbackMarketCap = parseMktCap(rowAsset.market_cap || '')
  const assetCategory = modalAsset.category || getAssetCategory(targetTicker, rowAsset.name || '')
  const selectedUp = (selectedTicker.chg || 0) >= 0
  const selectedAlerts = (alertsBySymbol[alertKey] || []).slice().sort((a, b) => a.price - b.price)
  const selectedAlertLines = selectedAlerts.map((a) => ({ price: a.price, direction: a.direction, triggered: Boolean(a.triggered) }))

  const persistAlerts = (next) => {
    setAlertsBySymbol(next)
    try { localStorage.setItem('stocks_alerts_v1', JSON.stringify(next)) } catch {}
  }
  const addAlert = () => {
    const p = Number(alertPriceInput)
    if (!Number.isFinite(p) || p <= 0) return
    const next = { ...alertsBySymbol }
    const arr = Array.isArray(next[alertKey]) ? [...next[alertKey]] : []
    arr.push({ id: `${Date.now()}`, price: p, direction: alertDirection, triggered: false, createdAt: Date.now() })
    next[alertKey] = arr
    persistAlerts(next)
    setAlertPriceInput('')
  }
  const removeAlert = (id) => {
    const next = { ...alertsBySymbol }
    next[alertKey] = (next[alertKey] || []).filter((a) => a.id !== id)
    persistAlerts(next)
  }
  const toggleAlertSound = () => {
    setAlertSoundOn((prev) => {
      const next = !prev
      try { localStorage.setItem('stocks_alert_sound_on', next ? '1' : '0') } catch {}
      return next
    })
  }
  const quickTradeFromStocks = (direction) => {
    if (!isTradeable) return
    const cmd = `${direction} ${selected} 10000 5` // Defaults
    sessionStorage.setItem('tt_trade_symbol', selected.replace(/USDT$/, ''))
    sessionStorage.setItem('tt_terminal_prefill_cmd', cmd)
    sessionStorage.setItem('tt_terminal_autosend', '1')
    window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page: 'terminal' } }))
  }
  const openTerminal = () => {
    if (!isTradeable) return
    sessionStorage.setItem('tt_prefill_symbol', selected)
    window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page: 'terminal' } }))
  }

  return (
    <div className="stx-modal-overlay" onClick={onClose}>
      <div className="stx-modal-content" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="stx-modal-header">
          <div style={{display:'flex', alignItems:'center', gap:'14px'}}>
            <StockLogo ticker={targetTicker} cmcIcon={rowAsset.icon} size={36} />
            <div>
              <div style={{fontSize:'16px', fontWeight:'600', color:'var(--text-0)', fontFamily:'var(--font-mono)', letterSpacing:'0.06em'}}>{targetTicker}</div>
              <div style={{color:'var(--text-3)', fontSize:'10px', fontFamily:'var(--font-mono)', letterSpacing:'0.08em', textTransform:'uppercase', marginTop:'2px'}}>
                {isTradeable ? selected : (rowAsset.name || modalAsset.name || targetTicker)}
              </div>
            </div>
            {selectedTicker.price > 0 && (
              <div style={{marginLeft:'8px'}}>
                <div style={{fontSize:'18px', fontWeight:'600', color:'var(--text-0)', fontFamily:'var(--font-mono)'}}>{fmtUsd(selectedTicker.price)}</div>
                <div style={{fontSize:'11px', fontFamily:'var(--font-mono)', color: selectedUp ? 'var(--accent)' : 'var(--danger)'}}>{fmtPct(selectedTicker.chg)}</div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="stx-modal-alert-btn"
              title="Fiyat Alarmı Kur"
              onClick={() => {
                try { sessionStorage.setItem('ca_prefill_coin', targetTicker) } catch {}
                window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page: 'custom-alerts' } }))
                onClose()
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
            </button>
            <button onClick={onClose} className="stx-modal-close">&times;</button>
          </div>
        </div>

        {/* Range selector */}
        <div className="stocks-range-row">
          {RANGE_OPTIONS.map((r) => (
            <button key={r.id} className={`stocks-range-btn ${rangeId === r.id ? 'active' : ''}`} onClick={() => setRangeId(r.id)}>{r.label}</button>
          ))}
        </div>

        {/* Chart */}
        {!isTradeable && !chartLoading && candles.length === 0 ? (
          <TradingViewEmbed asset={modalAsset} rangeId={rangeId} />
        ) : (
          <CandleChart candles={candles} loading={chartLoading} alertLines={selectedAlertLines} />
        )}

        {/* Panels */}
        <div className="stx-panels-grid">
          {/* Alert panel */}
          <div className="stocks-alerts-card">
            <div className="stocks-alerts-head">
              <span>Price Alert</span>
              <div className="stocks-alerts-head-actions">
                <button className={`stocks-sound-toggle ${alertSoundOn ? 'on' : 'off'}`} onClick={toggleAlertSound}>
                  {alertSoundOn ? '🔔 Sound On' : '🔕 Sound Off'}
                </button>
              </div>
            </div>
            <div className="stocks-alerts-form">
              <select className="stocks-alert-select" value={alertDirection} onChange={(e) => setAlertDirection(e.target.value)}>
                <option value="above">Above</option>
                <option value="below">Below</option>
              </select>
              <input className="stocks-alert-input" type="number" placeholder="Price" value={alertPriceInput} onChange={(e) => setAlertPriceInput(e.target.value)} />
              <button className="stocks-alert-add" onClick={addAlert}>Add</button>
            </div>
            <div className="stocks-alert-list">
              {selectedAlerts.length === 0 && <div className="stocks-alert-empty">No alerts yet</div>}
              {selectedAlerts.map((a) => (
                <div key={a.id} className="stocks-alert-item">
                  <span className={`stocks-alert-badge ${a.direction === 'above' ? 'up' : 'down'}`}>{a.direction === 'above' ? '▲' : '▼'}</span>
                  <strong>{fmtUsd(a.price)}</strong>
                  <span className={`stocks-alert-state ${a.triggered ? 'hit' : ''}`}>{a.triggered ? 'Triggered' : 'Waiting'}</span>
                  <button className="stocks-alert-remove" onClick={() => removeAlert(a.id)}>Remove</button>
                </div>
              ))}
            </div>
          </div>

          {/* Stats panel */}
          <div className="stx-stats-panel">
            {isTradeable ? (
              <>
                <div className="stx-stat-item">
                  <span>24h Volume</span>
                  <strong>{fmtUsd(selectedTicker.volume, 0)}</strong>
                </div>
                <div className="stx-stat-item">
                  <span>Open</span>
                  <strong>{fmtUsd(selectedTicker.open)}</strong>
                </div>
                <div className="stx-stat-item">
                  <span>24h High</span>
                  <strong style={{color:'var(--accent)'}}>{fmtUsd(selectedTicker.high)}</strong>
                </div>
                <div className="stx-stat-item">
                  <span>24h Low</span>
                  <strong style={{color:'var(--danger)'}}>{fmtUsd(selectedTicker.low)}</strong>
                </div>
                <div className="stx-stat-item">
                  <span>Market Cap</span>
                  <strong>{fmtCap(selectedFund.marketCap || fallbackMarketCap)}</strong>
                </div>
                <div className="stx-stat-item">
                  <span>Trade Count</span>
                  <strong>{(selectedTicker.trades || 0).toLocaleString('en-US')}</strong>
                </div>
              </>
            ) : (
              <>
                <div className="stx-stat-item">
                  <span>Price</span>
                  <strong>{rowAsset.price || fmtUsd(selectedTicker.price)}</strong>
                </div>
                <div className="stx-stat-item">
                  <span>Today</span>
                  <strong style={{color: selectedUp ? 'var(--accent)' : 'var(--danger)'}}>{rowAsset.today || fmtPct(selectedTicker.chg)}</strong>
                </div>
                <div className="stx-stat-item">
                  <span>Market Cap</span>
                  <strong>{rowAsset.market_cap || fmtCap(fallbackMarketCap)}</strong>
                </div>
                <div className="stx-stat-item">
                  <span>Country</span>
                  <strong>{rowAsset.country || '—'}</strong>
                </div>
                <div className="stx-stat-item">
                  <span>Category</span>
                  <strong>{assetCategory}</strong>
                </div>
                <div className="stx-stat-item">
                  <span>Symbol</span>
                  <strong>{targetTicker}</strong>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        {isTradeable && (
          <div className="stocks-actions">
            <button className="stx-btn stx-btn-ghost" onClick={openTerminal}>Chart</button>
            <button className="stx-btn stx-btn-red" onClick={() => quickTradeFromStocks('short')}>Sell</button>
            <button className="stx-btn stx-btn-green" onClick={() => quickTradeFromStocks('long')}>Buy</button>
          </div>
        )}
      </div>
    </div>
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

export default function StocksPage() {
  const [rankingData, setRankingData] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [modalAsset, setModalAsset] = useState(null)
  const [debugError, setDebugError] = useState(null)
  const [sortKey, setSortKey] = useState('rank')
  const [sortDir, setSortDir] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const rowsPerPage = 100

  const handleSort = (key) => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => -d); return key }
      setSortDir(key === 'rank' ? 1 : -1)
      return key
    })
  }

  useEffect(() => {
    let mounted = true
    const fetchRanking = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/stocks/assets_ranking?_t=${Date.now()}`)
        const json = await res.json()
        if (mounted && json.status === 'ok') {
          setRankingData(json.data)
          if (json.data.length === 0) setDebugError('Backend returned empty data array.')
        } else if (mounted) {
          setDebugError('Backend returned status: ' + json.status)
        }
      } catch (err) {
        console.warn('Ranking fetch failed', err)
        if (mounted) setDebugError(err.toString())
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchRanking()
    const id = setInterval(fetchRanking, 60_000)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let filtered = rankingData
    if (q) {
      filtered = rankingData.filter(r =>
        (r.name && r.name.toLowerCase().includes(q)) ||
        (r.code && r.code.toLowerCase().includes(q))
      )
    }
    return [...filtered].sort((a, b) => {
      let va, vb
      switch (sortKey) {
        case 'rank':       va = parseInt(a.rank) || 0;   vb = parseInt(b.rank) || 0;   break
        case 'name':       va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase(); break
        case 'market_cap': va = parseMktCap(a.market_cap);  vb = parseMktCap(b.market_cap);  break
        case 'price':      va = parsePrice(a.price);        vb = parsePrice(b.price);        break
        case 'today':      va = parseToday(a.today);        vb = parseToday(b.today);        break
        case 'country':    va = (a.country || '').toLowerCase(); vb = (b.country || '').toLowerCase(); break
        default:           return 0
      }
      if (va < vb) return -sortDir
      if (va > vb) return sortDir
      return 0
    })
  }, [query, rankingData, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage))
  const currentRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage
    return rows.slice(start, start + rowsPerPage)
  }, [rows, currentPage, rowsPerPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [query, sortKey])

  const quickTrade = (symbol, e) => {
    e.stopPropagation()
    sessionStorage.setItem('tt_trade_symbol', symbol.replace(/USDT$/, ''))
    sessionStorage.setItem('tt_terminal_prefill_cmd', `long ${symbol} 10000 5`)
    sessionStorage.setItem('tt_terminal_autosend', '0')
    window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page: 'terminal' } }))
  }

  const openModal = (row, tradeSymbol, category) => {
    if (!row?.code) return
    setModalAsset({
      code: row.code,
      name: row.name,
      tradeSymbol: tradeSymbol || null,
      row,
      category,
    })
  }

  return (
    <div className="stx2-page">

      {/* Header */}
      <div className="stx2-page-header">
        <div>
          <div className="stx2-page-title">Top Assets by Market Cap</div>
          <div className="stx2-page-subtitle">
            <span className="stx2-pill stx2-pill-stock">Stocks</span>
            <span className="stx2-pill stx2-pill-crypto">Crypto</span>
            <span className="stx2-pill stx2-pill-metal">Metals</span>
            <span className="stx2-pill stx2-pill-etf">ETFs</span>
          </div>
        </div>
        <div className="stx2-search-wrap">
          <span className="stx2-search-icon">⌕</span>
          <input className="stx2-search" placeholder="Search assets…" value={query} onChange={e => setQuery(e.target.value)} />
          {query && <button className="stx2-search-clr" onClick={() => setQuery('')}>×</button>}
        </div>
      </div>

      {/* Table */}
      <div className="stx2-table-wrap">
        {debugError && <div className="stx2-error">{debugError}</div>}
        {loading && rankingData.length === 0 ? (
          <div className="stx2-loading">Loading…</div>
        ) : (
          <table className="stx2-table">
            <thead>
              <tr>
                {[
                  { key: 'rank',       label: '#' },
                  { key: 'name',       label: 'Name' },
                  { key: 'market_cap', label: 'Market Cap' },
                  { key: 'price',      label: 'Price' },
                  { key: 'today',      label: '24h' },
                  { key: 'country',    label: 'Country' },
                ].map(col => (
                  <th key={col.key} className={`stx2-th${col.key === 'rank' ? ' stx2-th-rank' : ''}`}
                    onClick={() => handleSort(col.key)} style={{ color: sortKey === col.key ? '#fff' : undefined }}>
                    {col.label}
                    <span className="stx2-sort-icon">{sortKey !== col.key ? '↕' : sortDir > 0 ? '↑' : '↓'}</span>
                  </th>
                ))}
                <th className="stx2-th stx2-th-action">Action</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map(r => {
                let tradeSymbol = ASSET_TO_TERMINAL_MAP[r.code]
                if (!tradeSymbol && STOCK_UNIVERSE.find(x => x.ticker === r.code)) tradeSymbol = r.code + 'USDT'
                const category = getAssetCategory(r.code, r.name)
                const isUp   = r.today_dir === 'up'
                const isDown = r.today_dir === 'down'
                return (
                  <tr key={`${r.rank}-${r.code}`} className={`stx2-row stx2-cat-${category}`}
                    onClick={() => openModal(r, tradeSymbol, category)}>
                    <td className="stx2-td stx2-td-rank">{r.rank}</td>
                    <td className="stx2-td stx2-td-name">
                      <StockLogo ticker={r.code} cmcIcon={r.icon} size={28} />
                      <div className="stx2-name-block">
                        <span className="stx2-name">{r.name}</span>
                        <span className="stx2-code">{r.code}</span>
                      </div>
                    </td>
                    <td className="stx2-td stx2-td-num">{r.market_cap}</td>
                    <td className="stx2-td stx2-td-price">{r.price}</td>
                    <td className="stx2-td">
                      <span className={`stx2-chg-badge${isUp ? ' up' : isDown ? ' dn' : ''}`}>
                        {isUp ? '+' : ''}{r.today}
                      </span>
                    </td>
                    <td className="stx2-td stx2-td-country">{r.country}</td>
                    <td className="stx2-td stx2-td-action">
                      {tradeSymbol
                        ? <button className="mk-trade-btn" onClick={e => quickTrade(tradeSymbol, e)}>Trade</button>
                        : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && !loading && (
        <div className="stx2-pagination">
          <button className="stx2-pag-btn" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>‹</button>
          {Array.from({ length: totalPages }).map((_, i) => {
            const p = i + 1
            if (totalPages > 7 && Math.abs(p - currentPage) > 2 && p !== 1 && p !== totalPages) {
              if (p === 2 || p === totalPages - 1) return <span key={p} className="stx2-pag-dot">…</span>
              return null
            }
            return <button key={p} className={`stx2-pag-btn${currentPage === p ? ' active' : ''}`} onClick={() => setCurrentPage(p)}>{p}</button>
          })}
          <button className="stx2-pag-btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>›</button>
        </div>
      )}

      {modalAsset && <StocksDetailModal asset={modalAsset} onClose={() => setModalAsset(null)} />}
    </div>
  )
}
