import { useState, useEffect, useCallback } from 'react'
import { haptic } from '../../capacitor'
import { fetchVolumeMonitorFull, formatUSD } from '../../services/api'

const COIN_LOGOS = {
  BTC:'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png?1696501400',
  ETH:'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628',
  SOL:'https://coin-images.coingecko.com/coins/images/4128/large/solana.png?1718769756',
  XRP:'https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png?1696501442',
  BNB:'https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png?1696501970',
  DOGE:'https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png?1696501409',
  ADA:'https://coin-images.coingecko.com/coins/images/975/large/cardano.png?1696502090',
  AVAX:'https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png?1696512369',
  HYPE:'https://coin-images.coingecko.com/coins/images/50882/large/hyperliquid.jpg?1729431300',
  SUI:'https://coin-images.coingecko.com/coins/images/26375/large/sui-ocean-square.png?1727791290',
  DOT:'https://coin-images.coingecko.com/coins/images/12171/large/polkadot.jpg?1766533446',
  LINK:'https://coin-images.coingecko.com/coins/images/877/large/Chainlink_Logo_500.png?1760023405',
  TON:'https://coin-images.coingecko.com/coins/images/17980/large/photo_2024-09-10_17.09.00.jpeg?1725963446',
  TRX:'https://coin-images.coingecko.com/coins/images/1094/large/tron-logo.png?1696502193',
  NEAR:'https://coin-images.coingecko.com/coins/images/10365/large/near.jpg?1696510367',
  APT:'https://coin-images.coingecko.com/coins/images/26455/large/Aptos-Network-Symbol-Black-RGB-1x.png?1761789140',
  UNI:'https://coin-images.coingecko.com/coins/images/12504/large/uniswap-logo.png?1720676669',
  ARB:'https://coin-images.coingecko.com/coins/images/16547/large/arb.jpg?1721358242',
  OP:'https://coin-images.coingecko.com/coins/images/25244/large/Optimism.png?1696524385',
  ATOM:'https://coin-images.coingecko.com/coins/images/1481/large/cosmos_hub.png?1696502525',
  PEPE:'https://coin-images.coingecko.com/coins/images/29850/large/pepe-token.jpeg?1696528776',
  WIF:'https://coin-images.coingecko.com/coins/images/33566/large/dogwifhat.jpg?1702499428',
  INJ:'https://coin-images.coingecko.com/coins/images/12882/large/Other_200x200.png?1738782212',
  TAO:'https://coin-images.coingecko.com/coins/images/28452/large/ARUsPeNQ_400x400.jpeg?1696527447',
  WLD:'https://coin-images.coingecko.com/coins/images/31069/large/worldcoin.jpeg?1696529903',
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

// ─── Rank Badge ───────────────────────────────────────────────────────────────
function RankBadge({ rank }) {
  const colors = { 1: '#f0b90b', 2: '#e8e8e8', 3: '#cd7f32' }
  const color  = colors[rank] || '#333'
  return (
    <div style={{
      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
      background: rank <= 3 ? `${color}22` : 'rgba(255,255,255,0.04)',
      border: `1px solid ${rank <= 3 ? color + '44' : 'transparent'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10, fontWeight: 800, fontFamily: 'var(--mono)',
      color: rank <= 3 ? color : '#444',
    }}>
      {rank}
    </div>
  )
}

// ─── Volume Bar ───────────────────────────────────────────────────────────────
function VolumeBar({ volume, maxVolume }) {
  const pct = maxVolume > 0 ? Math.min((volume / maxVolume) * 100, 100) : 0
  return (
    <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
      <div style={{
        height: '100%', borderRadius: 2,
        width: pct + '%',
        background: 'linear-gradient(90deg, #00d992, #00d99280)',
        transition: 'width 0.4s ease',
      }} />
    </div>
  )
}

// ─── Volume Sentiment Gauge ─────────────────────────────────────────────────
// Skor backend'den geliyor: top 100 evrenden hesaplanıyor (sadece gösterilen
// anomaly listesinden değil). Böylece BTC/ETH gibi büyük ama sakin coinler de
// piyasa yönüne ağırlık verir. TOP BUY / TOP SELL hâlâ gösterilen listeden
// türetilir — "şu an dikkat çeken hareketler" mantığı.
function VolumeSentiment({ sentiment, data }) {
  if (!sentiment) {
    return (
      <div style={{ padding: '12px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ fontSize: 10, color: '#555', fontWeight: 700, letterSpacing: 0.5 }}>
          SENTIMENT · VOLUME · yükleniyor…
        </div>
      </div>
    )
  }
  const bullVol = sentiment.bull_volume || 0
  const bearVol = sentiment.bear_volume || 0
  const score = sentiment.score || 0
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
  const verdict = score >  0.3 ? 'BUYING'
                : score < -0.3 ? 'SELLING'
                :                'NEUTRAL'
  const tone = verdict === 'BUYING'  ? '#00d992'
             : verdict === 'SELLING' ? '#f43f5e'
             :                          '#aaa'
  const pct = Math.max(0, Math.min(100, (score + 1) * 50))

  return (
    <div style={{ padding: '12px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8 }}>
          SENTIMENT · VOLUME × PRICE · 24H
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

      {/* Gauge bar */}
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
        <span>SELLING</span>
        <span>NÖTR</span>
        <span>BUYING</span>
      </div>

      {/* 4-card sub-panel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        <div style={{
          background: 'rgba(0,217,146,0.06)', border: '1px solid rgba(0,217,146,0.15)',
          borderRadius: 10, padding: '8px 8px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#00d992', letterSpacing: 0.5 }}>BUY VOLUME</div>
          <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff', marginTop: 3 }}>
            {formatUSD(bullVol)}
          </div>
          <div style={{ fontSize: 9, color: '#888', fontFamily: 'var(--mono)', marginTop: 1 }}>fiyat ↑ hacim</div>
        </div>
        <div style={{
          background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.15)',
          borderRadius: 10, padding: '8px 8px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#f43f5e', letterSpacing: 0.5 }}>SELL VOLUME</div>
          <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff', marginTop: 3 }}>
            {formatUSD(bearVol)}
          </div>
          <div style={{ fontSize: 9, color: '#888', fontFamily: 'var(--mono)', marginTop: 1 }}>fiyat ↓ hacim</div>
        </div>
        <div style={{
          background: 'rgba(0,217,146,0.04)', border: '1px solid rgba(0,217,146,0.1)',
          borderRadius: 10, padding: '8px 8px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#00d992', letterSpacing: 0.5 }}>TOP BUY</div>
          <div style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff', marginTop: 3 }}>
            {topBuy ? topBuy.symbol : '—'}
          </div>
          <div style={{ fontSize: 9, color: '#00d992', fontFamily: 'var(--mono)', marginTop: 1 }}>
            {topBuy ? '+' + topBuy.priceChangePct.toFixed(2) + '%' : '—'}
          </div>
        </div>
        <div style={{
          background: 'rgba(244,63,94,0.04)', border: '1px solid rgba(244,63,94,0.1)',
          borderRadius: 10, padding: '8px 8px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#f43f5e', letterSpacing: 0.5 }}>TOP SELL</div>
          <div style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff', marginTop: 3 }}>
            {topSell ? topSell.symbol : '—'}
          </div>
          <div style={{ fontSize: 9, color: '#f43f5e', fontFamily: 'var(--mono)', marginTop: 1 }}>
            {topSell ? topSell.priceChangePct.toFixed(2) + '%' : '—'}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Majors Strip — BTC/ETH/SOL/BNB her zaman üstte ─────────────────────────
function MajorCard({ m }) {
  const [imgErr, setImgErr] = useState(false)
  const isUp = m.priceChangePct >= 0
  const tone = isUp ? '#00d992' : '#f43f5e'
  return (
    <div style={{
      flex: '0 0 auto', minWidth: 108,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 10, padding: '8px 10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(255,255,255,0.05)', overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {!imgErr
              ? <img src={coinLogo(m.symbol)} alt={m.symbol}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={() => setImgErr(true)} />
              : <span style={{ fontSize: 8, fontWeight: 800, color: '#555' }}>{m.symbol.slice(0,2)}</span>
            }
          </div>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#ddd', letterSpacing: 0.3 }}>
            {m.symbol}
          </span>
        </div>
        <span style={{ fontSize: 9, color: '#666', fontFamily: 'var(--mono)', fontWeight: 700 }}>
          {m.ratio.toFixed(1)}x
        </span>
      </div>
      <div style={{
        fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)', color: tone, marginTop: 3,
      }}>
        {isUp ? '+' : ''}{m.priceChangePct.toFixed(2)}%
      </div>
      <div style={{ fontSize: 9, color: '#555', fontFamily: 'var(--mono)', marginTop: 1 }}>
        {formatUSD(m.volume24h)}
      </div>
    </div>
  )
}

function MajorsStrip({ majors }) {
  if (!majors || !majors.length) return null
  return (
    <div style={{
      display: 'flex', gap: 6, padding: '10px 20px',
      overflowX: 'auto', borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      {majors.map(m => <MajorCard key={m.symbol} m={m} />)}
    </div>
  )
}

// ─── Band Badge — anomaly bandı (spike/active/normal) ───────────────────────
function BandBadge({ band, ratio }) {
  if (!band || band === 'normal') return null
  const isSpike = band === 'spike'
  const color   = isSpike ? '#f0b90b' : '#00d992'
  const label   = isSpike ? 'SPIKE' : 'ACTIVE'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 6px', borderRadius: 6,
      background: color + '1a', border: `1px solid ${color}33`,
      fontSize: 9, fontWeight: 800, color, letterSpacing: 0.4,
      fontFamily: 'var(--mono)',
    }}>
      {label} · {ratio.toFixed(1)}x
    </span>
  )
}

// ─── Coin Row ─────────────────────────────────────────────────────────────────
function CoinRow({ row, maxVolume }) {
  const [imgErr, setImgErr] = useState(false)
  const isUp = row.priceChangePct >= 0

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <RankBadge rank={row.rank} />

      {/* Logo */}
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: 'rgba(255,255,255,0.05)', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!imgErr
          ? <img src={coinLogo(row.symbol)} alt={row.symbol}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => setImgErr(true)} />
          : <span style={{ fontSize: 11, fontWeight: 800, color: '#555' }}>{row.symbol.slice(0,3)}</span>
        }
      </div>

      {/* Symbol + volume bar */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{row.symbol}
            <span style={{ fontSize: 11, color: '#444', fontWeight: 500 }}>/USDT</span>
          </span>
          <BandBadge band={row.band} ratio={row.ratio} />
        </div>
        <VolumeBar volume={row.volume24h} maxVolume={maxVolume} />
        <div style={{ fontSize: 11, color: '#00d992', fontWeight: 700, fontFamily: 'var(--mono)', marginTop: 3 }}>
          {formatUSD(row.volume24h)}
        </div>
      </div>

      {/* Price + change */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: '#fff' }}>
          {fmtPrice(row.price)}
        </div>
        <div style={{
          fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)',
          color: isUp ? '#00d992' : '#f43f5e', marginTop: 2,
        }}>
          {isUp ? '+' : ''}{row.priceChangePct.toFixed(2)}%
        </div>
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 14, width: 60, borderRadius: 4, background: 'rgba(255,255,255,0.06)', marginBottom: 6 }} />
            <div style={{ height: 3,  width: '100%', borderRadius: 2, background: 'rgba(255,255,255,0.04)' }} />
            <div style={{ height: 11, width: 80, borderRadius: 4, background: 'rgba(255,255,255,0.05)', marginTop: 5 }} />
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ height: 13, width: 70, borderRadius: 4, background: 'rgba(255,255,255,0.06)', marginBottom: 4 }} />
            <div style={{ height: 12, width: 45, borderRadius: 4, background: 'rgba(255,255,255,0.05)' }} />
          </div>
        </div>
      ))}
    </>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function VolumeMonitorScreen() {
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
    } catch {}
    finally { setLoading(false) }
  }, [limit])

  useEffect(() => {
    setLoading(true)
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  const maxVolume = data.length ? Math.max(...data.map(d => d.volume24h)) : 1
  const totalVolume = data.reduce((s, d) => s + d.volume24h, 0)

  const limitOptions = [25, 50, 75, 100]

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', color: 'var(--text)', paddingBottom: 24 }}>

      {/* Header */}
      <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Volume Monitor</div>
            <div style={{ fontSize: 11, color: '#444', marginTop: 2 }}>
              Anomaly · top 100 perp · 24h vs 7g ·{' '}
              {lastUpd && <span style={{ color: '#555' }}>
                {lastUpd.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>}
            </div>
          </div>

          {/* Limit selector */}
          <div style={{ display: 'flex', gap: 4 }}>
            {limitOptions.map(n => (
              <button key={n}
                onClick={() => { haptic('light'); setLimit(n) }}
                style={{
                  padding: '5px 9px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                  background: limit === n ? 'rgba(0,217,146,0.15)' : 'rgba(255,255,255,0.05)',
                  color: limit === n ? '#00d992' : '#555',
                }}>
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Total volume */}
        {totalVolume > 0 && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 11, color: '#444', fontWeight: 600 }}>TOP {limit} TOPLAM</span>
            <span style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--mono)', color: '#00d992' }}>
              {formatUSD(totalVolume)}
            </span>
          </div>
        )}
      </div>

      {/* Volume sentiment — backend top-100 universe (BTC/ETH dahil) */}
      <VolumeSentiment sentiment={sentiment} data={data} />

      {/* Majors strip — BTC/ETH/SOL/BNB her zaman görünsün */}
      <MajorsStrip majors={majors} />

      {/* Column labels */}
      <div style={{ display: 'flex', padding: '8px 20px', fontSize: 10, fontWeight: 700, color: '#333', letterSpacing: 0.5 }}>
        <div style={{ width: 22, marginRight: 12 }}>#</div>
        <div style={{ width: 36, marginRight: 12 }} />
        <div style={{ flex: 1 }}>SEMBOL · HACİM</div>
        <div style={{ textAlign: 'right' }}>FİYAT · DEĞİŞİM</div>
      </div>

      {/* List */}
      {loading
        ? <Skeleton />
        : data.map(row => <CoinRow key={row.symbol} row={row} maxVolume={maxVolume} />)
      }
    </div>
  )
}
