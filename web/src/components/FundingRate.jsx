import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { API_BASE } from '../config'

/* ── Config ──────────────────────────────────────────────────────── */
const REFRESH_MS = 30_000

// All coins verified 8/8 exchange coverage (data from all 8 exchanges)
// kPEPE→PEPE alias handles HyperLiquid's naming
const COINS = [
  'BTC',   'ETH',   'SOL',   'XRP',   'BNB',   'DOGE',  'ADA',   'AVAX',  'HYPE',  'SUI',
  'DOT',   'LINK',  'TON',   'TRX',   'NEAR',  'APT',   'LTC',   'BCH',   'UNI',   'ARB',
  'OP',    'ATOM',  'POL',   'INJ',   'TIA',   'SEI',   'JUP',   'PYTH',  'WIF',   'PEPE',
  'RNDR',  'IMX',   'LDO',   'STX',   'ORDI',  'WLD',   'PENDLE','GMX',   'DYDX',  'AAVE',
  'SNX',   'CRV',   'ENA',   'COMP',  'SUSHI', 'ENS',   'BLUR',  'GALA',  'SAND',  'AXS',
  'ICP',   'S',     'ALGO',  'HBAR',  'ETC',   'XLM',   'TAO',   'EIGEN', 'CELO',  'IOTA',
  'NEO',   'ZEC',   'DASH',  'STRK',  'JTO',   'ONDO',
  // New 8/8 coins (all verified)
  'SKY',   'W',     'APE',   'AR',    'NOT',   'CFX',   'GMT',   'MINA',  'TRB',   'RSR',
  'YGG',   'VIRTUAL','AERO', 'ZRO',   'BERA',  'PNUT',  'ETHFI', 'MOVE',  'BOME',  'BRETT',
  'MEW',   'PENGU', 'POPCAT','PEOPLE','ZETA',  'TURBO', 'KAITO', 'GRASS', 'MOODENG','ME',
  'SPX',
]

// CoinMarketCap exchange logos
const EXCHANGES = [
  { key: 'binance',     label: 'Binance',   color: '#f0b90b', logo: 'https://s2.coinmarketcap.com/static/img/exchanges/64x64/270.png' },
  { key: 'okx',        label: 'OKX',       color: '#ffffff', logo: 'https://s2.coinmarketcap.com/static/img/exchanges/64x64/294.png' },
  { key: 'bybit',      label: 'Bybit',     color: '#f7a600', logo: 'https://s2.coinmarketcap.com/static/img/exchanges/64x64/521.png' },
  { key: 'bitget',     label: 'Bitget',    color: '#00c9a7', logo: 'https://s2.coinmarketcap.com/static/img/exchanges/64x64/513.png' },
  { key: 'hyperliquid',label: 'HyperLiq',  color: '#9b5de5', logo: 'https://app.hyperliquid.xyz/apple-touch-icon.png' },
]

const PERIODS = [
  { key: 'current', label: 'Current' },
  { key: '1d', label: '1 Day' },
  { key: '7d', label: '7 Day' },
  { key: '30d', label: '30 Day' },
  { key: '1y', label: '1 Year' },
]

