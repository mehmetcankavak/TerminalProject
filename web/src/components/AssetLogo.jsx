import { useEffect, useMemo, useState } from 'react'

const LOGO_DEV_TOKEN = import.meta.env.VITE_LOGO_DEV_TOKEN || ''

const CMC_IDS = {
  BTC:1, ETH:1027, BNB:1839, SOL:5426, XRP:52, ADA:2010, DOGE:74, AVAX:5805,
  TRX:1958, TON:11419, SHIB:5994, LINK:1975, DOT:6636, LTC:2, BCH:1831,
  UNI:7083, NEAR:6535, APT:21794, ARB:11841, OP:11840, ATOM:3794, FIL:2280,
  ICP:8916, VET:3077, ALGO:4030, HBAR:4642, XLM:512, SAND:6210, MANA:1966,
  AAVE:7278, CRV:6538, PEPE:24478, WLD:13502, SUI:20947, SEI:23149, TIA:22861,
  INJ:7226, RUNE:4157, AR:5632, ETC:1321, XMR:328, JUP:29210, BONK:23095,
  WIF:30120, ORDI:25028, DYDX:28324, IMX:10603, JASMY:9696, GALA:7080,
}

const LOGO_DOMAINS = {
  AAPL: 'apple.com',
  ABBV: 'abbvie.com',
  ABT: 'abbott.com',
  ACN: 'accenture.com',
  ADBE: 'adobe.com',
  AMD: 'amd.com',
  AMGN: 'amgen.com',
  AMZN: 'amazon.com',
  ASML: 'asml.com',
  AVGO: 'broadcom.com',
  AZN: 'astrazeneca.com',
  BAC: 'bankofamerica.com',
  BABA: 'alibaba.com',
  BRK: 'berkshirehathaway.com',
  COIN: 'coinbase.com',
  COST: 'costco.com',
  CRM: 'salesforce.com',
  CRCL: 'circle.com',
  CSCO: 'cisco.com',
  CVX: 'chevron.com',
  DIS: 'thewaltdisneycompany.com',
  EWJ: 'ishares.com',
  EWY: 'ishares.com',
  GOOGL: 'google.com',
  GOOG: 'google.com',
  HD: 'homedepot.com',
  HOOD: 'robinhood.com',
  INTC: 'intel.com',
  JNJ: 'jnj.com',
  JPM: 'jpmorganchase.com',
  KO: 'coca-colacompany.com',
  LLY: 'lilly.com',
  MA: 'mastercard.com',
  MARA: 'marathondh.com',
  META: 'meta.com',
  MRK: 'merck.com',
  MSFT: 'microsoft.com',
  MSTR: 'strategy.com',
  MU: 'micron.com',
  NFLX: 'netflix.com',
  NKE: 'nike.com',
  NVO: 'novonordisk.com',
  NVDA: 'nvidia.com',
  ORCL: 'oracle.com',
  PEP: 'pepsico.com',
  PFE: 'pfizer.com',
  PLTR: 'palantir.com',
  PYPL: 'paypal.com',
  QQQ: 'invesco.com',
  RIOT: 'riotplatforms.com',
  SBUX: 'starbucks.com',
  SNDK: 'sandisk.com',
  SPY: 'ssga.com',
  SQ: 'block.xyz',
  TSM: 'tsmc.com',
  TSLA: 'tesla.com',
  UNH: 'unitedhealthgroup.com',
  V: 'visa.com',
  VOO: 'vanguard.com',
  VTI: 'vanguard.com',
  WMT: 'walmart.com',
  XOM: 'exxonmobil.com',
}

const DARK_MARK_SYMBOLS = new Set([
  'AAPL',
  'BRK',
  'BRK.A',
  'BRK.B',
  'DIS',
  'NKE',
])

