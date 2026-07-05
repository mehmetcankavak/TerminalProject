import { useState, useEffect } from 'react'

// Global market metrics — CoinGecko (mcap, dominance, volume) + Alternative.me
// (Fear & Greed index). Both public, no key, ücretsiz.

const COINGECKO  = 'https://api.coingecko.com/api/v3'
const FEAR_GREED = 'https://api.alternative.me/fng/'

function fmtB(n) {
  if (n == null || !isFinite(n)) return '—'
  const v = Math.abs(n)
  if (v >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T'
  if (v >= 1e9)  return '$' + (n / 1e9).toFixed(1)  + 'B'
  if (v >= 1e6)  return '$' + (n / 1e6).toFixed(0)  + 'M'
  return '$' + n.toFixed(0)
}

function fmtPct(n) {
  if (n == null || !isFinite(n)) return '—'
  return n.toFixed(2) + '%'
}

const DOM_COLORS = {
  BTC: '#f7931a', ETH: '#627eea', BNB: '#f3ba2f',
  SOL: '#9945ff', XRP: '#00aaf0', Others: '#666',
}

// ─── Global Sentiment ────────────────────────────────────────────────────────
// Compound score combining Fear & Greed (contrarian) + market cap momentum.
// F&G is volatility-weighted public sentiment 0-100; we contrarian-invert it
// so extreme greed reads bearish and extreme fear reads bullish. Then we add
// 24h mcap change as a secondary momentum signal.
function GlobalSentiment({ global, fg }) {
  if (!global || !fg) {
    return (
      <div style={{ padding: '12px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ fontSize: 10, color: '#555', fontWeight: 700, letterSpacing: 0.5 }}>
          SENTIMENT · GLOBAL · yükleniyor…
        </div>
      </div>
    )
  }
  // F&G contrarian: 50 = neutral, 0 = extreme fear (bullish), 100 = extreme greed (bearish)
  const fgContrarian = (50 - fg.value) / 50           // -1..+1 (positive = fear/bullish)
  const mcapMom      = Math.max(-1, Math.min(1, (global.market_cap_change_percentage_24h_usd || 0) / 5))
  // Weighted blend: 70% contrarian F&G, 30% momentum
  const score = 0.7 * fgContrarian + 0.3 * mcapMom
  const verdict = score >  0.3 ? 'BULLISH'
                : score < -0.3 ? 'BEARISH'
                :                'NEUTRAL'
  const tone = verdict === 'BULLISH' ? '#00d992'
             : verdict === 'BEARISH' ? '#f43f5e'
             :                          '#aaa'
  const pct = Math.max(0, Math.min(100, (score + 1) * 50))
  const fgColor = fg.value < 25 ? '#f43f5e'
                : fg.value < 45 ? '#fb923c'
                : fg.value < 55 ? '#aaa'
                : fg.value < 75 ? '#84cc16'
                :                  '#00d992'

  return (
    <div style={{ padding: '12px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8 }}>
          SENTIMENT · GLOBAL · 24H
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)', color: tone }}>
            {score >= 0 ? '+' : ''}{score.toFixed(2)}
          </span>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.6, color: tone }}>
            {verdict}
          </span>
        </div>
      </div>

      <div style={{ position: 'relative', height: 8, marginBottom: 8 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 4,
          background: 'linear-gradient(to right, rgba(244,63,94,0.5) 0%, rgba(244,63,94,0.15) 35%, rgba(255,255,255,0.06) 50%, rgba(0,217,146,0.15) 65%, rgba(0,217,146,0.5) 100%)',
        }} />
        <div style={{
          position: 'absolute', top: -2, bottom: -2, left: '50%',
          width: 1, background: 'rgba(255,255,255,0.18)', transform: 'translateX(-50%)',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: pct + '%',
          width: 12, height: 12, borderRadius: '50%', background: tone,
          boxShadow: '0 0 10px ' + tone + '99',
          border: '2px solid #000', transform: 'translate(-50%, -50%)',
          transition: 'left 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#555', fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>
        <span>BEARISH</span>
        <span>NÖTR</span>
        <span>BULLISH</span>
      </div>

      {/* 4-card panel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10, padding: '8px 8px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#aaa', letterSpacing: 0.5 }}>TOTAL MCAP</div>
          <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff', marginTop: 3 }}>
            {fmtB(global.total_market_cap?.usd)}
          </div>
          <div style={{
            fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)', marginTop: 1,
            color: (global.market_cap_change_percentage_24h_usd || 0) >= 0 ? '#00d992' : '#f43f5e',
          }}>
            {(global.market_cap_change_percentage_24h_usd || 0) >= 0 ? '+' : ''}
            {(global.market_cap_change_percentage_24h_usd || 0).toFixed(2)}%
          </div>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10, padding: '8px 8px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#aaa', letterSpacing: 0.5 }}>24H VOLUME</div>
          <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff', marginTop: 3 }}>
            {fmtB(global.total_volume?.usd)}
          </div>
          <div style={{ fontSize: 9, color: '#888', fontFamily: 'var(--mono)', marginTop: 1 }}>
            {global.active_cryptocurrencies?.toLocaleString() || '—'} coin
          </div>
        </div>
        <div style={{
          background: 'rgba(247,147,26,0.06)', border: '1px solid rgba(247,147,26,0.15)',
          borderRadius: 10, padding: '8px 8px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#f7931a', letterSpacing: 0.5 }}>BTC DOM</div>
          <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff', marginTop: 3 }}>
            {fmtPct(global.market_cap_percentage?.btc)}
          </div>
          <div style={{ fontSize: 9, color: '#888', fontFamily: 'var(--mono)', marginTop: 1 }}>
            ETH {fmtPct(global.market_cap_percentage?.eth)}
          </div>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid ' + fgColor + '40',
          borderRadius: 10, padding: '8px 8px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: fgColor, letterSpacing: 0.5 }}>FEAR & GREED</div>
          <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff', marginTop: 3 }}>
            {fg.value}
          </div>
          <div style={{ fontSize: 9, color: fgColor, fontFamily: 'var(--mono)', marginTop: 1 }}>
            {fg.label}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Dominance Stacked Bar ──────────────────────────────────────────────────
function DominanceBar({ global }) {
  if (!global) return null
  const btc = global.market_cap_percentage?.btc || 0
  const eth = global.market_cap_percentage?.eth || 0
  const bnb = global.market_cap_percentage?.bnb || 0
  const sol = global.market_cap_percentage?.sol || 0
  const xrp = global.market_cap_percentage?.xrp || 0
  const others = Math.max(0, 100 - btc - eth - bnb - sol - xrp)
  const list = [
    { name: 'BTC',    pct: btc,    color: DOM_COLORS.BTC },
    { name: 'ETH',    pct: eth,    color: DOM_COLORS.ETH },
    { name: 'BNB',    pct: bnb,    color: DOM_COLORS.BNB },
    { name: 'SOL',    pct: sol,    color: DOM_COLORS.SOL },
    { name: 'XRP',    pct: xrp,    color: DOM_COLORS.XRP },
    { name: 'Others', pct: others, color: DOM_COLORS.Others },
  ]
  return (
    <div style={{ padding: '20px 16px 0' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#666', letterSpacing: 1, marginBottom: 10 }}>
        MARKET DOMINANCE
      </div>
      {/* Stacked bar */}
      <div style={{
        display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden',
        background: 'rgba(255,255,255,0.04)', marginBottom: 12,
      }}>
        {list.map(d => (
          d.pct > 0
            ? <div key={d.name} style={{
                width: d.pct + '%', background: d.color,
                transition: 'width 0.5s ease',
              }} title={d.name + ' ' + d.pct.toFixed(2) + '%'} />
            : null
        ))}
      </div>
      {/* Legend grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontFamily: 'var(--mono)',
      }}>
        {list.map(d => (
          <div key={d.name} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.03)', borderRadius: 8,
            padding: '8px 10px', border: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: d.color, flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>{d.name}</div>
              <div style={{ fontSize: 10, color: '#888' }}>{d.pct.toFixed(2)}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center', color: '#555', fontSize: 13 }}>
      Veri yükleniyor…
    </div>
  )
}

// ─── Top Movers (Gainers / Losers) ──────────────────────────────────────────
function MoverRow({ coin, isGainer }) {
  const tone = isGainer ? '#00d992' : '#f43f5e'
  const pct  = coin.price_change_percentage_24h || 0
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '9px 10px', background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10,
    }}>
      {coin.image && (
        <img src={coin.image} alt={coin.symbol}
          style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0 }}
          onError={e => { e.target.style.display = 'none' }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
          {coin.symbol}
        </div>
        <div style={{ fontSize: 9, color: '#888', fontFamily: 'var(--mono)' }}>
          ${coin.current_price >= 1 ? coin.current_price.toFixed(2) : coin.current_price?.toFixed(5)}
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)', color: tone }}>
        {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
      </div>
    </div>
  )
}

// ─── Trending Coin Chip ─────────────────────────────────────────────────────
function TrendingChip({ rank, coin }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 10px', background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 800, color: '#fbbf24', fontFamily: 'var(--mono)',
        width: 16, textAlign: 'center',
      }}>
        #{rank}
      </div>
      {coin.thumb && (
        <img src={coin.thumb} alt={coin.symbol}
          style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0 }}
          onError={e => { e.target.style.display = 'none' }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#fff', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>
          {coin.symbol}
        </div>
      </div>
      <div style={{ fontSize: 9, color: '#888' }}>👁</div>
    </div>
  )
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function GlobalMetricsScreen() {
  const [global,   setGlobal]   = useState(null)
  const [fg,       setFg]       = useState(null)
  const [topCoins, setTopCoins] = useState([])
  const [trending, setTrending] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [gRes, fRes, mRes, tRes] = await Promise.all([
          fetch(`${COINGECKO}/global`),
          fetch(`${FEAR_GREED}?limit=1`),
          fetch(`${COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&price_change_percentage=24h`),
          fetch(`${COINGECKO}/search/trending`),
        ])
        const gData = await gRes.json()
        const fData = await fRes.json()
        const mData = await mRes.json()
        const tData = await tRes.json()
        if (!alive) return
        setGlobal(gData.data)
        const fgEntry = fData.data?.[0]
        if (fgEntry) {
          setFg({
            value: parseInt(fgEntry.value),
            label: fgEntry.value_classification,
            updated: parseInt(fgEntry.timestamp),
          })
        }
        if (Array.isArray(mData)) setTopCoins(mData)
        if (Array.isArray(tData?.coins)) setTrending(tData.coins.slice(0, 7).map(c => c.item))
      } catch {}
      finally { setLoading(false) }
    }
    load()
    const id = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  // Compute top gainers and losers from top 100 by mcap
  const gainers = [...topCoins]
    .filter(c => (c.price_change_percentage_24h || 0) > 0)
    .sort((a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0))
    .slice(0, 5)
  const losers = [...topCoins]
    .filter(c => (c.price_change_percentage_24h || 0) < 0)
    .sort((a, b) => (a.price_change_percentage_24h || 0) - (b.price_change_percentage_24h || 0))
    .slice(0, 5)

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', color: 'var(--text)', paddingBottom: 32 }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Global Metrics</div>
            <div style={{ fontSize: 11, color: '#fff', marginTop: 2 }}>
              Market Cap · Dominance · Sentiment
            </div>
            <div style={{ fontSize: 9, color: '#666', marginTop: 4, fontFamily: 'var(--mono)', letterSpacing: 0.3 }}>
              KAYNAK · CoinGecko + Alternative.me · key yok
            </div>
          </div>
          {global?.total_market_cap?.usd && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#666', fontWeight: 700, letterSpacing: 0.5 }}>TOTAL MCAP</div>
              <div style={{ fontSize: 16, fontWeight: 900, fontFamily: 'var(--mono)', color: '#fff' }}>
                {fmtB(global.total_market_cap.usd)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sentiment + 4-card */}
      <GlobalSentiment global={global} fg={fg} />

      {/* Dominance breakdown */}
      {loading ? <Skeleton /> : <DominanceBar global={global} />}

      {/* Top Gainers + Losers (side by side) */}
      {(gainers.length > 0 || losers.length > 0) && (
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#666', letterSpacing: 1, marginBottom: 10 }}>
            EN ÇOK HAREKET · 24H · TOP 100 MCAP
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#00d992', letterSpacing: 0.5, marginBottom: 6 }}>
                ↑ GAINERS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {gainers.map(c => <MoverRow key={c.id} coin={c} isGainer={true} />)}
                {gainers.length === 0 && (
                  <div style={{ fontSize: 11, color: '#555', padding: 12, textAlign: 'center' }}>—</div>
                )}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#f43f5e', letterSpacing: 0.5, marginBottom: 6 }}>
                ↓ LOSERS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {losers.map(c => <MoverRow key={c.id} coin={c} isGainer={false} />)}
                {losers.length === 0 && (
                  <div style={{ fontSize: 11, color: '#555', padding: 12, textAlign: 'center' }}>—</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trending — CoinGecko search interest */}
      {trending.length > 0 && (
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#666', letterSpacing: 1, marginBottom: 10 }}>
            TRENDING · COINGECKO 24H ARAMA
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {trending.map((c, i) => <TrendingChip key={c.id} rank={i + 1} coin={c} />)}
          </div>
        </div>
      )}
    </div>
  )
}
