// Native-feel Price Alerts screen — modelled after Midas / Trade Republic.
// Two surfaces:
//   1. List of active alerts (toggle to disable = delete)
//   2. Add-alert flow: coin picker → price input
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { haptic } from '../../capacitor'
import { API_BASE } from '../../config'

const TOP_15_CRYPTOS = [
  { sym: 'BTC',  name: 'Bitcoin', type: 'crypto' },
  { sym: 'ETH',  name: 'Ethereum', type: 'crypto' },
  { sym: 'SOL',  name: 'Solana', type: 'crypto' },
  { sym: 'XRP',  name: 'Ripple', type: 'crypto' },
  { sym: 'BNB',  name: 'BNB', type: 'crypto' },
  { sym: 'DOGE', name: 'Dogecoin', type: 'crypto' },
  { sym: 'ADA',  name: 'Cardano', type: 'crypto' },
  { sym: 'AVAX', name: 'Avalanche', type: 'crypto' },
  { sym: 'LINK', name: 'Chainlink', type: 'crypto' },
  { sym: 'TON',  name: 'Toncoin', type: 'crypto' },
  { sym: 'TRX',  name: 'Tron', type: 'crypto' },
  { sym: 'SUI',  name: 'Sui', type: 'crypto' },
  { sym: 'DOT',  name: 'Polkadot', type: 'crypto' },
  { sym: 'MATIC',name: 'Polygon', type: 'crypto' },
  { sym: 'NEAR', name: 'NEAR Protocol', type: 'crypto' },
]

const TOP_15_STOCKS = [
  { sym: 'AAPL', name: 'Apple', type: 'stock' },
  { sym: 'MSFT', name: 'Microsoft', type: 'stock' },
  { sym: 'NVDA', name: 'NVIDIA', type: 'stock' },
  { sym: 'GOOGL', name: 'Alphabet', type: 'stock' },
  { sym: 'AMZN', name: 'Amazon', type: 'stock' },
  { sym: 'META', name: 'Meta Platforms', type: 'stock' },
  { sym: 'TSLA', name: 'Tesla', type: 'stock' },
  { sym: 'BRK.B', name: 'Berkshire Hathaway', type: 'stock' },
  { sym: 'LLY', name: 'Eli Lilly', type: 'stock' },
  { sym: 'AVGO', name: 'Broadcom', type: 'stock' },
  { sym: 'V', name: 'Visa', type: 'stock' },
  { sym: 'JPM', name: 'JPMorgan Chase', type: 'stock' },
  { sym: 'UNH', name: 'UnitedHealth', type: 'stock' },
  { sym: 'WMT', name: 'Walmart', type: 'stock' },
  { sym: 'MA', name: 'Mastercard', type: 'stock' },
]

const ALL_ASSETS = [...TOP_15_CRYPTOS, ...TOP_15_STOCKS]

const formatPrice = (p) => {
  if (p == null || isNaN(p)) return '—'
  if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (p >= 1)    return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  return p.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
}

// Coin logo via CoinGecko CDN — falls back to a colored letter circle.
function CoinAvatar({ sym }) {
  const [error, setError] = useState(false)
  if (error) {
    return (
      <div className="pa-avatar pa-avatar-fallback">
        {sym.slice(0, 1)}
      </div>
    )
  }
  return (
    <div className="pa-avatar">
      <img
        src={`https://assets.coingecko.com/coins/images/search/${sym.toLowerCase()}.png`}
        onError={() => setError(true)}
        alt={sym}
      />
    </div>
  )
}

