import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createChart, CrosshairMode, CandlestickSeries, HistogramSeries } from 'lightweight-charts'
import { API_BASE } from '../config'

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtPrice(p) {
  if (p == null || !isFinite(p) || p <= 0) return '—'
  if (p >= 10000) return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (p >= 1000)  return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (p >= 1)     return '$' + p.toFixed(4)
  if (p >= 0.001) return '$' + p.toFixed(5)
  if (p >= 0.0001)return '$' + p.toFixed(6)
  return '$' + p.toFixed(8)
}
function fmtLarge(v) {
  if (!v || !isFinite(v) || v <= 0) return '—'
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T'
  if (v >= 1e9)  return '$' + (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6)  return '$' + (v / 1e6).toFixed(2) + 'M'
  return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
function fmtSupply(v, sym) {
  if (!v || !isFinite(v) || v <= 0) return '—'
  const s = sym || ''
  if (v >= 1e12) return (v / 1e12).toFixed(2) + 'T ' + s
  if (v >= 1e9)  return (v / 1e9).toFixed(2) + 'B ' + s
  if (v >= 1e6)  return (v / 1e6).toFixed(2) + 'M ' + s
  return v.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' ' + s
}
function fmtChg(v) {
  if (v == null || !isFinite(v)) return null
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
}

// ─── Sparkline SVG ────────────────────────────────────────────────────────────
function Sparkline({ prices }) {
  if (!prices?.length || prices.length < 2) return <span className="cmcx-dim">—</span>
  const up = prices[prices.length - 1] >= prices[0]
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const W = 80, H = 30
  const step = Math.max(1, Math.floor(prices.length / 50))
  const pts = prices
    .filter((_, i) => i % step === 0 || i === prices.length - 1)
    .map((p, i, arr) => {
      const x = (i / (arr.length - 1)) * W
      const y = H - ((p - min) / range) * (H - 4) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <polyline points={pts} fill="none"
        stroke={up ? '#00d992' : '#ff3b5c'} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ─── Coin Logo ────────────────────────────────────────────────────────────────
const FALLBACK_COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899','#f97316']
const symColor = s => FALLBACK_COLORS[(s.charCodeAt(0) + (s.charCodeAt(1) || 0)) % FALLBACK_COLORS.length]

function CoinLogo({ cmcId, sym, size = 28 }) {
  const [err, setErr] = useState(false)
  const src = cmcId ? `https://s2.coinmarketcap.com/static/img/coins/32x32/${cmcId}.png` : null
  if (!src || err) {
    return (
      <span style={{
        width: size, height: size, borderRadius: '50%',
        background: symColor(sym || '?'),
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.floor(size * 0.35), fontWeight: 700, color: '#fff', flexShrink: 0,
      }}>{(sym || '?').slice(0, 3)}</span>
    )
  }
  return (
    <img src={src} alt={sym} width={size} height={size}
      style={{ borderRadius: '50%', flexShrink: 0, objectFit: 'contain' }}
      onError={() => setErr(true)} />
  )
}

// ─── Global Stats Bar ─────────────────────────────────────────────────────────
function GlobalStatsBar({ global: g, fearGreed }) {
  if (!g) return <div className="cmcx-stats-bar cmcx-stats-loading"/>
  const totalMcap = g.total_market_cap?.usd
  const totalVol  = g.total_volume?.usd
  const btcDom    = g.market_cap_percentage?.btc
  const ethDom    = g.market_cap_percentage?.eth
  const mcapChg   = g.market_cap_change_percentage_24h_usd
  const fgVal     = fearGreed ? parseInt(fearGreed.value) : null
  const fgLabel   = fearGreed?.value_classification
  const fgColor   = fgVal >= 60 ? '#00d992' : fgVal >= 40 ? '#f5a623' : '#ff3b5c'

  const items = [
    { label: 'Market Cap',    value: fmtLarge(totalMcap), chg: mcapChg },
    { label: '24h Volume',    value: fmtLarge(totalVol) },
    { label: 'BTC Dominance', value: btcDom != null ? btcDom.toFixed(1) + '%' : '—' },
    { label: 'ETH Dominance', value: ethDom != null ? ethDom.toFixed(1) + '%' : '—' },
    ...(fgVal != null ? [{ label: 'Fear & Greed', value: fgVal, label2: fgLabel, color: fgColor }] : []),
    { label: 'Active Coins',  value: g.active_cryptocurrencies?.toLocaleString() || '—' },
  ]

  return (
    <div className="cmcx-stats-bar">
      {items.map((item, i) => (
        <div key={i} className="cmcx-stat-item">
          <span className="cmcx-stat-label">{item.label}</span>
          <div className="cmcx-stat-val-row">
            <span className="cmcx-stat-value" style={item.color ? { color: item.color } : {}}>
              {item.value}
              {item.label2 && <span className="cmcx-stat-sublabel"> {item.label2}</span>}
            </span>
            {item.chg != null && (
              <span className={`cmcx-stat-chg ${item.chg >= 0 ? 'up' : 'dn'}`}>{fmtChg(item.chg)}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Category chips ───────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'all',       label: 'All' },
  { id: 'favorites', label: '★ Favorites' },
  { id: 'defi',      label: 'DeFi' },
  { id: 'ai',        label: 'AI' },
  { id: 'meme',      label: 'Meme' },
  { id: 'layer1',    label: 'Layer 1' },
  { id: 'layer2',    label: 'Layer 2' },
  { id: 'gaming',    label: 'Gaming' },
  { id: 'rwa',       label: 'RWA' },
  { id: 'stable',    label: 'Stablecoins' },
]

const TAG_CAT = {
  'defi': 'defi', 'decentralized-finance-defi': 'defi',
  'artificial-intelligence': 'ai', 'ai-big-data': 'ai',
  'memes': 'meme', 'meme-token': 'meme',
  'layer-1': 'layer1', 'proof-of-work': 'layer1',
  'layer-2': 'layer2', 'scaling': 'layer2',
  'gaming': 'gaming', 'play-to-earn': 'gaming', 'metaverse': 'gaming',
  'real-world-assets': 'rwa',
  'stablecoin': 'stable', 'stablecoins': 'stable',
}

const STABLE_SET = new Set(['USDT','USDC','FDUSD','BUSD','TUSD','DAI','PYUSD','USDD','USDP','FRAX'])
const ITEMS_PER_PAGE = 20

// ─── Candle chart (reused from StocksPage) ───────────────────────────────────
function CoinCandleChart({ symbol, loading }) {
  const containerRef = useRef(null)
  const chartRef     = useRef(null)
  const candleRef    = useRef(null)
  const volRef       = useRef(null)
  const [candles, setCandles]   = useState([])
  const [cLoading, setCLoading] = useState(true)
  const [rangeId, setRangeId]   = useState('4h')

  const RANGES = [
    { id: '1h',  interval: '5m',  limit: 60  },
    { id: '4h',  interval: '15m', limit: 64  },
    { id: '1d',  interval: '1h',  limit: 24  },
    { id: '1w',  interval: '4h',  limit: 42  },
    { id: '1M',  interval: '1d',  limit: 30  },
  ]

  useEffect(() => {
    if (!symbol) return
    let mounted = true
    setCLoading(true)
    const range = RANGES.find(r => r.id === rangeId) || RANGES[1]
    fetch(`${API_BASE}/api/binance/klines?symbol=${symbol}USDT&interval=${range.interval}&limit=${range.limit}`)
      .then(r => r.json())
      .then(payload => {
        if (!mounted) return
        const data = Array.isArray(payload?.data) ? payload.data : []
        const parsed = data.map(d => ({
          time: Number(d[0]) / 1000,
          open: Number(d[1]), high: Number(d[2]),
          low: Number(d[3]),  close: Number(d[4]),
          volume: Number(d[5]),
        })).filter(x => Number.isFinite(x.time))
        setCandles(parsed)
        setCLoading(false)
      })
      .catch(() => { if (mounted) setCLoading(false) })
    return () => { mounted = false }
  }, [symbol, rangeId])

  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#8b9eb7' },
      grid: { vertLines: { color: 'rgba(26,28,37,0.45)' }, horzLines: { color: 'rgba(26,28,37,0.45)' } },
      rightPriceScale: { borderColor: 'rgba(26,28,37,0.8)' },
      timeScale: { borderColor: 'rgba(26,28,37,0.8)', timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: true, handleScale: true,
    })
    const cs = chart.addSeries(CandlestickSeries, {
      upColor: '#00d992', downColor: '#ff3b5c', borderVisible: false,
      wickUpColor: '#00d992', wickDownColor: '#ff3b5c',
    })
    const vs = chart.addSeries(HistogramSeries, {
      priceScaleId: '', priceFormat: { type: 'volume' }, color: 'rgba(0,217,146,0.35)',
    })
    chart.priceScale('').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } })
    const obs = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    })
    obs.observe(containerRef.current)
    chartRef.current = chart; candleRef.current = cs; volRef.current = vs
    return () => { obs.disconnect(); chart.remove() }
  }, [])

  useEffect(() => {
    if (!candleRef.current || !volRef.current || candles.length === 0) return
    candleRef.current.setData(candles)
    volRef.current.setData(candles.map(c => ({ time: c.time, value: c.volume, color: c.close >= c.open ? 'rgba(0,217,146,0.35)' : 'rgba(255,59,92,0.35)' })))
    chartRef.current?.timeScale().fitContent()
  }, [candles])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="stocks-range-row">
        {RANGES.map(r => (
          <button key={r.id} className={`stocks-range-btn${rangeId === r.id ? ' active' : ''}`} onClick={() => setRangeId(r.id)}>{r.id}</button>
        ))}
      </div>
      <div ref={containerRef} style={{ width: '100%', height: 220, position: 'relative' }}>
        {(loading || cLoading) && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 12 }}>Yükleniyor…</div>
        )}
      </div>
    </div>
  )
}

