import { useEffect, useRef, useState } from 'react'
import { useLang } from '../context/LangContext'
import { API_BASE } from '../config'

const BINANCE_SYMBOLS = ['BTCUSDT', 'ETHUSDT']
const DISPLAY_ORDER   = ['BTCUSDT', 'ETHUSDT', 'GOLD', 'SILVER', 'BRENTOIL']

const DISPLAY = {
  BTCUSDT:  'BTC',
  ETHUSDT:  'ETH',
  GOLD:     'GOLD',
  SILVER:   'SILVER',
  BRENTOIL: 'BRENT',
}

const ICON_COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16']
const symbolColor = (sym) => ICON_COLORS[sym.charCodeAt(0) % ICON_COLORS.length]

function TickerIcon({ sym }) {
  const [srcIdx, setSrcIdx] = useState(0)

  // Birebir TradingView orjinal SVG path'leri
  if (sym === 'GOLD') {
    return (
      <svg className="ticker-icon" width="14" height="14" viewBox="0 0 18 18" style={{borderRadius:'50%', overflow:'hidden'}}>
        <path d="M0 0h18v18H0V0z" fill="#D69A00"/>
        <path d="M4.156 9a.26.26 0 00-.217.107L2.215 11.68c-.096.143.024.32.217.32h6.135c.193 0 .313-.177.217-.32L7.06 9.107A.26.26 0 006.843 9H4.156zm7 0a.26.26 0 00-.217.107L9.215 11.68c-.096.143.024.32.217.32h6.136c.192 0 .312-.177.216-.32L14.06 9.107A.26.26 0 0013.843 9h-2.687zm-3.5-4a.26.26 0 00-.217.107L5.715 7.68c-.096.143.024.32.217.32h6.136c.192 0 .312-.177.216-.32L10.56 5.107A.26.26 0 0010.343 5H7.656z" fill="#fff"/>
      </svg>
    )
  }
  if (sym === 'SILVER') {
    return (
      <svg className="ticker-icon" width="14" height="14" viewBox="0 0 18 18" style={{borderRadius:'50%', overflow:'hidden'}}>
        <path d="M0 0h18v18H0V0z" fill="#ADABB8"/>
        <path d="M4.156 9a.26.26 0 00-.216.107L2.215 11.68c-.095.143.025.321.217.321h6.136c.192 0 .313-.178.217-.321L7.06 9.107A.26.26 0 006.844 9H4.156zm7 0a.26.26 0 00-.216.107L9.215 11.68c-.096.143.025.321.217.321h6.136c.192 0 .313-.178.217-.321L14.06 9.107A.26.26 0 0013.844 9h-2.688zm-3.5-4a.26.26 0 00-.216.107L5.715 7.68c-.095.143.025.321.217.321h6.136c.192 0 .313-.178.217-.321L10.56 5.107A.26.26 0 0010.345 5H7.656z" fill="#fff"/>
      </svg>
    )
  }
  if (sym === 'BRENTOIL') {
    return (
      <svg className="ticker-icon" width="14" height="14" viewBox="0 0 18 18" style={{borderRadius:'50%', overflow:'hidden'}}>
        <path d="M0 0h18v18H0V0z" fill="#5D606B"/>
        <path d="M9 2.5C9 2.5 4.5 9 4.5 12C4.5 14.485 6.515 16.5 9 16.5C11.485 16.5 13.5 14.485 13.5 12C13.5 9 9 2.5 9 2.5Z" fill="#fff"/>
      </svg>
    )
  }
  const sources = [
    `https://assets.coincap.io/assets/icons/${sym.toLowerCase()}@2x.png`,
    `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons/32/color/${sym.toLowerCase()}.png`,
  ]
  if (srcIdx >= sources.length) {
    return (
      <span className="ticker-icon-avatar" style={{ background: symbolColor(sym) }}>
        {sym[0]}
      </span>
    )
  }
  return (
    <img
      className="ticker-icon"
      src={sources[srcIdx]}
      alt={sym}
      onError={() => setSrcIdx(i => i + 1)}
    />
  )
}

function fmt(price, sym) {
  if (!price && price !== 0) return '—'
  if (sym === 'SILVER') return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (price >= 1) return price.toFixed(4)
  return price.toFixed(5)
}

