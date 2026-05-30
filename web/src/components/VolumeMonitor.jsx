import { useState, useEffect, useCallback } from 'react'
import { fetchVolumeMonitorFull, formatUSD } from '../services/api'

const COIN_LOGOS = {
  BTC: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png?1696501400',
  ETH: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628',
  SOL: 'https://coin-images.coingecko.com/coins/images/4128/large/solana.png?1718769756',
  XRP: 'https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png?1696501442',
  BNB: 'https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png?1696501970',
  DOGE: 'https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png?1696501409',
  ADA: 'https://coin-images.coingecko.com/coins/images/975/large/cardano.png?1696502090',
  AVAX: 'https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png?1696512369',
  SUI: 'https://coin-images.coingecko.com/coins/images/26375/large/sui-ocean-square.png?1727791290',
  DOT: 'https://coin-images.coingecko.com/coins/images/12171/large/polkadot.jpg?1766533446',
  LINK: 'https://coin-images.coingecko.com/coins/images/877/large/Chainlink_Logo_500.png?1760023405',
  TON: 'https://coin-images.coingecko.com/coins/images/17980/large/photo_2024-09-10_17.09.00.jpeg?1725963446',
  TRX: 'https://coin-images.coingecko.com/coins/images/1094/large/tron-logo.png?1696502193',
  NEAR: 'https://coin-images.coingecko.com/coins/images/10365/large/near.jpg?1696510367',
  APT: 'https://coin-images.coingecko.com/coins/images/26455/large/Aptos-Network-Symbol-Black-RGB-1x.png?1761789140',
  UNI: 'https://coin-images.coingecko.com/coins/images/12504/large/uniswap-logo.png?1720676669',
  ARB: 'https://coin-images.coingecko.com/coins/images/16547/large/arb.jpg?1721358242',
  OP: 'https://coin-images.coingecko.com/coins/images/25244/large/Optimism.png?1696524385',
  ATOM: 'https://coin-images.coingecko.com/coins/images/1481/large/cosmos_hub.png?1696502525',
  PEPE: 'https://coin-images.coingecko.com/coins/images/29850/large/pepe-token.jpeg?1696528776',
  INJ: 'https://coin-images.coingecko.com/coins/images/12882/large/Other_200x200.png?1738782212',
}

function coinLogo(sym) {
  return COIN_LOGOS[sym] ?? `https://assets.coincap.io/assets/icons/${sym.toLowerCase()}@2x.png`
}

function fmtPrice(p) {
  if (!p) return '—'
  if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (p >= 1)    return '$' + p.toFixed(3)
  return '$' + p.toFixed(6)
}

/* ── Rank Badge ─────────────────────────────────────────────────────── */
function RankBadge({ rank }) {
  const cls = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : ''
  return <div className={`vmx-rank-badge ${cls}`}>{rank}</div>
}

/* ── Volume Bar ─────────────────────────────────────────────────────── */
function VolumeBar({ volume, maxVolume }) {
  const pct = maxVolume > 0 ? Math.min((volume / maxVolume) * 100, 100) : 0
  return (
    <div className="vmx-vol-bar-track">
      <div className="vmx-vol-bar-fill" style={{ width: pct + '%' }} />
    </div>
  )
}

/* ── Band Badge ─────────────────────────────────────────────────────── */
function BandBadge({ band, ratio }) {
  if (!band || band === 'normal') return null
  const cls = band === 'spike' ? 'spike' : 'active'
  const label = band === 'spike' ? 'SPIKE' : 'ACTIVE'
  return (
    <span className={`vmx-band-badge ${cls}`}>{label} · {ratio.toFixed(1)}x</span>
  )
}

