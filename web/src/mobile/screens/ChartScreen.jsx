import { useState, useEffect, useRef } from 'react'
import { createChart, CandlestickSeries, LineStyle } from 'lightweight-charts'
import { haptic } from '../../capacitor'
import { API_BASE } from '../../config'
import AssetLogo from '../../components/AssetLogo'

// ── Range configs ──────────────────────────────────────────────
const CRYPTO_RANGES = [
  { id: '24S', interval: '15m', limit: 96  },
  { id: '1G',  interval: '1h',  limit: 24  },
  { id: '1H',  interval: '4h',  limit: 42  },
  { id: '1A',  interval: '1d',  limit: 30  },
  { id: '3A',  interval: '1d',  limit: 90  },
  { id: '1Y',  interval: '1w',  limit: 52  },
  { id: '5Y',  interval: '1w',  limit: 260 },
]

const STOCK_RANGES = [
  { id: '24S', interval: '5m',  yrange: '1d'  },
  { id: '1G',  interval: '30m', yrange: '5d'  },
  { id: '1H',  interval: '1h',  yrange: '5d'  },
  { id: '1A',  interval: '1d',  yrange: '1mo' },
  { id: '3A',  interval: '1d',  yrange: '3mo' },
  { id: '1Y',  interval: '1wk', yrange: '1y'  },
  { id: '5Y',  interval: '1mo', yrange: '5y'  },
]

// ── Data fetchers ──────────────────────────────────────────────
async function fetchCryptoCandles(sym, range) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${sym}USDT&interval=${range.interval}&limit=${range.limit}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch data')
  const raw = await res.json()
  if (!Array.isArray(raw)) throw new Error('Invalid data')
  return raw.map(k => ({
    time:   Math.floor(k[0] / 1000),
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }))
}

