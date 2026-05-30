import { useState, useEffect, useMemo } from 'react'
import { haptic } from '../../capacitor'
import { useWatchlist } from '../../hooks/useWatchlist'
import { API_BASE } from '../../config'
import HLSwipeRow from '../HLSwipeRow'

// CoinMarketCap numeric IDs — used to build CDN logo URLs
const CMC_IDS = {
  BTC:1,ETH:1027,BNB:1839,SOL:5426,XRP:52,ADA:2010,DOGE:74,AVAX:5805,
  TRX:1958,TON:11419,SHIB:5994,LINK:1975,DOT:6636,MATIC:3890,POL:28321,
  LTC:2,BCH:1831,UNI:7083,NEAR:6535,APT:21794,ARB:11841,OP:11840,
  ATOM:3794,FIL:2280,ICP:8916,VET:3077,ALGO:4030,HBAR:4642,EGLD:6892,
  XLM:512,FLOW:4558,SAND:6210,MANA:1966,AXS:6783,THETA:2416,EOS:1765,
  ZEC:1437,MKR:1518,AAVE:7278,SNX:2586,CRV:6538,COMP:5692,GRT:6719,
  FTM:3513,ROSE:8714,IOTX:2777,QTUM:1684,ZIL:2469,ICX:2099,BTT:16086,
  BAT:1697,STORJ:1772,ANKR:3783,BAND:4679,WAVES:1274,CFX:7334,CTSI:5444,
  NMR:1732,PAXG:4236,RLC:1637,TRB:5757,UNFI:7695,XEM:873,ZEN:1680,
  ZRX:1896,ENS:11636,YFI:5864,SUSHI:6758,BAL:5728,LDO:8000,PEPE:24478,
  WLD:13502,SUI:20947,SEI:23149,TIA:22861,INJ:7226,RUNE:4157,AR:5632,
  KAVA:4846,OCEAN:3911,XTZ:2011,KSM:5034,MINA:8646,ETC:1321,XMR:328,
  CAKE:7186,GMT:18069,PYTH:28177,JTO:29170,JUP:29210,BONK:23095,
  WIF:30120,BOME:30226,HYPE:29093,STRK:22691,BLAST:30012,NOT:28850,
  DOGS:30984,CATI:32521,EIGEN:33048,SCR:33376,NEIRO:33128,ORDI:25028,
  LUNC:4172,LUNA:20314,USTC:7129,DYDX:28324,IMX:10603,LRC:1934,
  JASMY:9696,CHZ:4066,HOT:2682,AUDIO:7030,CELR:3812,SKL:5691,PERP:6950,
  ALPHA:7692,ALICE:8766,PEOPLE:12165,HIGH:9285,CVX:9903,GALA:7080,
  APE:18876,SPELL:11289,SLP:5824,VOXEL:14057,ACH:6945,AGLD:10603,
  DAR:11466,ILV:11846,PORTO:11592,ALPINE:12320,SANTOS:12341,LAZIO:11605,
  CITY:10049,BAR:10009,JUV:8974,PSG:8971,OG:9066,ACM:9111,ATM:9104,
  INTER:10368,ASR:12481,FLUX:3029,GLMR:6836,DGB:109,SC:1042,DCR:1168,
  XVG:693,STEEM:1230,ARPA:4039,BETA:11202,LINA:7102,DEGO:7326,ELF:2758,
  IDEX:3928,KP3R:8720,LIT:7725,MDX:8420,MFT:2896,MBL:5827,OAX:1636,
  OGN:5117,ORN:5189,POND:4605,PROS:8255,REEF:6951,SXP:4279,STPT:4000,
  TVK:6898,TWT:5964,VITE:2824,WIN:4206,XVS:7083,YFII:7369,ERN:7398,
  FLM:7150,GTC:11396,SFP:5765,SUPER:8290,TLM:8925,DODO:7224,HARD:7717,
  BAKE:7056,CLV:4920,DOCK:3691,DUSK:4092,GAS:2570,NEO:1376,IOTA:2530,
  IOST:2405,OMG:1808,STMX:4006,KNC:9444,CELO:5567,STX:4847,MASK:8536,
  YGG:11835,TORN:14878,ACM:9111,LOKA:11389,CHESS:11104,FIDA:10538,
  CKB:4948,ONE:3945,QUICK:8206,FOR:3895,PUNDIX:9225,FARM:6859,WTC:2106,
}

function cmcLogoUrl(sym) {
  const id = CMC_IDS[sym.toUpperCase()]
  return id ? `https://s2.coinmarketcap.com/static/img/coins/64x64/${id}.png` : null
}