// Component for swipe-to-reveal actions
function SwipeableAlertRow({ alert, livePrice, onDelete, onEdit }) {
  const [offset, setOffset] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const startX = useRef(0)
  const currentX = useRef(0)
  const sym = alert.coin?.toUpperCase()
  
  const maxOffset = -140 // Width of two buttons (70px each)

  const onTouchStart = (e) => {
    startX.current = e.touches[0].clientX
    setIsSwiping(true)
  }

  const onTouchMove = (e) => {
    if (!isSwiping) return
    const x = e.touches[0].clientX
    const deltaX = x - startX.current
    
    // Allow swiping left, prevent swiping right past 0
    if (deltaX < 0) {
      currentX.current = Math.max(deltaX, maxOffset - 20) // little rubber band effect
      setOffset(currentX.current)
    } else {
      currentX.current = 0
      setOffset(0)
    }
  }

  const onTouchEnd = () => {
    setIsSwiping(false)
    if (currentX.current < maxOffset / 2) {
      setOffset(maxOffset)
      haptic('light')
    } else {
      setOffset(0)
    }
  }

  return (
    <div className="pa-swipe-container">
      <div className="pa-swipe-actions">
        <button className="pa-swipe-btn edit" onClick={() => { setOffset(0); onEdit(alert); }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
          </svg>
        </button>
        <button className="pa-swipe-btn delete" onClick={() => { setOffset(0); onDelete(alert.id); }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
      <div 
        className="pa-alert-row"
        style={{ transform: `translateX(${offset}px)`, transition: isSwiping ? 'none' : 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="pa-alert-text">
          <div className="pa-alert-sym">
            {sym}
            <span className="pa-alert-dir">
              {alert.direction === 'above' ? '↑' : '↓'}
            </span>
          </div>
          <div className="pa-alert-market">
            Piyasa fiyatı: ${formatPrice(livePrice ?? alert.market_price)}
          </div>
        </div>
        <div className="pa-alert-target">
          ${formatPrice(alert.target_price)}
        </div>
        <label className="pa-toggle">
          <input
            type="checkbox"
            checked
            onChange={() => onDelete(alert.id)}
          />
          <span className="pa-toggle-track"><span className="pa-toggle-thumb" /></span>
        </label>
      </div>
    </div>
  )
}

export default function PriceAlertsScreen({ onBack, prefillSym }) {
  const { token } = useAuth()
  const [alerts, setAlerts] = useState([])
  const [prices, setPrices] = useState({})
  const [view, setView] = useState(() => prefillSym ? 'setPrice' : 'list')
  const [picked, setPicked] = useState(() => {
    if (!prefillSym) return null
    return ALL_ASSETS.find(a => a.sym === prefillSym.toUpperCase()) || { sym: prefillSym.toUpperCase(), name: prefillSym.toUpperCase(), type: 'crypto' }
  })
  const [search, setSearch] = useState('')
  const [priceInput, setPriceInput] = useState('')
  const [direction, setDirection] = useState('above')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const wsRef = useRef(null)
  const pctScrollRef = useRef(null)

  // Center the horizontal scroll view when entering the set price screen
  useEffect(() => {
    if (view === 'setPrice' && pctScrollRef.current) {
      setTimeout(() => {
        if (pctScrollRef.current) {
          const { scrollWidth, clientWidth } = pctScrollRef.current
          pctScrollRef.current.scrollTo({
            left: (scrollWidth - clientWidth) / 2,
            behavior: 'smooth'
          })
        }
      }, 50)
    }
  }, [view])

  // Fetch existing alerts
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setAlerts(await res.json())
    } catch {}
  }, [token])

  useEffect(() => { fetchAlerts() }, [fetchAlerts])

  // Fetch current price for prefilled symbol (stock or crypto)
  useEffect(() => {
    if (!prefillSym) return
    const sym = prefillSym.toUpperCase()
    fetch(`${API_BASE}/api/binance/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify([sym + 'USDT']))}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const row = Array.isArray(data) ? data[0] : data
        if (row?.lastPrice) setPrices(prev => ({ ...prev, [sym]: parseFloat(row.lastPrice) }))
      })
      .catch(() => {})
  }, [prefillSym])

  // Subscribe to Binance miniTicker for the symbols we care about (alerts + popular crypto picker list).
  useEffect(() => {
    const symbols = new Set([
      ...alerts.filter(a => !TOP_15_STOCKS.find(s => s.sym === a.coin?.toUpperCase())).map(a => a.coin?.toUpperCase()).filter(Boolean),
      ...TOP_15_CRYPTOS.map(c => c.sym),
      ...(prefillSym ? [prefillSym.toUpperCase()] : []),
    ])
    if (symbols.size === 0) return
    const streams = [...symbols].map(s => `${s.toLowerCase()}usdt@miniTicker`).join('/')
    const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`)
    wsRef.current = ws
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        const d = msg.data
        if (!d || !d.s) return
        const sym = d.s.replace('USDT', '')
        setPrices(prev => ({ ...prev, [sym]: parseFloat(d.c) }))
      } catch {}
    }
    ws.onerror = () => {}
    return () => ws.close()
  }, [alerts])

  // Disable = delete (matches the user's mental model when flipping the toggle off)
  const handleDelete = async (id) => {
    haptic('light')
    setAlerts(a => a.filter(x => x.id !== id))   // optimistic
    try {
      await fetch(`${API_BASE}/api/alerts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch { fetchAlerts() }
  }

  const openAdd = () => { haptic('light'); setView('pickCoin'); setSearch('') }
  const cancelAdd = () => { haptic('light'); setView('list'); setPicked(null); setPriceInput(''); setError('') }

  const pickCoin = (c) => {
    haptic('light')
    setPicked(c)
    // Seed the big number with the live price the user tapped on —
    // a one-time snapshot, the value is independent of further WS ticks.
    const snap = prices[c.sym]
    if (snap != null) {
      const rounded = snap >= 1 ? snap.toFixed(2) : snap.toFixed(4)
      setPriceInput(rounded.replace('.', ','))
    } else {
      setPriceInput('')
    }
    setDirection('above')
    setView('setPrice')
  }

  const saveAlert = async () => {
    const parsed = parseFloat(priceInput.replace(',', '.'))
    if (!parsed || parsed <= 0) { setError('Geçerli bir fiyat girin'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ coin: picked.sym, direction, target_price: parsed }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.detail || 'Alarm eklenemedi')
      } else {
        haptic('heavy')
        await fetchAlerts()
        cancelAdd()
      }
    } catch {
      setError('Bağlantı hatası')
    } finally {
      setSaving(false)
    }
  }

  // Filter coins by search
  const filteredCoins = useMemo(() => {
    const q = search.trim().toUpperCase()
    if (!q) return null // If no search, return null to show the sections
    return ALL_ASSETS.filter(c =>
      c.sym.includes(q) || c.name.toUpperCase().includes(q)
    )
  }, [search])

  // ───────────────────────────────────── Sub-view: Coin picker
  if (view === 'pickCoin') {
    return (
      <div className="pa-screen">
        <header className="pa-modal-header">
          <button className="pa-close-btn" onClick={cancelAdd} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <h2 className="pa-modal-title">Alarm ekle</h2>
          <div style={{ width: 36 }} />
        </header>

        <div className="pa-search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            className="pa-search-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Coin ara"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        {!filteredCoins ? (
          <>
            <div className="pa-section-title">Kripto (İlk 15)</div>
            <div className="pa-coin-list">
              {TOP_15_CRYPTOS.map(c => (
                <button key={c.sym} className="pa-coin-row" onClick={() => pickCoin(c)}>
                  <CoinAvatar sym={c.sym} />
                  <div className="pa-coin-text">
                    <div className="pa-coin-sym">{c.sym}</div>
                    <div className="pa-coin-name">CRYPTO • {c.name}</div>
                  </div>
                  {prices[c.sym] && (
                    <div className="pa-coin-price">${formatPrice(prices[c.sym])}</div>
                  )}
                </button>
              ))}
            </div>

            <div className="pa-section-title" style={{ marginTop: '24px' }}>Hisse Senetleri (İlk 15)</div>
            <div className="pa-coin-list">
              {TOP_15_STOCKS.map(c => (
                <button key={c.sym} className="pa-coin-row" onClick={() => pickCoin(c)}>
                  <CoinAvatar sym={c.sym} />
                  <div className="pa-coin-text">
                    <div className="pa-coin-sym">{c.sym}</div>
                    <div className="pa-coin-name">STOCK • {c.name}</div>
                  </div>
                  {/* Stocks don't have live ws price here, but user can still add an alert */}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="pa-coin-list">
            {filteredCoins.map(c => (
              <button key={c.sym} className="pa-coin-row" onClick={() => pickCoin(c)}>
                <CoinAvatar sym={c.sym} />
                <div className="pa-coin-text">
                  <div className="pa-coin-sym">{c.sym}</div>
                  <div className="pa-coin-name">{c.type === 'crypto' ? 'CRYPTO' : 'STOCK'} • {c.name}</div>
                </div>
                {prices[c.sym] && (
                  <div className="pa-coin-price">${formatPrice(prices[c.sym])}</div>
                )}
              </button>
            ))}
            {filteredCoins.length === 0 && (
              <div className="pa-empty">Sonuç bulunamadı</div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ───────────────────────────────────── Sub-view: Price input
  if (view === 'setPrice' && picked) {
    const currentPrice = prices[picked.sym]
    const target = parseFloat(priceInput.replace(',', '.'))
    const diff = (currentPrice && target) ? ((target - currentPrice) / currentPrice) * 100 : null

    // Big number shows only what the user typed — the live market price
    // already sits in the subtitle, so don't overwrite the input with it.
    const displayValue = priceInput || '0'

    // Quick percentage chips — multiply the live price.
    const setByPct = (pct) => {
      haptic('light')
      if (!currentPrice) return
      const v = currentPrice * (1 + pct / 100)
      // Sensible rounding: 2 dp for >=1, 4 dp for <1
      const rounded = v >= 1 ? v.toFixed(2) : v.toFixed(4)
      setPriceInput(rounded.replace('.', ','))
      // If user picks a percent, set direction accordingly
      setDirection(pct >= 0 ? 'above' : 'below')
    }

    const onKey = (key) => {
      haptic('light')
      setError('')
      setPriceInput(prev => {
        if (key === 'back') return prev.slice(0, -1)
        if (key === ',') {
          if (prev.includes(',') || prev.includes('.')) return prev
          return prev === '' ? '0,' : prev + ','
        }
        // Limit to a reasonable length
        if (prev.length >= 12) return prev
        // Strip leading zero unless we just typed a decimal
        if (prev === '0' && key !== ',') return key
        return prev + key
      })
    }

    return (
      <div className="pa-screen pa-screen-numpad">
        <header className="pa-pi-header">
          <button className="pa-close-btn" onClick={() => setView('pickCoin')} aria-label="Back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <div className="pa-pi-title-wrap">
            <div className="pa-pi-title">{picked.sym}</div>
            <div className="pa-pi-subtitle">${formatPrice(currentPrice)}</div>
          </div>
          <button
            className="pa-pi-icon-btn"
            onClick={() => { haptic('light'); setDirection(d => d === 'above' ? 'below' : 'above') }}
            aria-label="Toggle direction"
            title={direction === 'above' ? 'Yükselirse' : 'Düşerse'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {direction === 'above'
                ? <>
                    <polyline points="17 11 12 6 7 11"/>
                    <line x1="12" y1="6" x2="12" y2="20"/>
                  </>
                : <>
                    <polyline points="7 13 12 18 17 13"/>
                    <line x1="12" y1="4" x2="12" y2="18"/>
                  </>
              }
            </svg>
          </button>
        </header>

        <div className="pa-pi-body">
          <div className="pa-pi-label">İşlem fiyatı</div>
          <div className="pa-pi-amount">
            <span className="pa-pi-currency">$</span>
            <span className="pa-pi-value">{displayValue || '0'}</span>
          </div>
          {diff != null && Math.abs(diff) < 10000 && (
            <div className="pa-pi-diff">
              Değişim: <span className={diff >= 0 ? 'up' : 'down'}>%{Math.abs(diff).toFixed(2).replace('.', ',')}</span>
            </div>
          )}

          {/* Quick percentage chips — horizontal scroll */}
          <div className="pa-pct-row" ref={pctScrollRef}>
            {[-15, -10, -5, -2, -1, 1, 2, 5, 10, 15].map(p => (
              <button key={p} className="pa-pct-chip" onClick={() => setByPct(p)}>
                {p > 0 ? `+%${p}` : `%${p}`}
              </button>
            ))}
          </div>
        </div>

        <div className="pa-pi-foot">
          <div className="pa-pi-hint">Aynı fiyat için 1 saat içinde en fazla 1 bildirim alırsın</div>

          {error && <div className="pa-error">{error}</div>}

          <button
            className="pa-pi-cta"
            onClick={saveAlert}
            disabled={saving || !priceInput}
          >
            {saving ? '...' : 'Alarm ekle'}
          </button>

          {/* Custom numpad — full-width 3×4 grid */}
          <div className="pa-numpad">
            {['1','2','3','4','5','6','7','8','9',',','0','back'].map(k => (
              <button
                key={k}
                className={`pa-key${k === 'back' ? ' pa-key-action' : ''}`}
                onClick={() => onKey(k)}
              >
                {k === 'back'
                  ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 5H8l-7 7 7 7h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
                  : k}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ───────────────────────────────────── Main view: Alert list
  return (
    <div className="pa-screen">
      <header className="pa-modal-header">
        <button className="pa-close-btn" onClick={() => { haptic('light'); onBack?.() }} aria-label="Back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ width: 36 }} />
      </header>
      <div className="pa-list-header">
        <h1 className="pa-list-title">Tüm yatırım alarmları</h1>
      </div>

      {alerts.length === 0 ? (
        <div className="pa-empty-state">
          <div className="pa-empty-icon">
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="26" cy="26" r="25" stroke="rgba(0,217,146,0.15)" strokeWidth="1.5" />
              {/* Bell body */}
              <path
                d="M26 13C26 13 18 17 18 26V32H34V26C34 17 26 13 26 13Z"
                fill="rgba(0,217,146,0.12)"
                stroke="#00d992"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              {/* Bell bottom */}
              <path
                d="M21 32C21 32 21 35 26 35C31 35 31 32 31 32"
                stroke="#00d992"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              {/* Bell top stem */}
              <line x1="26" y1="10" x2="26" y2="13" stroke="#00d992" strokeWidth="1.6" strokeLinecap="round" />
              {/* Price line left */}
              <line x1="14" y1="26" x2="17" y2="26" stroke="rgba(0,217,146,0.4)" strokeWidth="1.2" strokeLinecap="round" />
              {/* Price line right */}
              <line x1="35" y1="26" x2="38" y2="26" stroke="rgba(0,217,146,0.4)" strokeWidth="1.2" strokeLinecap="round" />
              {/* Target tick */}
              <path d="M22 25.5L25 28.5L30 23" stroke="#00d992" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="pa-empty-title">Henüz alarmın yok</div>
          <div className="pa-empty-sub">Coin'in hedef fiyata ulaştığında haber alalım.</div>
        </div>
      ) : (
        <div className="pa-alert-list">
          {alerts.map(a => {
            const sym = a.coin?.toUpperCase()
            const live = prices[sym]
            return (
              <SwipeableAlertRow 
                key={a.id} 
                alert={a} 
                livePrice={prices[sym]} 
                onDelete={handleDelete}
                onEdit={(alert) => {
                  // Not fully implemented yet, just seed pickCoin and price
                  haptic('light')
                  setPicked({ sym: alert.coin.toUpperCase() })
                  setPriceInput(alert.target_price.toString().replace('.', ','))
                  setDirection(alert.direction)
                  setView('setPrice')
                }}
              />
            )
          })}
        </div>
      )}

      <div className="pa-cta-region">
        <button className="pa-add-btn" onClick={openAdd}>
          Alarm ekle
        </button>
      </div>
    </div>
  )
}
