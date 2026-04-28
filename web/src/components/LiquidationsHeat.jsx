import { useState, useEffect, useRef, useCallback } from 'react'

/* ── Config ──────────────────────────────────────────────────────── */
const PRICE_ROWS = 50
const PRICE_RANGE = 0.04        // ±4%
const COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'AVAX', 'LINK', 'HYPE']

const TIMEFRAMES = [
  { label: '1h', cols: 60, bucket: 60_000, klineInterval: '1m' },
  { label: '4h', cols: 60, bucket: 4 * 60_000, klineInterval: '5m' },
  { label: '12h', cols: 72, bucket: 10 * 60_000, klineInterval: '15m' },
  { label: '24h', cols: 96, bucket: 15 * 60_000, klineInterval: '15m' },
]

function fmtUSD(v) {
  if (!v) return '$0'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(0)
}
function fmtPrice(p) {
  if (!p) return '—'
  if (p >= 10000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (p >= 100) return p.toFixed(1)
  if (p >= 1) return p.toFixed(3)
  return p.toFixed(5)
}

/* ── Coinglass-tarzı renk paleti ─────────────────────────────────── */
function heatColor(longVol, shortVol, maxVol, threshold) {
  if (maxVol === 0) return null
  const total = longVol + shortVol
  if (total === 0) return null
  const norm = total / maxVol
  if (norm < threshold) return null
  const t = Math.pow(norm, 0.45) // logarithmic intensity
  
  // Orijinal Coinglass Skalası: 
  // Çok Düşük (Koyu Mor) -> Düşük (Mavi/Lacivert) -> Orta (Açık Mavi/Teal) -> Yüksek (Yeşil) -> Çok Yüksek (Sarı)
  
  if (t > 0.8) return `rgba(226, 255, 41, ${Math.min(1, 0.8 + 0.2*t)})` // Sarı
  else if (t > 0.5) return `rgba(0, 217, 146, ${Math.min(1, 0.6 + 0.4*t)})` // Hacker Green / Teal
  else if (t > 0.3) return `rgba(25, 118, 210, ${Math.min(1, 0.5 + 0.5*t)})` // Mavi
  else return `rgba(103, 58, 183, ${Math.min(1, 0.3 + 0.7*t)})` // Mor
}

/* ── Grid builder ─────────────────────────────────────────────────── */
function buildGrid(liqs, currentPrice, tf) {
  const cols = tf.cols
  const rows = PRICE_ROWS
  const bucketMs = tf.bucket
  const windowMs = cols * bucketMs

  if (!currentPrice || liqs.length === 0)
    return { cells: {}, maxVol: 1, priceMin: 0, priceMax: 0, cols, rows }

  const now = Date.now()
  const priceHalf = currentPrice * PRICE_RANGE
  const priceMin = currentPrice - priceHalf
  const priceMax = currentPrice + priceHalf
  const priceSpan = priceMax - priceMin
  const cells = {}
  let maxVol = 0

  for (const liq of liqs) {
    const age = now - liq.time
    if (age < 0 || age > windowMs) continue
    const col = cols - 1 - Math.floor(age / bucketMs)
    if (col < 0 || col >= cols) continue
    const row = Math.floor(((liq.price - priceMin) / priceSpan) * rows)
    if (row < 0 || row >= rows) continue
    const key = `${col}_${row}`
    if (!cells[key]) cells[key] = { longVol: 0, shortVol: 0 }
    if (liq.side === 'long') cells[key].longVol += liq.vol
    else cells[key].shortVol += liq.vol
    const t = cells[key].longVol + cells[key].shortVol
    if (t > maxVol) maxVol = t
  }

  return { cells, maxVol: maxVol || 1, priceMin, priceMax, cols, rows }
}

/* ── Canvas Price Line ───────────────────────────────────────────── */
function PriceOverlay({ candles, priceMin, priceMax, cols, rows, containerRef }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !candles.length || !priceMin || !priceMax) return

    const rect = container.getBoundingClientRect()
    const W = rect.width
    const H = rect.height
    canvas.width = W * 2  // retina
    canvas.height = H * 2
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'

    const ctx = canvas.getContext('2d')
    ctx.scale(2, 2)
    ctx.clearRect(0, 0, W, H)

    const priceSpan = priceMax - priceMin
    const toY = (p) => H - ((p - priceMin) / priceSpan) * H
    const candleW = Math.max(1, (W / candles.length) * 0.6)

    candles.forEach((c, i) => {
      const x = (i / candles.length) * W + (W / candles.length) * 0.5
      const oY = toY(c.open)
      const cY = toY(c.close)
      const hY = toY(c.high)
      const lY = toY(c.low)
      const bullish = c.close >= c.open
      const color = bullish ? '#00d992' : '#ff3b5c'

      // Wick
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, hY)
      ctx.lineTo(x, lY)
      ctx.stroke()

      // Body
      ctx.fillStyle = color
      const bodyTop = Math.min(oY, cY)
      const bodyH = Math.max(1, Math.abs(oY - cY))
      ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH)
    })

    // Current price line
    if (candles.length > 0) {
      const lastPrice = candles[candles.length - 1].close
      const y = toY(lastPrice)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 0.5
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
      ctx.setLineDash([])

      // Price label
      ctx.fillStyle = '#ff3b5c'
      const labelW = 70
      ctx.fillRect(W - labelW, y - 9, labelW, 18)
      ctx.fillStyle = '#fff'
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('$' + fmtPrice(lastPrice), W - labelW / 2, y + 3)
    }
  }, [candles, priceMin, priceMax, cols, rows, containerRef])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 5,
      }}
    />
  )
}