/* ── Coin logos: verified CoinGecko URLs ──────────────────────────── */
const COIN_LOGOS = {
  BTC:     'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png?1696501400',
  ETH:     'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628',
  SOL:     'https://coin-images.coingecko.com/coins/images/4128/large/solana.png?1718769756',
  XRP:     'https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png?1696501442',
  BNB:     'https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png?1696501970',
  DOGE:    'https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png?1696501409',
  ADA:     'https://coin-images.coingecko.com/coins/images/975/large/cardano.png?1696502090',
  AVAX:    'https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png?1696512369',
  HYPE:    'https://coin-images.coingecko.com/coins/images/50882/large/hyperliquid.jpg?1729431300',
  SUI:     'https://coin-images.coingecko.com/coins/images/26375/large/sui-ocean-square.png?1727791290',
  DOT:     'https://coin-images.coingecko.com/coins/images/12171/large/polkadot.jpg?1766533446',
  LINK:    'https://coin-images.coingecko.com/coins/images/877/large/Chainlink_Logo_500.png?1760023405',
  TON:     'https://coin-images.coingecko.com/coins/images/17980/large/photo_2024-09-10_17.09.00.jpeg?1725963446',
  TRX:     'https://coin-images.coingecko.com/coins/images/1094/large/tron-logo.png?1696502193',
  NEAR:    'https://coin-images.coingecko.com/coins/images/10365/large/near.jpg?1696510367',
  APT:     'https://coin-images.coingecko.com/coins/images/26455/large/Aptos-Network-Symbol-Black-RGB-1x.png?1761789140',
  LTC:     'https://coin-images.coingecko.com/coins/images/2/large/litecoin.png?1696501400',
  BCH:     'https://coin-images.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png?1696501932',
  UNI:     'https://coin-images.coingecko.com/coins/images/12504/large/uniswap-logo.png?1720676669',
  ARB:     'https://coin-images.coingecko.com/coins/images/16547/large/arb.jpg?1721358242',
  OP:      'https://coin-images.coingecko.com/coins/images/25244/large/Optimism.png?1696524385',
  ATOM:    'https://coin-images.coingecko.com/coins/images/1481/large/cosmos_hub.png?1696502525',
  POL:     'https://coin-images.coingecko.com/coins/images/32440/large/pol.png?1759114181',
  INJ:     'https://coin-images.coingecko.com/coins/images/12882/large/Other_200x200.png?1738782212',
  TIA:     'https://coin-images.coingecko.com/coins/images/31967/large/tia.jpg?1696530772',
  SEI:     'https://coin-images.coingecko.com/coins/images/28205/large/Sei_Logo_-_Transparent.png?1696527207',
  JUP:     'https://coin-images.coingecko.com/coins/images/34188/large/jup.png?1704266489',
  PYTH:    'https://coin-images.coingecko.com/coins/images/31924/large/pyth.png?1701245725',
  WIF:     'https://coin-images.coingecko.com/coins/images/33566/large/dogwifhat.jpg?1702499428',
  PEPE:    'https://coin-images.coingecko.com/coins/images/29850/large/pepe-token.jpeg?1696528776',
  RNDR:    'https://coin-images.coingecko.com/coins/images/11636/large/rndr.png?1696511529',
  IMX:     'https://coin-images.coingecko.com/coins/images/17233/large/immutableX-symbol-BLK-RGB.png?1696516787',
  LDO:     'https://coin-images.coingecko.com/coins/images/13573/large/Lido_DAO.png?1696513326',
  STX:     'https://coin-images.coingecko.com/coins/images/2069/large/Stacks_Logo_png.png?1709979332',
  ORDI:    'https://coin-images.coingecko.com/coins/images/30162/large/ordi.png?1696529082',
  WLD:     'https://coin-images.coingecko.com/coins/images/31069/large/worldcoin.jpeg?1696529903',
  PENDLE:  'https://coin-images.coingecko.com/coins/images/15069/large/Pendle_Logo_Normal-03.png?1696514728',
  GMX:     'https://coin-images.coingecko.com/coins/images/18323/large/arbit.png?1696517814',
  DYDX:    'https://coin-images.coingecko.com/coins/images/32594/large/dydx.png?1698673495',
  AAVE:    'https://coin-images.coingecko.com/coins/images/12645/large/aave-token-round.png?1720472354',
  SNX:     'https://coin-images.coingecko.com/coins/images/3406/large/SNX.png?1696504103',
  CRV:     'https://coin-images.coingecko.com/coins/images/12124/large/Curve.png?1696511967',
  ENA:     'https://coin-images.coingecko.com/coins/images/36530/large/ethena.png?1711701436',
  COMP:    'https://coin-images.coingecko.com/coins/images/10775/large/COMP.png?1696510737',
  SUSHI:   'https://coin-images.coingecko.com/coins/images/12271/large/512x512_Logo_no_chop.png?1696512101',
  ENS:     'https://coin-images.coingecko.com/coins/images/19785/large/ENS.jpg?1727872989',
  BLUR:    'https://coin-images.coingecko.com/coins/images/28453/large/blur.png?1696527448',
  GALA:    'https://coin-images.coingecko.com/coins/images/12493/large/GALA_token_image_-_200PNG.png?1709725869',
  SAND:    'https://coin-images.coingecko.com/coins/images/12129/large/sandbox_logo.jpg?1696511971',
  AXS:     'https://coin-images.coingecko.com/coins/images/13029/large/axie_infinity_logo.png?1696512817',
  ICP:     'https://coin-images.coingecko.com/coins/images/14495/large/Internet_Computer_logo.png?1696514180',
  S:       'https://coin-images.coingecko.com/coins/images/38108/large/200x200_Sonic_Logo.png?1734679256',
  ALGO:    'https://coin-images.coingecko.com/coins/images/4380/large/download.png?1696504978',
  HBAR:    'https://coin-images.coingecko.com/coins/images/3688/large/hbar.png?1696504364',
  ETC:     'https://coin-images.coingecko.com/coins/images/453/large/ethereum-classic-logo.png?1696501717',
  XLM:     'https://coin-images.coingecko.com/coins/images/100/large/fmpFRHHQ_400x400.jpg?1735231350',
  TAO:     'https://coin-images.coingecko.com/coins/images/28452/large/ARUsPeNQ_400x400.jpeg?1696527447',
  EIGEN:   'https://coin-images.coingecko.com/coins/images/37441/large/eigencloud.jpg?1751003565',
  CELO:    'https://coin-images.coingecko.com/coins/images/11090/large/InjXBNx9_400x400.jpg?1696511031',
  IOTA:    'https://coin-images.coingecko.com/coins/images/692/large/IOTA_Thumbnail_%281%29.png?1743772896',
  NEO:     'https://coin-images.coingecko.com/coins/images/480/large/NEO_512_512.png?1696501735',
  ZEC:     'https://coin-images.coingecko.com/coins/images/486/large/circle-zcash-color.png?1696501740',
  DASH:    'https://coin-images.coingecko.com/coins/images/19/large/dash-logo.png?1696501423',
  STRK:    'https://coin-images.coingecko.com/coins/images/26433/large/starknet.png?1696525507',
  JTO:     'https://coin-images.coingecko.com/coins/images/33228/large/jto.png?1701137022',
  ONDO:    'https://coin-images.coingecko.com/coins/images/26580/large/ONDO.png?1696525656',
  SKY:     'https://coin-images.coingecko.com/coins/images/39925/large/sky.jpg?1724827980',
  W:       'https://coin-images.coingecko.com/coins/images/35087/large/W_Token_%283%29.png?1758122686',
  APE:     'https://coin-images.coingecko.com/coins/images/24383/large/APECOIN.png?1756551529',
  AR:      'https://coin-images.coingecko.com/coins/images/4343/large/oRt6SiEN_400x400.jpg?1696504946',
  NOT:     'https://coin-images.coingecko.com/coins/images/33453/large/rFmThDiD_400x400.jpg?1701876350',
  CFX:     'https://coin-images.coingecko.com/coins/images/13079/large/3vuYMbjN.png?1696512867',
  GMT:     'https://coin-images.coingecko.com/coins/images/23597/large/token-gmt-200x200.png?1703153841',
  MINA:    'https://coin-images.coingecko.com/coins/images/15628/large/JM4_vQ34_400x400.png?1696515261',
  TRB:     'https://coin-images.coingecko.com/coins/images/9644/large/TRB-New_Logo.png?1737722143',
  RSR:     'https://coin-images.coingecko.com/coins/images/8365/large/RSR_Blue_Circle_1000.png?1721777856',
  YGG:     'https://coin-images.coingecko.com/coins/images/17358/large/Shield_Mark_-_Colored_-_Iridescent.png?1696516909',
  VIRTUAL: 'https://coin-images.coingecko.com/coins/images/34057/large/LOGOMARK.png?1708356054',
  AERO:    'https://coin-images.coingecko.com/coins/images/31745/large/token.png?1696530564',
  ZRO:     'https://coin-images.coingecko.com/coins/images/28206/large/ftxG9_TJ_400x400.jpeg?1696527208',
  BERA:    'https://coin-images.coingecko.com/coins/images/25235/large/BERA.png?1738822008',
  PNUT:    'https://coin-images.coingecko.com/coins/images/51301/large/Peanut_the_Squirrel.png?1734941241',
  ETHFI:   'https://coin-images.coingecko.com/coins/images/35958/large/etherfi.jpeg?1710254562',
  MOVE:    'https://coin-images.coingecko.com/coins/images/39345/large/movement-testnet-token.png?1721878759',
  BOME:    'https://coin-images.coingecko.com/coins/images/36071/large/bome.png?1710407255',
  BRETT:   'https://coin-images.coingecko.com/coins/images/35529/large/1000050750.png?1709031995',
  MEW:     'https://coin-images.coingecko.com/coins/images/36440/large/MEW.png?1711442286',
  PENGU:   'https://coin-images.coingecko.com/coins/images/52622/large/PUDGY_PENGUINS_PENGU_PFP.png?1733809110',
  POPCAT:  'https://coin-images.coingecko.com/coins/images/33760/large/image.jpg?1702964227',
  PEOPLE:  'https://coin-images.coingecko.com/coins/images/20612/large/GN_UVm3d_400x400.jpg?1696520017',
  ZETA:    'https://coin-images.coingecko.com/coins/images/26718/large/Twitter_icon.png?1696525788',
  TURBO:   'https://coin-images.coingecko.com/coins/images/30117/large/TurboMark-QL_200.png?1708079597',
  KAITO:   'https://coin-images.coingecko.com/coins/images/54411/large/Qm4DW488_400x400.jpg?1739552780',
  GRASS:   'https://coin-images.coingecko.com/coins/images/40094/large/Grass.jpg?1725697048',
  MOODENG: 'https://coin-images.coingecko.com/coins/images/50264/large/MOODENG.jpg?1726726975',
  ME:      'https://coin-images.coingecko.com/coins/images/39850/large/_ME_Profile_Dark_2x.png?1734013082',
  SPX:     'https://coin-images.coingecko.com/coins/images/31401/large/centeredcoin_%281%29.png?1737048493',
  PIXEL:   'https://coin-images.coingecko.com/coins/images/32503/large/pixel_logo.png?1707384160',
  XAI:     'https://coin-images.coingecko.com/coins/images/33946/large/image_2024-01-09_152341901.png?1704785038',
  U:       'https://coin-images.coingecko.com/coins/images/52079/large/u.png?1732551467',
  OPN:     'https://coin-images.coingecko.com/coins/images/36284/large/opn_logo.png?1719543958',
  ACX:     'https://coin-images.coingecko.com/coins/images/28456/large/across.png?1669894371',
}