async function fetchStockCandles(sym, range) {
  const url = `${API_BASE}/api/stocks/chart?symbol=${encodeURIComponent(sym)}&interval=${range.interval}&range=${range.yrange}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch data')
  const json = await res.json()
  if (!Array.isArray(json.data) || json.data.length === 0) throw new Error('No chart data available')
  return json.data
}

// ── Formatters ─────────────────────────────────────────────────
function fmtPx(p) {
  if (p == null || isNaN(p)) return '—'
  if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (p >= 1)    return '$' + p.toFixed(p < 10 ? 3 : 2)
  return '$' + p.toFixed(6)
}

function fmtVol(v) {
  if (!v || isNaN(v)) return '—'
  if (v >= 1e12) return (v / 1e12).toFixed(2) + 'T'
  if (v >= 1e9)  return (v / 1e9).toFixed(2)  + 'B'
  if (v >= 1e6)  return (v / 1e6).toFixed(2)  + 'M'
  if (v >= 1e3)  return (v / 1e3).toFixed(1)  + 'K'
  return v.toFixed(0)
}

function parseCapValue(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return isNaN(v) ? null : v
  const raw = String(v).trim()
  const n = parseFloat(raw.replace(/[$,\s]/g, ''))
  if (isNaN(n)) return raw
  const upper = raw.toUpperCase()
  if (upper.includes('T')) return n * 1e12
  if (upper.includes('B')) return n * 1e9
  if (upper.includes('M')) return n * 1e6
  return n
}

function fmtCap(v) {
  const parsed = parseCapValue(v)
  if (parsed == null) return '—'
  if (typeof parsed === 'string') return parsed.replace(/\s+/g, '')
  if (parsed >= 1e12) return '$' + (parsed / 1e12).toFixed(2) + 'T'
  if (parsed >= 1e9)  return '$' + (parsed / 1e9).toFixed(2) + 'B'
  if (parsed >= 1e6)  return '$' + (parsed / 1e6).toFixed(2) + 'M'
  return '$' + parsed.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function pctChange(candles, hovered) {
  if (!candles.length) return null
  const first = candles[0].open
  const last  = hovered ? hovered.close : candles[candles.length - 1].close
  if (!first) return null
  return ((last - first) / first) * 100
}

function fmtTouchDate(time, rangeId) {
  if (!time) return ''
  const dt = new Date(time * 1000)
  const day = dt.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long' })
  const hm = dt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  if (rangeId === '24S' || rangeId === '1G' || rangeId === '1H') return `${day}, ${hm}`
  return `${day}, ${hm}`
}

// ── Main component ─────────────────────────────────────────────
export default function ChartScreen({ sym, type, name, price, change, marketCap, onBack, onNavigate }) {
  const isCrypto = type === 'crypto'
  const ranges   = isCrypto ? CRYPTO_RANGES : STOCK_RANGES

  const [range,   setRange]   = useState(ranges[3]) // 1A default
  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [hovered, setHovered] = useState(null)  // candle under crosshair
  const [assetMarketCap, setAssetMarketCap] = useState(() => parseCapValue(marketCap))
  const HL_FALLBACK = new Set([
    // Crypto perp
    'BTC','ETH','SOL','BNB','XRP','ADA','DOGE','AVAX','TRX','DOT','LINK','MATIC','UNI','ATOM',
    'LTC','BCH','ARB','OP','APT','INJ','SUI','SEI','TIA','WLD','PYTH','JTO','JUP','BONK','WIF',
    'HYPE','POPCAT','MEW','PEPE','SHIB','FIL','NEAR','HBAR','XLM','ALGO','STX','RUNE','ORDI',
    'TON','ICP','VET','CRV','LDO','AAVE','COMP','MKR','SNX','SUSHI','BAL','GMX','DYDX','ENS',
    'ETC','XMR','CAKE','EIGEN','STRK','BLAST','NOT','DOGS','CATI','SCR','NEIRO','LUNC','IMX',
    'PAXG','GMT','BOME','PNUT','GOAT','MOODENG','GRASS','PURR','CHILLGUY','ME','VIRTUAL','PENGU',
    'USUAL','FARTCOIN','AI16Z','AIXBT','TRUMP','BERA','KAITO','HYPER','ZORA','LINEA','PUMP',
    // TradFi (spot)
    'AAPL','NVDA','TSLA','MSFT','GOOGL','GOOG','AMZN','META','NFLX','AMD','COIN','HOOD','MSTR',
    'SPY','QQQ','GLD','SLV','BRK','BABA','UBER','PLTR','SMCI','AVGO','TSM','ORCL','CRM','ADBE',
    'PYPL','SQ','SHOP','GOLD','SILVER',
  ])
  const [onHL, setOnHL] = useState(() => HL_FALLBACK.has(sym))

  useEffect(() => {
    let alive = true
    fetch(`${API_BASE}/api/hl-markets`)
      .then(r => r.json())
      .then(d => {
        if (!alive) return
        const names = Array.isArray(d?.markets) ? d.markets.map(m => m.name) : []
        if (names.includes(sym)) setOnHL(true)
      })
      .catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sym])

  const containerRef    = useRef(null)
  const chartRef        = useRef(null)
  const candleSeriesRef = useRef(null)
  const baselineLineRef = useRef(null)

  // ── Fetch ────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    setHovered(null)
    ;(isCrypto ? fetchCryptoCandles(sym, range) : fetchStockCandles(sym, range))
      .then(d  => { if (alive) { setCandles(d); setLoading(false) } })
      .catch(e => { if (alive) { setError(e.message); setLoading(false) } })
    return () => { alive = false }
  }, [sym, type, range])

  useEffect(() => {
    let alive = true
    const initial = parseCapValue(marketCap)
    setAssetMarketCap(initial)
    if (initial != null) return () => { alive = false }

    ;(async () => {
      try {
        if (isCrypto) {
          const res = await fetch(`${API_BASE}/api/market/cmc_top`)
          if (!res.ok) return
          const json = await res.json()
          const rows = Array.isArray(json?.data) ? json.data : []
          const row = rows.find(c => String(c.sym || c.symbol || '').toUpperCase() === String(sym).toUpperCase())
          const cap = row?.mcap ?? row?.quote?.USD?.marketCap ?? row?.quote?.marketCap
          if (alive && cap != null) setAssetMarketCap(parseCapValue(cap))
        } else {
          const res = await fetch(`${API_BASE}/api/stocks/fundamentals?symbols=${encodeURIComponent(sym)}`)
          if (!res.ok) return
          const json = await res.json()
          const item = json?.data?.[String(sym).toUpperCase()] || Object.values(json?.data || {})[0]
          const cap = item?.marketCap
          if (alive && cap != null) setAssetMarketCap(parseCapValue(cap))
        }
      } catch {
        // Market cap is nice-to-have; chart stays usable without it.
      }
    })()
    return () => { alive = false }
  }, [sym, type, marketCap, isCrypto])

  // ── Create chart (once on mount) ────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const w = containerRef.current.clientWidth
    const h = Math.round(window.innerHeight * 0.43)

    const chart = createChart(containerRef.current, {
      width:  w,
      height: h,
      layout: {
        background:       { color: '#000' },
        textColor:        '#444',
        fontSize:         11,
        attributionLogo:  false,   // remove TradingView watermark
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        mode: 1,
        vertLine:  { color: '#6b7280', width: 1, style: 0, labelVisible: false },
        horzLine:  { visible: false, labelVisible: false },
      },
      rightPriceScale: {
        visible: false,
      },
      timeScale: {
        visible:        false,
        borderVisible:  false,
        timeVisible:    true,
        secondsVisible: false,
        fixLeftEdge:    true,
        fixRightEdge:   true,
      },
      handleScroll: { touchMove: true, mouseWheel: false, pressedMouseMove: false },
      handleScale:  { pinch: true,     mouseWheel: false, axisDoubleClickReset: false },
    })

    // Candlestick series
    const candle = chart.addSeries(CandlestickSeries, {
      upColor:         '#00d992',
      downColor:       '#f43f5e',
      borderUpColor:   '#00d992',
      borderDownColor: '#f43f5e',
      wickUpColor:     '#00d992',
      wickDownColor:   '#f43f5e',
      borderVisible:   true,
      wickVisible:     true,
      priceLineVisible: false,
      lastValueVisible: false,
    })

    const clearTouchSelection = () => {
      setHovered(null)
      chart.clearCrosshairPosition()
    }

    // Crosshair -> update hovered candle for stats + price display while touching.
    chart.subscribeCrosshairMove(param => {
      const c = param?.seriesData?.get(candle)
      setHovered(c ?? null)
    })
    containerRef.current.addEventListener('touchend', clearTouchSelection, { passive: true })
    containerRef.current.addEventListener('touchcancel', clearTouchSelection, { passive: true })
    containerRef.current.addEventListener('pointerup', clearTouchSelection)
    containerRef.current.addEventListener('pointercancel', clearTouchSelection)
    containerRef.current.addEventListener('pointerleave', clearTouchSelection)

    chartRef.current        = chart
    candleSeriesRef.current = candle

    const obs = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    obs.observe(containerRef.current)

    return () => {
      containerRef.current?.removeEventListener('touchend', clearTouchSelection)
      containerRef.current?.removeEventListener('touchcancel', clearTouchSelection)
      containerRef.current?.removeEventListener('pointerup', clearTouchSelection)
      containerRef.current?.removeEventListener('pointercancel', clearTouchSelection)
      containerRef.current?.removeEventListener('pointerleave', clearTouchSelection)
      obs.disconnect()
      chart.remove()
      chartRef.current = null
      baselineLineRef.current = null
    }
  }, [])

  // ── Push data to chart whenever candles change ───────────────
  useEffect(() => {
    const cs = candleSeriesRef.current
    if (!cs || !candles.length) return
    cs.setData(candles)
    if (baselineLineRef.current) {
      cs.removePriceLine(baselineLineRef.current)
      baselineLineRef.current = null
    }
    const baselinePrice = candles[0]?.open
    if (baselinePrice != null && !isNaN(baselinePrice)) {
      baselineLineRef.current = cs.createPriceLine({
        price: baselinePrice,
        color: 'rgba(156, 163, 175, 0.58)',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
        title: '',
      })
    }
    chartRef.current?.timeScale().fitContent()
  }, [candles])

  // ── Derived display values ───────────────────────────────────
  const displayCandle = hovered || (candles.length ? candles[candles.length - 1] : null)
  const displayPrice  = displayCandle?.close ?? price
  const displayPct    = pctChange(candles, hovered)
  const isUp          = (displayPct ?? change ?? 0) >= 0
  const pctValue      = displayPct ?? change
  const displayMarketCap = fmtCap(assetMarketCap)

  const stats = displayCandle ? [
    ['Open',   fmtPx(displayCandle.open)],
    ['High',   fmtPx(displayCandle.high)],
    ['Close',  fmtPx(displayCandle.close)],
    ['Low',    fmtPx(displayCandle.low)],
    ['Market Cap', displayMarketCap],
    ['Chg %',  pctValue != null ? `${isUp?'+':''}${pctValue.toFixed(2)}%` : '—'],
  ] : []

  const touchStats = displayCandle ? [
    ['Open',   fmtPx(displayCandle.open)],
    ['Close',  fmtPx(displayCandle.close)],
    ['High',   fmtPx(displayCandle.high)],
    ['Low',    fmtPx(displayCandle.low)],
    ['Change', pctValue != null ? `${isUp?'+':''}${pctValue.toFixed(2)}%` : '—', isUp ? '#00d992' : '#f43f5e'],
    ['Market Cap', displayMarketCap],
  ] : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>

      {/* ── Top header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: 'max(54px, calc(env(safe-area-inset-top, 0px) + 14px)) 16px 0',
        gap: 10,
        flexShrink: 0,
      }}>
        <button
          onClick={() => { haptic('light'); onBack() }}
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 32, lineHeight: 1, padding: '0 6px 0 0', cursor: 'pointer', flexShrink: 0, opacity: 0.8 }}>
          ‹
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AssetLogo symbol={sym} type={type} size={30} radius={10} />
            <span style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: 0.3 }}>{sym}</span>
          </div>
          {name && name !== sym && (
            <div style={{ fontSize: 12, color: '#555', marginTop: 2, fontWeight: 500 }}>{name}</div>
          )}
        </div>
        {onNavigate && (
          <button
            onClick={() => { haptic('medium'); onNavigate('custom-alerts', { prefillSym: sym }) }}
            style={{ background: 'none', border: 'none', color: '#fff', padding: 4, cursor: 'pointer', flexShrink: 0, opacity: 0.85 }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </button>
        )}
      </div>

      {/* ── Price + touch stats ── */}
      <div style={{ padding: '10px 20px 16px', flexShrink: 0, minHeight: 150 }}>
        {!hovered ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: '#fff', fontFamily: 'var(--mono)', letterSpacing: 0 }}>
                {fmtPx(displayPrice)}
              </span>
              {pctValue != null && (
                <span style={{ fontSize: 18, fontWeight: 700, color: isUp ? '#00d992' : '#f43f5e', fontFamily: 'var(--mono)' }}>
                  {isUp ? '+' : ''}{pctValue.toFixed(2)}%
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#56565f', marginTop: 8, fontFamily: 'var(--mono)' }}>
              Son fiyat
            </div>
          </>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 28, rowGap: 10 }}>
            {touchStats.map(([label, val, color]) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'baseline', gap: 12 }}>
                <span style={{ color: '#9a9aa4', fontSize: 15, fontWeight: 500 }}>{label}</span>
                <strong style={{ color: color || '#f5f5f7', fontSize: 16, fontWeight: 700, fontFamily: 'var(--mono)' }}>{val}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Chart area ── */}
      <div style={{ position: 'relative', flexShrink: 0, borderTop: '1px solid #0d0d0d' }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#00d992', fontSize: 28, animation: 'm-spin 1s linear infinite', display: 'inline-block' }}>◌</span>
          </div>
        )}
        {error && !loading && (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ color: '#444', fontSize: 14, marginBottom: 8 }}>Chart failed to load</div>
            <div style={{ color: '#333', fontSize: 12 }}>{error}</div>
          </div>
        )}
        <div ref={containerRef} style={{ width: '100%' }} />
        {hovered && (
          <div style={{
            position: 'absolute',
            left: '50%',
            top: 10,
            transform: 'translateX(-50%)',
            color: '#a4a4ae',
            fontSize: 14,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            textShadow: '0 1px 6px rgba(0,0,0,0.9)',
          }}>
            {fmtTouchDate(hovered.time, range.id)}
          </div>
        )}
      </div>

      {/* ── Range selector ── */}
      <div style={{ display: 'flex', gap: 2, padding: '10px 12px', flexShrink: 0 }}>
        {ranges.map(r => {
          const active = range.id === r.id
          return (
            <button
              key={r.id}
              onClick={() => { haptic('light'); setRange(r) }}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                background:  'transparent',
                color:       active ? '#fff' : '#444',
                fontSize:    12, fontWeight: active ? 800 : 600,
                fontFamily:  'var(--mono)',
                transition:  'color 0.15s',
              }}>
              {r.id}
            </button>
          )
        })}
      </div>

      {/* ── Stats grid ── */}
      {stats.length > 0 && (
        <div style={{
          margin: '4px 12px 16px',
          background: 'var(--bg)',
          borderRadius: 14,
          padding: '14px 16px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '14px 8px',
          flexShrink: 0,
        }}>
          {stats.map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: '#444', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'var(--mono)' }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Trade CTA (sticky bottom) — only for HL-listed assets ── */}
      {onHL && onNavigate && (
        <div style={{
          position: 'sticky',
          bottom: 0,
          flexShrink: 0,
          padding: '10px 16px calc(env(safe-area-inset-bottom, 0px) + 14px)',
          background: 'linear-gradient(to top, var(--bg) 60%, transparent)',
          display: 'flex',
          gap: 10,
        }}>
          <button
            onClick={() => {
              haptic('medium')
              onNavigate('hl-trade', { sym, name, price: displayPrice, change: pctValue, type, initialSide: 'long' })
            }}
            style={{
              flex: 1,
              height: 54,
              borderRadius: 14,
              border: 'none',
              background: '#00d992',
              color: '#000',
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: 0.4,
              cursor: 'pointer',
              boxShadow: '0 4px 18px rgba(0,217,146,0.25)',
            }}
          >
            Long
          </button>
          <button
            onClick={() => {
              haptic('medium')
              onNavigate('hl-trade', { sym, name, price: displayPrice, change: pctValue, type, initialSide: 'short' })
            }}
            style={{
              flex: 1,
              height: 54,
              borderRadius: 14,
              border: 'none',
              background: '#f43f5e',
              color: '#000',
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: 0.4,
              cursor: 'pointer',
              boxShadow: '0 4px 18px rgba(244,63,94,0.25)',
            }}
          >
            Short
          </button>
        </div>
      )}
    </div>
  )
}
