import { useState, useEffect, useRef } from 'react'

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
  SOL: '#9945ff', XRP: '#00aaf0', Others: '#555',
}

/* ── TradingView Widget ─────────────────────────────────────────── */
function TVWidget({ symbol, height = 340, interval = 'D', studies = [] }) {
  const ref = useRef(null)
  const id  = useRef('tv_' + symbol.replace(/[^a-z0-9]/gi, '_') + '_' + Date.now())

  useEffect(() => {
    if (!ref.current) return
    ref.current.innerHTML = ''
    const container = document.createElement('div')
    container.id = id.current
    container.style.height = '100%'
    ref.current.appendChild(container)
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/tv.js'
    script.async = true
    script.onload = () => {
      if (!window.TradingView) return
      new window.TradingView.widget({
        container_id: id.current,
        autosize: true,
        symbol,
        interval,
        timezone: 'Europe/Istanbul',
        theme: 'dark',
        style: '1',
        locale: 'en',
        toolbar_bg: '#0c0d12',
        backgroundColor: 'rgba(8,9,12,1)',
        gridColor: 'rgba(26,28,37,0.4)',
        hide_top_toolbar: false,
        hide_legend: false,
        hide_side_toolbar: true,
        allow_symbol_change: false,
        save_image: false,
        calendar: false,
        studies,
        overrides: {
          'paneProperties.background': '#08090c',
          'paneProperties.backgroundType': 'solid',
        },
      })
    }
    document.head.appendChild(script)
    return () => { if (document.head.contains(script)) document.head.removeChild(script) }
  }, [symbol])

  return <div ref={ref} style={{ width: '100%', height }} />
}

/* ── Global Sentiment ───────────────────────────────────────────── */
function GlobalSentiment({ global: g, fg }) {
  if (!g || !fg) {
    return (
      <div className="gm-sentiment-wrap gm-sentiment-loading">
        <div className="gm-section-hdr">SENTIMENT · LOADING…</div>
      </div>
    )
  }

  const fgContrarian = (50 - fg.value) / 50
  const mcapMom      = Math.max(-1, Math.min(1, (g.market_cap_change_percentage_24h_usd || 0) / 5))
  const score        = 0.7 * fgContrarian + 0.3 * mcapMom
  const verdict      = score >  0.3 ? 'BULLISH' : score < -0.3 ? 'BEARISH' : 'NEUTRAL'
  const tone         = verdict === 'BULLISH' ? '#00e87a' : verdict === 'BEARISH' ? '#f43f5e' : '#aaa'
  const pct          = Math.max(0, Math.min(100, (score + 1) * 50))

  const fgColor = fg.value < 25 ? '#f43f5e'
                : fg.value < 45 ? '#fb923c'
                : fg.value < 55 ? '#aaa'
                : fg.value < 75 ? '#84cc16'
                :                  '#00e87a'

  return (
    <div className="gm-sentiment-wrap">
      <div className="gm-sentiment-top">
        <div className="gm-section-hdr">SENTIMENT · GLOBAL · 24H</div>
        <div className="gm-sentiment-verdict" style={{ color: tone }}>
          <span className="gm-sentiment-score">{score >= 0 ? '+' : ''}{score.toFixed(2)}</span>
          <span className="gm-sentiment-label">{verdict}</span>
        </div>
      </div>

      <div className="gm-gauge-wrap">
        <div className="gm-gauge-track">
          <div className="gm-gauge-gradient" />
          <div className="gm-gauge-center-line" />
          <div className="gm-gauge-dot" style={{ left: pct + '%', background: tone, boxShadow: `0 0 10px ${tone}99` }} />
        </div>
        <div className="gm-gauge-labels">
          <span>BEARISH</span>
          <span>NEUTRAL</span>
          <span>BULLISH</span>
        </div>
      </div>

      {/* 4-stat mini cards */}
      <div className="gm-stat4-grid">
        <div className="gm-stat4-card">
          <div className="gm-stat4-title">TOTAL MCAP</div>
          <div className="gm-stat4-value">{fmtB(g.total_market_cap?.usd)}</div>
          <div className="gm-stat4-sub" style={{ color: (g.market_cap_change_percentage_24h_usd || 0) >= 0 ? '#00e87a' : '#f43f5e' }}>
            {(g.market_cap_change_percentage_24h_usd || 0) >= 0 ? '+' : ''}
            {(g.market_cap_change_percentage_24h_usd || 0).toFixed(2)}%
          </div>
        </div>
        <div className="gm-stat4-card">
          <div className="gm-stat4-title">24H VOLUME</div>
          <div className="gm-stat4-value">{fmtB(g.total_volume?.usd)}</div>
          <div className="gm-stat4-sub">{g.active_cryptocurrencies?.toLocaleString() || '—'} coins</div>
        </div>
        <div className="gm-stat4-card" style={{ background: 'rgba(247,147,26,0.06)', border: '1px solid rgba(247,147,26,0.15)' }}>
          <div className="gm-stat4-title" style={{ color: '#f7931a' }}>BTC DOM</div>
          <div className="gm-stat4-value">{fmtPct(g.market_cap_percentage?.btc)}</div>
          <div className="gm-stat4-sub">ETH {fmtPct(g.market_cap_percentage?.eth)}</div>
        </div>
        <div className="gm-stat4-card" style={{ border: `1px solid ${fgColor}40` }}>
          <div className="gm-stat4-title" style={{ color: fgColor }}>FEAR & GREED</div>
          <div className="gm-stat4-value">{fg.value}</div>
          <div className="gm-stat4-sub" style={{ color: fgColor }}>{fg.label}</div>
        </div>
      </div>
    </div>
  )
}

