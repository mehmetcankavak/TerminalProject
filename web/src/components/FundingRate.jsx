import { useState, useEffect, useCallback, useMemo } from 'react'
import { API_BASE } from '../config'

const REFRESH_MS = 30_000

const COINS = [
  'BTC','ETH','SOL','XRP','BNB','DOGE','ADA','AVAX','HYPE','SUI',
  'DOT','LINK','TON','TRX','NEAR','APT','LTC','BCH','UNI','ARB',
  'OP','ATOM','POL','INJ','TIA','SEI','JUP','PYTH','WIF','PEPE',
  'RNDR','IMX','LDO','STX','ORDI','WLD','PENDLE','GMX','DYDX','AAVE',
  'SNX','CRV','ENA','COMP','SUSHI','ENS','BLUR','GALA','SAND','AXS',
  'ICP','S','ALGO','HBAR','ETC','XLM','TAO','EIGEN','CELO','IOTA',
  'NEO','ZEC','DASH','STRK','JTO','ONDO',
  'SKY','W','APE','AR','NOT','CFX','GMT','MINA','TRB','RSR',
  'YGG','VIRTUAL','AERO','ZRO','BERA','PNUT','ETHFI','MOVE','BOME','BRETT',
  'MEW','PENGU','POPCAT','PEOPLE','ZETA','TURBO','KAITO','GRASS','MOODENG','ME','SPX',
]

const EXCHANGES = [
  { key: 'binance',     label: 'Binance',  short: 'BIN', color: '#f0b90b', logo: 'https://s2.coinmarketcap.com/static/img/exchanges/64x64/270.png',  interval: 8 },
  { key: 'okx',         label: 'OKX',      short: 'OKX', color: '#e8e8e8', logo: 'https://s2.coinmarketcap.com/static/img/exchanges/64x64/294.png',  interval: 8 },
  { key: 'bybit',       label: 'Bybit',    short: 'BBT', color: '#f7a600', logo: 'https://s2.coinmarketcap.com/static/img/exchanges/64x64/521.png',  interval: 8 },
  { key: 'bitget',      label: 'Bitget',   short: 'BG',  color: '#00c9a7', logo: 'https://s2.coinmarketcap.com/static/img/exchanges/64x64/513.png',  interval: 8 },
  { key: 'hyperliquid', label: 'HyperLiq', short: 'HL',  color: '#9b5de5', logo: 'https://app.hyperliquid.xyz/apple-touch-icon.png',                interval: 1 },
]

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
  LTC:'https://coin-images.coingecko.com/coins/images/2/large/litecoin.png?1696501400',
  BCH:'https://coin-images.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png?1696501932',
  UNI:'https://coin-images.coingecko.com/coins/images/12504/large/uniswap-logo.png?1720676669',
  ARB:'https://coin-images.coingecko.com/coins/images/16547/large/arb.jpg?1721358242',
  OP:'https://coin-images.coingecko.com/coins/images/25244/large/Optimism.png?1696524385',
  ATOM:'https://coin-images.coingecko.com/coins/images/1481/large/cosmos_hub.png?1696502525',
  POL:'https://coin-images.coingecko.com/coins/images/32440/large/pol.png?1759114181',
  INJ:'https://coin-images.coingecko.com/coins/images/12882/large/Other_200x200.png?1738782212',
  TIA:'https://coin-images.coingecko.com/coins/images/31967/large/tia.jpg?1696530772',
  SEI:'https://coin-images.coingecko.com/coins/images/28205/large/Sei_Logo_-_Transparent.png?1696527207',
  JUP:'https://coin-images.coingecko.com/coins/images/34188/large/jup.png?1704266489',
  PYTH:'https://coin-images.coingecko.com/coins/images/31924/large/pyth.png?1701245725',
  WIF:'https://coin-images.coingecko.com/coins/images/33566/large/dogwifhat.jpg?1702499428',
  PEPE:'https://coin-images.coingecko.com/coins/images/29850/large/pepe-token.jpeg?1696528776',
  RNDR:'https://coin-images.coingecko.com/coins/images/11636/large/rndr.png?1696511529',
  IMX:'https://coin-images.coingecko.com/coins/images/17233/large/immutableX-symbol-BLK-RGB.png?1696516787',
  LDO:'https://coin-images.coingecko.com/coins/images/13573/large/Lido_DAO.png?1696513326',
  STX:'https://coin-images.coingecko.com/coins/images/2069/large/Stacks_Logo_png.png?1709979332',
  ORDI:'https://coin-images.coingecko.com/coins/images/30162/large/ordi.png?1696529082',
  WLD:'https://coin-images.coingecko.com/coins/images/31069/large/worldcoin.jpeg?1696529903',
  PENDLE:'https://coin-images.coingecko.com/coins/images/15069/large/Pendle_Logo_Normal-03.png?1696514728',
  GMX:'https://coin-images.coingecko.com/coins/images/18323/large/arbit.png?1696517814',
  DYDX:'https://coin-images.coingecko.com/coins/images/32594/large/dydx.png?1698673495',
  AAVE:'https://coin-images.coingecko.com/coins/images/12645/large/aave-token-round.png?1720472354',
}