function coinLogoUrl(symbol) {
  return COIN_LOGOS[symbol] ?? `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`
}

/* ── Symbol normalizer ────────────────────────────────────────────── */
// Handles 1000x prefixes, suffix variants, and exchange rebrands
const SYM_ALIAS = {
  RENDER: 'RNDR',  // OKX/Bybit use RENDER
  XBT:    'BTC',   // KuCoin uses XBT
  MATIC:  'POL',   // Polygon renamed to POL
  FTM:    'S',     // Fantom renamed to Sonic (S)
  SONIC:  'S',     // Binance futures use SONIC
  kPEPE:  'PEPE',  // HyperLiquid uses kPEPE
}

function normSym(raw) {
  let s = raw
  if (s.startsWith('1000000')) s = s.slice(7)
  else if (s.startsWith('1000')) s = s.slice(4)
  if (s.endsWith('1000')) s = s.slice(0, -4)
  return SYM_ALIAS[s] ?? s
}

/* ── Helpers ──────────────────────────────────────────────────────── */
function fmtRate(r) {
  if (r == null) return null
  return (r * 100).toFixed(4) + '%'
}
function rateColor(r) {
  if (r == null) return 'var(--text-3)'
  if (r > 0) return '#00d992'
  if (r < 0) return '#ff3b5c'
  return 'var(--text-2)'
}