// ─── Coin detail modal ────────────────────────────────────────────────────────
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const tone = (at, freq, vol, dur, type = 'sine') => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.type = type; osc.frequency.value = freq
      gain.gain.setValueAtTime(vol, at); gain.gain.exponentialRampToValueAtTime(0.001, at + dur)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(at); osc.stop(at + dur)
    }
    tone(ctx.currentTime, 1046, 0.16, 0.12, 'square')
    tone(ctx.currentTime + 0.14, 1318, 0.15, 0.12, 'square')
    tone(ctx.currentTime + 0.30, 1567, 0.14, 0.16, 'triangle')
  } catch {}
}

function CoinDetailModal({ coin, onClose }) {
  const [alertsBySymbol, setAlertsBySymbol] = useState(() => {
    try { return JSON.parse(localStorage.getItem('markets_alerts_v1') || '{}') } catch { return {} }
  })
  const [alertPriceInput, setAlertPriceInput] = useState('')
  const [alertDirection,  setAlertDirection]  = useState('above')
  const [alertSoundOn,    setAlertSoundOn]    = useState(() => {
    try { return localStorage.getItem('markets_alert_sound_on') !== '0' } catch { return true }
  })

  const sym = coin.sym
  const price = coin.price

  // check alerts
  useEffect(() => {
    const id = setInterval(() => {
      const alerts = alertsBySymbol[sym] || []
      const updated = alerts.map(a => {
        if (a.triggered) return a
        const hit = a.direction === 'above' ? price >= a.price : price <= a.price
        if (hit) {
          if (alertSoundOn) playAlertSound()
          return { ...a, triggered: true }
        }
        return a
      })
      if (updated.some((a, i) => a.triggered !== (alertsBySymbol[sym] || [])[i]?.triggered)) {
        const next = { ...alertsBySymbol, [sym]: updated }
        setAlertsBySymbol(next)
        try { localStorage.setItem('markets_alerts_v1', JSON.stringify(next)) } catch {}
      }
    }, 2000)
    return () => clearInterval(id)
  }, [alertsBySymbol, sym, price, alertSoundOn])

  const persistAlerts = next => {
    setAlertsBySymbol(next)
    try { localStorage.setItem('markets_alerts_v1', JSON.stringify(next)) } catch {}
  }
  const addAlert = () => {
    const p = Number(alertPriceInput)
    if (!Number.isFinite(p) || p <= 0) return
    const next = { ...alertsBySymbol }
    const arr  = Array.isArray(next[sym]) ? [...next[sym]] : []
    arr.push({ id: `${Date.now()}`, price: p, direction: alertDirection, triggered: false, createdAt: Date.now() })
    next[sym] = arr
    persistAlerts(next)
    setAlertPriceInput('')
  }
  const removeAlert = id => {
    const next = { ...alertsBySymbol }
    next[sym] = (next[sym] || []).filter(a => a.id !== id)
    persistAlerts(next)
  }

  const selectedAlerts = (alertsBySymbol[sym] || []).slice().sort((a, b) => a.price - b.price)
  const isUp = (coin.chg24h || 0) >= 0

  const goTrade = () => {
    sessionStorage.setItem('tt_trade_symbol', sym)
    window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page: 'terminal', symbol: sym } }))
    onClose()
  }

  return (
    <div className="stx-modal-overlay" onClick={onClose}>
      <div className="stx-modal-content" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="stx-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <CoinLogo cmcId={coin.id} sym={sym} size={36} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-0)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>{coin.name}</div>
              <div style={{ color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>{sym}</div>
            </div>
            {price > 0 && (
              <div style={{ marginLeft: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-0)', fontFamily: 'var(--font-mono)' }}>{fmtPrice(price)}</div>
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: isUp ? 'var(--accent)' : 'var(--danger)' }}>{fmtChg(coin.chg24h)}</div>
              </div>
            )}
          </div>
          <button onClick={onClose} className="stx-modal-close">&times;</button>
        </div>

        {/* Chart */}
        <CoinCandleChart symbol={sym} />

        {/* Panels */}
        <div className="stx-panels-grid">
          {/* Alert panel */}
          <div className="stocks-alerts-card">
            <div className="stocks-alerts-head">
              <span>Fiyat Alarmı</span>
              <button className={`stocks-sound-toggle ${alertSoundOn ? 'on' : 'off'}`}
                onClick={() => setAlertSoundOn(p => { const n = !p; try { localStorage.setItem('markets_alert_sound_on', n ? '1' : '0') } catch {}; return n })}>
                {alertSoundOn ? '🔔 Ses Açık' : '🔕 Ses Kapalı'}
              </button>
            </div>
            <div className="stocks-alerts-form">
              <select className="stocks-alert-select" value={alertDirection} onChange={e => setAlertDirection(e.target.value)}>
                <option value="above">Üstüne (Above)</option>
                <option value="below">Altına (Below)</option>
              </select>
              <input className="stocks-alert-input" type="number" placeholder="Fiyat" value={alertPriceInput} onChange={e => setAlertPriceInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAlert()} />
              <button className="stocks-alert-add" onClick={addAlert}>Ekle</button>
            </div>
            <div className="stocks-alert-list">
              {selectedAlerts.length === 0 && <div className="stocks-alert-empty">Henüz alarm yok</div>}
              {selectedAlerts.map(a => (
                <div key={a.id} className="stocks-alert-item">
                  <span className={`stocks-alert-badge ${a.direction === 'above' ? 'up' : 'down'}`}>{a.direction === 'above' ? '▲' : '▼'}</span>
                  <strong>{fmtPrice(a.price)}</strong>
                  <span className={`stocks-alert-state ${a.triggered ? 'hit' : ''}`}>{a.triggered ? 'Tetiklendi' : 'Bekliyor'}</span>
                  <button className="stocks-alert-remove" onClick={() => removeAlert(a.id)}>Sil</button>
                </div>
              ))}
            </div>
          </div>

          {/* Stats panel */}
          <div className="stx-stats-panel">
            <div className="stx-stat-item"><span>Piyasa Değeri</span><strong>{fmtLarge(coin.mcap)}</strong></div>
            <div className="stx-stat-item"><span>24s Hacim</span><strong>{fmtLarge(coin.vol24h)}</strong></div>
            <div className="stx-stat-item"><span>Dolaşım Arzı</span><strong>{fmtSupply(coin.supply, sym)}</strong></div>
            <div className="stx-stat-item"><span>Maks Arz</span><strong>{coin.maxSup > 0 ? fmtSupply(coin.maxSup, sym) : '∞'}</strong></div>
            <div className="stx-stat-item"><span>1s Değişim</span><strong style={{ color: (coin.chg1h || 0) >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{fmtChg(coin.chg1h) || '—'}</strong></div>
            <div className="stx-stat-item"><span>7g Değişim</span><strong style={{ color: (coin.chg7d || 0) >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{fmtChg(coin.chg7d) || '—'}</strong></div>
          </div>
        </div>

        {/* Actions */}
        <div className="stocks-actions">
          <button className="stx-btn stx-btn-green" onClick={goTrade}>Trade</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MarketsPage() {
  const [coins,      setCoins]      = useState([])
  const [sparkMap,   setSparkMap]   = useState({})
  const [globalData, setGlobalData] = useState(null)
  const [fearGreed,  setFearGreed]  = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [category,   setCategory]   = useState('all')
  const [search,     setSearch]     = useState('')
  const [sortKey,    setSortKey]    = useState('rank')
  const [sortDir,    setSortDir]    = useState(1)
  const [page,       setPage]       = useState(1)
  const [flash,      setFlash]      = useState({})
  const [selectedCoin, setSelectedCoin] = useState(null)
  const [favorites,  setFavorites]  = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('cmcx_fav') || '[]')) }
    catch { return new Set() }
  })
  const prevPx = useRef({})

  // ─── CMC top coins (30s interval) ────────────────────────────────────────
  const fetchCoins = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/market/cmc_top`)
      const json = await res.json()
      if (json.status !== 'ok') return
      const newFlash = {}
      const processed = (json.data || []).map(c => {
        const quote = (c.quotes || []).find(q => q.name === 'USD') || {}
        const sym   = (c.symbol || '').toUpperCase()
        const price = quote.price || 0
        const prev  = prevPx.current[sym]
        if (prev && prev !== price) newFlash[sym] = price > prev ? 'up' : 'dn'
        prevPx.current[sym] = price
        return {
          id:     c.id,
          rank:   c.cmcRank || 9999,
          name:   c.name || sym,
          sym,
          price,
          chg1h:  quote.percentChange1h,
          chg24h: quote.percentChange24h,
          chg7d:  quote.percentChange7d,
          mcap:   quote.marketCap   || 0,
          vol24h: quote.volume24h   || 0,
          supply: c.circulatingSupply || 0,
          maxSup: c.maxSupply || 0,
          tags:   (c.tags || []).map(t => typeof t === 'string' ? t : (t?.slug || '')),
        }
      })
      setCoins(processed)
      setLoading(false)
      if (Object.keys(newFlash).length) {
        setFlash(p => ({ ...p, ...newFlash }))
        setTimeout(() => setFlash(p => {
          const n = { ...p }
          Object.keys(newFlash).forEach(k => delete n[k])
          return n
        }), 800)
      }
    } catch { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchCoins()
    const id = setInterval(fetchCoins, 30_000)
    return () => clearInterval(id)
  }, [fetchCoins])

  // ─── Sparklines + 1h/7d (10-min interval) ────────────────────────────────
  useEffect(() => {
    let mounted = true
    const fetchSparks = async () => {
      try {
        const res  = await fetch(`${API_BASE}/api/market/sparklines`)
        const json = await res.json()
        if (!mounted || json.status !== 'ok') return
        const map = {}
        for (const c of (json.data || [])) map[c.symbol] = c
        setSparkMap(map)
      } catch {}
    }
    fetchSparks()
    const id = setInterval(fetchSparks, 10 * 60_000)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  // ─── Global stats (60s interval) ─────────────────────────────────────────
  useEffect(() => {
    let mounted = true
    const fetch_ = () => fetch(`${API_BASE}/api/market/global`)
      .then(r => r.json())
      .then(j => { if (mounted && j.status === 'ok') setGlobalData(j.data) })
      .catch(() => {})
    fetch_()
    const id = setInterval(fetch_, 60_000)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  // ─── Fear & Greed (once) ──────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true
    fetch('https://api.alternative.me/fng/?limit=1')
      .then(r => r.json())
      .then(j => { if (mounted) setFearGreed(j.data?.[0] || null) })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  // ─── Sort ─────────────────────────────────────────────────────────────────
  const handleSort = (key) => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => -d); return key }
      setSortDir(key === 'rank' ? 1 : -1)
      return key
    })
    setPage(1)
  }

  const toggleFav = useCallback((sym, e) => {
    e.stopPropagation(); e.preventDefault()
    setFavorites(prev => {
      const next = new Set(prev)
      next.has(sym) ? next.delete(sym) : next.add(sym)
      localStorage.setItem('cmcx_fav', JSON.stringify([...next]))
      return next
    })
  }, [])

  const goTrade = (sym) => {
    sessionStorage.setItem('tt_trade_symbol', sym)
    window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page: 'terminal', symbol: sym } }))
  }

  // ─── Filter + Sort ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = coins
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || c.sym.toLowerCase().includes(q))
    if (category === 'favorites') list = list.filter(c => favorites.has(c.sym))
    else if (category === 'stable') list = list.filter(c => STABLE_SET.has(c.sym))
    else if (category !== 'all') list = list.filter(c => c.tags.some(t => TAG_CAT[t] === category))

    return [...list].sort((a, b) => {
      const sa = sparkMap[a.sym] || {}, sb = sparkMap[b.sym] || {}
      let va, vb
      switch (sortKey) {
        case 'rank':   va = a.rank;   vb = b.rank;   break
        case 'name':   va = a.name.toLowerCase(); vb = b.name.toLowerCase(); break
        case 'price':  va = a.price;  vb = b.price;  break
        case 'chg1h':  va = (sa.chg1h  ?? a.chg1h)  || 0; vb = (sb.chg1h  ?? b.chg1h)  || 0; break
        case 'chg24h': va = a.chg24h  || 0; vb = b.chg24h  || 0; break
        case 'chg7d':  va = (sa.chg7d  ?? a.chg7d)  || 0; vb = (sb.chg7d  ?? b.chg7d)  || 0; break
        case 'mcap':   va = a.mcap;   vb = b.mcap;   break
        case 'vol':    va = a.vol24h; vb = b.vol24h; break
        case 'supply': va = a.supply; vb = b.supply; break
        default:       va = a.rank;   vb = b.rank;
      }
      if (va < vb) return -sortDir
      if (va > vb) return sortDir
      return 0
    })
  }, [coins, search, category, sortKey, sortDir, favorites, sparkMap])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paged = useMemo(() => filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE), [filtered, page])

  useEffect(() => setPage(1), [search, category, sortKey])

  const SortIcon = ({ k }) => (
    <span style={{ marginLeft: 3, opacity: sortKey === k ? 1 : 0.3, fontSize: 9 }}>
      {sortKey !== k ? '↕' : sortDir > 0 ? '↑' : '↓'}
    </span>
  )

  const TH = ({ k, children, r, c: center }) => (
    <th className={`cmcx-th${r ? ' r' : ''}${center ? ' c' : ''}`}
      onClick={() => k && handleSort(k)}
      style={{ cursor: k ? 'pointer' : 'default', color: sortKey === k ? 'var(--text-1)' : undefined }}
    >
      {children}{k && <SortIcon k={k} />}
    </th>
  )

  // ─── Pagination buttons ───────────────────────────────────────────────────
  const pagBtns = () => {
    const btns = []
    for (let p = 1; p <= totalPages; p++) {
      if (totalPages > 7 && Math.abs(p - page) > 2 && p !== 1 && p !== totalPages) {
        if (p === 2 || p === totalPages - 1) btns.push(<span key={'d' + p} className="cmcx-pag-dot">…</span>)
        continue
      }
      btns.push(
        <button key={p} className={`cmcx-pag-btn${page === p ? ' active' : ''}`} onClick={() => setPage(p)}>{p}</button>
      )
    }
    return btns
  }

  return (
    <div className="cmcx-page">

      {/* ── Global Stats ── */}
      <GlobalStatsBar global={globalData} fearGreed={fearGreed} />

      {/* ── Chips + Search ── */}
      <div className="cmcx-topbar">
        <div className="cmcx-chips">
          {CATEGORIES.map(cat => (
            <button key={cat.id}
              className={`cmcx-chip${category === cat.id ? ' active' : ''}`}
              onClick={() => { setCategory(cat.id); setPage(1) }}
            >{cat.label}</button>
          ))}
        </div>
        <div className="cmcx-search-wrap">
          <span className="cmcx-srch-icon">⌕</span>
          <input className="cmcx-srch" placeholder="Search coins…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }} spellCheck={false} />
          {search && <button className="cmcx-srch-clr" onClick={() => { setSearch(''); setPage(1) }}>×</button>}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="cmcx-table-wrap">
        <table className="cmcx-table">
          <thead>
            <tr>
              <TH k="rank">#</TH>
              <TH k="name">Name</TH>
              <TH k="price" r>Price</TH>
              <TH k="chg1h" r>1h %</TH>
              <TH k="chg24h" r>24h %</TH>
              <TH k="chg7d" r>7d %</TH>
              <TH k="mcap" r>Market Cap</TH>
              <TH k="vol" r>Volume(24h)</TH>
              <TH k="supply" r>Circulating Supply</TH>
              <th className="cmcx-th">Last 7 Days</th>
              <th className="cmcx-th c">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 15 }).map((_, i) => (
              <tr key={i}><td colSpan={11}>
                <div className="cmcx-skel" style={{ opacity: Math.max(0.04, 1 - i * 0.06) }} />
              </td></tr>
            ))}
            {!loading && paged.length === 0 && (
              <tr><td colSpan={11} className="cmcx-empty">
                {search ? `"${search}" için sonuç yok` : 'Sonuç bulunamadı'}
              </td></tr>
            )}
            {!loading && paged.map((c, idx) => {
              const sp      = sparkMap[c.sym] || {}
              const chg1h   = sp.chg1h  ?? c.chg1h
              const chg7d   = sp.chg7d  ?? c.chg7d
              const fd      = flash[c.sym]
              const isFav   = favorites.has(c.sym)
              const isStable = STABLE_SET.has(c.sym)
              const supplyPct = c.maxSup > 0 ? Math.min(100, (c.supply / c.maxSup) * 100) : null

              return (
                <tr key={c.sym} className={`cmcx-row${fd ? ` cmcx-flash-${fd}` : ''}`}
                  onClick={() => setSelectedCoin(c)} style={{ cursor: 'pointer' }}>
                  <td className="cmcx-td cmcx-td-rank">
                    <span className="cmcx-rank-num">{(page - 1) * ITEMS_PER_PAGE + idx + 1}</span>
                  </td>
                  <td className="cmcx-td cmcx-td-name">
                    <CoinLogo cmcId={c.id} sym={c.sym} size={28} />
                    <div className="cmcx-name-block">
                      <span className="cmcx-coin-name">{c.name}</span>
                      <span className="cmcx-coin-sym">{c.sym}</span>
                    </div>
                    <button className={`cmcx-fav-btn${isFav ? ' on' : ''}`} onClick={e => toggleFav(c.sym, e)}>
                      {isFav ? '★' : '☆'}
                    </button>
                  </td>
                  <td className={`cmcx-td r cmcx-price-cell${fd === 'up' ? ' pu' : fd === 'dn' ? ' pd' : ''}`}>
                    {fmtPrice(c.price)}
                  </td>
                  <td className="cmcx-td r">
                    {chg1h != null
                      ? <span className={`cmcx-chg-badge ${chg1h >= 0 ? 'up' : 'dn'}`}>{fmtChg(chg1h)}</span>
                      : <span className="cmcx-dim">—</span>}
                  </td>
                  <td className="cmcx-td r">
                    {c.chg24h != null
                      ? <span className={`cmcx-chg-badge ${c.chg24h >= 0 ? 'up' : 'dn'}`}>{fmtChg(c.chg24h)}</span>
                      : <span className="cmcx-dim">—</span>}
                  </td>
                  <td className="cmcx-td r">
                    {chg7d != null
                      ? <span className={`cmcx-chg-badge ${chg7d >= 0 ? 'up' : 'dn'}`}>{fmtChg(chg7d)}</span>
                      : <span className="cmcx-dim">—</span>}
                  </td>
                  <td className="cmcx-td r cmcx-dim">{fmtLarge(c.mcap)}</td>
                  <td className="cmcx-td r cmcx-dim">{fmtLarge(c.vol24h)}</td>
                  <td className="cmcx-td r">
                    <div className="cmcx-supply-col">
                      <span className="cmcx-supply-txt">{fmtSupply(c.supply, c.sym)}</span>
                      {supplyPct != null && (
                        <div className="cmcx-supply-bar">
                          <div className="cmcx-supply-fill" style={{ width: supplyPct + '%' }} />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="cmcx-td cmcx-td-spark">
                    <Sparkline prices={sp.sparkline} />
                  </td>
                  <td className="cmcx-td c">
                    {isStable
                      ? <span className="cmcx-dim" style={{ fontSize: '0.8em' }}>Stable</span>
                      : <button className="mk-trade-btn" onClick={e => { e.stopPropagation(); goTrade(c.sym) }}>Trade</button>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {!loading && totalPages > 1 && (
        <div className="cmcx-pagination">
          <button className="cmcx-pag-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
          {pagBtns()}
          <button className="cmcx-pag-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
        </div>
      )}

      {/* ── Coin detail modal ── */}
      {selectedCoin && <CoinDetailModal coin={selectedCoin} onClose={() => setSelectedCoin(null)} />}

    </div>
  )
}
