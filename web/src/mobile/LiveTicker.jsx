import { useState, useEffect, useLayoutEffect, useRef, memo, useMemo } from 'react'
import { API_BASE } from '../config'
import { getAssetLogoSources } from '../components/AssetLogo'

const SPEED_PX_PER_SEC = 100  // pixels per second

const DEFAULT_TOP20 = [
  'BTC','ETH','BNB','SOL','XRP','DOGE','ADA','AVAX','TRX','TON',
  'LINK','SHIB','DOT','UNI','NEAR','APT','ARB','OP','INJ','SUI',
]

function fmtPrice(p) {
  if (p == null || isNaN(p)) return null
  if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (p >= 1) return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 5 })
}

function TickerLogo({ sym, type, icon }) {
  const [idx, setIdx] = useState(0)
  // Reuse AssetLogo's source logic — handles crypto, stocks AND commodities (GOLD, SILVER, etc.)
  const sources = useMemo(() => getAssetLogoSources({ symbol: sym, type, icon }), [sym, type, icon])
  const src = sources[idx]

  if (!src) return (
    <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--bg-3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 800, color: 'var(--text-3)', flexShrink: 0 }}>
      {sym.slice(0, 2)}
    </span>
  )
  return (
    <img src={src} alt={sym} width={16} height={16}
      style={{ borderRadius: '50%', objectFit: 'contain', flexShrink: 0, display: 'block' }}
      onError={() => setIdx(i => i + 1)} />
  )
}

// Scrolling strip — rAF animation runs independently of React renders
const TickerStrip = memo(function TickerStrip({ items, pricesRef }) {
  const wrapRef    = useRef(null)   // the translating div
  const offsetRef  = useRef(0)      // current scroll offset in px
  const halfRef    = useRef(0)      // half of total scrollWidth (one set)
  const lastRef    = useRef(null)   // last rAF timestamp
  const [, setTick] = useState(0)   // trigger price re-reads every 2s

  // rAF loop — starts once on mount, never restarts
  useEffect(() => {
    let rafId
    const step = (ts) => {
      if (lastRef.current != null && wrapRef.current) {
        const dt = (ts - lastRef.current) / 1000
        offsetRef.current += SPEED_PX_PER_SEC * dt
        const half = halfRef.current
        if (half > 0 && offsetRef.current >= half) {
          offsetRef.current -= half  // seamless reset at exact halfway point
        }
        wrapRef.current.style.transform = `translateX(-${offsetRef.current}px)`
      }
      lastRef.current = ts
      rafId = requestAnimationFrame(step)
    }
    rafId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafId)
  }, []) // intentionally empty — rAF never restarts

  // Measure half-width after every render so reset point stays accurate
  useLayoutEffect(() => {
    if (wrapRef.current) {
      halfRef.current = wrapRef.current.scrollWidth / 2
    }
  })

  // Refresh displayed prices every 2s (reads from pricesRef, no WS re-render)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 2000)
    return () => clearInterval(t)
  }, [])

  const doubled = useMemo(() => [...items, ...items], [items])

  return (
    <div style={{ overflow: 'hidden', height: 30, borderBottom: '1px solid var(--border)', background: 'var(--bg)', flexShrink: 0 }}>
      <div ref={wrapRef} style={{ display: 'flex', alignItems: 'center', height: '100%', willChange: 'transform' }}>
        {doubled.map((item, i) => {
          const p = pricesRef.current[item.sym]
          const price  = p?.price  ?? item.staticPrice  ?? null
          const change = p?.change ?? item.staticChange ?? null
          const isUp    = (change ?? 0) >= 0
          const isValid = change != null && !isNaN(change)
          const priceStr = fmtPrice(price)
          return (
            <span key={`${item.key}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 12px', height: '100%', borderRight: '1px solid rgba(255,255,255,0.05)', flexShrink: 0, whiteSpace: 'nowrap' }}>
              <TickerLogo sym={item.sym} type={item.type} icon={item.icon} />
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{item.sym}</span>
              {priceStr && <span style={{ fontSize: 11, fontWeight: 600, color: '#ffffff', fontFamily: 'var(--mono)' }}>{priceStr}</span>}
              {isValid && (
                <span style={{ fontSize: 10, fontWeight: 700, color: isUp ? '#00d992' : '#f43f5e', fontFamily: 'var(--mono)' }}>
                  {isUp ? '+' : ''}{change.toFixed(2)}%
                </span>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
})

export default function LiveTicker() {
  const [cryptoSyms, setCryptoSyms] = useState(DEFAULT_TOP20)
  const [stocks, setStocks]         = useState([])
  const pricesRef = useRef({})

  // CoinGecko — top 20 by market cap (symbol order)
  useEffect(() => {
    fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false')
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return
        const syms = data.map(c => c.symbol.toUpperCase()).filter(Boolean)
        if (syms.length >= 10) setCryptoSyms(syms)
      }).catch(() => {})
  }, [])

  // Top 20 stocks from backend
  useEffect(() => {
    fetch(`${API_BASE}/api/stocks/assets_ranking`)
      .then(r => r.json())
      .then(res => {
        if (res.status === 'ok' && Array.isArray(res.data)) setStocks(res.data.slice(0, 20))
      }).catch(() => {})
  }, [])

  // Binance WS — writes to ref only, zero state updates, zero re-renders
  useEffect(() => {
    let ws, dead = false
    const connect = () => {
      ws = new WebSocket('wss://stream.binance.com:9443/ws/!miniTicker@arr')
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (!Array.isArray(data)) return
          data.forEach(d => {
            if (!d.s.endsWith('USDT')) return
            const sym = d.s.slice(0, -4)
            if (!cryptoSyms.includes(sym)) return
            const close = parseFloat(d.c)
            const open  = parseFloat(d.o)
            pricesRef.current[sym] = { price: close, change: open !== 0 ? ((close - open) / open) * 100 : 0 }
          })
        } catch {}
      }
      ws.onclose = () => { if (!dead) setTimeout(connect, 3000) }
      ws.onerror = () => {}
    }
    connect()
    return () => { dead = true; ws?.close() }
  }, [cryptoSyms])

  // Stable items — only recomputed when symbols/stocks change
  const items = useMemo(() => [
    ...cryptoSyms.map(sym => ({ key: `c-${sym}`, sym, type: 'crypto' })),
    ...stocks.map(s => ({
      key: `s-${s.code}`,
      sym: s.code,
      type: s.asset_type || s.type || 'stock',
      icon: s.icon,
      staticPrice:  parseFloat((s.price || '').replace(/[$,]/g, '')) || null,
      staticChange: parseFloat((s.today || '').replace(/[%+]/g, '')) || null,
    })),
  ], [cryptoSyms, stocks])

  if (items.length === 0) return null
  return <TickerStrip items={items} pricesRef={pricesRef} />
}