/* ── Dominance Stacked Bar ──────────────────────────────────────── */
function DominanceBar({ global: g }) {
  if (!g) return null
  const btc    = g.market_cap_percentage?.btc || 0
  const eth    = g.market_cap_percentage?.eth || 0
  const bnb    = g.market_cap_percentage?.bnb || 0
  const sol    = g.market_cap_percentage?.sol || 0
  const xrp    = g.market_cap_percentage?.xrp || 0
  const others = Math.max(0, 100 - btc - eth - bnb - sol - xrp)
  const list   = [
    { name: 'BTC',    pct: btc,    color: DOM_COLORS.BTC },
    { name: 'ETH',    pct: eth,    color: DOM_COLORS.ETH },
    { name: 'BNB',    pct: bnb,    color: DOM_COLORS.BNB },
    { name: 'SOL',    pct: sol,    color: DOM_COLORS.SOL },
    { name: 'XRP',    pct: xrp,    color: DOM_COLORS.XRP },
    { name: 'Others', pct: others, color: DOM_COLORS.Others },
  ]
  return (
    <div className="gm-section">
      <div className="gm-section-hdr">MARKET DOMINANCE</div>
      <div className="gm-dom-stacked">
        {list.map(d => d.pct > 0 && (
          <div key={d.name} style={{ width: d.pct + '%', background: d.color, transition: 'width 0.5s ease' }}
            title={d.name + ' ' + d.pct.toFixed(2) + '%'} />
        ))}
      </div>
      <div className="gm-dom-legend">
        {list.map(d => (
          <div key={d.name} className="gm-dom-legend-item">
            <div className="gm-dom-dot" style={{ background: d.color }} />
            <div>
              <div className="gm-dom-name">{d.name}</div>
              <div className="gm-dom-pct">{d.pct.toFixed(2)}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Mover Row ──────────────────────────────────────────────────── */
function MoverRow({ coin, isGainer }) {
  const tone = isGainer ? '#00e87a' : '#f43f5e'
  const pct  = coin.price_change_percentage_24h || 0
  return (
    <div className="gm-mover-row">
      {coin.image && (
        <img src={coin.image} alt={coin.symbol} className="gm-mover-img"
          onError={e => { e.target.style.display = 'none' }} />
      )}
      <div className="gm-mover-info">
        <div className="gm-mover-sym">{coin.symbol?.toUpperCase()}</div>
        <div className="gm-mover-price">
          ${coin.current_price >= 1 ? coin.current_price.toFixed(2) : coin.current_price?.toFixed(5)}
        </div>
      </div>
      <div className="gm-mover-pct" style={{ color: tone }}>
        {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
      </div>
    </div>
  )
}

/* ── Trending Chip ──────────────────────────────────────────────── */
function TrendingChip({ rank, coin }) {
  return (
    <div className="gm-trend-chip">
      <div className="gm-trend-rank">#{rank}</div>
      {coin.thumb && (
        <img src={coin.thumb} alt={coin.symbol} className="gm-trend-img"
          onError={e => { e.target.style.display = 'none' }} />
      )}
      <div className="gm-trend-sym">{coin.symbol?.toUpperCase()}</div>
      <div className="gm-trend-eye">👁</div>
    </div>
  )
}

/* ── Main Component ─────────────────────────────────────────────── */
export default function GlobalMetrics() {
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
        const [gData, fData, mData, tData] = await Promise.all([gRes.json(), fRes.json(), mRes.json(), tRes.json()])
        if (!alive) return
        setGlobal(gData.data)
        const fgEntry = fData.data?.[0]
        if (fgEntry) setFg({ value: parseInt(fgEntry.value), label: fgEntry.value_classification })
        if (Array.isArray(mData)) setTopCoins(mData)
        if (Array.isArray(tData?.coins)) setTrending(tData.coins.slice(0, 7).map(c => c.item))
      } catch (e) {
        console.error('GlobalMetrics fetch error', e)
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    const t = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const gainers = [...topCoins]
    .filter(c => (c.price_change_percentage_24h || 0) > 0)
    .sort((a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0))
    .slice(0, 5)
  const losers = [...topCoins]
    .filter(c => (c.price_change_percentage_24h || 0) < 0)
    .sort((a, b) => (a.price_change_percentage_24h || 0) - (b.price_change_percentage_24h || 0))
    .slice(0, 5)

  return (
    <div className="gm-page">

      {/* Header */}
      <div className="gm-page-header">
        <div>
          <div className="gm-page-title">Global Metrics</div>
          <div className="gm-page-subtitle">Market Cap · Dominance · Sentiment</div>
        </div>
        {global?.total_market_cap?.usd && (
          <div className="gm-header-mcap">
            <div className="gm-header-mcap-label">TOTAL MCAP</div>
            <div className="gm-header-mcap-value">{fmtB(global.total_market_cap.usd)}</div>
          </div>
        )}
      </div>

      {/* Sentiment gauge */}
      {loading
        ? <div className="gm-sentiment-wrap gm-sentiment-loading"><div className="gm-section-hdr">SENTIMENT · LOADING…</div></div>
        : <GlobalSentiment global={global} fg={fg} />
      }

      {/* Dominance */}
      {!loading && <DominanceBar global={global} />}

      {/* Top Movers */}
      {(gainers.length > 0 || losers.length > 0) && (
        <div className="gm-section">
          <div className="gm-section-hdr">TOP MOVERS · 24H · TOP 100 MCAP</div>
          <div className="gm-movers-grid">
            <div>
              <div className="gm-movers-side-label" style={{ color: '#00e87a' }}>↑ GAINERS</div>
              <div className="gm-movers-list">
                {gainers.map(c => <MoverRow key={c.id} coin={c} isGainer />)}
              </div>
            </div>
            <div>
              <div className="gm-movers-side-label" style={{ color: '#f43f5e' }}>↓ LOSERS</div>
              <div className="gm-movers-list">
                {losers.map(c => <MoverRow key={c.id} coin={c} isGainer={false} />)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trending */}
      {trending.length > 0 && (
        <div className="gm-section">
          <div className="gm-section-hdr">TRENDING · COINGECKO 24H</div>
          <div className="gm-trend-grid">
            {trending.map((c, i) => <TrendingChip key={c.id} rank={i + 1} coin={c} />)}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="gm-section">
        <div className="gm-section-hdr">BTC DOMINANCE <span className="gm-chart-source">CRYPTOCAP:BTC.D</span></div>
        <div className="gm-chart-panel">
          <TVWidget symbol="CRYPTOCAP:BTC.D" height={340} interval="D" />
        </div>
      </div>

      <div className="gm-section">
        <div className="gm-section-hdr">TOTAL CRYPTO MARKET CAP <span className="gm-chart-source">CRYPTOCAP:TOTAL</span></div>
        <div className="gm-chart-panel">
          <TVWidget symbol="CRYPTOCAP:TOTAL" height={380} interval="W" />
        </div>
      </div>

      <div className="gm-section">
        <div className="gm-section-hdr">ALTCOIN MARKET CAP (ex-BTC) <span className="gm-chart-source">CRYPTOCAP:TOTAL2</span></div>
        <div className="gm-chart-panel">
          <TVWidget symbol="CRYPTOCAP:TOTAL2" height={340} interval="W" />
        </div>
      </div>

    </div>
  )
}