/* ── Volume Sentiment ───────────────────────────────────────────────── */
function VolumeSentiment({ sentiment, data }) {
  if (!sentiment) {
    return (
      <div className="vmx-sentiment vmx-sentiment-loading">
        <div className="vmx-section-label">SENTIMENT · VOLUME · yükleniyor…</div>
      </div>
    )
  }

  const bullVol = sentiment.bull_volume || 0
  const bearVol = sentiment.bear_volume || 0
  const score   = sentiment.score || 0

  let topBuy = null, topSell = null
  for (const r of (data || [])) {
    const v = r.volume24h || 0
    const p = r.priceChangePct || 0
    if (p >= 0) {
      if (!topBuy || (p * v) > (topBuy.priceChangePct * topBuy.volume24h)) topBuy = r
    } else {
      if (!topSell || (p * v) < (topSell.priceChangePct * topSell.volume24h)) topSell = r
    }
  }

  const verdict = score > 0.3 ? 'BUYING' : score < -0.3 ? 'SELLING' : 'NEUTRAL'
  const tone    = verdict === 'BUYING' ? '#00e87a' : verdict === 'SELLING' ? '#f43f5e' : '#fbbf24'
  const pct     = Math.max(0, Math.min(100, (score + 1) * 50))

  return (
    <div className="vmx-sentiment">
      {/* Header row */}
      <div className="vmx-sentiment-hdr">
        <span className="vmx-section-label">SENTIMENT · VOLUME × PRICE · 24H</span>
        <div className="vmx-sentiment-score">
          <span className="vmx-score-num" style={{ color: tone }}>
            {score >= 0 ? '+' : ''}{score.toFixed(2)}
          </span>
          <span className="vmx-verdict" style={{ color: tone }}>{verdict}</span>
        </div>
      </div>

      {/* Gauge */}
      <div className="vmx-gauge-track">
        <div className="vmx-gauge-bg" />
        <div className="vmx-gauge-mid" />
        <div className="vmx-gauge-dot" style={{ left: pct + '%', background: tone, boxShadow: `0 0 10px ${tone}99` }} />
      </div>
      <div className="vmx-gauge-axis">
        <span>SELLING</span>
        <span>NEUTRAL</span>
        <span>BUYING</span>
      </div>

      {/* 4-stat cards */}
      <div className="vmx-stat4-grid">
        <div className="vmx-stat-card buy">
          <div className="vmx-stat-label">BUY VOLUME</div>
          <div className="vmx-stat-val" style={{ color: '#fff' }}>{formatUSD(bullVol)}</div>
          <div className="vmx-stat-sub">fiyat ↑ hacim</div>
        </div>
        <div className="vmx-stat-card sell">
          <div className="vmx-stat-label" style={{ color: '#f43f5e' }}>SELL VOLUME</div>
          <div className="vmx-stat-val" style={{ color: '#fff' }}>{formatUSD(bearVol)}</div>
          <div className="vmx-stat-sub">fiyat ↓ hacim</div>
        </div>
        <div className="vmx-stat-card buy-soft">
          <div className="vmx-stat-label">TOP BUY</div>
          <div className="vmx-stat-val">{topBuy ? topBuy.symbol : '—'}</div>
          <div className="vmx-stat-sub" style={{ color: '#00e87a' }}>
            {topBuy ? '+' + topBuy.priceChangePct.toFixed(2) + '%' : '—'}
          </div>
        </div>
        <div className="vmx-stat-card sell-soft">
          <div className="vmx-stat-label" style={{ color: '#f43f5e' }}>TOP SELL</div>
          <div className="vmx-stat-val">{topSell ? topSell.symbol : '—'}</div>
          <div className="vmx-stat-sub" style={{ color: '#f43f5e' }}>
            {topSell ? topSell.priceChangePct.toFixed(2) + '%' : '—'}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Major Card ─────────────────────────────────────────────────────── */
function MajorCard({ m }) {
  const [imgErr, setImgErr] = useState(false)
  const isUp = m.priceChangePct >= 0
  const tone = isUp ? '#00e87a' : '#f43f5e'
  return (
    <div className="vmx-major-card">
      <div className="vmx-major-top">
        <div className="vmx-major-identity">
          <div className="vmx-major-logo">
            {!imgErr
              ? <img src={coinLogo(m.symbol)} alt={m.symbol} onError={() => setImgErr(true)} />
              : <span>{m.symbol.slice(0, 2)}</span>
            }
          </div>
          <span className="vmx-major-sym">{m.symbol}</span>
        </div>
        <span className="vmx-major-ratio">{m.ratio.toFixed(1)}x</span>
      </div>
      <div className="vmx-major-chg" style={{ color: tone }}>
        {isUp ? '+' : ''}{m.priceChangePct.toFixed(2)}%
      </div>
      <div className="vmx-major-vol">{formatUSD(m.volume24h)}</div>
    </div>
  )
}

function MajorsStrip({ majors }) {
  if (!majors?.length) return null
  return (
    <div className="vmx-majors-strip">
      {majors.map(m => <MajorCard key={m.symbol} m={m} />)}
    </div>
  )
}

/* ── Coin Row ───────────────────────────────────────────────────────── */
function CoinRow({ row, maxVolume }) {
  const [imgErr, setImgErr] = useState(false)
  const isUp = row.priceChangePct >= 0
  return (
    <div className="vmx-coin-row">
      <RankBadge rank={row.rank} />

      <div className="vmx-logo">
        {!imgErr
          ? <img src={coinLogo(row.symbol)} alt={row.symbol} onError={() => setImgErr(true)} />
          : <span>{row.symbol.slice(0, 3)}</span>
        }
      </div>

      <div className="vmx-name-block">
        <div className="vmx-sym-row">
          <span className="vmx-sym">{row.symbol}</span>
          <span className="vmx-pair">/USDT</span>
          <BandBadge band={row.band} ratio={row.ratio} />
        </div>
        <VolumeBar volume={row.volume24h} maxVolume={maxVolume} />
        <div className="vmx-vol-amount">{formatUSD(row.volume24h)}</div>
      </div>

      <div className="vmx-price-block">
        <div className="vmx-price">{fmtPrice(row.price)}</div>
        <div className={`vmx-change ${isUp ? 'up' : 'dn'}`}>
          {isUp ? '+' : ''}{row.priceChangePct.toFixed(2)}%
        </div>
      </div>
    </div>
  )
}

/* ── Skeleton ───────────────────────────────────────────────────────── */
function Skeleton() {
  return (
    <>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="vmx-skeleton-row">
          <div className="vmx-skel-circle" style={{ width: 26, height: 26 }} />
          <div className="vmx-skel-circle" style={{ width: 40, height: 40 }} />
          <div style={{ flex: 1 }}>
            <div className="vmx-skel-rect" style={{ width: 70, height: 14, marginBottom: 6 }} />
            <div className="vmx-skel-rect" style={{ width: '100%', height: 3 }} />
            <div className="vmx-skel-rect" style={{ width: 90, height: 11, marginTop: 5 }} />
          </div>
          <div>
            <div className="vmx-skel-rect" style={{ width: 80, height: 13, marginBottom: 4 }} />
            <div className="vmx-skel-rect" style={{ width: 55, height: 12 }} />
          </div>
        </div>
      ))}
    </>
  )
}