/* ── Data Fetchers ───────────────────────────────────────────────── */
async function fetchBinance() {
  const res = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex')
  const data = await res.json()
  const out = {}
  for (const d of data) {
    const sym = normSym(d.symbol.replace('USDT', '').replace('BUSD', ''))
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
    const sym = normSym(d.symbol.replace('USDT', ''))
    out[sym] = { rate: parseFloat(d.fundingRate) }
  }
  return out
}

async function fetchOKX() {
  const out = {}
  try {
    // Step 1: get instruments to build normalized symbol → instId map
    const r1 = await fetch('https://www.okx.com/api/v5/public/instruments?instType=SWAP')
    const j1 = await r1.json()
    const instMap = {}
    for (const d of (j1.data || [])) {
      if (!d.instId?.endsWith('-USDT-SWAP')) continue
      const sym = normSym(d.instId.replace('-USDT-SWAP', ''))
      instMap[sym] = d.instId
    }
    // Step 2: fetch funding rates for our coins in parallel
    await Promise.allSettled(
      COINS.map(async coin => {
        const instId = instMap[coin]
        if (!instId) return
        try {
          const r = await fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${instId}`)
          const j = await r.json()
          const d = j.data?.[0]
          if (d?.fundingRate != null) out[coin] = { rate: parseFloat(d.fundingRate) }
        } catch (err) { console.warn('[FundingRate] OKX coin fetch error', err) }
      })
    )
  } catch {
    // Fallback: direct per-coin
    await Promise.allSettled(
      COINS.slice(0, 40).map(async coin => {
        try {
          const r = await fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${coin}-USDT-SWAP`)
          const j = await r.json()
          const d = j.data?.[0]
          if (d?.fundingRate != null) out[coin] = { rate: parseFloat(d.fundingRate) }
        } catch (err) { console.warn('[FundingRate] OKX fallback error', err) }
      })
    )
  }
  return out
}

