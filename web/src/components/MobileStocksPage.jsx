import { useState, useEffect } from 'react'
import { haptic } from '../capacitor'
import { API_BASE } from '../config'
import AssetLogo from './AssetLogo'
import { useWatchlist } from '../hooks/useWatchlist'
import HLSwipeRow from '../mobile/HLSwipeRow'

export default function MobileStocksPage({ onNavigate }) {
  const { has: inWatch, toggle: toggleWatch } = useWatchlist('stocks')
  const [watchOnly, setWatchOnly] = useState(() => {
    try { return localStorage.getItem('tt_stocks_watch_only') === '1' } catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem('tt_stocks_watch_only', watchOnly ? '1' : '0') } catch {}
  }, [watchOnly])
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [errorMsg, setErrorMsg] = useState(null)
  const [hlSymbols, setHlSymbols] = useState(() => new Set([
    'AAPL','NVDA','MSFT','TSLA','GOOGL','GOOG','AMZN','META','NFLX','AMD',
    'COIN','HOOD','MSTR','SPY','QQQ','GLD','SLV','BRK','BABA','UBER',
    'PLTR','SMCI','AVGO','TSM','ORCL','CRM','ADBE','PYPL','SQ','SHOP',
    'GOLD','SILVER'
  ]))

  useEffect(() => {
    fetch(`${API_BASE}/api/hl-markets`)
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d?.markets)) {
          setHlSymbols(prev => {
            const next = new Set(prev)
            d.markets.forEach(m => next.add(m.name))
            return next
          })
        }
      })
      .catch(err => console.error('[HL markets]', err))
  }, [])

  useEffect(() => {
    setLoading(true)
    setErrorMsg(null)
    fetch(`${API_BASE}/api/stocks/assets_ranking`)
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
        const data = await res.json()
        return data
      })
      .then(res => {
        if (res.status === 'ok' && Array.isArray(res.data)) {
          setAssets(res.data)
        } else {
          setErrorMsg(`API error: ${res.message || 'Invalid data format'}`)
        }
        setLoading(false)
      })
      .catch((e) => {
        setErrorMsg(`Network error: ${e.message} (API: ${API_BASE})`)
        setLoading(false)
      })
  }, [])

  let filtered = assets
  if (search) {
    const q = search.toLowerCase()
    filtered = filtered.filter(a =>
      (a.name || '').toLowerCase().includes(q) ||
      (a.code || '').toLowerCase().includes(q)
    )
  }
  if (watchOnly) {
    filtered = filtered.filter(a => inWatch(a.code))
  }

  return (
    <div style={{ paddingBottom: 24, position: 'relative', background: '#000' }}>
      {/* Search Bar */}
      <div className="markets-search">
        <span className="markets-search-icon" style={{ color: '#a1a1aa' }}>⌕</span>
        <input
          className="markets-search-input"
          placeholder="Search Stock / Asset..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoCorrect="off" autoCapitalize="off"
          style={{ background: '#000', color: '#d4d4d8' }}
        />
      </div>

      {/* Title Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{watchOnly ? '★ Watchlist' : "World's Most Valuable"}</div>
        <button
          type="button"
          aria-label={watchOnly ? 'Tümünü göster' : 'Sadece favorileri göster'}
          className={`wl-filter-star${watchOnly ? ' on' : ''}`}
          onClick={(e) => {
            haptic('light')
            setWatchOnly(v => !v)
            const el = e.currentTarget
            el.classList.remove('pulse')
            void el.offsetWidth
            el.classList.add('pulse')
          }}
        >★</button>
      </div>

      {/* List header */}
      <div style={{ display: 'flex', padding: '16px 20px 8px', fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}>
        <span style={{ flex: 1 }}>Rank / Symbol</span>
        <span style={{ textAlign: 'right' }}>Market Cap / 24H</span>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          Loading...
        </div>
      )}

      {/* Error state */}
      {errorMsg && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)', fontSize: 13 }}>
          {errorMsg}
        </div>
      )}

      {/* Empty watchlist state */}
      {!loading && !errorMsg && watchOnly && filtered.length === 0 && (
        <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-2)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>★</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Watchlist boş</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>
            Herhangi bir hissenin yıldızına basarak listene ekleyebilirsin
          </div>
          <button
            type="button"
            onClick={() => { haptic('light'); setWatchOnly(false) }}
            style={{
              padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--card)', color: 'var(--text)', fontWeight: 600, fontSize: 13,
              cursor: 'pointer',
            }}
          >Tümünü göster</button>
        </div>
      )}

      {/* Asset rows */}
      <div className="markets-list">
        {filtered.map((asset, i) => {
          const isUp = asset.today_dir === 'up'
          const isDown = asset.today_dir === 'down'
          const chgStr = asset.today ? `%${asset.today.replace('%', '').replace('.', ',')}` : '—'
          const onHL = hlSymbols.has(asset.code)
          const priceNum = parseFloat((asset.price || '').replace(/[$,]/g, ''))
          const changeNum = parseFloat((asset.today || '').replace('%', '')) || null

          const rowInner = (
            <div className="markets-row" onClick={() => { haptic('medium'); onNavigate?.('chart', { sym: asset.code, type: 'stock', name: asset.name, price: priceNum, change: changeNum, marketCap: asset.market_cap }) }}>
              {/* Rank & Logo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <div style={{ width: 20, fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textAlign: 'center', fontFamily: 'var(--mono)' }}>
                  {asset.rank || ''}
                </div>
                <div style={{ position: 'relative', width: 36, height: 36 }}>
                  <AssetLogo symbol={asset.code} icon={asset.icon} type={asset.asset_type || asset.type || 'stock'} size={36} radius={12} />
                  <button
                    type="button"
                    aria-label={inWatch(asset.code) ? 'Remove from watchlist' : 'Add to watchlist'}
                    className={`wl-star${inWatch(asset.code) ? ' on' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      haptic('light')
                      toggleWatch(asset.code)
                      const el = e.currentTarget
                      el.classList.remove('pulse')
                      void el.offsetWidth
                      el.classList.add('pulse')
                    }}
                  >★</button>
                </div>
              </div>
              
              {/* Symbol & Market Cap */}
              <div className="markets-row-info" style={{ marginLeft: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 500 }}>{asset.code || ''}</div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2, fontFamily: 'var(--mono)' }}>
                  {(asset.market_cap || '').replace(' T', 'T').replace(' B', 'B')}
                </div>
                {hlSymbols.has(asset.code) && (
                  <div style={{ fontSize: 11, color: '#888', marginTop: 1, letterSpacing: 0.2 }}>Hyperliquid</div>
                )}
              </div>
              
              {/* Price & Change */}
              <div className="markets-row-right" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'var(--mono)' }}>
                  {asset.price || '—'}
                </div>
                <div style={{ 
                  fontSize: 13, 
                  fontWeight: 600, 
                  color: isUp ? 'var(--green)' : (isDown ? 'var(--red)' : 'var(--text-3)'),
                  marginTop: 2,
                  fontFamily: 'var(--mono)'
                }}>
                  {isDown ? '-' : (isUp ? '' : '')}{chgStr}
                </div>
              </div>
            </div>
          )

          return (
            <HLSwipeRow
              key={asset.rank || asset.code || i}
              enabled={onHL}
              onAction={() => onNavigate?.('hl-trade', { sym: asset.code, name: asset.name, price: priceNum, change: changeNum, type: 'stock' })}
            >
              {rowInner}
            </HLSwipeRow>
          )
        })}
      </div>
    </div>
  )
}