export default function LiveTicker() {
  const { lang, toggleLang } = useLang()
  const [prices, setPrices] = useState({})
  const [flash, setFlash] = useState({})
  const [dominance, setDominance] = useState({ btc: null, eth: null })
  const wsRef = useRef(null)
  const prevRef = useRef({})

  const updatePrice = (symbol, data) => {
    const prev = prevRef.current[symbol]
    const dir = prev != null
      ? data.last_price > prev ? 'up' : data.last_price < prev ? 'down' : null
      : null
    prevRef.current[symbol] = data.last_price
    setPrices(p => ({ ...p, [symbol]: data }))
    if (dir) {
      setFlash(f => ({ ...f, [symbol]: dir }))
      setTimeout(() => setFlash(f => ({ ...f, [symbol]: null })), 600)
    }
  }

  // ── Dominans: backend proxy → TradingView, her 60 saniyede bir
  useEffect(() => {
    let mounted = true
    const fetchDom = () =>
      fetch(`${API_BASE}/api/dominance`)
        .then(r => r.json())
        .then(d => {
          if (!mounted) return
          setDominance({ btc: d.btc ?? null, eth: d.eth ?? null })
        })
        .catch(() => {})
    fetchDom()
    const id = setInterval(fetchDom, 60 * 1000)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  // ── Commodity fiyatlar: backend proxy → XAU/XAG/BRENT Crypto Synthetics, her 2 saniyede bir
  useEffect(() => {
    let mounted = true
    const fetchCommodities = () =>
      fetch(`${API_BASE}/api/commodities`)
        .then(r => r.json())
        .then(d => {
          if (!mounted) return
          for (const sym of ['GOLD', 'SILVER', 'BRENTOIL']) {
            if (d[sym]) updatePrice(sym, d[sym])
          }
        })
        .catch(() => {})
    fetchCommodities()
    const id = setInterval(fetchCommodities, 2 * 1000)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  // ── Binance public WebSocket — BTC, ETH
  useEffect(() => {
    let isMounted = true
    let retryTimer = null

    function connect() {
      const streams = BINANCE_SYMBOLS.map(s => `${s.toLowerCase()}@ticker`).join('/')
      const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`)
      wsRef.current = ws

      ws.onmessage = (e) => {
        if (!isMounted) return
        try {
          const msg = JSON.parse(e.data)
          const d = msg.data
          if (!d || !d.s) return
          const symbol = d.s
          if (!BINANCE_SYMBOLS.includes(symbol)) return
          updatePrice(symbol, {
            last_price: parseFloat(d.c),
            change_24h_pct: parseFloat(d.P),
            high_24h: parseFloat(d.h),
            low_24h: parseFloat(d.l),
            volume_24h: parseFloat(d.q),
          })
        } catch (err) { console.warn('[LiveTicker] WS parse error', err) }
      }

      ws.onclose = () => { if (isMounted) retryTimer = setTimeout(connect, 3000) }
      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      isMounted = false
      clearTimeout(retryTimer)
      wsRef.current?.close()
    }
  }, [])

  const btcPrice = prices['BTCUSDT']?.last_price
  const ethPrice = prices['ETHUSDT']?.last_price
  const ethBtc   = btcPrice && ethPrice ? (ethPrice / btcPrice) : null

  const btcDom = dominance.btc
  const ethDom = dominance.eth

  return (
    <div className="live-ticker-bar">
      {/* ── Fiyatlar ── */}
      {DISPLAY_ORDER.map(sym => {
        const d = prices[sym]
        const chg = d?.change_24h_pct
        const isPos = chg >= 0
        const flashDir = flash[sym]
        return (
          <div key={sym} className={`ticker-item${flashDir ? ` flash-${flashDir}` : ''}`}>
            <TickerIcon sym={sym === 'BTCUSDT' ? 'BTC' : sym === 'ETHUSDT' ? 'ETH' : sym} />
            <span className="ticker-sym">{DISPLAY[sym]}</span>
            <span className="ticker-price">{d ? fmt(d.last_price, sym) : '—'}</span>
            {d && chg != null && (
              <span className={`ticker-chg ${isPos ? 'pos' : 'neg'}`}>
                {isPos ? '+' : ''}{chg.toFixed(2)}%
              </span>
            )}
          </div>
        )
      })}

      {/* ── Separator ── */}
      <div className="ticker-divider" />

      {/* ── BTC Dominans ── */}
      <div className="ticker-item ticker-item-dom">
        <TickerIcon sym="btc" />
        <span className="ticker-sym">BTC.D</span>
        <span className="ticker-price ticker-dom-val">
          {btcDom != null ? btcDom.toFixed(1) + '%' : '—'}
        </span>
      </div>

      {/* ── ETH Dominans ── */}
      <div className="ticker-item ticker-item-dom">
        <TickerIcon sym="eth" />
        <span className="ticker-sym">ETH.D</span>
        <span className="ticker-price ticker-dom-val">
          {ethDom != null ? ethDom.toFixed(1) + '%' : '—'}
        </span>
      </div>

      {/* ── ETH/BTC parite ── */}
      <div className="ticker-item ticker-item-dom">
        <span className="ticker-sym ticker-sym-pair">ETH/BTC</span>
        <span className="ticker-price ticker-dom-val">
          {ethBtc != null ? ethBtc.toFixed(5) : '—'}
        </span>
      </div>

      <div className="ticker-live-dot">
        <span className="live-pulse" />
        LIVE
      </div>

      <button className="lang-toggle" onClick={toggleLang}>
        {lang === 'en' ? 'TR' : 'EN'}
      </button>
    </div>
  )
}