const SYM_ALIAS = { RENDER:'RNDR', XBT:'BTC', MATIC:'POL', FTM:'S', SONIC:'S', kPEPE:'PEPE' }
function normSym(raw) {
  let s = raw
  if (s.startsWith('1000000')) s = s.slice(7)
  else if (s.startsWith('1000')) s = s.slice(4)
  if (s.endsWith('1000')) s = s.slice(0, -4)
  return SYM_ALIAS[s] ?? s
}

function fmtRate(r) {
  if (r == null || isNaN(r)) return null
  return (r >= 0 ? '+' : '') + (r * 100).toFixed(4) + '%'
}
function rateColor(r) {
  if (r == null || isNaN(r)) return 'rgba(255,255,255,0.2)'
  if (r > 0) return '#00e87a'
  if (r < 0) return '#f43f5e'
  return 'rgba(255,255,255,0.35)'
}
function msUntilNext(intervalHours) {
  const ms = intervalHours * 3_600_000
  return ms - (Date.now() % ms)
}
function fmtCountdown(ms) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m`
  return `${String(m).padStart(2,'0')}m ${String(sec).padStart(2,'0')}s`
}

// ─── Fallback direct fetchers ─────────────────────────────────────────────────
async function fetchBinance() {
  const res = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex')
  const data = await res.json()
  const out = {}
  for (const d of data) {
    const sym = normSym(d.symbol.replace('USDT','').replace('BUSD',''))
    out[sym] = { rate: parseFloat(d.lastFundingRate) }
  }
  return out
}
async function fetchBybit() {
  const res = await fetch('https://api.bybit.com/v5/market/tickers?category=linear&limit=300')
  const json = await res.json()
  const out = {}
  for (const d of (json.result?.list ?? [])) {
    if (!d.symbol.endsWith('USDT') || !d.fundingRate) continue
    out[normSym(d.symbol.replace('USDT',''))] = { rate: parseFloat(d.fundingRate) }
  }
  return out
}
async function fetchOKX() {
  const out = {}
  try {
    const r1 = await fetch('https://www.okx.com/api/v5/public/instruments?instType=SWAP')
    const j1 = await r1.json()
    const instMap = {}
    for (const d of (j1.data || [])) {
      if (!d.instId?.endsWith('-USDT-SWAP')) continue
      instMap[normSym(d.instId.replace('-USDT-SWAP',''))] = d.instId
    }
    await Promise.allSettled(COINS.map(async coin => {
      const instId = instMap[coin]; if (!instId) return
      try {
        const r = await fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${instId}`)
        const j = await r.json()
        const d = j.data?.[0]
        if (d?.fundingRate != null) out[coin] = { rate: parseFloat(d.fundingRate) }
      } catch {}
    }))
  } catch {
    await Promise.allSettled(COINS.slice(0,40).map(async coin => {
      try {
        const r = await fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${coin}-USDT-SWAP`)
        const j = await r.json()
        const d = j.data?.[0]
        if (d?.fundingRate != null) out[coin] = { rate: parseFloat(d.fundingRate) }
      } catch {}
    }))
  }
  return out
}
async function fetchHL() {
  const res = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
  })
  const [meta, ctxs] = await res.json()
  const out = {}
  meta.universe.forEach((asset, i) => {
    const ctx = ctxs[i]
    if (ctx?.funding != null) out[normSym(asset.name)] = { rate: parseFloat(ctx.funding) }
  })
  return out
}
async function fetchBitget() {
  try {
    const res = await fetch('https://api.bitget.com/api/v2/mix/market/tickers?productType=usdt-futures')
    const json = await res.json()
    const out = {}
    for (const d of (json.data || [])) {
      const raw = d.symbol?.replace('USDT',''); if (!raw) continue
      if (d.fundingRate != null) out[normSym(raw)] = { rate: parseFloat(d.fundingRate) }
    }
    return out
  } catch { return {} }
}
const FETCHERS = { binance: fetchBinance, okx: fetchOKX, bybit: fetchBybit, bitget: fetchBitget, hyperliquid: fetchHL }

// ─── Countdown Strip ──────────────────────────────────────────────────────────
function CountdownStrip({ data }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{
      display: 'flex', gap: 8, padding: '14px 20px',
      overflowX: 'auto', flexWrap: 'nowrap', scrollbarWidth: 'none',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      {EXCHANGES.map(ex => {
        const remaining = msUntilNext(ex.interval)
        const pct = 1 - remaining / (ex.interval * 3_600_000)
        const urgent = remaining < 15 * 60_000
        const rates = Object.values(data[ex.key] || {}).map(d => d.rate).filter(r => r != null)
        const avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null
        return (
          <div key={ex.key} style={{
            flexShrink: 0, minWidth: 110,
            background: urgent ? 'rgba(244,63,94,0.06)' : 'rgba(255,255,255,0.025)',
            border: `1px solid ${urgent ? 'rgba(244,63,94,0.22)' : 'rgba(255,255,255,0.07)'}`,
            borderRadius: 12, padding: '10px 12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
              <img src={ex.logo} alt={ex.label} width={14} height={14}
                style={{ borderRadius: 3, objectFit: 'cover', flexShrink: 0 }}
                onError={e => { e.target.style.display = 'none' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>{ex.short}</span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>{ex.interval}h</span>
            </div>
            <div style={{
              fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)',
              color: urgent ? '#f43f5e' : 'var(--text-0)', marginBottom: 6,
            }}>
              {fmtCountdown(remaining)}
            </div>
            <div style={{ height: 2, background: 'rgba(255,255,255,0.07)', borderRadius: 1, marginBottom: 5 }}>
              <div style={{
                height: '100%', borderRadius: 1, transition: 'width 1s linear',
                width: pct * 100 + '%',
                background: urgent ? '#f43f5e' : '#00e87a',
              }} />
            </div>
            {avg != null && (
              <div style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: rateColor(avg) }}>
                {avg >= 0 ? '+' : ''}{(avg * 100).toFixed(4)}%
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Funding Sentiment Gauge ──────────────────────────────────────────────────
function FundingSentiment({ sentiment }) {
  if (!sentiment) {
    return (
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', fontWeight: 700, letterSpacing: 0.5 }}>
          SENTIMENT · FUNDING · loading…
        </div>
      </div>
    )
  }
  const tone = sentiment.verdict === 'BULLISH' ? '#00e87a'
             : sentiment.verdict === 'BEARISH' ? '#f43f5e'
             :                                   '#aaa'
  const pct = Math.max(0, Math.min(100, (sentiment.score + 1) * 50))
  const avgPct = (sentiment.avg_rate * 100).toFixed(4)

  return (
    <div style={{ padding: '14px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', fontWeight: 700, letterSpacing: 0.8 }}>
          SENTIMENT · FUNDING
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-mono)', color: tone }}>
            {sentiment.score >= 0 ? '+' : ''}{sentiment.score.toFixed(2)}
          </span>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.6, color: tone }}>{sentiment.verdict}</span>
        </div>
      </div>

      <div style={{ position: 'relative', height: 8, marginBottom: 8 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 4,
          background: 'linear-gradient(to right, rgba(244,63,94,0.5) 0%, rgba(244,63,94,0.15) 35%, rgba(255,255,255,0.06) 50%, rgba(0,232,122,0.15) 65%, rgba(0,232,122,0.5) 100%)',
        }} />
        <div style={{ position: 'absolute', top: -2, bottom: -2, left: '50%', width: 1, background: 'rgba(255,255,255,0.18)', transform: 'translateX(-50%)' }} />
        <div style={{
          position: 'absolute', top: '50%', left: pct + '%',
          width: 12, height: 12, borderRadius: '50%', background: tone,
          boxShadow: `0 0 10px ${tone}99`, border: '2px solid #000',
          transform: 'translate(-50%, -50%)',
          transition: 'left 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'rgba(255,255,255,0.2)', fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>
        <span>BEARISH</span><span>NEUTRAL</span><span>BULLISH</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <div style={{ background: 'rgba(0,232,122,0.06)', border: '1px solid rgba(0,232,122,0.15)', borderRadius: 10, padding: '10px 10px' }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#00e87a', letterSpacing: 0.5, marginBottom: 4 }}>OVERSOLD</div>
          <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-0)', marginBottom: 2 }}>{sentiment.oversold_count}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)' }}>
            {sentiment.top_oversold?.[0]
              ? sentiment.top_oversold[0].symbol + ' ' + (sentiment.top_oversold[0].avg_rate * 100).toFixed(3) + '%'
              : '—'}
          </div>
        </div>
        <div style={{ background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.15)', borderRadius: 10, padding: '10px 10px' }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#f43f5e', letterSpacing: 0.5, marginBottom: 4 }}>OVERBOUGHT</div>
          <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-0)', marginBottom: 2 }}>{sentiment.overbought_count}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)' }}>
            {sentiment.top_overbought?.[0]
              ? sentiment.top_overbought[0].symbol + ' +' + (sentiment.top_overbought[0].avg_rate * 100).toFixed(3) + '%'
              : '—'}
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 10px' }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5, marginBottom: 4 }}>AVG RATE</div>
          <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: sentiment.avg_rate >= 0 ? '#f43f5e' : '#00e87a', marginBottom: 2 }}>
            {sentiment.avg_rate >= 0 ? '+' : ''}{avgPct}%
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)' }}>{sentiment.total_symbols} coins</div>
        </div>
        <div style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: 10, padding: '10px 10px' }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#fbbf24', letterSpacing: 0.5, marginBottom: 4 }}>ARB OPPS</div>
          <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-0)', marginBottom: 2 }}>{sentiment.arb_count}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)' }}>
            {sentiment.top_arb?.[0]
              ? sentiment.top_arb[0].symbol + ' Δ' + (sentiment.top_arb[0].spread * 100).toFixed(3) + '%'
              : '—'}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── History Chart ────────────────────────────────────────────────────────────
function HistoryChart({ coin }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true); setHistory([])
    fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${coin}USDT&limit=90`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setHistory(data.map(d => ({ time: d.fundingTime, rate: parseFloat(d.fundingRate) })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [coin])

  if (loading) return <div style={{ padding: '20px 0', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>Loading…</div>
  if (!history.length) return <div style={{ padding: '16px 0', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>No data</div>

  const rates  = history.map(d => d.rate)
  const maxAbs = Math.max(...rates.map(Math.abs), 0.0001)
  const last24 = rates.slice(-24)
  const avg    = last24.reduce((a, b) => a + b, 0) / last24.length
  const annual = avg * 3 * 365
  const W = 100, H = 52
  const barW = Math.max(0.8, (W / rates.length) - 0.3)

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontWeight: 600 }}>Binance · Last 90 periods</span>
        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: annual >= 0 ? '#00e87a' : '#f43f5e' }}>
          ~{(annual * 100).toFixed(1)}% annualized
        </span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="56" preserveAspectRatio="none" style={{ display: 'block' }}>
          <line x1="0" y1={H/2} x2={W} y2={H/2} stroke="rgba(255,255,255,0.06)" strokeWidth="0.3" />
          {rates.map((r, i) => {
            const pct  = Math.abs(r) / maxAbs
            const barH = Math.max(0.5, pct * (H / 2 - 2))
            const x    = (i / rates.length) * W
            const y    = r >= 0 ? H / 2 - barH : H / 2
            return <rect key={i} x={x} y={y} width={barW} height={barH}
              fill={r >= 0 ? 'rgba(0,232,122,0.8)' : 'rgba(244,63,94,0.8)'} />
          })}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
          <span>{new Date(history[0].time).toLocaleDateString('en-US', { day:'numeric', month:'short' })}</span>
          <span>{new Date(history[Math.floor(history.length/2)].time).toLocaleDateString('en-US', { day:'numeric', month:'short' })}</span>
          <span>{new Date(history[history.length-1].time).toLocaleDateString('en-US', { day:'numeric', month:'short' })}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Countdown Badge (in detail view) ────────────────────────────────────────
function CountdownBadge({ interval }) {
  const [ms, setMs] = useState(() => msUntilNext(interval))
  useEffect(() => {
    const id = setInterval(() => setMs(msUntilNext(interval)), 1000)
    return () => clearInterval(id)
  }, [interval])
  const urgent = ms < 15 * 60_000
  return (
    <div style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: urgent ? '#f43f5e' : 'rgba(255,255,255,0.28)' }}>
      {fmtCountdown(ms)}
    </div>
  )
}

// ─── Coin Detail Page ─────────────────────────────────────────────────────────
function CoinDetail({ coin, data, onBack, isFav, onToggleFav }) {
  const logo = COIN_LOGOS[coin]
  const [imgErr, setImgErr] = useState(false)
  const [showChart, setShowChart] = useState(false)

  const rates      = EXCHANGES.map(ex => ({ ...ex, rate: data[ex.key]?.[coin]?.rate ?? null }))
  const validRates = rates.filter(r => r.rate != null)
  const avgRate    = validRates.length ? validRates.reduce((a, b) => a + b.rate, 0) / validRates.length : null
  const maxRate    = validRates.length ? Math.max(...validRates.map(r => r.rate)) : null
  const minRate    = validRates.length ? Math.min(...validRates.map(r => r.rate)) : null
  const spread     = maxRate != null && minRate != null ? maxRate - minRate : null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-0)', color: 'var(--text-0)', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <button onClick={onBack}
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: 'var(--text-0)', fontSize: 16, cursor: 'pointer', padding: '6px 10px', lineHeight: 1, marginRight: 14 }}>
          ←
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {!imgErr && logo
              ? <img src={logo} alt={coin} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setImgErr(true)} />
              : <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.3)' }}>{coin.slice(0,3)}</span>
            }
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{coin}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Perpetual Funding Rate</div>
          </div>
        </div>
        <button onClick={() => onToggleFav(coin)}
          style={{ background: 'none', border: 'none', color: isFav ? '#f59e0b' : 'rgba(255,255,255,0.2)', fontSize: 22, cursor: 'pointer', padding: 0 }}>
          ★
        </button>
      </div>

      {/* Summary stats */}
      {avgRate != null && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '16px 20px 8px' }}>
          {[
            { label: 'AVG RATE', val: fmtRate(avgRate), color: rateColor(avgRate) },
            { label: 'HIGHEST',  val: fmtRate(maxRate), color: rateColor(maxRate) },
            { label: 'LOWEST',   val: fmtRate(minRate), color: rateColor(minRate) },
            { label: 'SPREAD',   val: spread != null ? 'Δ' + (spread * 100).toFixed(4) + '%' : '—', color: spread != null && spread >= 0.0003 ? '#fbbf24' : 'rgba(255,255,255,0.35)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', fontWeight: 700, letterSpacing: 0.6, marginBottom: 5 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Exchange cards */}
      <div style={{ padding: '8px 20px' }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>EXCHANGE RATES</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rates.map(ex => (
            <div key={ex.key} style={{
              display: 'flex', alignItems: 'center',
              background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 12, padding: '12px 16px',
            }}>
              <img src={ex.logo} alt={ex.label} width={22} height={22}
                style={{ borderRadius: 4, objectFit: 'cover', flexShrink: 0, marginRight: 12 }}
                onError={e => { e.target.style.display = 'none' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-0)' }}>{ex.label}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>Every {ex.interval}h</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-mono)', color: ex.rate != null ? rateColor(ex.rate) : 'rgba(255,255,255,0.2)' }}>
                  {ex.rate != null ? fmtRate(ex.rate) : '—'}
                </div>
                <CountdownBadge interval={ex.interval} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* History chart toggle */}
      <div style={{ padding: '12px 20px 24px' }}>
        <button onClick={() => setShowChart(v => !v)}
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '8px 14px', width: '100%' }}>
          {showChart ? '▲ Hide' : '▼ Binance Funding History (90 periods)'}
        </button>
        {showChart && <HistoryChart coin={coin} />}
      </div>
    </div>
  )
}

