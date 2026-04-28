import { useState, useEffect, useRef } from 'react'
import { API_BASE } from '../config'

// ─── Data hooks ──────────────────────────────────────────────────────────────

function useCryptoTop100() {
  const [items, setItems] = useState([])
  useEffect(() => {
    let dead = false
    const load = () =>
      fetch(`${API_BASE}/api/market/cmc_top`).then(r => r.json())
        .then(j => {
          if (dead || j.status !== 'ok') return
          setItems((j.data || []).slice(0, 100).map(c => {
            const usd = (c.quotes || []).find(q => q.name === 'USD') || {}
            return { type: 'crypto', id: c.id, symbol: c.symbol, price: usd.price, chg: usd.percentChange24h }
          }))
        }).catch(() => {})
    load()
    const id = setInterval(load, 30_000)
    return () => { dead = true; clearInterval(id) }
  }, [])
  return items
}

function useStocksTop100() {
  const [items, setItems] = useState([])
  useEffect(() => {
    let dead = false
    const load = () =>
      fetch(`${API_BASE}/api/stocks/assets_ranking`).then(r => r.json())
        .then(j => {
          if (dead || j.status !== 'ok') return
          setItems((j.data || []).slice(0, 100).map(s => ({
            type: 'stock',
            symbol: s.code || s.name,
            price: s.price,
            chg: s.today,
            chgDir: s.today_dir,
            icon: s.icon,
          })))
        }).catch(() => {})
    load()
    const id = setInterval(load, 5 * 60_000)
    return () => { dead = true; clearInterval(id) }
  }, [])
  return items
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtPrice(price) {
  if (price == null || !isFinite(price)) return '—'
  if (price >= 10000) return '$' + price.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (price >= 1)     return '$' + price.toFixed(2)
  if (price >= 0.01)  return '$' + price.toFixed(4)
  return '$' + price.toFixed(6)
}

function parseChg(chg) {
  if (typeof chg === 'number') return chg
  if (typeof chg === 'string') return parseFloat(chg.replace('%', '').replace('+', ''))
  return NaN
}

// ─── Stock icon with fallback chain ─────────────────────────────────────────

function StockIcon({ symbol, cmcIcon }) {
  const [idx, setIdx] = useState(0)
  const sources = []
  if (cmcIcon) sources.push(cmcIcon.startsWith('/') ? `https://companiesmarketcap.com${cmcIcon}` : cmcIcon)
  sources.push(`https://financialmodelingprep.com/image-stock/${symbol}.png`)

  useEffect(() => { setIdx(0) }, [symbol])

  if (!sources.length || idx >= sources.length) {
    return (
      <span className="st-icon-fb">{(symbol || '?')[0]}</span>
    )
  }
  return (
    <img
      src={sources[idx]}
      alt={symbol}
      className="st-icon"
      referrerPolicy="no-referrer"
      onError={() => setIdx(i => i + 1)}
    />
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ScrollTicker() {
  const cryptos = useCryptoTop100()
  const stocks  = useStocksTop100()
  const prevRef = useRef({})
  const [flash, setFlash] = useState({})

  // Flash on price change
  useEffect(() => {
    if (!cryptos.length && !stocks.length) return
    const newFlash = {}
    for (const item of [...cryptos, ...stocks]) {
      const k = `${item.type}-${item.symbol}`
      const cur = typeof item.price === 'number' ? item.price : parseFloat(item.price)
      const prev = prevRef.current[k]
      if (isFinite(cur) && prev != null && cur !== prev) newFlash[k] = item.type
      if (isFinite(cur)) prevRef.current[k] = cur
    }
    if (!Object.keys(newFlash).length) return
    setFlash(p => ({ ...p, ...newFlash }))
    const t = setTimeout(() => setFlash(p => {
      const n = { ...p }; Object.keys(newFlash).forEach(k => delete n[k]); return n
    }), 900)
    return () => clearTimeout(t)
  }, [cryptos, stocks])

  const all = [...cryptos, ...stocks]
  if (!all.length) return <div className="scroll-ticker-bar" />

  // Duplicate for seamless loop
  const doubled = [...all, ...all]

  return (
    <div className="scroll-ticker-bar">
      <div
        className="scroll-ticker-track"
        style={{ animationDuration: `${Math.max(120, all.length * 2.2)}s` }}
      >
        {doubled.map((item, i) => {
          const k   = `${item.type}-${item.symbol}`
          const fd  = flash[k]
          const chg = parseChg(item.chg)
          const isPos = chg >= 0
          const priceNum = typeof item.price === 'number' ? item.price : parseFloat(item.price)

          return (
            <span
              key={i}
              className={`st-item${fd ? ` st-flash-${fd}` : ''}`}
            >
              {/* Icon */}
              {item.type === 'crypto' && item.id ? (
                <img
                  src={`https://s2.coinmarketcap.com/static/img/coins/32x32/${item.id}.png`}
                  alt="" className="st-icon"
                  onError={e => { e.target.style.display = 'none' }}
                />
              ) : item.type === 'stock' ? (
                <StockIcon symbol={item.symbol} cmcIcon={item.icon} />
              ) : null}

              <span className="st-sym">{item.symbol}</span>

              {/* Price */}
              {item.type === 'crypto'
                ? <span className="st-price">{isFinite(priceNum) ? fmtPrice(priceNum) : '—'}</span>
                : <span className="st-price">{item.price || '—'}</span>
              }

              {/* Change */}
              {!isNaN(chg) && (
                <span className={`st-chg ${isPos ? 'up' : 'dn'}`}>
                  {(isPos ? '+' : '') + chg.toFixed(2) + '%'}
                </span>
              )}

              <span className="st-dot">·</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