function fmtPrice(p) {
  if (p == null || isNaN(p)) return '—'
  if (p >= 1000) return p.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (p >= 1)    return p.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  return p.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
}

export default function MarketsScreen({ onNavigate }) {
  const [coins, setCoins] = useState([])   // ordered by source (mcap when CoinGecko loads)
  const [prices, setPrices] = useState({})
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState(() => {
    try { return localStorage.getItem('tt_markets_sort') || 'marketcap' } catch { return 'marketcap' }
  })
  const [showSort, setShowSort] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [hlSymbols, setHlSymbols] = useState(new Set())
  const { list: watchlist, has: inWatch, toggle: toggleWatch } = useWatchlist()

  useEffect(() => {
    try { localStorage.setItem('tt_markets_sort', sortBy) } catch {}
  }, [sortBy])

  useEffect(() => {
    fetch(`${API_BASE}/api/hl-markets`)
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d?.markets)) {
          setHlSymbols(new Set(d.markets.map(m => m.name)))
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const onExt = (e) => {
      const v = e.detail || (typeof e === 'object' && e.newValue)
      if (typeof v === 'string' && v) setSortBy(v)
    }
    window.addEventListener('tt_markets_sort_change', onExt)
    return () => window.removeEventListener('tt_markets_sort_change', onExt)
  }, [])

  useEffect(() => {
    // Stablecoin ve wrapped token filtresi
    const EXCLUDE = new Set([
      'USDT','USDC','USDS','USDE','DAI','BUSD','TUSD','FDUSD','PYUSD','GUSD',
      'USDP','FRAX','LUSD','EURI','CRVUSD','SUSD','USDX','MUSD','LISUSD',
      'WBTC','WETH','WBNB','WSTETH','WEETH','CBBTC','RETH','SBTC','STBTC',
      'BBTC','HBTC','TBTC','BTCB','BETH','STETH',
    ])

    let cancelled = false
    setLoadError(false)

    const fetchWithTimeout = (url, ms = 8000) => {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), ms)
      return fetch(url, { signal: ctrl.signal })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
        .finally(() => clearTimeout(t))
    }

    // 1) Binance — primary source. If this works, page populates.
    fetchWithTimeout('https://api.binance.com/api/v3/ticker/24hr')
      .then(bnData => {
        if (cancelled) return
        if (!Array.isArray(bnData)) throw new Error('binance_invalid')

        const binancePairs = {}
        bnData
          .filter(t => t.symbol.endsWith('USDT') && !t.symbol.includes('UPUSDT') && !t.symbol.includes('DOWNUSDT'))
          .filter(t => parseFloat(t.quoteVolume) > 500_000)
          .forEach(t => {
            const sym = t.symbol.slice(0, -4)
            if (EXCLUDE.has(sym)) return
            binancePairs[sym] = {
              price: parseFloat(t.lastPrice),
              change: parseFloat(t.priceChangePercent),
              vol: parseFloat(t.quoteVolume),
            }
          })

        // Initial render: sorted by volume (will be replaced if CG succeeds)
        const initial = Object.entries(binancePairs)
          .sort((a, b) => b[1].vol - a[1].vol)
          .slice(0, 250)
        setCoins(initial.map(([sym]) => ({ sym, name: sym })))
        const p = {}
        initial.forEach(([sym, v]) => { p[sym] = v })
        setPrices(p)

        // 2) CoinGecko — nice-to-have, gives proper market cap order + names
        fetchWithTimeout('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false', 6000)
          .then(cgData => {
            if (cancelled || !Array.isArray(cgData) || cgData.length === 0) return
            const filtered = cgData.filter(c => {
              const sym = c.symbol.toUpperCase()
              return !EXCLUDE.has(sym) && binancePairs[sym]
            })
            setCoins(filtered.map(c => ({ sym: c.symbol.toUpperCase(), name: c.name })))
            const p2 = {}
            filtered.forEach(c => {
              const sym = c.symbol.toUpperCase()
              p2[sym] = binancePairs[sym]
            })
            setPrices(p2)
          })
          .catch(() => {/* CG optional, ignore */})
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('[Markets] Binance fetch failed:', err)
        setLoadError(true)
      })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey])

  useEffect(() => {

    // Binance WebSocket — live price updates
    let ws
    const connect = () => {
      ws = new WebSocket('wss://stream.binance.com:9443/ws/!miniTicker@arr')
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data)
        if (!Array.isArray(data)) return
        setPrices(prev => {
          let updated = { ...prev }
          let changed = false
          data.forEach(d => {
            if (d.s.endsWith('USDT')) {
              const sym = d.s.replace('USDT', '')
              if (updated[sym]) {
                const close = parseFloat(d.c)
                const open  = parseFloat(d.o)
                updated[sym] = {
                  ...updated[sym],
                  price: close,
                  change: open !== 0 ? ((close - open) / open) * 100 : 0,
                  vol: parseFloat(d.q),
                }
                changed = true
              }
            }
          })
          return changed ? updated : prev
        })
      }
      ws.onerror = () => {}
    }
    connect()
    return () => ws?.close()
  }, [])

  const sortedAndFiltered = useMemo(() => {
    let list = coins.map(c => ({
      ...c,
      ...(prices[c.sym] || { price: null, change: null, vol: 0 })
    }))

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c => c.sym.toLowerCase().includes(q))
    }

    // marketcap: coins array is already in CoinGecko mcap order — no sort needed
    if (sortBy === 'volume') {
      list.sort((a, b) => (b.vol || 0) - (a.vol || 0))
    } else if (sortBy === 'gainers') {
      list.sort((a, b) => (b.change || 0) - (a.change || 0))
    } else if (sortBy === 'losers') {
      list.sort((a, b) => (a.change || 0) - (b.change || 0))
    } else if (sortBy === 'watchlist') {
      const order = new Map(watchlist.map((s, i) => [s, i]))
      list = list.filter(c => order.has(c.sym))
      list.sort((a, b) => (order.get(a.sym) ?? 0) - (order.get(b.sym) ?? 0))
    }

    return list
  }, [coins, prices, search, sortBy, watchlist])

  const sortLabels = {
    watchlist: '★ Watchlist',
    marketcap: 'Market Cap',
    volume: '24H Volume',
    gainers: 'Top Gainers',
    losers: 'Top Losers'
  }

  return (
    <div style={{ paddingBottom: 24, position: 'relative', background: '#000' }}>
      {/* Search bar — moved to top, matching Stocks page */}
      <div className="markets-search">
        <span className="markets-search-icon" style={{ color: '#a1a1aa' }}>⌕</span>
        <input
          className="markets-search-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search BTC, ETH, SOL..."
          autoCorrect="off" autoCapitalize="characters" spellCheck={false}
          style={{ background: '#000', color: '#d4d4d8' }}
        />
      </div>

      {/* Title row with sort dropdown trigger */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', position: 'relative', background: '#000' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div
            onClick={() => { haptic('light'); setShowSort(!showSort) }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 16, fontWeight: 700, cursor: 'pointer', color: '#d4d4d8' }}
          >
            {sortLabels[sortBy]}
            <span style={{ fontSize: 10, color: '#a1a1aa', transform: showSort ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
          </div>
          <button
            type="button"
            aria-label={sortBy === 'watchlist' ? 'Tüm coin\'leri göster' : 'Sadece favorileri göster'}
            className={`wl-filter-star${sortBy === 'watchlist' ? ' on' : ''}`}
            onClick={(e) => {
              haptic('light')
              setSortBy(prev => prev === 'watchlist' ? 'marketcap' : 'watchlist')
              const el = e.currentTarget
              el.classList.remove('pulse')
              void el.offsetWidth
              el.classList.add('pulse')
            }}
          >★</button>
        </div>

        {/* Dropdown Menu */}
        {showSort && (
          <div style={{
            position: 'absolute', top: 50, left: 20, background: '#000',
            border: '1px solid #1a1a1a', borderRadius: 12, padding: 8,
            zIndex: 50, boxShadow: '0 10px 40px rgba(0,0,0,0.8)', minWidth: 180
          }}>
            {Object.entries(sortLabels).map(([key, label]) => (
              <div
                key={key}
                onClick={() => { haptic('light'); setSortBy(key); setShowSort(false) }}
                style={{
                  padding: '12px 16px', fontSize: 14, fontWeight: 600,
                  color: sortBy === key ? '#00d992' : '#d4d4d8',
                  borderRadius: 8, cursor: 'pointer', background: sortBy === key ? 'rgba(255,255,255,0.04)' : 'transparent'
                }}
              >
                {label}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* List header */}
      <div style={{ display: 'flex', padding: '16px 20px 8px', fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}>
        <span style={{ flex: 1 }}>Sembol ({sortedAndFiltered.length})</span>
        <span style={{ textAlign: 'right' }}>24H Change</span>
      </div>

      {/* Empty state for watchlist filter */}
      {sortBy === 'watchlist' && sortedAndFiltered.length === 0 && coins.length > 0 && (
        <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-2)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>★</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Watchlist boş</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>
            Herhangi bir coin'in yıldızına basarak listene ekleyebilirsin
          </div>
          <button
            type="button"
            onClick={() => { haptic('light'); setSortBy('marketcap') }}
            style={{
              padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--card)', color: 'var(--text)', fontWeight: 600, fontSize: 13,
              cursor: 'pointer',
            }}
          >Tüm coin'leri göster</button>
        </div>
      )}

      {/* Loading state */}
      {coins.length === 0 && !loadError && (
        <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          Loading markets...
        </div>
      )}

      {/* Error state */}
      {coins.length === 0 && loadError && (
        <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-2)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚠</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Veriler yüklenemedi</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>
            İnternet bağlantısı veya Binance API erişimi sorunu olabilir
          </div>
          <button
            type="button"
            onClick={() => { haptic('light'); setReloadKey(k => k + 1) }}
            style={{
              padding: '10px 24px', borderRadius: 10, border: '1px solid var(--green)',
              background: 'var(--card)', color: 'var(--green)', fontWeight: 700, fontSize: 13,
              cursor: 'pointer',
            }}
          >Tekrar dene</button>
        </div>
      )}

      {/* Coin rows */}
      <div className="markets-list">
        {sortedAndFiltered.map(coin => {
          const isUp = coin.change >= 0
          const isValidChg = coin.change != null && !isNaN(coin.change)
          const chgStr = isValidChg ? `%${Math.abs(coin.change).toFixed(2).replace('.', ',')}` : '—'
          const onHL = hlSymbols.has(coin.sym)

          const rowInner = (
            <div className="markets-row" onClick={() => { haptic('medium'); onNavigate?.('chart', { sym: coin.sym, type: 'crypto', name: coin.sym, price: coin.price, change: coin.change }) }}>
              {/* Logo + star badge */}
              <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', background: 'var(--bg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img
                  src={cmcLogoUrl(coin.sym) || `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/128/color/${coin.sym.toLowerCase()}.png`}
                  alt={coin.sym}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  onError={(e) => {
                    const fb = e.target.dataset.fb || '0'
                    if (fb === '0') {
                      e.target.dataset.fb = '1'
                      e.target.src = `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/128/color/${coin.sym.toLowerCase()}.png`
                    } else if (fb === '1') {
                      e.target.dataset.fb = '2'
                      e.target.src = `https://assets.coincap.io/assets/icons/${coin.sym.toLowerCase()}@2x.png`
                    } else {
                      e.target.style.display = 'none'
                      e.target.parentElement.innerHTML = `<span style="font-size:11px;font-weight:800;color:var(--text)">${coin.sym.slice(0,3)}</span>`
                    }
                  }}
                />
                </div>
                <button
                  type="button"
                  aria-label={inWatch(coin.sym) ? 'Remove from watchlist' : 'Add to watchlist'}
                  className={`wl-star${inWatch(coin.sym) ? ' on' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    haptic('light')
                    toggleWatch(coin.sym)
                    const el = e.currentTarget
                    el.classList.remove('pulse')
                    // Force reflow to restart animation
                    void el.offsetWidth
                    el.classList.add('pulse')
                  }}
                >★</button>
              </div>

              {/* Sol: sembol adı */}
              <div className="markets-row-info" style={{ marginLeft: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{coin.sym}</div>
                {hlSymbols.has(coin.sym) && (
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2, letterSpacing: 0.2 }}>Hyperliquid</div>
                )}
              </div>

              {/* Sağ: fiyat + yüzde */}
              <div className="markets-row-right" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: 3 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                  {fmtPrice(coin.price)}
                </span>
                <span style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: !isValidChg ? 'var(--text-3)' : (isUp ? 'var(--green)' : 'var(--red)'),
                  fontFamily: 'var(--mono)',
                }}>
                  {isValidChg ? (isUp ? '+' : '-') : ''}{chgStr}
                </span>
              </div>
            </div>
          )

          return (
            <HLSwipeRow
              key={coin.sym}
              enabled={onHL}
              onAction={() => onNavigate?.('hl-trade', { sym: coin.sym, name: coin.sym, price: coin.price, change: coin.change, type: 'crypto' })}
            >
              {rowInner}
            </HLSwipeRow>
          )
        })}
      </div>
    </div>
  )
}