const LOCAL_LOGOS = {
  BRENT: commoditySvg('BR', '#111827', '#f59e0b', 'M19 42c0-12 15-18 15-31 8 10 11 17 11 26 0 10-7 17-16 17-6 0-10-4-10-12z'),
  WTI: commoditySvg('WT', '#111827', '#fb923c', 'M18 43c0-11 13-17 13-30 9 10 13 18 13 27 0 9-7 15-15 15-6 0-11-4-11-12z'),
  GOLD: commoditySvg('AU', '#15130b', '#f5c542', 'M16 42h32l-5-18H21l-5 18zm9-25h14l3 7H22l3-7z'),
  XAU: commoditySvg('AU', '#15130b', '#f5c542', 'M16 42h32l-5-18H21l-5 18zm9-25h14l3 7H22l3-7z'),
  SILVER: commoditySvg('AG', '#111827', '#d1d5db', 'M16 42h32l-5-18H21l-5 18zm9-25h14l3 7H22l3-7z'),
  XAG: commoditySvg('AG', '#111827', '#d1d5db', 'M16 42h32l-5-18H21l-5 18zm9-25h14l3 7H22l3-7z'),
  COPPER: commoditySvg('CU', '#160f0a', '#c47a3a', 'M17 42h30l-6-20H23l-6 20zm8-27h14l2 7H23l2-7z'),
  NATGAS: commoditySvg('NG', '#071923', '#38bdf8', 'M18 43c0-10 11-16 11-29 10 9 16 18 16 28 0 8-6 14-14 14-7 0-13-5-13-13z'),
  WHEAT: commoditySvg('WH', '#17130b', '#eab308', 'M32 49V15m0 7c-8 0-13 4-14 10 8 0 13-4 14-10zm0 9c8 0 13 4 14 10-8 0-13-4-14-10zm0-4c8 0 13-4 14-10-8 0-13 4-14 10zm0 9c-8 0-13 4-14 10 8 0 13-4 14-10z'),
  PLATINUM: commoditySvg('PT', '#111827', '#a5b4fc', 'M16 42h32l-5-18H21l-5 18zm9-25h14l3 7H22l3-7z'),
  PALLADIUM: commoditySvg('PD', '#111827', '#c4b5fd', 'M16 42h32l-5-18H21l-5 18zm9-25h14l3 7H22l3-7z'),
  DXY: indexSvg('DXY', '#0f172a', '#22c55e'),
  SPX: indexSvg('SPX', '#0f172a', '#60a5fa'),
  NDX: indexSvg('NDX', '#0f172a', '#a78bfa'),
}

function encodeSvg(svg) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

function commoditySvg(label, bg, accent, path) {
  return encodeSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="${bg}"/><path d="${path}" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><text x="32" y="57" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="9" font-weight="800" fill="${accent}">${label}</text></svg>`
  )
}

function indexSvg(label, bg, accent) {
  return encodeSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="${bg}"/><path d="M15 42l10-12 9 7 15-18" fill="none" stroke="${accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><text x="32" y="55" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="800" fill="white">${label}</text></svg>`
  )
}

function cleanSymbol(symbol) {
  return String(symbol || '').toUpperCase().replace(/[^A-Z0-9.]/g, '')
}

export function getAssetLogoSources({ symbol, icon, type } = {}) {
  const ticker = cleanSymbol(symbol)
  if (!ticker) return []

  if (LOCAL_LOGOS[ticker]) return [LOCAL_LOGOS[ticker]]

  if (type === 'crypto') {
    return [
      CMC_IDS[ticker] ? `https://s2.coinmarketcap.com/static/img/coins/64x64/${CMC_IDS[ticker]}.png` : null,
      `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/128/color/${ticker.toLowerCase()}.png`,
      `https://assets.coincap.io/assets/icons/${ticker.toLowerCase()}@2x.png`,
    ].filter(Boolean)
  }

  const sources = []
  const domain = LOGO_DOMAINS[ticker]

  if (LOGO_DEV_TOKEN && type !== 'commodity' && type !== 'index') {
    sources.push(`https://img.logo.dev/ticker:${ticker}?token=${LOGO_DEV_TOKEN}&size=128&format=png`)
    if (domain) sources.push(`https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}&size=128&format=png`)
  }

  if (domain) {
    sources.push(
      `https://logo.clearbit.com/${domain}`,
      `https://api.faviconkit.com/${domain}/128`
    )
  }

  sources.push(
    `https://financialmodelingprep.com/image-stock/${ticker}.png`,
    `https://eodhd.com/img/logos/US/${ticker}.png`
  )

  if (icon && String(icon).startsWith('/')) sources.push(`https://companiesmarketcap.com${icon}`)
  else if (icon) sources.push(icon)

  return [...new Set(sources.filter(Boolean))]
}

export default function AssetLogo({ symbol, icon, type = 'stock', size = 36, radius = 12 }) {
  const [sourceIndex, setSourceIndex] = useState(0)
  const sources = useMemo(() => getAssetLogoSources({ symbol, icon, type }), [symbol, icon, type])
  const src = sources[sourceIndex]
  const ticker = cleanSymbol(symbol)
  const fallback = ticker.slice(0, 3) || '?'
  const liftDarkMark = DARK_MARK_SYMBOLS.has(ticker)

  useEffect(() => {
    setSourceIndex(0)
  }, [symbol, icon, type])

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: radius,
      overflow: 'hidden',
      flexShrink: 0,
      background: '#000',
      border: '1px solid rgba(255,255,255,0.10)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
    }}>
      {src ? (
        <img
          src={src}
          alt={symbol}
          width={size}
          height={size}
          loading="lazy"
          referrerPolicy="no-referrer"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            padding: Math.max(2, Math.round(size * 0.07)),
            filter: liftDarkMark ? 'invert(1) brightness(1.45)' : 'none',
          }}
          onError={() => setSourceIndex(i => i + 1)}
        />
      ) : (
        <span style={{ color: '#f8fafc', fontSize: Math.max(9, Math.round(size * 0.28)), fontWeight: 800, fontFamily: 'var(--mono)' }}>{fallback}</span>
      )}
    </div>
  )
}