async function fetchHL() {
  const res = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
      const raw = d.symbol?.replace('USDT', '')
      if (!raw) continue
      const sym = normSym(raw)
      if (d.fundingRate != null) out[sym] = { rate: parseFloat(d.fundingRate) }
    }
    return out
  } catch (err) { console.warn('[FundingRate] Bitget error', err); return {} }
}

const FETCHERS = {
  binance: fetchBinance, okx: fetchOKX, bybit: fetchBybit,
  bitget: fetchBitget,   hyperliquid: fetchHL,
}

/* ── Exchange Logo ────────────────────────────────────────────────── */
function ExchangeLogo({ ex }) {
  const [err, setErr] = useState(false)
  if (!err && ex.logo) {
    return (
      <img
        src={ex.logo} alt={ex.label}
        width={16} height={16}
        style={{ borderRadius: 3, objectFit: 'cover', flexShrink: 0, verticalAlign: 'middle', marginRight: 4 }}
        onError={() => setErr(true)}
      />
    )
  }
  return <span className="cg-fr-ex-dot" style={{ background: ex.color }} />
}

/* ── Coin Logo ────────────────────────────────────────────────────── */
export function CoinLogo({ symbol }) {
  const [err, setErr] = useState(false)
  if (err) {
    return (
      <span style={{
        width: 18, height: 18, borderRadius: '50%', background: 'var(--bg-3)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 7, color: 'var(--text-2)', flexShrink: 0, fontWeight: 700,
      }}>
        {symbol[0]}
      </span>
    )
  }
  return (
    <img
      src={coinLogoUrl(symbol)} alt={symbol}
      width={18} height={18}
      style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      onError={() => setErr(true)}
    />
  )
}