// ─── Coin Row ─────────────────────────────────────────────────────────────────
function CoinRow({ coin, data, isFav, onSelect, onToggleFav }) {
  const [imgErr, setImgErr] = useState(false)
  const logo = COIN_LOGOS[coin]

  const rates      = EXCHANGES.map(ex => ({ key: ex.key, short: ex.short, rate: data[ex.key]?.[coin]?.rate ?? null }))
  const validRates = rates.filter(r => r.rate != null)
  const avgRate    = validRates.length ? validRates.reduce((a, b) => a + b.rate, 0) / validRates.length : null
  const spread     = validRates.length >= 2
    ? Math.max(...validRates.map(r => r.rate)) - Math.min(...validRates.map(r => r.rate))
    : null
  const spreadHot  = spread != null && Math.abs(spread) >= 0.0003

  return (
    <div
      onClick={() => onSelect(coin)}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      style={{ padding: '13px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', transition: 'background 0.15s' }}
    >
      {/* Row 1: coin identity + avg + spread + fav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {!imgErr && logo
            ? <img src={logo} alt={coin} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setImgErr(true)} />
            : <span style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.3)' }}>{coin.slice(0,3)}</span>
          }
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', flex: 1, color: 'var(--text-0)' }}>{coin}</span>
        {spread != null && (
          <span style={{
            fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)',
            color: spreadHot ? '#fbbf24' : 'rgba(255,255,255,0.2)',
            background: spreadHot ? 'rgba(251,191,36,0.1)' : 'transparent',
            padding: spreadHot ? '2px 6px' : '0', borderRadius: 4, letterSpacing: 0.3,
          }}>
            Δ{(spread * 100).toFixed(3)}%
          </span>
        )}
        {avgRate != null && (
          <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)', color: rateColor(avgRate) }}>
            {fmtRate(avgRate)}
          </span>
        )}
        <button onClick={e => { e.stopPropagation(); onToggleFav(coin) }}
          style={{ background: 'none', border: 'none', color: isFav ? '#f59e0b' : 'rgba(255,255,255,0.1)', fontSize: 16, cursor: 'pointer', padding: '0 0 0 6px', lineHeight: 1 }}>
          ★
        </button>
      </div>

      {/* Row 2: exchange rate pills — nowrap, scroll horizontally */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {rates.map(r => (
          <div key={r.key} style={{
            display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
            background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '4px 8px',
          }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: 0.3 }}>{r.short}</span>
            <span style={{ fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-mono)', color: r.rate != null ? rateColor(r.rate) : 'rgba(255,255,255,0.12)' }}>
              {r.rate != null ? fmtRate(r.rate) : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Exported CoinLogo (used by VolumeMonitor) ───────────────────────────────
export function CoinLogo({ symbol, size = 22 }) {
  const coin = normSym(String(symbol || '').replace(/USDT$|BUSD$|USD$/, ''))
  const logo  = COIN_LOGOS[coin]
  const [err, setErr] = useState(false)
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {!err && logo
        ? <img src={logo} alt={coin} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setErr(true)} />
        : <span style={{ fontSize: size * 0.38, fontWeight: 800, color: 'rgba(255,255,255,0.4)' }}>{coin.slice(0, 2)}</span>
      }
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function FundingRate() {
  const [data,      setData]      = useState({})
  const [sentiment, setSentiment] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [sortBy,    setSortBy]    = useState('default')
  const [showSort,  setShowSort]  = useState(false)
  const [showFavs,  setShowFavs]  = useState(false)
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fr_favorites') || '[]') } catch { return [] }
  })
  const [selected, setSelected] = useState(null)

  const fetchAll = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/funding/snapshot`)
      if (!r.ok) throw new Error('http_' + r.status)
      const json = await r.json()
      const out = {}
      EXCHANGES.forEach(ex => { out[ex.key] = {} })
      for (const [coin, byEx] of Object.entries(json.rates || {})) {
        for (const [exKey, payload] of Object.entries(byEx)) {
          if (!out[exKey]) out[exKey] = {}
          out[exKey][coin] = { rate: payload.rate }
        }
      }
      setData(out)
    } catch {
      const results = await Promise.allSettled(EXCHANGES.map(ex => FETCHERS[ex.key]()))
      const newData = {}
      EXCHANGES.forEach((ex, i) => { newData[ex.key] = results[i].status === 'fulfilled' ? results[i].value : {} })
      setData(newData)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, REFRESH_MS)
    return () => clearInterval(t)
  }, [fetchAll])

  useEffect(() => {
    let alive = true
    async function pull() {
      try {
        const r = await fetch(`${API_BASE}/api/funding/sentiment`)
        if (!alive || !r.ok) return
        setSentiment(await r.json())
      } catch {}
    }
    pull()
    const id = setInterval(pull, REFRESH_MS)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const toggleFav = useCallback((coin) => {
    setFavorites(prev => {
      const next = prev.includes(coin) ? prev.filter(c => c !== coin) : [...prev, coin]
      localStorage.setItem('fr_favorites', JSON.stringify(next))
      return next
    })
  }, [])

  const sortLabels = {
    default:      'Default',
    spread_desc:  'Spread: High → Low',
    avg_desc:     'Rate: High → Low',
    avg_asc:      'Rate: Low → High',
    binance_desc: 'Binance: High → Low',
    hl_desc:      'HyperLiq: High → Low',
  }

  const displayed = useMemo(() => {
    let list = COINS.filter(c => {
      const matchSearch = !search || c.toLowerCase().includes(search.toLowerCase())
      const matchFav    = !showFavs || favorites.includes(c)
      return matchSearch && matchFav
    })
    const ratesArr  = (coin) => EXCHANGES.map(ex => data[ex.key]?.[coin]?.rate).filter(r => r != null)
    const avgRate   = (coin) => { const rs = ratesArr(coin); return rs.length ? rs.reduce((a,b) => a+b, 0) / rs.length : null }
    const spreadOf  = (coin) => { const rs = ratesArr(coin); return rs.length >= 2 ? Math.max(...rs) - Math.min(...rs) : null }
    if (sortBy === 'spread_desc')  list = [...list].sort((a, b) => (spreadOf(b) ?? -Infinity) - (spreadOf(a) ?? -Infinity))
    if (sortBy === 'avg_desc')     list = [...list].sort((a, b) => (avgRate(b) ?? -Infinity) - (avgRate(a) ?? -Infinity))
    if (sortBy === 'avg_asc')      list = [...list].sort((a, b) => (avgRate(a) ?? Infinity)  - (avgRate(b) ?? Infinity))
    if (sortBy === 'binance_desc') list = [...list].sort((a, b) => (data.binance?.[b]?.rate ?? -Infinity) - (data.binance?.[a]?.rate ?? -Infinity))
    if (sortBy === 'hl_desc')      list = [...list].sort((a, b) => (data.hyperliquid?.[b]?.rate ?? -Infinity) - (data.hyperliquid?.[a]?.rate ?? -Infinity))
    return list
  }, [search, showFavs, favorites, sortBy, data])

  if (selected) {
    return (
      <CoinDetail
        coin={selected}
        data={data}
        onBack={() => setSelected(null)}
        isFav={favorites.includes(selected)}
        onToggleFav={toggleFav}
      />
    )
  }

  return (
    /* Outer: full height, flex column, NO scroll — inner list scrolls */
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-0)', color: 'var(--text-0)', overflow: 'hidden' }}>

      {/* ── Fixed top section — never scrolls away ───────────────── */}
      <div style={{ flexShrink: 0 }}>

        {/* Header + search */}
        <div style={{ padding: '18px 20px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  onClick={() => setShowSort(v => !v)}
                  style={{ fontSize: 18, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, letterSpacing: -0.3 }}>
                  Funding Rate
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', transform: showSort ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>
                {displayed.length} coins · 5 exchanges · 30s refresh
              </div>
            </div>

            <button
              onClick={() => setShowFavs(v => !v)}
              style={{
                background: showFavs ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${showFavs ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 20, padding: '6px 14px', cursor: 'pointer',
                color: showFavs ? '#f59e0b' : 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: 700,
              }}>
              ★ {favorites.length > 0 ? favorites.length : 'Favs'}
            </button>
          </div>

          {/* Sort dropdown */}
          {showSort && (
            <div style={{
              position: 'absolute', top: 70, left: 20,
              background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12, padding: 6, zIndex: 50,
              boxShadow: '0 12px 40px rgba(0,0,0,0.8)', minWidth: 220,
            }}>
              {Object.entries(sortLabels).map(([key, label]) => (
                <div key={key}
                  onClick={() => { setSortBy(key); setShowSort(false) }}
                  style={{
                    padding: '10px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                    color: sortBy === key ? '#00e87a' : 'rgba(255,255,255,0.6)',
                    background: sortBy === key ? 'rgba(0,232,122,0.08)' : 'transparent',
                    transition: 'background 0.15s',
                  }}>
                  {label}
                </div>
              ))}
            </div>
          )}

          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '8px 12px',
            border: '1px solid rgba(255,255,255,0.07)', marginBottom: 14,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="BTC, ETH, SOL…"
              spellCheck={false}
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-0)', fontSize: 13, fontFamily: 'var(--font-mono)' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 0, fontSize: 14 }}>✕</button>
            )}
          </div>
        </div>

        {/* Sentiment gauge — always visible */}
        <FundingSentiment sentiment={sentiment} />

        {/* Countdown strip — always visible */}
        <CountdownStrip data={data} />

      </div>{/* end fixed top */}

      {/* Click-away for sort */}
      {showSort && <div onClick={() => setShowSort(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />}

      {/* ── Scrollable token list ─────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {loading ? (
          Array.from({ length: 15 }).map((_, i) => (
            <div key={i} style={{ padding: '13px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
                <div style={{ height: 13, width: 50, borderRadius: 4, background: 'rgba(255,255,255,0.07)' }} />
                <div style={{ marginLeft: 'auto', height: 13, width: 70, borderRadius: 4, background: 'rgba(255,255,255,0.07)' }} />
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                {EXCHANGES.map(ex => (
                  <div key={ex.key} style={{ height: 24, width: 70, borderRadius: 6, background: 'rgba(255,255,255,0.04)' }} />
                ))}
              </div>
            </div>
          ))
        ) : displayed.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>
            {showFavs ? 'No favorites added' : 'No coins found'}
          </div>
        ) : (
          displayed.map(coin => (
            <CoinRow
              key={coin} coin={coin} data={data}
              isFav={favorites.includes(coin)}
              onSelect={setSelected}
              onToggleFav={toggleFav}
            />
          ))
        )}
      </div>
    </div>
  )
}