/* ── Main ───────────────────────────────────────────────────────────── */
export default function VolumeMonitor() {
  const [data,      setData]      = useState([])
  const [majors,    setMajors]    = useState([])
  const [sentiment, setSentiment] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [limit,     setLimit]     = useState(50)
  const [lastUpd,   setLastUpd]   = useState(null)

  const load = useCallback(async () => {
    try {
      const result = await fetchVolumeMonitorFull(limit)
      if (result?.items?.length) {
        setData(result.items)
        setMajors(result.majors || [])
        setSentiment(result.sentiment || null)
        setLastUpd(new Date())
      }
    } catch (e) {
      console.warn('Volume fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    setLoading(true)
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  const maxVolume  = data.length ? Math.max(...data.map(d => d.volume24h)) : 1
  const totalVolume = data.reduce((s, d) => s + d.volume24h, 0)
  const LIMIT_OPTIONS = [25, 50, 75, 100]

  return (
    <div className="vmx-page">

      {/* Header */}
      <div className="vmx-page-header">
        <div>
          <div className="vmx-page-title">Volume Monitor</div>
          <div className="vmx-page-subtitle">
            <span className="vmx-live-dot" />
            Binance Perp · Anomaly · 24h vs 7g avg
            {lastUpd && (
              <span className="vmx-updated">
                ↻ {lastUpd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
        <div className="vmx-toolbar-right">
          {totalVolume > 0 && (
            <div className="vmx-total-vol">
              <span className="vmx-total-label">TOP {limit}</span>
              <span className="vmx-total-num">{formatUSD(totalVolume)}</span>
            </div>
          )}
          <div className="vmx-limit-btns">
            {LIMIT_OPTIONS.map(n => (
              <button
                key={n}
                className={`vmx-limit-btn ${limit === n ? 'active' : ''}`}
                onClick={() => setLimit(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sentiment panel */}
      <VolumeSentiment sentiment={sentiment} data={data} />

      {/* Majors strip */}
      <MajorsStrip majors={majors} />

      {/* Column labels */}
      <div className="vmx-col-labels">
        <span style={{ width: 26 }}>#</span>
        <span style={{ width: 40 }} />
        <span style={{ flex: 1 }}>SYMBOL · VOLUME</span>
        <span>PRICE · CHANGE</span>
      </div>

      {/* List */}
      <div className="vmx-coin-list">
        {loading ? <Skeleton /> : data.map(row => (
          <CoinRow key={row.symbol} row={row} maxVolume={maxVolume} />
        ))}
      </div>

    </div>
  )
}