/* ── Countdown helpers ───────────────────────────────────────────── */
function msUntilNext(intervalHours) {
  const ms = intervalHours * 3_600_000
  return ms - (Date.now() % ms)
}
function fmtCountdown(ms) {
  const s   = Math.floor(ms / 1000)
  const h   = Math.floor(s / 3600)
  const m   = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m ${String(sec).padStart(2,'0')}s`
  return `${String(m).padStart(2,'0')}m ${String(sec).padStart(2,'0')}s`
}

// interval in hours per exchange
const EX_INTERVAL = { binance: 8, okx: 8, bybit: 8, bitget: 8, hyperliquid: 1 }

function FundingCountdownBar({ data }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // aggregate avg rate per exchange for top coins
  const avgRates = useMemo(() => {
    const out = {}
    for (const ex of EXCHANGES) {
      const rates = Object.values(data[ex.key] || {}).map(d => d.rate).filter(r => r != null)
      out[ex.key] = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null
    }
    return out
  }, [data])

  return (
    <div className="fr-countdown-bar">
      {EXCHANGES.map(ex => {
        const interval = EX_INTERVAL[ex.key]
        const ms   = msUntilNext(interval) - (now % 1000 === 0 ? 0 : 0)  // recompute each second
        const remaining = msUntilNext(interval)
        const pct  = 1 - remaining / (interval * 3_600_000)
        const avg  = avgRates[ex.key]
        const urgency = remaining < 15 * 60_000  // <15min → highlight

        return (
          <div key={ex.key} className={`fr-cd-item${urgency ? ' urgent' : ''}`}>
            <div className="fr-cd-top">
              <ExchangeLogo ex={ex} />
              <span className="fr-cd-name">{ex.label}</span>
              <span className="fr-cd-interval">{interval}h</span>
            </div>
            <div className="fr-cd-timer">{fmtCountdown(remaining)}</div>
            <div className="fr-cd-bar-track">
              <div className="fr-cd-bar-fill" style={{ width: pct * 100 + '%', background: urgency ? 'var(--danger)' : 'var(--accent)' }} />
            </div>
            {avg != null && (
              <div className="fr-cd-avg" style={{ color: avg >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
                avg {(avg * 100).toFixed(4)}%
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── Funding history bar chart (Binance) ─────────────────────────── */
function FundingHistoryChart({ coin }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!coin) return
    setLoading(true)
    fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${coin}USDT&limit=90`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return
        setHistory(data.map(d => ({
          time: d.fundingTime,
          rate: parseFloat(d.fundingRate),
        })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [coin])

  if (loading) return <div className="fr-hist-loading">Yükleniyor…</div>
  if (!history.length) return <div className="fr-hist-loading">Veri yok</div>

  const rates  = history.map(d => d.rate)
  const maxAbs = Math.max(...rates.map(Math.abs), 0.0001)
  const W = 100, H = 48
  const barW = Math.max(1, (W / rates.length) - 0.5)

  // running 7-day annualised cost label
  const last8 = rates.slice(-24)  // last 24 periods = ~8 days
  const avg   = last8.reduce((a, b) => a + b, 0) / last8.length
  const annual = avg * 3 * 365  // 3 payments/day * 365

  return (
    <div className="fr-hist-wrap">
      <div className="fr-hist-header">
        <span className="fr-hist-title">Funding Rate Geçmişi — {coin} (Binance, son 90 dönem)</span>
        <span className="fr-hist-annual" style={{ color: annual >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
          8g ort: {(avg * 100).toFixed(4)}% · yıllık ~{(annual * 100).toFixed(1)}%
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="fr-hist-svg" preserveAspectRatio="none">
        {/* zero line */}
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.08)" strokeWidth="0.3" />
        {rates.map((r, i) => {
          const pct = Math.abs(r) / maxAbs
          const barH = pct * (H / 2 - 2)
          const x   = (i / rates.length) * W
          const y   = r >= 0 ? H / 2 - barH : H / 2
          return (
            <rect key={i} x={x} y={y} width={barW} height={barH}
              fill={r >= 0 ? 'rgba(0,217,146,0.75)' : 'rgba(255,59,92,0.75)'} />
          )
        })}
      </svg>
      <div className="fr-hist-labels">
        <span>{new Date(history[0].time).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
        <span>{new Date(history[Math.floor(history.length / 2)].time).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
        <span>{new Date(history[history.length - 1].time).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
      </div>
    </div>
  )
}

/* ── Component ───────────────────────────────────────────────────── */
export default function FundingRate() {
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('current')
  const [search, setSearch] = useState('')
  const [sortEx, setSortEx] = useState(null)
  const [sortDir, setSortDir] = useState(-1)
  const [favorites, setFavorites] = useState([])
  const [showFav, setShowFav] = useState(false)
  const [selectedCoin, setSelectedCoin] = useState(null)

  const fetchAll = useCallback(async () => {
    const results = await Promise.allSettled(EXCHANGES.map(ex => FETCHERS[ex.key]()))
    const newData = {}
    EXCHANGES.forEach((ex, i) => {
      newData[ex.key] = results[i].status === 'fulfilled' ? results[i].value : {}
    })
    setData(newData)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, REFRESH_MS)
    return () => clearInterval(t)
  }, [fetchAll])

  const toggleFav = (coin) => {
    setFavorites(prev => prev.includes(coin) ? prev.filter(c => c !== coin) : [...prev, coin])
  }

  let coins = COINS.filter(c => !search || c.toLowerCase().includes(search.toLowerCase()))
  if (showFav && favorites.length > 0) coins = coins.filter(c => favorites.includes(c))
  if (sortEx) {
    coins = [...coins].sort((a, b) => {
      const ra = data[sortEx]?.[a]?.rate
      const rb = data[sortEx]?.[b]?.rate
      if (ra == null && rb == null) return 0
      if (ra == null) return 1
      if (rb == null) return -1
      return sortDir > 0 ? ra - rb : rb - ra
    })
  }

  const handleSort = (exKey) => {
    if (sortEx === exKey) setSortDir(d => -d)
    else { setSortEx(exKey); setSortDir(-1) }
  }

  return (
    <div className="cg-fr-page">

      {/* ── Countdown Bar ── */}
      <FundingCountdownBar data={data} />

      {/* ── Top Bar ── */}
      <div className="cg-fr-topbar">
        <div className="cg-fr-periods">
          {PERIODS.map(p => (
            <button key={p.key} className={`cg-fr-period-btn ${period === p.key ? 'active' : ''}`} onClick={() => setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
          <button className="cg-fr-period-btn cg-fr-heatmap-btn">Funding Rate Heatmap</button>
        </div>
        <div className="cg-fr-actions">
          <button className={`cg-fr-action-btn ${showFav ? '' : 'active'}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
            </svg>
          </button>
          <button className={`cg-fr-action-btn ${showFav ? 'active' : ''}`} onClick={() => setShowFav(!showFav)}>
            Show Favorites
          </button>
          <button className="cg-fr-action-btn" onClick={() => {
            const coin = prompt('Add coin to favorites (e.g. BTC):')
            if (coin && COINS.includes(coin.toUpperCase())) toggleFav(coin.toUpperCase())
          }}>Add Favorites</button>
        </div>
        <div className="cg-fr-search-wrap">
          <input
            className="cg-fr-search" placeholder="Search..."
            value={search} onChange={e => setSearch(e.target.value)} spellCheck={false}
          />
          {search && <button className="cg-fr-search-x" onClick={() => setSearch('')}>×</button>}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="cg-fr-table-wrap">
        <table className="cg-fr-table">
          <thead>
            <tr>
              <th className="cg-fr-th cg-fr-th-sym"><span className="cg-fr-th-text">Symbol</span></th>
              {EXCHANGES.map(ex => (
                <th key={ex.key} className={`cg-fr-th cg-fr-th-ex ${sortEx === ex.key ? 'cg-fr-th-sorted' : ''}`} onClick={() => handleSort(ex.key)}>
                  <ExchangeLogo ex={ex} />
                  <span className="cg-fr-th-text">{ex.label}</span>
                  {sortEx === ex.key && <span className="cg-fr-sort-arrow">{sortDir > 0 ? '↑' : '↓'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 20 }).map((_, i) => (
              <tr key={i} className="cg-fr-row cg-fr-row-skel">
                <td className="cg-fr-td"><div className="cg-fr-skel" style={{ width: 60 }} /></td>
                {EXCHANGES.map(ex => <td key={ex.key} className="cg-fr-td"><div className="cg-fr-skel" style={{ width: 64 }} /></td>)}
              </tr>
            ))}
            {!loading && coins.map(coin => {
              const isSelected = selectedCoin === coin
              return (
                <>
                  <tr key={coin} className={`cg-fr-row${isSelected ? ' fr-row-selected' : ''}`}
                    onClick={() => setSelectedCoin(isSelected ? null : coin)}
                    style={{ cursor: 'pointer' }}>
                    <td className="cg-fr-td cg-fr-td-sym">
                      <button className={`cg-fr-fav ${favorites.includes(coin) ? 'active' : ''}`}
                        onClick={e => { e.stopPropagation(); toggleFav(coin) }}>★</button>
                      <CoinLogo symbol={coin} />
                      <span className="cg-fr-coin-name">{coin}</span>
                      <span className="fr-row-expand">{isSelected ? '▲' : '▼'}</span>
                    </td>
                    {EXCHANGES.map(ex => {
                      const r = data[ex.key]?.[coin]?.rate
                      return (
                        <td key={ex.key} className="cg-fr-td cg-fr-td-rate">
                          {r != null
                            ? <span style={{ color: rateColor(r) }}>{fmtRate(r)}</span>
                            : <span className="cg-fr-no-data">-</span>
                          }
                        </td>
                      )
                    })}
                  </tr>
                  {isSelected && (
                    <tr key={coin + '_hist'} className="fr-hist-row">
                      <td colSpan={EXCHANGES.length + 1} style={{ padding: 0 }}>
                        <FundingHistoryChart coin={coin} />
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