/* ══════════════════════════════════════════════════════════════════ */
export default function LiquidationsHeat() {
  const [coin, setCoin] = useState('BTC')
  const [price, setPrice] = useState(null)
  const [grid, setGrid] = useState({ cells: {}, maxVol: 1, priceMin: 0, priceMax: 0, cols: 60, rows: 50 })
  const [feed, setFeed] = useState([])
  const [stats, setStats] = useState({ totalLong: 0, totalShort: 0, count: 0, biggest: null })
  const [exStatus, setExStatus] = useState({ binance: 'off', bybit: 'off' })
  const [threshold, setThreshold] = useState(0.04)
  const [tfIdx, setTfIdx] = useState(3) // default 24h
  const [candles, setCandles] = useState([])

  const liqsRef = useRef([])
  const priceRef = useRef(null)
  const coinRef = useRef(coin)
  coinRef.current = coin
  const gridContainerRef = useRef(null)

  const bnWsRef = useRef(null)
  const bybitWsRef = useRef(null)
  const bnTimerRef = useRef(null)
  const bybitTimerRef = useRef(null)

  const tf = TIMEFRAMES[tfIdx]

  /* ── Fiyat çek ── */
  const fetchPrice = useCallback(async (c) => {
    try {
      const r = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${c}USDT`)
      const d = await r.json()
      const p = parseFloat(d.price)
      setPrice(p); priceRef.current = p
    } catch (err) { console.warn('[LiqHeat] price fetch error', err) }
  }, [])

  /* ── Kline/Candle data çek ── */
  const fetchCandles = useCallback(async (c, timeframe) => {
    try {
      const limit = timeframe.cols
      const r = await fetch(
        `https://fapi.binance.com/fapi/v1/klines?symbol=${c}USDT&interval=${timeframe.klineInterval}&limit=${limit}`
      )
      const data = await r.json()
      if (Array.isArray(data)) {
        setCandles(data.map(k => ({
          time: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        })))
      }
    } catch (err) { console.warn('[LiqHeat] candle fetch error', err) }
  }, [])

  /* ── Liq ekle ── */
  const addLiq = useCallback((liq) => {
    liqsRef.current.push(liq)
    setFeed(prev => [liq, ...prev].slice(0, 30))
    setStats(prev => ({
      totalLong: liq.side === 'long' ? prev.totalLong + liq.vol : prev.totalLong,
      totalShort: liq.side === 'short' ? prev.totalShort + liq.vol : prev.totalShort,
      count: prev.count + 1,
      biggest: !prev.biggest || liq.vol > prev.biggest.vol ? liq : prev.biggest,
    }))
  }, [])

  /* ── Binance WS ── */
  const connectBinance = useCallback((c) => {
    clearTimeout(bnTimerRef.current)
    if (bnWsRef.current) { bnWsRef.current.onclose = null; bnWsRef.current.close() }
    const ws = new WebSocket(`wss://fstream.binance.com/ws/${c.toLowerCase()}usdt@forceOrder`)
    bnWsRef.current = ws
    setExStatus(p => ({ ...p, binance: 'connecting' }))
    ws.onopen = () => setExStatus(p => ({ ...p, binance: 'live' }))
    ws.onerror = () => setExStatus(p => ({ ...p, binance: 'error' }))
    ws.onclose = () => {
      setExStatus(p => ({ ...p, binance: 'reconnecting' }))
      bnTimerRef.current = setTimeout(() => connectBinance(coinRef.current), 3000)
    }
    ws.onmessage = (evt) => {
      try {
        const o = JSON.parse(evt.data).o
        if (!o) return
        const side = o.S === 'SELL' ? 'long' : 'short'
        const pr = parseFloat(o.ap)
        const vol = pr * parseFloat(o.z)
        priceRef.current = pr; setPrice(pr)
        addLiq({ id: Date.now() + Math.random(), time: o.T || Date.now(), price: pr, side, vol, exchange: 'Binance' })
      } catch (err) { console.warn('[LiqHeat] Binance WS parse error', err) }
    }
  }, [addLiq])

  /* ── Bybit WS ── */
  const connectBybit = useCallback((c) => {
    clearTimeout(bybitTimerRef.current)
    if (bybitWsRef.current) { bybitWsRef.current.onclose = null; bybitWsRef.current.close() }
    const ws = new WebSocket('wss://stream.bybit.com/v5/public/linear')
    bybitWsRef.current = ws
    setExStatus(p => ({ ...p, bybit: 'connecting' }))
    ws.onopen = () => {
      setExStatus(p => ({ ...p, bybit: 'live' }))
      ws.send(JSON.stringify({ op: 'subscribe', args: [`liquidation.${c}USDT`] }))
    }
    ws.onerror = () => setExStatus(p => ({ ...p, bybit: 'error' }))
    ws.onclose = () => {
      setExStatus(p => ({ ...p, bybit: 'reconnecting' }))
      bybitTimerRef.current = setTimeout(() => connectBybit(coinRef.current), 3000)
    }
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data)
        if (!msg.data) return
        const d = msg.data
        const side = d.side === 'Sell' ? 'long' : 'short'
        const pr = parseFloat(d.price)
        const vol = pr * parseFloat(d.size)
        addLiq({ id: Date.now() + Math.random(), time: d.updatedTime || Date.now(), price: pr, side, vol, exchange: 'Bybit' })
      } catch (err) { console.warn('[LiqHeat] Bybit WS parse error', err) }
    }
  }, [addLiq])

  /* ── Coin değişince ── */
  useEffect(() => {
    liqsRef.current = []
    setFeed([]); setStats({ totalLong: 0, totalShort: 0, count: 0, biggest: null })
    setPrice(null); priceRef.current = null
    setCandles([])
    setGrid({ cells: {}, maxVol: 1, priceMin: 0, priceMax: 0, cols: tf.cols, rows: PRICE_ROWS })

    fetchPrice(coin)
    fetchCandles(coin, tf)
    connectBinance(coin)
    connectBybit(coin)

    return () => {
      clearTimeout(bnTimerRef.current)
      clearTimeout(bybitTimerRef.current)
      if (bnWsRef.current) { bnWsRef.current.onclose = null; bnWsRef.current.close() }
      if (bybitWsRef.current) { bybitWsRef.current.onclose = null; bybitWsRef.current.close() }
    }
  }, [coin, fetchPrice, fetchCandles, connectBinance, connectBybit])

  /* ── Timeframe değişince candle yenile ── */
  useEffect(() => {
    fetchCandles(coin, tf)
  }, [tfIdx, coin, tf, fetchCandles])

  /* ── Grid yenileme ── */
  useEffect(() => {
    const t = setInterval(() => {
      const windowMs = tf.cols * tf.bucket
      const cutoff = Date.now() - windowMs
      liqsRef.current = liqsRef.current.filter(l => l.time >= cutoff)
      setGrid(buildGrid(liqsRef.current, priceRef.current, tf))
    }, 1200)
    return () => clearInterval(t)
  }, [tf])

  /* ── Candle periyodik güncelle ── */
  useEffect(() => {
    const t = setInterval(() => fetchCandles(coin, tf), 30_000)
    return () => clearInterval(t)
  }, [coin, tf, fetchCandles])

  /* ── Price labels ── */
  const priceLabels = (price && grid.priceMin && grid.priceMax)
    ? Array.from({ length: PRICE_ROWS }, (_, i) => {
      const frac = (PRICE_ROWS - 1 - i) / (PRICE_ROWS - 1)
      return grid.priceMin + frac * (grid.priceMax - grid.priceMin)
    })
    : Array.from({ length: PRICE_ROWS }, () => null)

  const currentRow = (price && grid.priceMin && grid.priceMax)
    ? Math.round(((price - grid.priceMin) / (grid.priceMax - grid.priceMin)) * (PRICE_ROWS - 1))
    : -1
  const currentDisplayRow = PRICE_ROWS - 1 - currentRow

  const statusDot = (s) => ({
    live: '#00d992', connecting: '#eab308', reconnecting: '#f97316', error: '#ef4444', off: '#444',
  }[s] || '#444')

  return (
    <div className="lh-page">
      {/* ── Top Header and Toolbars ── */}
      <div className="lh-cg-header-top">
        <div className="lh-cg-pairs">
          <button className="lh-cg-pair-btn active">Pair</button>
          <button className="lh-cg-pair-btn">Symbol</button>
        </div>
        <button className="lh-cg-prime-btn">Prime</button>
      </div>

      <div className="lh-cg-header-main">
        <div className="lh-cg-title">
          Binance {coin}/USDT Liquidation Heatmap
        </div>

        <div className="lh-cg-controls-right">
          <div className="lh-cg-dropdown">
            Binance {coin}/USDT Perpetual <span className="lh-cg-caret">▼</span>
          </div>
          
          <div className="lh-cg-dropdown lh-cg-tf-drop">
            <select value={tfIdx} onChange={e => setTfIdx(Number(e.target.value))}>
              {TIMEFRAMES.map((t, i) => (
                <option key={t.label} value={i}>{t.label === '24h' ? '24 hour' : t.label}</option>
              ))}
            </select>
          </div>

          <button className="lh-cg-icon-btn">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21L21.5 8" /></svg>
          </button>
          <button className="lh-cg-icon-btn">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
          </button>
        </div>
      </div>

      <div className="lh-cg-tools-row">
        <div className="lh-cg-tools-left">
          {/* Preset Colors (Visual Only) */}
          <div className="lh-cg-color-presets">
             <div className="lh-cg-cbox c1"></div>
             <div className="lh-cg-cbox c2"></div>
             <div className="lh-cg-cbox c3 active"></div>
             <div className="lh-cg-cbox c4"></div>
          </div>
          
          <div className="lh-thresh-wrap">
            <div className="lh-thresh-filled-label">
              Liquidity Threshold = {threshold.toFixed(2)}
            </div>
            <div className="lh-thresh-track-wrap">
               <input type="range" min="0" max="0.5" step="0.01" value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))} className="lh-thresh-slider" />
               <div className="lh-thresh-track-fill" style={{ width: `${(threshold / 0.5) * 100}%` }}></div>
            </div>
          </div>
        </div>

        <div className="lh-cg-tools-right">
           <label className="lh-cg-checkbox-lbl">
             <input type="checkbox" defaultChecked />
             <span className="lh-cg-chk-box"></span>
             <span className="lh-cg-chk-txt">Liquidation Map</span>
           </label>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="lh-cg-legend-row">
        <span className="lh-cg-legend-item"><span className="lh-cg-legend-box p1"></span> Liquidation Leverage</span>
        <span className="lh-cg-legend-item"><span className="lh-cg-legend-box p2"></span> Supercharts</span>
      </div>

      {/* ── Combined Heatmap + Chart ── */}
      <div className="lh-heat-container" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        
        {/* Sol Eksen (Hacim Çubuğu) */}
        <div className="lh-cg-vol-axis">
           <div className="lh-cg-vol-max">{fmtUSD(grid.maxVol || 0)}</div>
           <div className="lh-cg-vol-gradient"></div>
           <div className="lh-cg-vol-min">0</div>
        </div>
        
        {/* Ortadaki Grid ve Chart */}
        <div className="lh-cg-main-chart">
          <div className="lh-grid-outer" style={{ position: 'relative', width: '100%', height: '100%' }} ref={gridContainerRef}>
          <div className="lh-grid" style={{ '--cols': grid.cols || tf.cols, '--rows': PRICE_ROWS }}>
            {Array.from({ length: PRICE_ROWS }, (_, ri) =>
              Array.from({ length: grid.cols || tf.cols }, (_, ci) => {
                const dataRow = PRICE_ROWS - 1 - ri
                const key = `${ci}_${dataRow}`
                const cell = grid.cells[key]
                const bg = cell ? heatColor(cell.longVol, cell.shortVol, grid.maxVol, threshold) : null
                const isCurr = ri === currentDisplayRow
                return (
                  <div
                    key={`${ci}_${ri}`}
                    className={`lh-cell ${isCurr ? 'lh-cell-price-row' : ''}`}
                    style={bg ? { background: bg } : undefined}
                    title={cell ? `Long: ${fmtUSD(cell.longVol)} / Short: ${fmtUSD(cell.shortVol)}` : undefined}
                  />
                )
              })
            )}
          </div>

          <PriceOverlay
            candles={candles}
            priceMin={grid.priceMin}
            priceMax={grid.priceMax}
            cols={grid.cols || tf.cols}
            rows={PRICE_ROWS}
            containerRef={gridContainerRef}
          />
        </div>
        </div>
        
        {/* Sağ Eksen (Fiyat) */}
        <div className="lh-cg-price-axis">
          {priceLabels.map((p, i) => {
            return (
              <div key={i} className="lh-cg-price-lbl" style={{ top: `${(i / (PRICE_ROWS - 1)) * 100}%` }}>
                {p ? fmtPrice(p) : ''}
              </div>
            )
          })}
        </div>
      </div>
      {/* Alt X ekseni ve Timeline UI */}
      <div className="lh-cg-timeline">
        <div className="lh-cg-x-axis">
            {Array.from({ length: 12 }, (_, i) => {
              const fraction = i / 11;
              const pastMs = Date.now() - (1 - fraction) * (tf.cols * tf.bucket);
              const d = new Date(pastMs);
              const lbl = `${d.getMonth()+1}, ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
              
              return (
                <div key={i} className="lh-cg-x-lbl" style={{ left: `${fraction * 100}%` }}>
                  {lbl}
                </div>
              )
            })}
        </div>
        
        <div className="lh-cg-mini-chart">
           <div className="lh-cg-mini-handle left"><span>||</span></div>
           <div className="lh-cg-mini-area">
             <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
               <polygon points="0,100 5,80 15,90 25,75 35,85 50,60 65,80 75,50 85,75 95,90 100,100" fill="#253248" />
               <polyline points="0,100 5,80 15,90 25,75 35,85 50,60 65,80 75,50 85,75 95,90 100,100" fill="none" stroke="#2b5278" strokeWidth="1" />
             </svg>
           </div>
           <div className="lh-cg-mini-handle right"><span>||</span></div>
        </div>
      </div>
    </div>
  )
}
