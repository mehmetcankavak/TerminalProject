import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'

// ── Static data ──────────────────────────────────────────────────────────────
const TOOLS = [
  { id: 'liquidations-stream', tag: 'LIQ',   pro: true,  color: '#f23645', dim: 'rgba(242,54,69,0.14)'   },
  { id: 'funding-rate',        tag: 'FUND',  pro: true,  color: '#3b82f6', dim: 'rgba(59,130,246,0.14)'  },
  { id: 'long-short-ratio',    tag: 'L/S',   pro: true,  color: '#f5a623', dim: 'rgba(245,166,35,0.14)'  },
  { id: 'volume-monitor',      tag: 'VOL',   pro: true,  color: '#a855f7', dim: 'rgba(168,85,247,0.14)'  },
  { id: 'big-transfers',       tag: 'WHALE', pro: true,  color: '#06b6d4', dim: 'rgba(6,182,212,0.14)'   },
  { id: 'token-unlock',        tag: 'VEST',  pro: true,  color: '#f97316', dim: 'rgba(249,115,22,0.14)'  },
  { id: 'custom-alerts',       tag: 'ALT',   pro: true,  color: '#eab308', dim: 'rgba(234,179,8,0.14)'   },
  { id: 'portfolio',           tag: 'PF',    pro: true,  color: '#00e87a', dim: 'rgba(0,232,122,0.14)'   },
  { id: 'smart-money',         tag: 'SM',    pro: true,  color: '#2dd4bf', dim: 'rgba(45,212,191,0.14)'  },
  { id: 'global-metrics',      tag: 'MKT',   pro: false, color: '#8b5cf6', dim: 'rgba(139,92,246,0.14)'  },
  { id: 'economic-calendar',   tag: 'CAL',   pro: false, color: '#94a3b8', dim: 'rgba(148,163,184,0.14)' },
  { id: 'spot-markets',        tag: 'SPOT',  pro: false, color: '#f59e0b', dim: 'rgba(245,158,11,0.14)'  },
  { id: 'terminal',            tag: 'TERM',  pro: true,  color: '#00e87a', dim: 'rgba(0,232,122,0.14)'   },
]

const MARQUEE_ITEMS = [
  'Binance', 'OKX', 'Bybit', 'Hyperliquid',
  '<50ms Latency', '24/7 Live Data', '13+ Tools',
  'Real-Time Liquidations', 'Whale Alerts', 'Smart Money', 'Funding Rates',
]

function rnd(min, max, dec = 1) {
  return (min + Math.random() * (max - min)).toFixed(dec)
}

// ── Tool icons (inline SVG glyphs) ───────────────────────────────────────────
function ToolIcon({ id, color }) {
  const icons = {
    'liquidations-stream': (
      <svg viewBox="0 0 20 20" fill="none">
        <path d="M10 2 L6 10 H9 L7 18 L14 8 H11 Z" fill={color} opacity=".9"/>
      </svg>
    ),
    'funding-rate': (
      <svg viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7" stroke={color} strokeWidth="1.5" opacity=".7"/>
        <path d="M7 13 L10 7 L13 13" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="10" cy="13.5" r="1" fill={color}/>
      </svg>
    ),
    'long-short-ratio': (
      <svg viewBox="0 0 20 20" fill="none">
        <rect x="3" y="11" width="5" height="6" rx="1" fill={color} opacity=".85"/>
        <rect x="12" y="7" width="5" height="10" rx="1" fill={color} opacity=".45"/>
        <path d="M5.5 11 L5.5 4 M5.5 4 L3.5 6 M5.5 4 L7.5 6" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
    'volume-monitor': (
      <svg viewBox="0 0 20 20" fill="none">
        <rect x="2"  y="13" width="3" height="5" rx="1" fill={color} opacity=".45"/>
        <rect x="7"  y="9"  width="3" height="9" rx="1" fill={color} opacity=".65"/>
        <rect x="12" y="5"  width="3" height="13" rx="1" fill={color} opacity=".85"/>
        <rect x="17" y="11" width="3" height="7" rx="1" fill={color} opacity=".55"/>
      </svg>
    ),
    'big-transfers': (
      <svg viewBox="0 0 20 20" fill="none">
        <path d="M3 10 Q10 4 17 10" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity=".6"/>
        <path d="M3 10 Q10 16 17 10" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity=".9"/>
        <circle cx="3"  cy="10" r="2" fill={color} opacity=".7"/>
        <circle cx="17" cy="10" r="2" fill={color} opacity=".7"/>
      </svg>
    ),
    'token-unlock': (
      <svg viewBox="0 0 20 20" fill="none">
        <rect x="5" y="9" width="10" height="8" rx="2" stroke={color} strokeWidth="1.5" opacity=".85"/>
        <path d="M7.5 9 V6.5 A2.5 2.5 0 0 1 12.5 6.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity=".6"/>
        <circle cx="10" cy="13" r="1.5" fill={color}/>
      </svg>
    ),
    'custom-alerts': (
      <svg viewBox="0 0 20 20" fill="none">
        <path d="M10 3 A5 5 0 0 1 15 8 V12 L16.5 14 H3.5 L5 12 V8 A5 5 0 0 1 10 3 Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" opacity=".85"/>
        <path d="M8.5 14 A1.5 1.5 0 0 0 11.5 14" stroke={color} strokeWidth="1.3" strokeLinecap="round" opacity=".7"/>
        <circle cx="14" cy="4" r="2.5" fill={color}/>
      </svg>
    ),
    'portfolio': (
      <svg viewBox="0 0 20 20" fill="none">
        <path d="M10 10 L10 3 A7 7 0 0 1 17 10 Z" fill={color} opacity=".85"/>
        <path d="M10 10 L3 10 A7 7 0 0 1 10 3 Z" fill={color} opacity=".45"/>
        <path d="M10 10 L16.06 13.5 A7 7 0 0 1 3 10 Z" fill={color} opacity=".65"/>
        <circle cx="10" cy="10" r="2.5" fill="#0a0a0a"/>
      </svg>
    ),
    'smart-money': (
      <svg viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="9" r="5" stroke={color} strokeWidth="1.5" opacity=".8"/>
        <circle cx="8.5" cy="8" r="1" fill={color}/>
        <circle cx="11.5" cy="8" r="1" fill={color}/>
        <path d="M8 11 Q10 13 12 11" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity=".7"/>
        <path d="M5 15 Q10 17 15 15" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity=".45"/>
      </svg>
    ),
    'global-metrics': (
      <svg viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7" stroke={color} strokeWidth="1.4" opacity=".7"/>
        <path d="M10 3 Q13 10 10 17 Q7 10 10 3" stroke={color} strokeWidth="1.2" opacity=".6"/>
        <path d="M3.5 8 H16.5 M3.5 12 H16.5" stroke={color} strokeWidth="1.2" opacity=".5"/>
      </svg>
    ),
    'economic-calendar': (
      <svg viewBox="0 0 20 20" fill="none">
        <rect x="3" y="5" width="14" height="12" rx="2" stroke={color} strokeWidth="1.4" opacity=".7"/>
        <path d="M3 9 H17" stroke={color} strokeWidth="1.2" opacity=".5"/>
        <path d="M7 3 V7 M13 3 V7" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity=".7"/>
        <rect x="6"  y="12" width="2" height="2" rx=".5" fill={color} opacity=".7"/>
        <rect x="9"  y="12" width="2" height="2" rx=".5" fill={color} opacity=".5"/>
        <rect x="12" y="12" width="2" height="2" rx=".5" fill={color} opacity=".35"/>
      </svg>
    ),
    'spot-markets': (
      <svg viewBox="0 0 20 20" fill="none">
        <rect x="4"  y="7" width="3" height="6" rx="1" stroke={color} strokeWidth="1.3" opacity=".8"/>
        <rect x="8.5" y="5" width="3" height="4" rx="1" fill={color} opacity=".85"/>
        <rect x="13" y="8" width="3" height="5" rx="1" stroke={color} strokeWidth="1.3" opacity=".8"/>
        <path d="M4 13 H5.5 M8.5 9 H10 M13 10.5 H14.5" stroke={color} strokeWidth="1" opacity=".6"/>
        <path d="M3 16 Q10 14 17 16" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity=".4"/>
      </svg>
    ),
    'terminal': (
      <svg viewBox="0 0 20 20" fill="none">
        <rect x="2" y="4" width="16" height="12" rx="2" stroke={color} strokeWidth="1.4" opacity=".7"/>
        <path d="M6 8 L9 11 L6 14" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M11 14 H15" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  }
  return icons[id] || null
}

// ── 3D Tilt card ─────────────────────────────────────────────────────────────
function TiltCard({ children, className, style }) {
  const ref = useRef(null)
  const onMove = useCallback((e) => {
    const el = ref.current; if (!el) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width  - 0.5
    const y = (e.clientY - r.top)  / r.height - 0.5
    el.style.transform = `perspective(900px) rotateX(${-y * 8}deg) rotateY(${x * 8}deg) translateZ(12px)`
    el.style.setProperty('--gx', `${(x + 0.5) * 100}%`)
    el.style.setProperty('--gy', `${(y + 0.5) * 100}%`)
  }, [])
  const onLeave = useCallback(() => {
    if (!ref.current) return
    ref.current.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateZ(0px)'
  }, [])
  return (
    <div ref={ref} className={className} style={style} onMouseMove={onMove} onMouseLeave={onLeave}>
      {children}
    </div>
  )
}

// ── CardStack ────────────────────────────────────────────────────────────────
function wrapIdx(n, len) { return len <= 0 ? 0 : ((n % len) + len) % len }
function signedOff(i, active, len) {
  const raw = i - active
  const alt = raw > 0 ? raw - len : raw + len
  return Math.abs(alt) < Math.abs(raw) ? alt : raw
}

function CardStack({ items, autoAdvance = true, intervalMs = 3500 }) {
  const len = items.length
  const [active, setActive] = useState(0)
  const [hovering, setHovering] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef(null)

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 520
  const cardW = isMobile ? Math.min(window.innerWidth - 40, 340) : 420
  const cardH = isMobile ? 270 : 300

  useEffect(() => {
    if (!autoAdvance || hovering || dragging) return
    const id = setInterval(() => setActive(a => wrapIdx(a + 1, len)), intervalMs)
    return () => clearInterval(id)
  }, [autoAdvance, hovering, dragging, len, intervalMs])

  const maxOff = isMobile ? 2 : 3
  const overlap = isMobile ? 0.62 : 0.52
  const spacing = Math.round(cardW * (1 - overlap))
  const stepDeg = isMobile ? 10 : 14
  const depthPx = isMobile ? 60 : 110

  return (
    <div
      className="cs-root"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="cs-stage" style={{ height: cardH + 100 }}>
        <AnimatePresence initial={false}>
          {items.map((item, i) => {
            const off = signedOff(i, active, len)
            const abs = Math.abs(off)
            if (abs > maxOff) return null
            const isActive = off === 0
            const x = off * spacing
            const y = abs * 8
            const rotateZ = off * stepDeg
            const rotateX = isActive ? 0 : 10
            const scale = isActive ? 1.04 : 0.92 - abs * 0.02
            const lift = isActive ? -24 : 0
            const zIndex = 100 - abs

            return (
              <motion.div
                key={item.id}
                className={`cs-card ${isActive ? 'cs-active' : ''}`}
                style={{
                  width: cardW, height: cardH, zIndex,
                  '--cc': item.color, '--cd': item.dim,
                  cursor: isActive ? 'grab' : 'pointer',
                }}
                animate={{ x, y: y + lift, rotateZ, rotateX, scale, opacity: 1 }}
                initial={{ opacity: 0, y: y + 60, x, rotateZ, rotateX, scale }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                onClick={() => !isActive && setActive(i)}
                onMouseDown={isActive ? (e) => { dragStart.current = e.clientX; setDragging(true) } : undefined}
                onMouseUp={isActive ? (e) => {
                  if (dragStart.current !== null) {
                    const dx = e.clientX - dragStart.current
                    if (dx > 60) setActive(a => wrapIdx(a - 1, len))
                    else if (dx < -60) setActive(a => wrapIdx(a + 1, len))
                  }
                  dragStart.current = null; setDragging(false)
                } : undefined}
                onTouchStart={isActive ? (e) => { dragStart.current = e.touches[0].clientX; setDragging(true) } : undefined}
                onTouchEnd={isActive ? (e) => {
                  if (dragStart.current !== null) {
                    const dx = e.changedTouches[0].clientX - dragStart.current
                    if (dx > 50) setActive(a => wrapIdx(a - 1, len))
                    else if (dx < -50) setActive(a => wrapIdx(a + 1, len))
                  }
                  dragStart.current = null; setDragging(false)
                } : undefined}
              >
                {/* accent top bar */}
                <div className="cs-bar" style={{ background: item.color }} />
                {/* corner number */}
                <span className="cs-num">{String(i + 1).padStart(2, '0')}</span>
                {/* header: icon + meta */}
                <div className="cs-head">
                  <div className="cs-icon-wrap" style={{ background: item.dim }}>
                    <ToolIcon id={item.id} color={item.color} />
                  </div>
                  <div className="cs-meta">
                    <div className="cs-name">{item.name}</div>
                    <div className="cs-tags">
                      <span className="cs-tag" style={{ color: item.color, borderColor: item.color }}>{item.tag}</span>
                      {item.pro && <span className="cs-pro">PRO</span>}
                    </div>
                  </div>
                </div>
                {/* mini preview */}
                <div className="cs-preview">
                  {isActive ? item.mini : <div className="cs-preview-blur" />}
                </div>
                {/* bottom glow */}
                <div className="cs-glow" style={{ background: `radial-gradient(ellipse at 50% 110%, ${item.color}30, transparent 70%)` }} />
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* dots */}
      <div className="cs-dots">
        {items.map((it, idx) => (
          <button
            key={it.id}
            className={`cs-dot ${idx === active ? 'cs-dot-on' : ''}`}
            style={idx === active ? { background: items[active].color } : {}}
            onClick={() => setActive(idx)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Token Logo Ticker ─────────────────────────────────────────────────────────
const CG = 'https://coin-images.coingecko.com/coins/images'
const TOKEN_LIST = [
  { sym:'BTC',  color:'#F7931A', img:`${CG}/1/large/bitcoin.png` },
  { sym:'ETH',  color:'#627EEA', img:`${CG}/279/large/ethereum.png` },
  { sym:'SOL',  color:'#9945FF', img:`${CG}/4128/large/solana.png` },
  { sym:'BNB',  color:'#F0B90B', img:`${CG}/825/large/bnb-icon2_2x.png` },
  { sym:'XRP',  color:'#00AAE4', img:`${CG}/44/large/xrp-symbol-white-128.png` },
  { sym:'USDT', color:'#26A17B', img:`${CG}/325/large/Tether.png` },
  { sym:'HYPE', color:'#00E87A', img:'https://assets.coingecko.com/coins/images/50882/large/hyperliquid.jpg' },
  { sym:'AVAX', color:'#E84142', img:`${CG}/12559/large/Avalanche_Circle_RedWhite_Trans.png` },
  { sym:'DOGE', color:'#C2A633', img:`${CG}/5/large/dogecoin.png` },
  { sym:'ARB',  color:'#12AAFF', img:`${CG}/16547/large/photo_2023-03-29_21.47.00.jpeg` },
  { sym:'SUI',  color:'#4DA2FF', img:`${CG}/26375/large/sui_asset.jpeg` },
  { sym:'OP',   color:'#FF0420', img:`${CG}/25244/large/Optimism.png` },
  { sym:'LINK', color:'#2A5ADA', img:`${CG}/877/large/chainlink-new-logo.png` },
  { sym:'DOT',  color:'#E6007A', img:`${CG}/12171/large/polkadot.png` },
  { sym:'APT',  color:'#1FD1A3', img:`${CG}/26455/large/aptos_round.png` },
  { sym:'JUP',  color:'#C7A857', img:`${CG}/34188/large/jup.png` },
  { sym:'UNI',  color:'#FF007A', img:`${CG}/12504/large/uni.jpg` },
  { sym:'ATOM', color:'#8B8FAE', img:`${CG}/1481/large/cosmos_hub.png` },
]

function TokenTicker() {
  const all = [...TOKEN_LIST, ...TOKEN_LIST]
  return (
    <div className="tt-wrap">
      <div className="tt-fade-l" /><div className="tt-fade-r" />
      <div className="tt-track">
        {all.map((t, i) => (
          <div key={i} className="tt-token">
            <div className="tt-circle" style={{ '--tc': t.color }}>
              <img
                src={t.img}
                alt={t.sym}
                className="tt-img"
                onError={e => { e.currentTarget.style.display='none'; e.currentTarget.nextSibling.style.display='flex' }}
              />
              <span className="tt-fallback" style={{ color: t.color }}>{t.sym.slice(0,2)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Infinite marquee ─────────────────────────────────────────────────────────
function Marquee({ items }) {
  const doubled = [...items, ...items]
  return (
    <div className="ld3-mq-wrap">
      <div className="ld3-mq-fade-l" /><div className="ld3-mq-fade-r" />
      <div className="ld3-mq-track">
        {doubled.map((item, i) => (
          <span key={i} className="ld3-mq-item">
            <span className="ld3-mq-dot" />{item}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Hero Visual ───────────────────────────────────────────────────────────────
function HeroVisual() {
  const [btc, setBtc] = useState(67480)
  const [liqAmt, setLiqAmt] = useState(124)
  const [whaleAmt, setWhaleAmt] = useState(4.2)
  const [fundRate, setFundRate] = useState(0.083)
  const [btcUp, setBtcUp] = useState(true)

  useEffect(() => {
    const id = setInterval(() => {
      setBtc(p => { const n = p + (Math.random() - 0.48) * 60; setBtcUp(n > p); return Math.round(n) })
      setLiqAmt(p => Math.max(80, Math.min(220, p + (Math.random() - 0.5) * 12)))
      setWhaleAmt(p => parseFloat(Math.max(1, Math.min(12, p + (Math.random() - 0.5) * 0.8)).toFixed(1)))
      setFundRate(p => parseFloat(Math.max(0.01, Math.min(0.18, p + (Math.random() - 0.5) * 0.008)).toFixed(3)))
    }, 1800)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="hv-root">
      {/* Ambient glow */}
      <div className="hv-ambient" />

      {/* Rotating orbit rings */}
      <div className="hv-ring hv-ring-outer" />
      <div className="hv-ring hv-ring-mid" />

      {/* Main terminal frame */}
      <div className="hv-frame">
        <div className="hv-corner hv-c-tl" />
        <div className="hv-corner hv-c-tr" />
        <div className="hv-corner hv-c-bl" />
        <div className="hv-corner hv-c-br" />
        <div className="hv-frame-inner">
          <TerminalPreview />
        </div>
        <div className="hv-frame-glow" />
      </div>

      {/* Floating data bubbles */}
      <div className="hv-bubble hv-b-btc">
        <span className="hv-b-label">BTC / USDT</span>
        <span className={`hv-b-price ${btcUp ? 'up' : 'down'}`}>${btc.toLocaleString()}</span>
        <span className={`hv-b-change ${btcUp ? 'up' : 'down'}`}>{btcUp ? '▲' : '▼'} {btcUp ? '+' : ''}{((btc - 67000) / 670).toFixed(2)}%</span>
      </div>

      <div className="hv-bubble hv-b-liq">
        <div className="hv-b-row">
          <span className="bm-pulse-dot" />
          <span className="hv-b-label">24H LIQ</span>
        </div>
        <span className="hv-b-price red">${liqAmt.toFixed(0)}M</span>
      </div>

      <div className="hv-bubble hv-b-whale">
        <span className="hv-b-label">WHALE ALERT</span>
        <span className="hv-b-whale-val">${whaleAmt}M BTC</span>
        <span className="hv-b-label" style={{color:'rgba(245,158,11,.7)'}}>ON-CHAIN</span>
      </div>

      <div className="hv-bubble hv-b-fund">
        <span className="hv-b-label">FUND RATE</span>
        <span className="hv-b-price" style={{color:'#3b82f6'}}>+{fundRate}%</span>
      </div>
    </div>
  )
}

// ── Animated terminal ─────────────────────────────────────────────────────────
const TERM_LINES = [
  { label: '[SYS]',    cls: '',          text: () => 'WebSocket connected — Binance · OKX · Bybit · Hyperliquid' },
  { label: '[LIQ]',    cls: 'ta',        text: () => `1h Long: $${rnd(95,180)}M  Short: $${rnd(60,120)}M` },
  { label: '[FUND]',   cls: 'ta',        text: () => `BTC Binance: +0.${rnd(60,99,0)}%  OKX: +0.${rnd(70,99,0)}%` },
  { label: '[WHALE]',  cls: 'tw',        text: () => `BTC/USDT — $${rnd(1.2,8.5)}M ${Math.random()>.5?'SELL':'BUY'} — ${['Binance Perp','OKX Spot','Bybit Perp'][Math.floor(Math.random()*3)]}` },
  { label: '[ALARM]',  cls: 'tw',        text: () => `ETH/USDT target reached — $${rnd(2800,4200,0)}` },
  { label: '[L/S]',    cls: '',          text: () => { const l=rnd(48,62,1); return `BTC Long: ${l}%  Short: ${(100-l).toFixed(1)}%  — ${l>55?'LONG HEAVY':l<45?'SHORT HEAVY':'NEUTRAL'}` } },
  { label: '[SMART]',  cls: 'ta',        text: () => { const a='0x'+Math.random().toString(16).slice(2,6)+'...'; const c=['ETH','BTC','SOL','HYPE','ARB'][Math.floor(Math.random()*5)]; return `${a} opened ${c} ${Math.random()>.4?'LONG':'SHORT'} $${rnd(200,900,0)}K` } },
  { label: '[UNLOCK]', cls: 'td',        text: () => `${['SUI','ARB','OP','JUP','PYTH'][Math.floor(Math.random()*5)]} — ${rnd(20,200,0)}M tokens — $${rnd(40,350,0)}M value` },
]

function TerminalPreview() {
  const [visible, setVisible] = useState(0)
  const [lines, setLines] = useState(() => TERM_LINES.map(l => ({ ...l, t: l.text() })))
  useEffect(() => {
    if (visible >= TERM_LINES.length) return
    const id = setTimeout(() => setVisible(c => c + 1), 370 + Math.random() * 160)
    return () => clearTimeout(id)
  }, [visible])
  useEffect(() => {
    if (visible < TERM_LINES.length) return
    const id = setInterval(() => {
      setLines(prev => {
        const next = [...prev]; const idxs = new Set()
        while (idxs.size < 2 + Math.floor(Math.random()*2)) idxs.add(1 + Math.floor(Math.random()*(TERM_LINES.length-1)))
        idxs.forEach(i => { next[i] = { ...next[i], t: TERM_LINES[i].text() } }); return next
      })
    }, 3200)
    return () => clearInterval(id)
  }, [visible])

  return (
    <div className="ld3-term">
      <div className="ld3-term-bar">
        <span className="ld3-tdot r" /><span className="ld3-tdot y" /><span className="ld3-tdot g" />
        <span className="ld3-term-title">trading-terminal — live</span>
        <span className="ld3-term-live"><span className="ld3-term-live-dot" />LIVE</span>
      </div>
      <div className="ld3-term-body">
        {lines.map((l, i) => (
          <div key={i} className={`ld3-tline ${l.cls} ${i < visible ? 'in' : 'out'}`}>
            <span className="ld3-tl">{l.label}</span>
            <span className="ld3-tt">{l.t}</span>
          </div>
        ))}
        <div className={`ld3-tcur ${visible >= TERM_LINES.length ? 'blink' : ''}`}>_</div>
      </div>
    </div>
  )
}

// ── Mini shared components ────────────────────────────────────────────────────

// Sentiment gauge (BEARISH ←●→ BULLISH) — used on most screens
function SentGauge({ score }) {
  const s = Math.max(3, Math.min(97, score))
  const color = s > 62 ? '#00e87a' : s < 38 ? '#f43f5e' : '#f5a623'
  const label = s > 62 ? 'BULLISH' : s < 38 ? 'BEARISH' : 'NEUTRAL'
  return (
    <div className="sg-wrap">
      <div className="sg-track">
        <div className="sg-seg sg-bear"/><div className="sg-seg sg-neut"/><div className="sg-seg sg-bull"/>
        <div className="sg-dot" style={{ left:`${s}%`, background:color, boxShadow:`0 0 8px ${color}` }}/>
      </div>
      <div className="sg-row">
        <span className="sg-lbl">BEARISH</span>
        <span className="sg-verdict" style={{ color }}>{label}</span>
        <span className="sg-lbl">BULLISH</span>
      </div>
    </div>
  )
}

// 4-card stat grid
function StatGrid({ stats }) {
  return (
    <div className="stg-grid">
      {stats.map((s,i) => (
        <div key={i} className="stg-card">
          <span className="stg-v" style={{ color:s.c }}>{s.v}</span>
          <span className="stg-l">{s.l}</span>
        </div>
      ))}
    </div>
  )
}

// ── Bento mini-visualizations ─────────────────────────────────────────────────

function Sparkline({ data, color, height = 32 }) {
  if (!data || data.length < 2) return null
  const w = 120, h = height
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={h} style={{ overflow:'visible' }}>
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#sg-${color.replace('#','')})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LiqMini() {
  const [score, setScore] = useState(35)
  const [rows, setRows] = useState([
    { sym:'BTC',  lng:45, sht:22 },
    { sym:'ETH',  lng:28, sht:15 },
    { sym:'SOL',  lng:12, sht:8  },
    { sym:'HYPE', lng:8,  sht:11 },
  ])
  useEffect(() => {
    const id = setInterval(() => {
      setScore(s => Math.max(10,Math.min(90, s+(Math.random()-.5)*10)))
      setRows(prev => prev.map(r => ({
        ...r,
        lng: Math.max(1, r.lng+(Math.random()-.5)*5),
        sht: Math.max(1, r.sht+(Math.random()-.5)*4),
      })).sort((a,b)=>(b.lng+b.sht)-(a.lng+a.sht)))
    }, 2200)
    return () => clearInterval(id)
  }, [])
  const lT = rows.reduce((a,r)=>a+r.lng,0), sT = rows.reduce((a,r)=>a+r.sht,0)
  const max = Math.max(...rows.map(r=>r.lng+r.sht))
  return (
    <div className="bm2">
      <div className="bm2-hd">
        <div className="bm-live-badge"><span className="bm-pulse-dot"/>24H LIQUIDATIONS</div>
        <span className="bm2-bignum">${(lT+sT).toFixed(0)}M total</span>
      </div>
      <SentGauge score={score}/>
      <StatGrid stats={[
        {v:`$${lT.toFixed(0)}M`, l:'LONG LIQ',  c:'#f43f5e'},
        {v:`$${sT.toFixed(0)}M`, l:'SHORT LIQ', c:'#00e87a'},
        {v:lT>sT?'LONGS':'SHORTS', l:'DOMINANT', c:'rgba(255,255,255,.8)'},
        {v:`${(lT/(lT+sT)*100).toFixed(0)}%`, l:'1H PRESSURE', c:'#f5a623'},
      ]}/>
      <div className="bm2-table">
        {rows.map((r,i)=>(
          <div key={r.sym} className="bm2-liq-row">
            <span className="bm2-rank">#{i+1}</span>
            <span className="bm2-sym">{r.sym}</span>
            <div className="bm2-stkbar">
              <div className="bm2-stk-l" style={{width:`${(r.lng/max)*80}%`}}/>
              <div className="bm2-stk-s" style={{width:`${(r.sht/max)*80}%`}}/>
            </div>
            <div className="bm2-dbl"><span style={{color:'#f43f5e'}}>${r.lng.toFixed(0)}M</span><span style={{color:'#00e87a'}}>${r.sht.toFixed(0)}M</span></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function WhaleMini() {
  const CC = {ETH:'#a78bfa',BTC:'#f59e0b',TRON:'#ef4444',SOL:'#9945ff',BNB:'#f0b90b'}
  const FC = {INFLOW:'#f43f5e',OUTFLOW:'#00e87a',MINT:'#3b82f6',BURN:'#a855f7'}
  const LBLS = ['Binance Hot','Coinbase','Jump Trading','OKX Exchange','Unknown Whale','DWF Labs']
  const addr = () => '0x'+Math.random().toString(16).slice(2,6)+'...'+Math.random().toString(16).slice(2,6)
  const mkRow = (id) => {
    const chain = ['ETH','BTC','TRON','SOL','BNB'][Math.floor(Math.random()*5)]
    const flow = ['INFLOW','OUTFLOW','INFLOW','OUTFLOW','MINT'][Math.floor(Math.random()*5)]
    return {id, chain, flow, val:parseFloat(rnd(1,80)), from:addr(), label:LBLS[Math.floor(Math.random()*LBLS.length)], new:false}
  }
  const [score, setScore] = useState(55)
  const [txs, setTxs] = useState(() => [0,1,2,3].map(mkRow))
  const nid = useRef(10)
  useEffect(() => {
    const id = setInterval(() => {
      const row = {...mkRow(nid.current++), new:true}
      setTxs(p=>[row,...p.slice(0,3)])
      setScore(s=>Math.max(15,Math.min(85,s+(Math.random()-.5)*8)))
      setTimeout(()=>setTxs(p=>p.map(t=>t.id===row.id?{...t,new:false}:t)),600)
    }, 2500)
    return ()=>clearInterval(id)
  }, [])
  const inT=txs.filter(t=>t.flow==='INFLOW').reduce((a,t)=>a+t.val,0)
  const outT=txs.filter(t=>t.flow==='OUTFLOW').reduce((a,t)=>a+t.val,0)
  return (
    <div className="bm2">
      <div className="bm2-hd">
        <div className="bm-live-badge"><span className="bm-pulse-dot"/>WHALE TRANSFERS</div>
        <div className="bm2-pills">{['$1M+','$5M+','$10M+'].map(p=><span key={p} className="bm2-pill">{p}</span>)}</div>
      </div>
      <SentGauge score={score}/>
      <StatGrid stats={[
        {v:`$${inT.toFixed(0)}M`, l:'COIN IN',  c:'#f43f5e'},
        {v:`$${outT.toFixed(0)}M`,l:'COIN OUT', c:'#00e87a'},
        {v:txs.length,            l:'24H TXS',  c:'rgba(255,255,255,.75)'},
        {v:'ON-CHAIN',            l:'STATUS',   c:'#00e87a'},
      ]}/>
      <div className="bm2-table">
        {txs.map(t=>{
          const cc=CC[t.chain]||'#f59e0b', fc=FC[t.flow]||'#f5a623'
          return (
            <div key={t.id} className={`bm2-tx-row${t.new?' new':''}`}>
              <span className="bm2-chain" style={{color:cc,borderColor:cc+'50'}}>{t.chain}</span>
              <span className="bm2-tx-amt">${t.val.toFixed(1)}M</span>
              <span className="bm2-flow" style={{color:fc,background:fc+'18',borderColor:fc+'40'}}>{t.flow}</span>
              <span className="bm2-tx-lbl">{t.from} <span className="bm2-arrow">→</span> {t.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FundMini() {
  const [score, setScore] = useState(68)
  const [secs, setSecs] = useState(7*3600+45*60+23)
  const [rates, setRates] = useState([
    {sym:'BTC',  bnb:0.0082,okx:0.0091,byb:0.0076},
    {sym:'ETH',  bnb:0.0071,okx:0.0065,byb:0.0079},
    {sym:'SOL',  bnb:-0.003,okx:-0.002,byb:-0.004},
    {sym:'HYPE', bnb:0.0120,okx:0.0118,byb:0.0125},
  ])
  useEffect(()=>{
    const id=setInterval(()=>{
      setSecs(c=>c>0?c-1:8*3600)
      setScore(s=>Math.max(15,Math.min(85,s+(Math.random()-.5)*5)))
      setRates(prev=>prev.map(r=>{const d=(Math.random()-.49)*.0015;return{...r,bnb:parseFloat((r.bnb+d).toFixed(4)),okx:parseFloat((r.okx+d*.9).toFixed(4)),byb:parseFloat((r.byb+d*1.1).toFixed(4))}}))
    },1500)
    return()=>clearInterval(id)
  },[])
  const fmt=s=>{const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60;return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`}
  const avg=rates.reduce((a,r)=>a+r.bnb,0)/rates.length
  const ob=rates.filter(r=>r.bnb>0.01).length
  const os=rates.filter(r=>r.bnb<-0.005).length
  const pct=(secs%(8*3600))/(8*3600)*100
  return (
    <div className="bm2">
      <div className="bm2-hd">
        <div className="bm-live-badge"><span className="bm-pulse-dot green"/>FUNDING RATES</div>
        <span className="bm2-bignum" style={{color:avg>=0?'#00e87a':'#f43f5e'}}>{avg>=0?'+':''}{(avg*100).toFixed(3)}% avg</span>
      </div>
      <SentGauge score={score}/>
      <StatGrid stats={[
        {v:os,          l:'OVERSOLD',   c:'#00e87a'},
        {v:ob,          l:'OVERBOUGHT', c:'#f43f5e'},
        {v:`${(avg*100).toFixed(3)}%`,l:'AVG RATE',c:avg>=0?'#00e87a':'#f43f5e'},
        {v:ob+os,       l:'ARB OPPS',   c:'#f5a623'},
      ]}/>
      <div className="bm2-exch-row">
        {['BNB','OKX','BYBIT','BITGET','HL'].map(ex=>(
          <div key={ex} className="bm2-exch-box">
            <span className="bm2-exch-nm">{ex}</span>
            <span className="bm2-exch-timer">{fmt(secs)}</span>
            <div className="bm2-exch-pb"><div className="bm2-exch-fill" style={{width:`${pct}%`}}/></div>
          </div>
        ))}
      </div>
      <div className="bm2-table">
        {rates.map(r=>{
          const sp=Math.abs(Math.max(r.bnb,r.okx,r.byb)-Math.min(r.bnb,r.okx,r.byb))
          const arb=sp>0.001
          return(
            <div key={r.sym} className={`bm2-fund-row${arb?' arb':''}`}>
              <span className="bm2-sym">{r.sym}</span>
              {[[r.bnb,'BNB'],[r.okx,'OKX'],[r.byb,'BYBIT']].map(([v,ex])=>(
                <span key={ex} className={`bm2-rate${v>=0?' pos':' neg'}`}>{v>=0?'+':''}{(v*100).toFixed(3)}%</span>
              ))}
              {arb&&<span className="bm2-arb">ARB</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SmartMini() {
  const [score, setScore] = useState(64)
  const [traders, setTraders] = useState([
    {id:1,addr:'0x7f2a...c891',sym:'HYPE',side:'LONG', lev:10,pnl:84200,roi:42,val:4.2},
    {id:2,addr:'0x3e9b...12fa',sym:'BTC', side:'SHORT',lev:5, pnl:31500,roi:28,val:2.1},
    {id:3,addr:'0xaa19...e73b',sym:'SOL', side:'LONG', lev:8, pnl:12300,roi:19,val:0.9},
    {id:4,addr:'0xc721...9f4d',sym:'ARB', side:'LONG', lev:15,pnl:8900, roi:15,val:0.6},
  ])
  useEffect(()=>{
    const id=setInterval(()=>{
      setScore(s=>Math.max(20,Math.min(85,s+(Math.random()-.45)*6)))
      setTraders(prev=>prev.map(t=>({...t,pnl:Math.max(0,t.pnl+(Math.random()-.38)*400),roi:Math.max(1,t.roi+(Math.random()-.45)*.5)})))
    },1600)
    return()=>clearInterval(id)
  },[])
  const fmt=n=>n>=1000?`$${(n/1000).toFixed(1)}K`:`$${n.toFixed(0)}`
  const bullV=traders.filter(t=>t.side==='LONG').reduce((a,t)=>a+t.val,0)
  const bearV=traders.filter(t=>t.side==='SHORT').reduce((a,t)=>a+t.val,0)
  return (
    <div className="bm2">
      <div className="bm2-hd">
        <div className="bm-live-badge"><span className="bm-pulse-dot purple"/>SMART MONEY</div>
        <span className="bm2-bignum">{traders.length} following</span>
      </div>
      <SentGauge score={score}/>
      <StatGrid stats={[
        {v:`$${bullV.toFixed(1)}M`,l:'BULL VOL',   c:'#00e87a'},
        {v:`$${bearV.toFixed(1)}M`,l:'BEAR VOL',   c:'#f43f5e'},
        {v:traders.filter(t=>t.side==='LONG').length, l:'LONGS',c:'#00e87a'},
        {v:traders.filter(t=>t.side==='SHORT').length,l:'SHORTS',c:'#f43f5e'},
      ]}/>
      <div className="bm2-table">
        {traders.map((t,i)=>(
          <div key={t.id} className="bm2-trader-row">
            <span className="bm2-rank">#{i+1}</span>
            <div className="bm2-trader-info">
              <span className="bm2-addr">{t.addr}</span>
              <div className="bm2-trader-tags">
                <span className={`bm2-side ${t.side==='LONG'?'long':'short'}`}>{t.side}</span>
                <span className="bm2-sym">{t.sym}</span>
                <span className="bm2-lev">{t.lev}x</span>
              </div>
            </div>
            <div className="bm2-trader-right">
              <span className="bm2-pnl">{fmt(t.pnl)}</span>
              <span className="bm2-roi">ROI {t.roi.toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LSMini() {
  const [d, setD] = useState({btc:58.4,eth:52.1,sol:61.3,bnb:55.8})
  const [period, setPeriod] = useState('1h')
  useEffect(()=>{
    const id=setInterval(()=>setD(p=>({
      btc:Math.max(30,Math.min(70,p.btc+(Math.random()-.47)*1.2)),
      eth:Math.max(30,Math.min(70,p.eth+(Math.random()-.5)*1)),
      sol:Math.max(30,Math.min(70,p.sol+(Math.random()-.45)*1.4)),
      bnb:Math.max(30,Math.min(70,p.bnb+(Math.random()-.5)*.9)),
    })),1600)
    return()=>clearInterval(id)
  },[])
  const signal=d.btc>55?'LONG HEAVY':d.btc<45?'SHORT HEAVY':'NEUTRAL'
  const sigColor=d.btc>55?'#00e87a':d.btc<45?'#f43f5e':'#f5a623'
  const pairs=[{sym:'BTC',lng:d.btc},{sym:'ETH',lng:d.eth},{sym:'SOL',lng:d.sol},{sym:'BNB',lng:d.bnb}]
  return (
    <div className="bm2">
      <div className="bm2-hd">
        <div className="bm-live-badge"><span className="bm-pulse-dot green"/>LONG/SHORT RATIO</div>
        <div className="bm2-pills">{['5m','15m','1h','4h','1d'].map(p=><button key={p} className={`bm2-pill${p===period?' on':''}`} onClick={()=>setPeriod(p)}>{p}</button>)}</div>
      </div>
      {/* BTC spotlight */}
      <div className="bm2-ls-spot">
        <div className="bm2-ls-spot-top">
          <span className="bm2-ls-coin">BTC/USDT</span>
          <span className="bm2-verdict" style={{color:sigColor,background:sigColor+'18',borderColor:sigColor+'40'}}>{signal}</span>
        </div>
        <div className="bm2-ls-bigbar">
          <div className="bm2-ls-long"  style={{width:`${d.btc}%`}}><span>{d.btc.toFixed(1)}%</span></div>
          <div className="bm2-ls-short" style={{width:`${100-d.btc}%`}}><span>{(100-d.btc).toFixed(1)}%</span></div>
        </div>
        <div className="bm2-ls-lbl"><span style={{color:'#00e87a'}}>▲ LONG</span><span style={{color:'#f43f5e'}}>SHORT ▼</span></div>
      </div>
      <StatGrid stats={[
        {v:`${d.btc.toFixed(1)}%`,      l:'ALL ACC LONG',  c:'#00e87a'},
        {v:`${(100-d.btc).toFixed(1)}%`,l:'ALL ACC SHORT', c:'#f43f5e'},
        {v:`${(d.btc+3).toFixed(1)}%`,  l:'TOP LONG',      c:'#00e87a'},
        {v:`${(97-d.btc).toFixed(1)}%`, l:'TOP SHORT',     c:'#f43f5e'},
      ]}/>
      <div className="bm2-ls-grid">
        {pairs.map(p=>{
          const vd=p.lng>55?'long':p.lng<45?'short':'neut'
          const vc=p.lng>55?'#00e87a':p.lng<45?'#f43f5e':'#f5a623'
          return(
            <div key={p.sym} className="bm2-ls-card">
              <span className="bm2-ls-csym">{p.sym}</span>
              <div className="bm2-ls-cbar">
                <div style={{width:`${p.lng}%`,background:'#00e87a',height:'100%',borderRadius:'3px 0 0 3px',transition:'width .8s'}}/>
                <div style={{flex:1,background:'#f43f5e',height:'100%',borderRadius:'0 3px 3px 0'}}/>
              </div>
              <span className={`bm2-ls-cvd`} style={{color:vc}}>{vd==='long'?'LONG':vd==='short'?'SHORT':'NEUT'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── New mini visualizations (vol / vest / alt / pf / mkt / cal / spot / term) ─

function VolMini() {
  const [score,setScore]=useState(58)
  const [rows,setRows]=useState([
    {s:'BTC', buy:28,sell:17,chg:2.3},
    {s:'ETH', buy:18,sell:10,chg:1.8},
    {s:'SOL', buy:9, sell:5, chg:4.2},
    {s:'BNB', buy:6, sell:4, chg:-0.8},
    {s:'XRP', buy:4, sell:6, chg:-1.2},
  ])
  useEffect(()=>{
    const id=setInterval(()=>{
      setScore(s=>Math.max(15,Math.min(85,s+(Math.random()-.5)*8)))
      setRows(prev=>prev.map(r=>({...r,buy:Math.max(1,r.buy+(Math.random()-.5)*3),sell:Math.max(1,r.sell+(Math.random()-.5)*2),chg:parseFloat(rnd(-5,8,2))})).sort((a,b)=>(b.buy+b.sell)-(a.buy+a.sell)))
    },2200)
    return()=>clearInterval(id)
  },[])
  const max=Math.max(...rows.map(r=>r.buy+r.sell))
  const topBuy=rows.reduce((a,r)=>r.buy>a.buy?r:a,rows[0])
  const topSell=rows.reduce((a,r)=>r.sell>a.sell?r:a,rows[0])
  return (
    <div className="bm2">
      <div className="bm2-hd">
        <div className="bm-live-badge"><span className="bm-pulse-dot purple"/>VOLUME MONITOR</div>
        <span className="bm2-bignum">${rows.reduce((a,r)=>a+r.buy+r.sell,0).toFixed(0)}B</span>
      </div>
      <SentGauge score={score}/>
      <StatGrid stats={[
        {v:`$${rows.reduce((a,r)=>a+r.buy,0).toFixed(0)}B`,l:'BUY VOL',   c:'#00e87a'},
        {v:`$${rows.reduce((a,r)=>a+r.sell,0).toFixed(0)}B`,l:'SELL VOL', c:'#f43f5e'},
        {v:topBuy.s,  l:'TOP BUY',  c:'#00e87a'},
        {v:topSell.s, l:'TOP SELL', c:'#f43f5e'},
      ]}/>
      <div className="bm2-table">
        {rows.map((r,i)=>(
          <div key={r.s} className="bm2-vol-row">
            <span className="bm2-rank">#{i+1}</span>
            <span className="bm2-sym">{r.s}</span>
            <div className="bm2-stkbar">
              <div className="bm2-stk-buy"  style={{width:`${(r.buy/(max))*75}%`}}/>
              <div className="bm2-stk-sell" style={{width:`${(r.sell/(max))*75}%`}}/>
            </div>
            <span className="bm2-vol-amt">${(r.buy+r.sell).toFixed(0)}B</span>
            <span className={`bm2-chg ${r.chg>=0?'pos':'neg'}`}>{r.chg>=0?'+':''}{r.chg}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const UNLOCK_DATA = [
  {sym:'ARB', amt:'1.1B', val:980, days:2,  pct:18, cat:'TEAM'},
  {sym:'SUI', amt:'520M', val:740, days:5,  pct:12, cat:'INVESTOR'},
  {sym:'JUP', amt:'300M', val:420, days:8,  pct:7,  cat:'ECOSYSTEM'},
  {sym:'WLD', amt:'90M',  val:185, days:12, pct:4,  cat:'TEAM'},
  {sym:'APT', amt:'150M', val:310, days:19, pct:3,  cat:'FOUNDATION'},
]
function VestMini() {
  const [items, setItems] = useState(UNLOCK_DATA)
  useEffect(()=>{
    const id=setInterval(()=>setItems(prev=>prev.map(u=>({...u,val:parseFloat(rnd(u.val*.9,u.val*1.1,0))}))),3000)
    return()=>clearInterval(id)
  },[])
  const impColor=p=>p>8?'#f43f5e':p>4?'#f5a623':'#00e87a'
  const impLabel=p=>p>8?'HIGH':p>4?'MED':'LOW'
  return (
    <div className="bm2">
      <div className="bm2-hd">
        <div className="bm-live-badge"><span className="bm-pulse-dot orange"/>TOKEN UNLOCK</div>
        <span className="bm2-bignum">${items.reduce((a,u)=>a+u.val,0).toFixed(0)}M upcoming</span>
      </div>
      <div className="bm2-vest-hdr"><span>TOKEN</span><span>DATE</span><span>AMOUNT</span><span>USD VALUE</span><span>IMPACT</span></div>
      <div className="bm2-table">
        {items.map(u=>{
          const ic=impColor(u.pct), il=impLabel(u.pct)
          return(
            <div key={u.sym} className="bm2-vest-row">
              <div className="bm2-vest-sym-wrap">
                <div className="bm2-vest-dot" style={{background:ic}}/>
                <span className="bm2-sym">{u.sym}</span>
                <span className="bm2-vest-cat">{u.cat}</span>
              </div>
              <span className="bm2-vest-days">in {u.days}d</span>
              <span className="bm2-vest-amt">{u.amt}</span>
              <span className="bm2-vest-val">${u.val}M</span>
              <div className="bm2-vest-impact">
                <div className="bm2-vest-ibar"><div style={{width:`${Math.min(u.pct/20*100,100)}%`,background:ic,height:'100%',borderRadius:'3px',transition:'width .8s'}}/></div>
                <span className="bm2-impact-lbl" style={{color:ic}}>{il}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ALERT_SEED = [
  {sym:'BTC',type:'PRICE',   cond:'> $70,000',   cur:67480,target:70000},
  {sym:'ETH',type:'VOLUME',  cond:'Spike +40%',  cur:null, target:null },
  {sym:'SOL',type:'FUNDING', cond:'> 0.10%',     cur:0.083,target:0.10 },
  {sym:'BNB',type:'WHALE',   cond:'$5M+ transfer',cur:null,target:null },
  {sym:'ARB',type:'PRICE',   cond:'< $0.90',     cur:0.94, target:0.90 },
]
function AltMini() {
  const [alerts,setAlerts]=useState(()=>ALERT_SEED.map(a=>({...a,hit:false})))
  useEffect(()=>{
    const id=setInterval(()=>setAlerts(prev=>prev.map(a=>({...a,hit:Math.random()>.65}))),2000)
    return()=>clearInterval(id)
  },[])
  const active=alerts.filter(a=>!a.hit).length
  const triggered=alerts.filter(a=>a.hit).length
  const proximity=(a)=>{
    if(a.target&&a.cur&&a.type==='PRICE'){
      const pct=Math.abs((a.cur-a.target)/a.target)*100
      return Math.max(0,100-pct*10)
    }
    if(a.type==='FUNDING'&&a.cur&&a.target) return (a.cur/a.target)*100
    return Math.random()*60+20
  }
  return (
    <div className="bm2">
      <div className="bm2-hd">
        <div className="bm-live-badge"><span className="bm-pulse-dot yellow"/>CUSTOM ALERTS</div>
        <div className="bm2-alert-counts">
          <span className="bm2-ac-a">{active} Active</span>
          <span className="bm2-ac-t" style={{color:triggered>0?'#f5a623':'rgba(255,255,255,.3)'}}>{triggered} Triggered</span>
        </div>
      </div>
      <div className="bm2-table">
        {alerts.map((a,i)=>{
          const prox=proximity(a)
          const isClose=prox>75&&!a.hit
          return(
            <div key={i} className={`bm2-alert-row${a.hit?' fired':isClose?' close':''}`}>
              <span className={`bm2-al-dot${a.hit?' fired':isClose?' close':''}`}/>
              <span className="bm2-sym">{a.sym}</span>
              <span className="bm2-al-type">{a.type}</span>
              <span className="bm2-al-cond">{a.cond}</span>
              <div className="bm2-al-prox">
                <div className="bm2-al-pb"><div style={{width:`${Math.min(prox,100)}%`,background:isClose?'#f5a623':'rgba(255,255,255,.25)',height:'100%',borderRadius:'3px',transition:'width .8s'}}/></div>
              </div>
              <span className={`bm2-al-badge${a.hit?' fired':isClose?' close':''}`}>{a.hit?'FIRED':isClose?'CLOSE':'ACTIVE'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PfMini() {
  const BASE=[
    {s:'BTC',amt:0.42,base:67500,color:'#f59e0b',pct:44},
    {s:'ETH',amt:3.8, base:3200, color:'#3b82f6',pct:28},
    {s:'SOL',amt:25,  base:145,  color:'#a855f7',pct:18},
    {s:'BNB',amt:8,   base:420,  color:'#00e87a',pct:10},
  ]
  const [prices,setPrices]=useState(()=>BASE.map(b=>b.base))
  const [chartData,setChartData]=useState([22000,22800,21500,23400,22900,24100,23800,25200,24800,26100,25700,27400,26900,28100,27500,28900,28400,29200,28700,24851])
  useEffect(()=>{
    const id=setInterval(()=>{
      setPrices(prev=>prev.map((p,i)=>p*(1+(Math.random()-.5)*.003)))
      setChartData(prev=>[...prev.slice(1),Math.max(20000,prev[prev.length-1]*(1+(Math.random()-.45)*.015))])
    },1400)
    return()=>clearInterval(id)
  },[])
  const total=BASE.reduce((a,b,i)=>a+b.amt*prices[i],0)
  const start=chartData[0],last=chartData[chartData.length-1]
  const pnl=last-start, pnlPct=(pnl/start*100)
  const isUp=pnl>=0
  // SVG equity chart
  const W=160,H=40
  const mn=Math.min(...chartData),mx=Math.max(...chartData),rng=mx-mn||1
  const pts=chartData.map((v,i)=>`${(i/(chartData.length-1))*W},${H-((v-mn)/rng)*H}`).join(' ')
  const color=isUp?'#00e87a':'#f43f5e'
  const positions=[
    {sym:'BTC/USDT',side:'LONG', pnl:380,  pnlPct:3.2, size:12.4},
    {sym:'ETH/USDT',side:'SHORT',pnl:-120, pnlPct:-1.5,size:8.2 },
  ]
  return (
    <div className="bm2">
      <div className="bm2-hd">
        <div className="bm-live-badge"><span className="bm-pulse-dot green"/>PORTFOLIO</div>
        <span className={`bm2-bignum ${isUp?'pos':'neg'}`}>{isUp?'+':''}{pnlPct.toFixed(2)}% today</span>
      </div>
      <div className="bm2-pf-equity">
        <div className="bm2-pf-lbl">TOTAL EQUITY</div>
        <div className="bm2-pf-total">${total.toLocaleString('en',{maximumFractionDigits:0})}</div>
        <div className={`bm2-pf-pnl ${isUp?'pos':'neg'}`}>{isUp?'+':''}{pnl>=0?pnl.toFixed(0):(-pnl).toFixed(0)} USDT</div>
      </div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{display:'block',margin:'4px 0'}}>
        <defs>
          <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity=".35"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#pg)"/>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <div className="bm2-pf-pos-hdr"><span>POSITION</span><span>SIDE</span><span>SIZE</span><span>UNREAL PNL</span></div>
      <div className="bm2-table">
        {positions.map((p,i)=>(
          <div key={i} className="bm2-pos-row">
            <span className="bm2-sym">{p.sym}</span>
            <span className={`bm2-side ${p.side==='LONG'?'long':'short'}`}>{p.side}</span>
            <span className="bm2-pos-size">${p.size}K</span>
            <span className={`bm2-pos-pnl ${p.pnl>=0?'pos':'neg'}`}>{p.pnl>=0?'+':''}{p.pnl} ({p.pnlPct>=0?'+':''}{p.pnlPct}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MktMini() {
  const [score,setScore]=useState(65)
  const [m,setM]=useState({mcap:2.34,btcDom:54.2,fg:72,vol:89.4,alts:1.07})
  const [movers,setMovers]=useState({
    gainers:[{s:'SOL',chg:5.1},{s:'HYPE',chg:8.4},{s:'SUI',chg:3.7}],
    losers: [{s:'XRP',chg:-3.1},{s:'MATIC',chg:-4.2},{s:'ADA',chg:-2.8}],
  })
  useEffect(()=>{
    const id=setInterval(()=>{
      setScore(s=>Math.max(15,Math.min(85,s+(Math.random()-.45)*5)))
      setM(prev=>({...prev,btcDom:Math.min(Math.max(parseFloat((prev.btcDom+(Math.random()-.5)*.1).toFixed(1)),48),60),fg:Math.min(Math.max(Math.round(prev.fg+(Math.random()-.5)*2),10),90),vol:parseFloat((prev.vol+(Math.random()-.5)*.8).toFixed(1))}))
    },2200)
    return()=>clearInterval(id)
  },[])
  const fgColor=m.fg>65?'#00e87a':m.fg>45?'#f5a623':'#f43f5e'
  const fgLabel=m.fg>75?'EXTREME GREED':m.fg>60?'GREED':m.fg>40?'NEUTRAL':m.fg>25?'FEAR':'EXTREME FEAR'
  // market dominance segments
  const dom=[
    {lbl:'BTC', pct:m.btcDom,            color:'#f59e0b'},
    {lbl:'ETH', pct:17.8,                color:'#a78bfa'},
    {lbl:'BNB', pct:3.1,                 color:'#f0b90b'},
    {lbl:'SOL', pct:4.2,                 color:'#9945ff'},
    {lbl:'XRP', pct:2.8,                 color:'#06b6d4'},
    {lbl:'Others',pct:100-m.btcDom-17.8-3.1-4.2-2.8, color:'rgba(255,255,255,.2)'},
  ]
  return (
    <div className="bm2">
      <div className="bm2-hd">
        <div className="bm-live-badge"><span className="bm-pulse-dot purple"/>GLOBAL METRICS</div>
        <span className="bm2-bignum">${m.mcap}T total</span>
      </div>
      <SentGauge score={score}/>
      <StatGrid stats={[
        {v:`$${m.mcap}T`,    l:'TOTAL MCAP',   c:'rgba(255,255,255,.85)'},
        {v:`$${m.vol}B`,     l:'24H VOLUME',   c:'rgba(255,255,255,.85)'},
        {v:`${m.btcDom}%`,   l:'BTC DOM',      c:'#f59e0b'},
        {v:`${m.fg} ${fgLabel}`,l:'F&G INDEX', c:fgColor},
      ]}/>
      <div className="bm2-dom-bar">
        {dom.map(d=><div key={d.lbl} style={{flex:d.pct,background:d.color,height:'100%'}} title={`${d.lbl} ${d.pct.toFixed(1)}%`}/>)}
      </div>
      <div className="bm2-dom-legend">
        {dom.slice(0,5).map(d=>(
          <span key={d.lbl} className="bm2-dom-item">
            <span className="bm2-dom-dot" style={{background:d.color}}/>{d.lbl} {d.pct.toFixed(1)}%
          </span>
        ))}
      </div>
      <div className="bm2-movers">
        <div className="bm2-mover-col">
          <div className="bm2-mover-hd" style={{color:'#00e87a'}}>GAINERS ↑</div>
          {movers.gainers.map(g=><div key={g.s} className="bm2-mover-row"><span>{g.s}</span><span style={{color:'#00e87a'}}>+{g.chg}%</span></div>)}
        </div>
        <div className="bm2-mover-col">
          <div className="bm2-mover-hd" style={{color:'#f43f5e'}}>LOSERS ↓</div>
          {movers.losers.map(l=><div key={l.s} className="bm2-mover-row"><span>{l.s}</span><span style={{color:'#f43f5e'}}>{l.chg}%</span></div>)}
        </div>
      </div>
    </div>
  )
}

const CAL_EVENTS = [
  {flag:'🇺🇸',label:'US CPI Data',       imp:3,impLbl:'HIGH',  time:'2h 14m', type:'MACRO',  prev:'3.5%',exp:'3.2%'},
  {flag:'🇺🇸',label:'Fed Rate Decision', imp:3,impLbl:'HIGH',  time:'3d 7h',  type:'FED',    prev:'5.25%',exp:'5.00%'},
  {flag:'💻', label:'ETH Pectra Upgrade',imp:2,impLbl:'MED',   time:'5d 2h',  type:'CRYPTO', prev:'-',   exp:'-'},
  {flag:'🇺🇸',label:'US GDP Q2',         imp:2,impLbl:'MED',   time:'6d 11h', type:'MACRO',  prev:'2.4%',exp:'2.6%'},
  {flag:'₿',  label:'BTC Options Exp',   imp:1,impLbl:'LOW',   time:'8d 0h',  type:'CRYPTO', prev:'-',   exp:'$4.2B'},
]
function CalMini() {
  const ic={3:'#f43f5e',2:'#f5a623',1:'rgba(255,255,255,.4)'}
  return (
    <div className="bm2">
      <div className="bm2-hd">
        <div className="bm-live-badge"><span className="bm-pulse-dot blue"/>ECONOMIC CALENDAR</div>
        <span className="bm2-bignum" style={{color:'rgba(255,255,255,.45)'}}>TradingView · LIVE</span>
      </div>
      <div className="bm2-cal-hdr"><span>EVENT</span><span>TYPE</span><span>PREV</span><span>EXP</span><span>TIME</span></div>
      <div className="bm2-table">
        {CAL_EVENTS.map((ev,i)=>(
          <div key={i} className="bm2-cal-row">
            <div className="bm2-cal-ev">
              <div className="bm2-cal-stars">{Array.from({length:3},(_,j)=><span key={j} style={{color:j<ev.imp?ic[ev.imp]:'rgba(255,255,255,.15)',fontSize:'8px'}}>★</span>)}</div>
              <span className="bm2-cal-flag">{ev.flag}</span>
              <span className="bm2-cal-lbl">{ev.label}</span>
            </div>
            <span className="bm2-cal-type">{ev.type}</span>
            <span className="bm2-cal-val">{ev.prev}</span>
            <span className="bm2-cal-val exp" style={{color:ic[ev.imp]}}>{ev.exp}</span>
            <span className="bm2-cal-time">in {ev.time}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SpotMini() {
  const BASE=[
    {s:'BTC', p:67480,color:'#f59e0b',chg:2.1, hist:[65000,65800,66200,66900,67480]},
    {s:'ETH', p:3198, color:'#3b82f6',chg:1.8, hist:[3100,3130,3160,3180,3198]},
    {s:'SOL', p:144.8,color:'#a855f7',chg:4.2, hist:[138,139,141,143,144.8]},
    {s:'BNB', p:418,  color:'#f97316',chg:-0.8,hist:[422,421,419,418.5,418]},
    {s:'XRP', p:0.578,color:'#06b6d4',chg:-1.2,hist:[0.586,0.583,0.581,0.579,0.578]},
    {s:'DOGE',p:0.128,color:'#eab308',chg:3.4, hist:[0.123,0.124,0.125,0.127,0.128]},
  ]
  const CATS=['All','DeFi','AI','Meme','Layer1','Layer2']
  const [cat,setCat]=useState('All')
  const [prices,setPrices]=useState(()=>BASE.map(b=>({...b,dir:'up'})))
  useEffect(()=>{
    const id=setInterval(()=>setPrices(prev=>prev.map(p=>{
      const np=p.p*(1+(Math.random()-.5)*.0025)
      const nh=[...p.hist.slice(1),np]
      return{...p,p:np,dir:np>p.p?'up':'down',hist:nh}
    })),950)
    return()=>clearInterval(id)
  },[])
  const fmt=(p,s)=>s==='XRP'||s==='DOGE'?`$${p.toFixed(4)}`:p>=1000?`$${p.toLocaleString('en',{maximumFractionDigits:0})}`:p.toFixed(2)
  return (
    <div className="bm2">
      <div className="bm2-hd">
        <div className="bm-live-badge"><span className="bm-pulse-dot green"/>SPOT MARKETS</div>
        <span className="bm2-bignum" style={{color:'rgba(255,255,255,.4)'}}>200+ pairs</span>
      </div>
      <div className="bm2-cats">
        {CATS.map(c=><button key={c} className={`bm2-cat${c===cat?' on':''}`} onClick={()=>setCat(c)}>{c}</button>)}
      </div>
      <div className="bm2-spot-hdr"><span>#</span><span>NAME</span><span>PRICE</span><span>1h</span><span>24h</span><span>7D</span></div>
      <div className="bm2-table">
        {prices.map((p,i)=>{
          const W=60,H=22,mn=Math.min(...p.hist),mx=Math.max(...p.hist),rng=mx-mn||1
          const pts=p.hist.map((v,j)=>`${(j/(p.hist.length-1))*W},${H-((v-mn)/rng)*H}`).join(' ')
          const sc=p.chg>=0?'#00e87a':'#f43f5e'
          return(
            <div key={p.s} className={`bm2-spot-row ${p.dir}`}>
              <span className="bm2-rank">{i+1}</span>
              <div className="bm2-spot-nm">
                <div className="bm2-spot-dot" style={{background:p.color}}/>
                <span className="bm2-sym">{p.s}</span>
              </div>
              <span className={`bm2-spot-price ${p.dir}`}>{fmt(p.p,p.s)}</span>
              <span className={`bm2-chg ${p.chg>=0?'pos':'neg'}`} style={{fontSize:'9px'}}>{p.chg>=0?'+':''}{(p.chg*.3).toFixed(2)}%</span>
              <span className={`bm2-chg ${p.chg>=0?'pos':'neg'}`}>{p.chg>=0?'+':''}{p.chg}%</span>
              <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
                <polyline points={pts} fill="none" stroke={sc} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const TERM_CMDS = [
  {cmd:'set alert BTC > 70000',          out:'✓ Alert created: BTC/USDT > $70,000'},
  {cmd:'top traders --limit 4',          out:'#1 0x7f2a +$84.2K  #2 0x3e9b +$31.5K'},
  {cmd:'fund BTC --compare',             out:'BNB +0.083%  OKX +0.076%  BYBIT +0.079%'},
  {cmd:'whale --min 5M --chain eth',     out:'Monitoring ETH · 3 alerts in last 1h'},
  {cmd:'ls BTC --period 1h',             out:'Long: 58.2%  Short: 41.8%  ● HEAVY LONG'},
]
const NEWS_ITEMS = [
  'BTC breaks $68K resistance — strong volume confirms momentum',
  'ETH funding spike detected across Binance, OKX — 0.11%',
  'Whale alert: $45M USDT moved to Coinbase — potential sell pressure',
  'SOL L/S ratio flips bullish — top traders 62% long',
]
function TermMini() {
  const [lines,setLines]=useState([])
  const [cur,setCur]=useState(0)
  const [newsIdx,setNewsIdx]=useState(0)
  const [pnl,setPnl]=useState({total:24851,free:18200,unreal:380})
  useEffect(()=>{
    if(cur>=TERM_CMDS.length){const id=setTimeout(()=>{setLines([]);setCur(0)},2000);return()=>clearTimeout(id)}
    const id=setTimeout(()=>{setLines(prev=>[...prev,TERM_CMDS[cur]]);setCur(c=>c+1)},cur===0?400:1400)
    return()=>clearTimeout(id)
  },[cur])
  useEffect(()=>{
    const id=setInterval(()=>{
      setNewsIdx(n=>(n+1)%NEWS_ITEMS.length)
      setPnl(p=>({...p,unreal:Math.max(-500,p.unreal+(Math.random()-.45)*30)}))
    },3500)
    return()=>clearInterval(id)
  },[])
  return (
    <div className="bm2">
      {/* Status bar */}
      <div className="bm2-term-status">
        <span className="bm2-term-stat"><span className="bm2-term-slbl">Balance</span>${pnl.total.toLocaleString()}</span>
        <span className="bm2-term-stat"><span className="bm2-term-slbl">Free</span>${pnl.free.toLocaleString()}</span>
        <span className={`bm2-term-stat ${pnl.unreal>=0?'pos':'neg'}`}><span className="bm2-term-slbl">Unreal</span>{pnl.unreal>=0?'+':''}{pnl.unreal.toFixed(0)}</span>
        <span className="bm2-term-conn"><span className="bm-pulse-dot green"/>CONNECTED</span>
      </div>
      {/* News ticker */}
      <div className="bm2-term-news">
        <span className="bm2-term-news-tag">NEWS</span>
        <span className="bm2-term-news-txt" key={newsIdx}>{NEWS_ITEMS[newsIdx]}</span>
      </div>
      {/* Command console */}
      <div className="bm2-term-console">
        {lines.map((l,i)=>(
          <div key={i} className="bm2-term-block">
            <div className="bm2-term-cmd"><span className="bm2-term-ps">&gt; </span>{l.cmd}</div>
            <div className="bm2-term-out">{l.out}</div>
          </div>
        ))}
        {cur<TERM_CMDS.length&&<div className="bm2-term-cmd"><span className="bm2-term-ps">&gt; </span><span className="bm2-term-cur">_</span></div>}
      </div>
      {/* Positions */}
      <div className="bm2-term-pos">
        <div className="bm2-term-pos-row"><span className="bm2-sym">BTC/USDT</span><span className="bm2-side long">LONG</span><span style={{color:'rgba(255,255,255,.5)'}}>$12.4K</span><span className="bm2-pos-pnl pos">+$380 (+3.2%)</span><span className="bm2-term-tp">TP $71K</span></div>
        <div className="bm2-term-pos-row"><span className="bm2-sym">ETH/USDT</span><span className="bm2-side short">SHORT</span><span style={{color:'rgba(255,255,255,.5)'}}>$8.2K</span><span className="bm2-pos-pnl neg">-$120 (-1.5%)</span><span className="bm2-term-tp">SL $3.3K</span></div>
      </div>
    </div>
  )
}

// ── Mobile App Showcase ───────────────────────────────────────────────────────
// CMC logo CDN — same source as real mobile app MarketsScreen
const CMC = 'https://s2.coinmarketcap.com/static/img/coins/64x64'
const FLOAT_TOKENS = [
  { sym:'BTC',  color:'#F7931A', img:`${CMC}/1.png`,     pos:{ left:'-22%', top:'8%'  }, delay:0   },
  { sym:'ETH',  color:'#627EEA', img:`${CMC}/1027.png`,  pos:{ right:'-20%',top:'18%' }, delay:0.7 },
  { sym:'SOL',  color:'#9945FF', img:`${CMC}/5426.png`,  pos:{ left:'-18%', top:'58%' }, delay:1.4 },
  { sym:'HYPE', color:'#00D992', img:`${CMC}/29093.png`, pos:{ right:'-18%',top:'55%' }, delay:0.4 },
  { sym:'BNB',  color:'#F0B90B', img:`${CMC}/1839.png`,  pos:{ left:'-24%', top:'34%' }, delay:1.8 },
  { sym:'AVAX', color:'#E84142', img:`${CMC}/5805.png`,  pos:{ right:'-22%',top:'75%' }, delay:1.1 },
]

// ─── App Showcase: 5 phone screens matching the real app ──────────────────────

function fmtPx(p) {
  if (p >= 1000) return '$' + Math.round(p).toLocaleString('en-US')
  if (p >= 1)    return '$' + p.toFixed(2)
  return '$' + p.toFixed(4)
}

// Screen 1: Crypto Markets
const MKT_COINS = [
  { sym:'BTC',  name:'Bitcoin',     id:1,    base:67480, chg: 2.34 },
  { sym:'ETH',  name:'Ethereum',    id:1027, base:3621,  chg:-0.87 },
  { sym:'SOL',  name:'Solana',      id:5426, base:168.4, chg: 5.12 },
  { sym:'HYPE', name:'Hyperliquid', id:29093,base:24.81, chg: 8.64 },
  { sym:'BNB',  name:'BNB',         id:1839, base:592.3, chg: 1.21 },
  { sym:'AVAX', name:'Avalanche',   id:5805, base:38.72, chg:-1.53 },
]
function PhoneMarkets({ isActive }) {
  const [coins, setCoins] = useState(() => MKT_COINS.map(c => ({ ...c, price: c.base })))
  const [flash, setFlash] = useState({})
  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => {
      setCoins(prev => prev.map(c => {
        const np = c.price + (Math.random()-.48)*c.base*.0015
        if (Math.abs(np - c.price) > c.base*.0007) {
          setFlash(f => ({ ...f, [c.sym]: np > c.price }))
          setTimeout(() => setFlash(f => { const n={...f}; delete n[c.sym]; return n }), 450)
        }
        return { ...c, price: np }
      }))
    }, 2000)
    return () => clearInterval(id)
  }, [isActive])
  return (
    <div className="phs-screen">
      <div className="phs-shd"><span className="phs-stitle">Crypto Markets</span><span className="phs-live-tag green"><span className="bm-pulse-dot green" style={{width:4,height:4}}/>LIVE</span></div>
      <div className="phs-chips"><span className="phs-chip on">All</span><span className="phs-chip">Watchlist</span><span className="phs-chip">Gainers</span></div>
      <div className="phs-list">
        {coins.map(c => (
          <div key={c.sym} className={`phs-row${flash[c.sym]===true?' fl-up':flash[c.sym]===false?' fl-dn':''}`}>
            <img src={`${CMC}/${c.id}.png`} alt={c.sym} className="phs-logo" onError={e=>{e.currentTarget.style.opacity='.1'}}/>
            <div className="phs-info"><span className="phs-sym">{c.sym}</span><span className="phs-nm">{c.name}</span></div>
            <div className="phs-px"><span className="phs-val">{fmtPx(c.price)}</span><span className={`phs-chg ${c.chg>=0?'up':'dn'}`}>{c.chg>=0?'+':''}{c.chg.toFixed(2)}%</span></div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Screen 2: Liquidation Stream
const LIQ_SYMS2 = ['BTC','ETH','SOL','BNB','HYPE','ARB','AVAX','OP']
const LIQ_AMTS2 = ['$6.1M','$2.3M','$890K','$4.7M','$1.1M','$3.2M','$580K']
function PhoneLiquidations({ isActive }) {
  const [liqs, setLiqs] = useState([
    { sym:'BTC', side:'LONG',  amt:'$6.1M', ago:'1s',  color:'#f43f5e' },
    { sym:'ETH', side:'SHORT', amt:'$2.3M', ago:'4s',  color:'#00d992' },
    { sym:'SOL', side:'LONG',  amt:'$890K', ago:'7s',  color:'#f43f5e' },
    { sym:'HYPE',side:'SHORT', amt:'$1.1M', ago:'12s', color:'#00d992' },
    { sym:'BNB', side:'LONG',  amt:'$580K', ago:'18s', color:'#f43f5e' },
  ])
  const [score, setScore] = useState(.34)
  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => {
      const sym = LIQ_SYMS2[Math.floor(Math.random()*LIQ_SYMS2.length)]
      const side = Math.random()>.5?'LONG':'SHORT'
      setLiqs(prev => [{ sym, side, amt:LIQ_AMTS2[Math.floor(Math.random()*LIQ_AMTS2.length)], ago:'just now', color:side==='LONG'?'#f43f5e':'#00d992' }, ...prev.slice(0,4)])
      setScore(s => Math.max(-1, Math.min(1, s+(Math.random()-.5)*.08)))
    }, 1800)
    return () => clearInterval(id)
  }, [isActive])
  const pct=(score+1)*50
  const verdict=score>.3?'BULLISH':score<-.3?'BEARISH':'NEUTRAL'
  const tone=verdict==='BULLISH'?'#00d992':verdict==='BEARISH'?'#f43f5e':'#888'
  return (
    <div className="phs-screen">
      <div className="phs-shd"><span className="phs-stitle">Liquidations</span><span className="phs-live-tag" style={{color:'#f43f5e'}}><span className="bm-pulse-dot" style={{width:4,height:4}}/>LIVE</span></div>
      <div className="phs-sentiment">
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
          <span style={{fontSize:9,color:'#555',fontFamily:'var(--mono)',letterSpacing:.6,fontWeight:700}}>SENTIMENT · 24H</span>
          <span style={{fontSize:11,fontWeight:800,fontFamily:'var(--mono)',color:tone}}>{verdict}</span>
        </div>
        <div className="phs-sent-bg"><div className="phs-sent-fill" style={{width:`${pct}%`,background:tone}}/><div className="phs-sent-needle" style={{left:`${pct}%`}}/></div>
        <div style={{display:'flex',justifyContent:'space-between',marginTop:3}}>
          <span style={{fontSize:8,color:'#f43f5e',fontFamily:'var(--mono)'}}>LONG LIQ</span>
          <span style={{fontSize:8,color:'#00d992',fontFamily:'var(--mono)'}}>SHORT LIQ</span>
        </div>
      </div>
      <div className="phs-list">
        {liqs.map((l,i) => (
          <div key={i} className={`phs-row${i===0?' phs-new':''}`}>
            <span className="phs-sym">{l.sym}</span>
            <span className="phs-side-badge" style={{color:l.color,background:l.color+'18'}}>{l.side}</span>
            <span className="phs-val" style={{flex:1,textAlign:'right'}}>{l.amt}</span>
            <span style={{fontSize:9,color:'rgba(255,255,255,.25)',fontFamily:'var(--mono)',marginLeft:4,minWidth:36,textAlign:'right'}}>{l.ago}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Screen 3: Smart Money
const SM_SYMS = ['BTC','ETH','SOL','HYPE','BNB','ARB']
const SM_AMTS = ['$12.4M','$4.8M','$2.1M','$890K','$5.1M','$3.4M']
function PhoneSmartMoney({ isActive }) {
  const [moves, setMoves] = useState([
    { label:'Whale #1', addr:'0x3b4a...f8c2', action:'BUY',  sym:'BTC',  amt:'$12.4M', ago:'2m' },
    { label:'Whale #2', addr:'0x7d91...3a4e', action:'SELL', sym:'ETH',  amt:'$4.8M',  ago:'5m' },
    { label:'Fund #3',  addr:'0xa2c8...9b1d', action:'BUY',  sym:'SOL',  amt:'$2.1M',  ago:'11m' },
    { label:'Whale #4', addr:'0x5f2e...c70a', action:'BUY',  sym:'HYPE', amt:'$890K',  ago:'19m' },
  ])
  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => {
      const sym=SM_SYMS[Math.floor(Math.random()*SM_SYMS.length)]
      const action=Math.random()>.5?'BUY':'SELL'
      const n=Math.floor(Math.random()*99)+1
      const addr='0x'+Math.random().toString(16).slice(2,6)+'...'+Math.random().toString(16).slice(2,6)
      setMoves(prev=>[{ label:`Whale #${n}`, addr, action, sym, amt:SM_AMTS[Math.floor(Math.random()*SM_AMTS.length)], ago:'just now' },...prev.slice(0,3)])
    }, 2400)
    return () => clearInterval(id)
  }, [isActive])
  return (
    <div className="phs-screen">
      <div className="phs-shd"><span className="phs-stitle">Smart Money</span><span className="phs-live-tag green"><span className="bm-pulse-dot green" style={{width:4,height:4}}/>TRACKING</span></div>
      <div className="phs-list" style={{gap:6}}>
        {moves.map((m,i)=>(
          <div key={i} className={`phs-sm-row${i===0?' phs-new':''}`}>
            <div className="phs-sm-whale-icon" style={{color:m.action==='BUY'?'#00d992':'#f43f5e',background:m.action==='BUY'?'rgba(0,217,146,.1)':'rgba(244,63,94,.08)'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.3c0 2.6-4.5 4.7-10 4.7S2 18.9 2 16.3c0-1.1.9-2.1 2.3-2.9L12 17l7.7-3.6c1.4.8 2.3 1.8 2.3 2.9z"/><path d="M19.7 13.4C21.1 12.3 22 11 22 9.5 22 6.5 17.5 4 12 4S2 6.5 2 9.5c0 1.5.9 2.8 2.3 3.9"/></svg>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:2}}>
                <span style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.85)'}}>{m.label}</span>
                <span className="phs-side-badge" style={{color:m.action==='BUY'?'#00d992':'#f43f5e',background:m.action==='BUY'?'rgba(0,217,146,.12)':'rgba(244,63,94,.12)'}}>{m.action}</span>
                <span style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.7)',fontFamily:'var(--mono)'}}>{m.sym}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span style={{fontSize:9,color:'rgba(255,255,255,.28)',fontFamily:'var(--mono)'}}>{m.addr}</span>
                <span style={{fontSize:9,color:'rgba(255,255,255,.28)',fontFamily:'var(--mono)'}}>{m.ago}</span>
              </div>
            </div>
            <span style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.8)',fontFamily:'var(--mono)',marginLeft:6,flexShrink:0}}>{m.amt}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Screen 4: Funding Rates
const FUND_BASE2 = [
  { sym:'BTC',  id:1,     rate:.0210, long:true  },
  { sym:'ETH',  id:1027,  rate:.0085, long:false },
  { sym:'SOL',  id:5426,  rate:.0320, long:true  },
  { sym:'HYPE', id:29093, rate:.0512, long:true  },
  { sym:'BNB',  id:1839,  rate:.0041, long:false },
  { sym:'ARB',  id:11841, rate:.0183, long:true  },
]
function PhoneFunding({ isActive }) {
  const [rates, setRates] = useState(FUND_BASE2)
  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => {
      setRates(prev => prev.map(r => ({
        ...r, rate: Math.max(.001, r.rate+(Math.random()-.5)*.003),
        long: Math.random()>.35 ? r.long : !r.long,
      })))
    }, 2400)
    return () => clearInterval(id)
  }, [isActive])
  return (
    <div className="phs-screen">
      <div className="phs-shd"><span className="phs-stitle">Funding Rates</span><span className="phs-live-tag" style={{color:'#3b82f6'}}>8H RATE</span></div>
      <div className="phs-fund-hd"><span>Asset</span><span>Rate</span><span>Pays</span></div>
      <div className="phs-list" style={{gap:3}}>
        {rates.map(r=>(
          <div key={r.sym} className="phs-fund-row">
            <div style={{display:'flex',alignItems:'center',gap:7}}>
              <img src={`${CMC}/${r.id}.png`} alt={r.sym} className="phs-logo" style={{width:26,height:26}} onError={e=>{e.currentTarget.style.opacity='.1'}}/>
              <span className="phs-sym">{r.sym}</span>
            </div>
            <span className={`phs-fund-rate ${r.rate>.04?'hi':r.rate>.02?'md':'lo'}`}>{r.rate.toFixed(4)}%</span>
            <span className={`phs-side-badge ${r.long?'long-badge':'short-badge'}`}>{r.long?'LONG':'SHORT'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Screen 5: Stocks
const STOCK_BASE2 = [
  { sym:'AAPL', name:'Apple',     base:189.5, chg: 1.24 },
  { sym:'TSLA', name:'Tesla',     base:248.3, chg:-2.87 },
  { sym:'NVDA', name:'Nvidia',    base:892.4, chg: 4.52 },
  { sym:'AMZN', name:'Amazon',    base:178.6, chg: 0.91 },
  { sym:'META', name:'Meta',      base:512.8, chg: 2.13 },
  { sym:'MSFT', name:'Microsoft', base:421.3, chg:-0.34 },
]
function PhoneStocks({ isActive }) {
  const [stocks, setStocks] = useState(() => STOCK_BASE2.map(s=>({...s,price:s.base})))
  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => {
      setStocks(prev => prev.map(s => ({ ...s, price: Math.max(s.base*.7, s.price+(Math.random()-.48)*s.base*.002) })))
    }, 1600)
    return () => clearInterval(id)
  }, [isActive])
  return (
    <div className="phs-screen">
      <div className="phs-shd"><span className="phs-stitle">Stocks</span><span className="phs-live-tag" style={{color:'#f59e0b'}}>NYSE/NASDAQ</span></div>
      <div className="phs-chips"><span className="phs-chip on">All</span><span className="phs-chip">Tech</span><span className="phs-chip">Watchlist</span></div>
      <div className="phs-list">
        {stocks.map(s=>(
          <div key={s.sym} className="phs-row">
            <div className="phs-stock-ico" style={{background:s.chg>=0?'rgba(0,217,146,.08)':'rgba(244,63,94,.08)',border:`1px solid ${s.chg>=0?'rgba(0,217,146,.2)':'rgba(244,63,94,.2)'}`}}>
              <span style={{fontSize:8,fontWeight:800,color:s.chg>=0?'#00d992':'#f43f5e',fontFamily:'var(--mono)'}}>{s.sym.slice(0,4)}</span>
            </div>
            <div className="phs-info"><span className="phs-sym">{s.sym}</span><span className="phs-nm">{s.name}</span></div>
            <div className="phs-px"><span className="phs-val">${s.price.toFixed(2)}</span><span className={`phs-chg ${s.chg>=0?'up':'dn'}`}>{s.chg>=0?'+':''}{s.chg.toFixed(2)}%</span></div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Terminal screen: live news/event feed ──────────────────────────────────────
const TERM_EVENTS = [
  { id:1, prio:'HIGH',   badge:'LIST',  badgeColor:'#00d992', sym:'HYPE',  headline:'Hyperliquid listed on Coinbase — trading starts immediately',         age:'2s',  side:null },
  { id:2, prio:'HIGH',   badge:'HACK',  badgeColor:'#f43f5e', sym:'WBTC',  headline:'$47M exploit detected on WrappedBTC bridge — withdrawals paused',      age:'41s', side:'SHORT' },
  { id:3, prio:'MEDIUM', badge:'MACRO', badgeColor:'#f59e0b', sym:'BTC',   headline:'Fed signals no rate cut in Q3 — markets pricing hawkish pivot',        age:'3m',  side:null },
  { id:4, prio:'LOW',    badge:'NEWS',  badgeColor:'#6b7280', sym:'SOL',   headline:'Solana DEX volume hits $4.2B — highest since March 2024',              age:'7m',  side:null },
  { id:5, prio:'HIGH',   badge:'LIST',  badgeColor:'#00d992', sym:'PEPE',  headline:'PEPE perpetuals live on Binance — $120M OI within first hour',         age:'12m', side:'LONG' },
  { id:6, prio:'MEDIUM', badge:'PROD',  badgeColor:'#c084fc', sym:'ETH',   headline:'EIP-4844 upgrade scheduled for next week — gas fees expected to drop', age:'18m', side:null },
  { id:7, prio:'HIGH',   badge:'HACK',  badgeColor:'#f43f5e', sym:'ONDO',  headline:'Ondo Finance oracle manipulation — team investigating',                age:'24m', side:null },
]
const TERM_LOGS = [
  { type:'system',  text:'WebSocket connected — Binance · OKX · Bybit' },
  { type:'info',    text:'[LIQ] 1h Long: $138.1M  Short: $56.5M' },
  { type:'success', text:'[FUND] Binance: +0.90%  OKX: +0.84%' },
  { type:'trade',   text:'[WHALE] BTC/USDT −$5.1M SELL · OKX spot' },
  { type:'warning', text:'[ALARM] ETH/USDT target reached · $4858' },
  { type:'info',    text:'[L/S] Long: 53.8%  Short: 48.2% → NEUTRAL' },
  { type:'success', text:'[SMART] 0x87c2… opened SOL LONG $412K' },
]
const LOG_C = { system:'#a1a1aa', info:'#a1a1aa', success:'#00d992', warning:'#f59e0b', trade:'#00d992', error:'#f43f5e' }

function PhoneTerminal({ isActive }) {
  const [tab, setTab] = useState('news')
  const [logs, setLogs]  = useState(TERM_LOGS.slice(0,4))
  const [events, setEvents] = useState(TERM_EVENTS.slice(0,4))
  const [blink, setBlink] = useState(true)

  useEffect(() => {
    if (!isActive) return
    let logIdx = 4
    let evIdx  = 4
    const li = setInterval(() => {
      if (logIdx < TERM_LOGS.length) {
        setLogs(p => [...p, TERM_LOGS[logIdx++]].slice(-6))
      }
    }, 900)
    const ei = setInterval(() => {
      if (evIdx < TERM_EVENTS.length) {
        setEvents(p => [TERM_EVENTS[evIdx++], ...p].slice(0,5))
      }
    }, 2200)
    const bi = setInterval(() => setBlink(b => !b), 550)
    return () => { clearInterval(li); clearInterval(ei); clearInterval(bi) }
  }, [isActive])

  return (
    <div className="phs-screen" style={{padding:0,display:'flex',flexDirection:'column',height:'100%',background:'#000'}}>
      {/* Tab bar */}
      <div style={{display:'flex',borderBottom:'1px solid rgba(255,255,255,.07)',flexShrink:0}}>
        {['news','logs'].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:'8px 0',background:'none',border:'none',cursor:'pointer',
            fontSize:10,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',fontFamily:'var(--mono)',
            color:tab===t?'#00d992':'rgba(255,255,255,.28)',borderBottom:tab===t?'2px solid #00d992':'2px solid transparent',
            transition:'color .2s'}}>
            {t==='news'?'Intel Feed':'System Log'}
          </button>
        ))}
        <div style={{display:'flex',alignItems:'center',gap:4,padding:'0 10px',flexShrink:0}}>
          <span style={{width:5,height:5,borderRadius:'50%',background:'#00d992',boxShadow:'0 0 6px #00d992',display:'inline-block'}}/>
          <span style={{fontSize:9,color:'#00d992',fontFamily:'var(--mono)',fontWeight:700}}>LIVE</span>
        </div>
      </div>

      {tab==='news' ? (
        <div style={{flex:1,overflowY:'hidden',display:'flex',flexDirection:'column',gap:0}}>
          {events.map((ev,i) => {
            const alpha = Math.max(0.25, 1 - i * 0.18)
            const isHigh = ev.prio === 'HIGH'
            return (
              <div key={ev.id} style={{padding:'7px 10px',borderBottom:'1px solid rgba(255,255,255,.05)',
                opacity:alpha,background:i===0?'rgba(255,255,255,.025)':'transparent',transition:'all .3s'}}>
                <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:3}}>
                  <span style={{fontSize:8,fontWeight:800,padding:'2px 5px',borderRadius:3,
                    background:ev.badgeColor+'25',color:ev.badgeColor,fontFamily:'var(--mono)',letterSpacing:'.08em'}}>
                    {ev.badge}
                  </span>
                  <span style={{fontSize:9,fontWeight:700,color:'rgba(255,255,255,.35)',fontFamily:'var(--mono)'}}>
                    {ev.sym}
                  </span>
                  {ev.side && (
                    <span style={{fontSize:8,fontWeight:800,padding:'1px 4px',borderRadius:3,marginLeft:'auto',
                      background:ev.side==='LONG'?'rgba(0,217,146,.15)':'rgba(244,63,94,.15)',
                      color:ev.side==='LONG'?'#00d992':'#f43f5e',fontFamily:'var(--mono)',letterSpacing:'.08em'}}>
                      {ev.side}
                    </span>
                  )}
                  <span style={{fontSize:8,color:'rgba(255,255,255,.2)',fontFamily:'var(--mono)',marginLeft:ev.side?0:'auto'}}>{ev.age}</span>
                </div>
                <div style={{fontSize:10,color:isHigh?'rgba(255,255,255,.8)':'rgba(255,255,255,.45)',
                  lineHeight:1.35,fontFamily:'-apple-system,sans-serif'}}>
                  {ev.headline}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{flex:1,overflowY:'hidden',padding:'6px 0',display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
          {logs.map((l,i)=>(
            <div key={i} style={{padding:'2px 10px',fontFamily:'var(--mono)',fontSize:9.5,color:LOG_C[l.type]||'#a1a1aa',
              lineHeight:1.5,opacity:Math.max(0.25,1-(logs.length-1-i)*0.15)}}>
              {l.text}
            </div>
          ))}
        </div>
      )}

      {/* Command input row */}
      <div style={{borderTop:'1px solid rgba(255,255,255,.08)',padding:'7px 10px',flexShrink:0,
        display:'flex',alignItems:'center',gap:6,background:'rgba(0,217,146,.03)'}}>
        <span style={{color:'#00d992',fontFamily:'var(--mono)',fontSize:10,fontWeight:700,flexShrink:0}}>›</span>
        <span style={{fontFamily:'var(--mono)',fontSize:10,color:'rgba(255,255,255,.55)',flex:1,letterSpacing:'.02em'}}>
          {'status'}{blink && <span style={{color:'#00d992',fontWeight:700}}>_</span>}
        </span>
        <div style={{display:'flex',gap:4}}>
          {['pos','close','help'].map(c=>(
            <span key={c} style={{fontSize:8,padding:'2px 6px',borderRadius:4,border:'1px solid rgba(255,255,255,.12)',
              color:'rgba(255,255,255,.4)',fontFamily:'var(--mono)',cursor:'pointer',letterSpacing:'.04em',background:'rgba(255,255,255,.03)'}}>
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Nav icons (matching real app TABS) ─────────────────────────────────────────
const ASC_NAV = [
  { label:'Stocks',   icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg> },
  { label:'Crypto',   icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.5 9.5h3a2 2 0 0 1 0 4h-3v-4zm0 4h3.5a2 2 0 0 1 0 4H9.5v-4z"/><line x1="12" y1="6" x2="12" y2="9"/><line x1="12" y1="18" x2="12" y2="21"/></svg> },
  { label:'Terminal', icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg> },
  { label:'Wallet',   icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { label:'More',     icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg> },
]

// ── App features shown in scroll panels ────────────────────────────────────────
const APP_FEATURES = [
  {
    eyebrow:'CRYPTO MARKETS', accentColor:'#00d992', tabActive:1,
    title:'Live prices.\nAlways on.',
    desc:'250+ coins with real-time Binance WebSocket data. Sorted by market cap, watchlist, gainers or losers — always one tap away.',
    feats:['Real-time Binance feed','250+ coins tracked','Watchlist & alerts','Market cap ordering'],
    Screen: PhoneMarkets,
  },
  {
    eyebrow:'LIQUIDATION STREAM', accentColor:'#f43f5e', tabActive:4,
    title:'Watch the market\nget liquidated. Live.',
    desc:'Real-time OKX + Bybit liquidation events filtered above $10K. Sentiment gauge tells you who is getting crushed — longs or shorts.',
    feats:['OKX + Bybit live stream','24H sentiment gauge','Long/short breakdown','Minimum $10K filter'],
    Screen: PhoneLiquidations,
  },
  {
    eyebrow:'SMART MONEY', accentColor:'#a855f7', tabActive:4,
    title:'Follow the whales.',
    desc:'On-chain wallet tracker for the biggest movers. See what top wallets buy and sell before the market even notices.',
    feats:['On-chain wallet tracking','Buy/sell detection','Real-time notifications','Whale wallet labels'],
    Screen: PhoneSmartMoney,
  },
  {
    eyebrow:'FUNDING RATES', accentColor:'#3b82f6', tabActive:4,
    title:'Know who pays who.',
    desc:'Perpetual funding rates across all major pairs. High positive rates mean overheated longs — know this edge before the crowd.',
    feats:['8-hour rate breakdown','Long/short bias signal','Multi-exchange data','Extreme rate alerts'],
    Screen: PhoneFunding,
  },
  {
    eyebrow:'TERMINAL', accentColor:'#00d992', tabActive:2,
    title:'Intel feed.\nTrade in seconds.',
    desc:'Live event stream: exchange listings, exploit alerts, macro news — all AI-classified by priority. Execute trades directly from the news card.',
    feats:['AI event classification','Listing & hack alerts','One-tap trade from news','Real-time system logs'],
    Screen: PhoneTerminal,
  },
  {
    eyebrow:'STOCKS', accentColor:'#f59e0b', tabActive:0,
    title:'Stocks and crypto.\nOne terminal.',
    desc:'NYSE and NASDAQ alongside your crypto — tech stocks, ETFs and macro indices without switching apps.',
    feats:['NYSE + NASDAQ live prices','Tech & ETF coverage','Cross-asset portfolio','Macro correlation view'],
    Screen: PhoneStocks,
  },
]

function AppShowcase() {
  const [active, setActive] = useState(0)
  const panelRefs = useRef([])
  const sectionRef = useRef(null)
  const phoneColRef = useRef(null)

  // Active panel detection
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => { entries.forEach(e => { if (e.isIntersecting) setActive(Number(e.target.dataset.idx)) }) },
      { threshold: 0, rootMargin: '-42% 0px -42% 0px' }
    )
    panelRefs.current.forEach(el => el && obs.observe(el))
    return () => obs.disconnect()
  }, [])

  // JS-driven sticky: translateY compensates for scroll, keeping phone centered in viewport
  useEffect(() => {
    const section = sectionRef.current
    const phoneCol = phoneColRef.current
    if (!section || !phoneCol) return

    const PHONE_H = 580
    let phoneNaturalTop = 0
    let sectionDocTop = 0
    let sectionH = 0

    const measure = () => {
      phoneCol.style.transform = ''
      const r = phoneCol.getBoundingClientRect()
      phoneNaturalTop = r.top + window.scrollY
      sectionDocTop = section.getBoundingClientRect().top + window.scrollY
      sectionH = section.offsetHeight
    }

    const update = () => {
      const sy = window.scrollY
      const targetTop = (window.innerHeight - PHONE_H) / 2
      const scrolledPast = sy - (phoneNaturalTop - targetTop)
      const maxTY = sectionDocTop + sectionH - phoneNaturalTop - PHONE_H
      phoneCol.style.transform = `translateY(${Math.max(0, Math.min(scrolledPast, maxTY))}px)`
    }

    const onResize = () => { measure(); update() }

    requestAnimationFrame(() => { measure(); update() })
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', onResize, { passive: true })
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const feat = APP_FEATURES[active]

  return (
    <section className="asc-section" ref={sectionRef}>
      {/* Background color-shift orb follows active feature */}
      <div className="asc-bg-orb" style={{ background:`radial-gradient(ellipse at 70% 50%, ${feat.accentColor}0d 0%, transparent 60%)` }}/>

      {/* Centered top header */}
      <div className="asc-top">
        <div className="asc-eyebrow"><span className="asc-eye-dot"/>MOBILE APP</div>
        <h2 className="asc-main-title">Professional trading.<br/><span className="asc-main-em">In your pocket.</span></h2>
        <p className="asc-main-sub">Every tool. Natively on iOS and Android.</p>
        <div className="asc-store-row">
          <button className="asc-sbtn asc-sbtn-primary">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
            App Store
          </button>
          <button className="asc-sbtn">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M3.18 23.76c.3.17.65.19.97.05l12.45-7.19-2.65-2.65-10.77 9.79zM.35 1.16C.13 1.49 0 1.95 0 2.54v18.92c0 .59.13 1.05.35 1.38l.07.07 10.59-10.59v-.25L.42 1.09l-.07.07zM21.14 10.57l-2.93-1.69-2.99 2.99 2.99 2.99 2.95-1.7c.84-.48.84-1.27-.02-1.59zM3.18.24l12.45 7.19-2.65 2.65L2.21.29C2.53.16 2.88.18 3.18.24z"/></svg>
            Google Play
          </button>
        </div>
      </div>

      {/* Scroll zone: left panels + sticky right phone */}
      <div className="asc-zone">
        {/* Left: feature panels */}
        <div className="asc-panels">
          {APP_FEATURES.map((f, i) => (
            <div key={i} className={`asc-panel${active===i?' asc-panel-on':''}`}
              data-idx={i} ref={el => panelRefs.current[i] = el}>
              <div className="asc-panel-ew" style={{ color:f.accentColor }}>
                <span className="asc-panel-dot" style={{ background:f.accentColor, boxShadow:`0 0 8px ${f.accentColor}` }}/>
                {f.eyebrow}
              </div>
              <h3 className="asc-panel-h3">
                {f.title.split('\n').map((l,j,arr) => <span key={j}>{l}{j<arr.length-1&&<br/>}</span>)}
              </h3>
              <p className="asc-panel-desc">{f.desc}</p>
              <ul className="asc-panel-feats">
                {f.feats.map(ft => (
                  <li key={ft}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={f.accentColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {ft}
                  </li>
                ))}
              </ul>
              {/* Progress indicator */}
              <div className="asc-panel-prog">
                {APP_FEATURES.map((_,di) => (
                  <div key={di} className={`asc-pdot${active===di?' asc-pdot-on':''}`}
                    style={active===di?{background:feat.accentColor,width:20}:{}}/>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Right: outer column stretches full panel height; inner col tracks scroll via JS */}
        <div className="asc-phone-outer">
        <div className="asc-phone-col" ref={phoneColRef}>
          <div className="asc-phone-wrap">
            {/* Dynamic glow */}
            <div className="asc-phone-glow" style={{ background:`radial-gradient(ellipse, ${feat.accentColor}20 0%, transparent 65%)` }}/>

            {/* Floating tokens */}
            {FLOAT_TOKENS.map((t,i) => (
              <div key={i} className="asc-float" style={{ ...t.pos, '--fd':`${t.delay}s` }}>
                <img src={t.img} alt={t.sym} className="asc-float-img"
                  onError={e => { e.currentTarget.style.opacity='.08' }}
                  style={{ border:`2px solid ${t.color}60`, boxShadow:`0 0 16px ${t.color}40, 0 4px 12px rgba(0,0,0,.5)` }}
                />
              </div>
            ))}

            {/* Phone frame */}
            <div className="asc-phone">
              <div className="asc-notch"/>
              {/* Status bar */}
              <div className="asc-statusbar">
                <span style={{fontSize:11,fontWeight:600,color:'rgba(255,255,255,.85)',fontFamily:'-apple-system,sans-serif'}}>9:41</span>
                <div style={{display:'flex',gap:5,alignItems:'center'}}>
                  <svg width="13" height="9" viewBox="0 0 13 9" fill="rgba(255,255,255,.6)"><rect x="0" y="3" width="2" height="6" rx=".4"/><rect x="3" y="2" width="2" height="7" rx=".4"/><rect x="6" y="1" width="2" height="8" rx=".4"/><rect x="9" y="0" width="2" height="9" rx=".4"/><rect x="11.5" y="0" width="1.5" height="9" rx=".3" opacity=".25"/></svg>
                  <svg width="22" height="10" viewBox="0 0 22 10" fill="none"><rect x=".5" y="1.5" width="18" height="7" rx="1.5" stroke="rgba(255,255,255,.45)" strokeWidth="1"/><rect x="19" y="3.5" width="2.5" height="3" rx=".8" fill="rgba(255,255,255,.35)"/><rect x="1.5" y="2.5" width="14" height="5" rx="1" fill="rgba(255,255,255,.85)"/></svg>
                </div>
              </div>
              {/* App header */}
              <div className="asc-app-hd">
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontFamily:'var(--mono)',fontSize:14,fontWeight:700,color:'#fff',letterSpacing:'.04em'}}><span style={{color:'#00d992'}}>[</span>TT<span style={{color:'#00d992'}}>]</span></span>
                  <span style={{fontFamily:'var(--mono)',fontSize:9,fontWeight:700,color:'#00d992',border:'1px solid rgba(0,217,146,.3)',borderRadius:4,padding:'2px 6px',letterSpacing:'.06em',background:'rgba(0,217,146,.08)'}}>PRO</span>
                </div>
                <span className="bm-pulse-dot green" style={{width:6,height:6}}/>
              </div>

              {/* Screen area — all 5 screens stacked, active one shows */}
              <div className="asc-screen-area">
                {APP_FEATURES.map((f, i) => (
                  <div key={i} className={`asc-slide${active===i?' asc-slide-on':''}`}>
                    <f.Screen isActive={active===i}/>
                  </div>
                ))}
              </div>

              {/* Bottom nav — active tab changes per feature */}
              <div className="asc-bottom-nav">
                {ASC_NAV.map((n,i) => (
                  <div key={n.label} className={`asc-nav-item${feat.tabActive===i?' asc-nav-on':''}`}
                    style={feat.tabActive===i?{color:feat.accentColor}:{}}>
                    {n.icon}
                    <span>{n.label}</span>
                  </div>
                ))}
              </div>
              <div className="asc-home-bar"/>
            </div>
          </div>
        </div>
        </div>{/* /asc-phone-outer */}
      </div>
    </section>
  )
}

function MobileShowcase() { return null }
function MobileAppScreen() { return null }

// ── Stack items (tools + minis) ───────────────────────────────────────────────
const STACK_ITEMS = [
  { id:'liquidations-stream', tag:'LIQ',   pro:true,  color:'#f23645', dim:'rgba(242,54,69,0.14)',   name:'Liquidation Stream', mini:<LiqMini /> },
  { id:'funding-rate',        tag:'FUND',  pro:true,  color:'#3b82f6', dim:'rgba(59,130,246,0.14)',  name:'Funding Rates',      mini:<FundMini /> },
  { id:'big-transfers',       tag:'WHALE', pro:true,  color:'#f59e0b', dim:'rgba(245,158,11,0.14)',  name:'Whale Alerts',       mini:<WhaleMini /> },
  { id:'smart-money',         tag:'SM',    pro:true,  color:'#a855f7', dim:'rgba(168,85,247,0.14)',  name:'Smart Money',        mini:<SmartMini /> },
  { id:'long-short-ratio',    tag:'L/S',   pro:true,  color:'#00e87a', dim:'rgba(0,232,122,0.14)',   name:'Long / Short Ratio', mini:<LSMini /> },
  { id:'volume-monitor',      tag:'VOL',   pro:true,  color:'#8b5cf6', dim:'rgba(139,92,246,0.14)',  name:'Volume Monitor',     mini:<VolMini /> },
  { id:'token-unlock',        tag:'VEST',  pro:true,  color:'#f97316', dim:'rgba(249,115,22,0.14)',  name:'Token Unlock',       mini:<VestMini /> },
  { id:'custom-alerts',       tag:'ALT',   pro:true,  color:'#eab308', dim:'rgba(234,179,8,0.14)',   name:'Custom Alerts',      mini:<AltMini /> },
  { id:'portfolio',           tag:'PF',    pro:true,  color:'#00e87a', dim:'rgba(0,232,122,0.14)',   name:'Portfolio',          mini:<PfMini /> },
  { id:'global-metrics',      tag:'MKT',   pro:false, color:'#8b5cf6', dim:'rgba(139,92,246,0.14)',  name:'Global Metrics',     mini:<MktMini /> },
  { id:'economic-calendar',   tag:'CAL',   pro:false, color:'#94a3b8', dim:'rgba(148,163,184,0.14)', name:'Economic Calendar',  mini:<CalMini /> },
  { id:'spot-markets',        tag:'SPOT',  pro:false, color:'#f59e0b', dim:'rgba(245,158,11,0.14)',  name:'Spot Markets',       mini:<SpotMini /> },
  { id:'terminal',            tag:'TERM',  pro:true,  color:'#00e87a', dim:'rgba(0,232,122,0.14)',   name:'Trade Terminal',     mini:<TermMini /> },
]

// ── Feature Showcase ─────────────────────────────────────────────────────────
const SHOWCASE = [
  {
    id:'liq',   title:'Liquidation Stream', tagline:'Real-time cascade detection',
    color:'#f23645', toolId:'liquidations-stream',
    desc:'Watch cascading forced liquidations stream in across Binance, OKX, Bybit and Hyperliquid the instant they happen.',
    stats:[{ v:'$420M+', l:'daily liquidated' }, { v:'<50ms', l:'latency' }, { v:'4 perps', l:'exchanges' }],
  },
  {
    id:'whale', title:'Whale Alerts', tagline:'On-chain transfer monitoring',
    color:'#f59e0b', toolId:'big-transfers',
    desc:'Detect billion-dollar blockchain transfers the second they hit mempool. BTC, ETH, USDT, SOL and more tracked 24/7.',
    stats:[{ v:'6+', l:'blockchains' }, { v:'$1M', l:'min alert size' }, { v:'<5s', l:'detection lag' }],
  },
  {
    id:'fund',  title:'Funding Rates', tagline:'Cross-exchange spread finder',
    color:'#3b82f6', toolId:'funding-rate',
    desc:'Compare live perpetual funding rates across Binance, OKX and Bybit. Spot arbitrage opportunities instantly.',
    stats:[{ v:'3 exch', l:'Binance OKX Bybit' }, { v:'1 min', l:'refresh rate' }, { v:'200+', l:'pairs tracked' }],
  },
  {
    id:'smart', title:'Smart Money', tagline:'Copy top on-chain traders',
    color:'#a855f7', toolId:'smart-money',
    desc:'Track the top 50 Hyperliquid wallets in real-time. See their positions, leverage, realized PnL and size instantly.',
    stats:[{ v:'Top 50', l:'wallets tracked' }, { v:'Live', l:'PnL updates' }, { v:'HL only', l:'Hyperliquid data' }],
  },
  {
    id:'ls',    title:'Long / Short Ratio', tagline:'Live market sentiment signal',
    color:'#00e87a', toolId:'long-short-ratio',
    desc:'Track real-time long/short positioning across BTC, ETH and SOL. Know what the crowd is doing before it moves.',
    stats:[{ v:'3 pairs', l:'BTC ETH SOL' }, { v:'Live', l:'sentiment updates' }, { v:'4 exch', l:'aggregated' }],
  },
  {
    id:'vol',   title:'Volume Monitor', tagline:'Spike detection across markets',
    color:'#a855f7', toolId:'volume-monitor',
    desc:'Track 24h trading volume and detect abnormal spikes across BTC, ETH, SOL and more. Unusual volume = opportunity.',
    stats:[{ v:'Top 20', l:'pairs tracked' }, { v:'Live', l:'spike detection' }, { v:'4 exch', l:'aggregated' }],
  },
  {
    id:'vest',  title:'Token Unlock', tagline:'Upcoming vesting schedules',
    color:'#f97316', toolId:'token-unlock',
    desc:'Track upcoming token unlock events that could move markets. Know when large supplies hit circulation before they do.',
    stats:[{ v:'100+', l:'projects tracked' }, { v:'14 day', l:'lookahead' }, { v:'$2B+', l:'avg monthly unlock' }],
  },
  {
    id:'alt',   title:'Custom Alerts', tagline:'Set price, volume & event triggers',
    color:'#eab308', toolId:'custom-alerts',
    desc:'Build your own alert conditions — price levels, funding spikes, whale moves, liquidation cascades. Never miss a signal.',
    stats:[{ v:'Unlimited', l:'alerts' }, { v:'<1s', l:'trigger speed' }, { v:'6 types', l:'alert conditions' }],
  },
  {
    id:'pf',    title:'Portfolio', tagline:'Track your holdings live',
    color:'#00e87a', toolId:'portfolio',
    desc:'Connect your wallets and exchange accounts to track balances, PnL and asset allocation in real-time, all in one view.',
    stats:[{ v:'Multi-chain', l:'wallet tracking' }, { v:'Live', l:'PnL updates' }, { v:'All exch', l:'supported' }],
  },
  {
    id:'mkt',   title:'Global Metrics', tagline:'Macro crypto market overview',
    color:'#8b5cf6', toolId:'global-metrics',
    desc:'Total market cap, BTC dominance, Fear & Greed Index and 24h volume — the full macro picture at a glance.',
    stats:[{ v:'Real-time', l:'market cap' }, { v:'Fear&Greed', l:'index included' }, { v:'BTC Dom', l:'tracked live' }],
  },
  {
    id:'cal',   title:'Economic Calendar', tagline:'CPI, Fed, crypto events',
    color:'#94a3b8', toolId:'economic-calendar',
    desc:'Never get caught off-guard by macro events. US CPI, Fed meetings, token unlocks and major protocol upgrades all in one feed.',
    stats:[{ v:'50+', l:'events/month' }, { v:'3 impact', l:'severity levels' }, { v:'Crypto+Macro', l:'combined' }],
  },
  {
    id:'spot',  title:'Spot Markets', tagline:'Live prices across 200+ pairs',
    color:'#f59e0b', toolId:'spot-markets',
    desc:'Real-time spot prices, 24h changes and volume across the top 200+ trading pairs from Binance, OKX and Bybit.',
    stats:[{ v:'200+', l:'pairs' }, { v:'Live', l:'price feed' }, { v:'3 exch', l:'aggregated' }],
  },
  {
    id:'term',  title:'Terminal', tagline:'Command-line power interface',
    color:'#00e87a', toolId:'terminal',
    desc:'A full-featured command-line terminal for power users. Set alerts, query data, manage positions and run reports — all via commands.',
    stats:[{ v:'40+', l:'commands' }, { v:'Instant', l:'execution' }, { v:'Scriptable', l:'workflows' }],
  },
]

function FeatureShowcase() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [prog, setProg] = useState(0)
  const DURATION = 5000
  const TICK = 50

  useEffect(() => {
    if (paused) return
    const id = setInterval(() => {
      setProg(p => {
        const next = p + (TICK / DURATION) * 100
        if (next >= 100) {
          setActive(a => (a + 1) % SHOWCASE.length)
          return 0
        }
        return next
      })
    }, TICK)
    return () => clearInterval(id)
  }, [paused, active])

  const handleSelect = (i) => { setActive(i); setProg(0) }
  const f = SHOWCASE[active]

  const MINI_MAP = {
    liq:   <LiqMini />,
    whale: <WhaleMini />,
    fund:  <FundMini />,
    smart: <SmartMini />,
    ls:    <LSMini />,
    vol:   <VolMini />,
    vest:  <VestMini />,
    alt:   <AltMini />,
    pf:    <PfMini />,
    mkt:   <MktMini />,
    cal:   <CalMini />,
    spot:  <SpotMini />,
    term:  <TermMini />,
  }

  return (
    <div className="fl-root" onMouseEnter={() => setPaused(true)} onMouseLeave={() => { setPaused(false); setProg(0) }}>

      {/* ── Left sidebar tabs ── */}
      <div className="fl-sidebar">
        {SHOWCASE.map((feat, i) => (
          <button key={feat.id} className={`fl-tab ${i === active ? 'active' : ''}`}
            style={{ '--fc': feat.color }} onClick={() => handleSelect(i)}>
            <div className="fl-tab-bar" />
            <div className="fl-tab-ico">
              <ToolIcon id={feat.toolId} color={i === active ? feat.color : 'rgba(255,255,255,0.3)'} />
            </div>
            <div className="fl-tab-body">
              <div className="fl-tab-name">{feat.title}</div>
              <div className="fl-tab-sub">{feat.tagline}</div>
            </div>
          </button>
        ))}
      </div>

      {/* ── Right stage ── */}
      <TiltCard className="fl-stage" style={{ '--fc': f.color }}>
        {/* Top chrome */}
        <div className="fl-chrome">
          <div className="fl-chrome-dots">
            <span style={{ background:'#ff5f57' }} /><span style={{ background:'#febc2e' }} /><span style={{ background:'#28c840' }} />
          </div>
          <div className="fl-chrome-addr">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ color:'rgba(255,255,255,.3)' }}>
              <rect x="5" y="11" width="14" height="11" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>
            </svg>
            cryptoterminal.app/{f.id}
          </div>
          <div className="fl-chrome-live"><span className="bm-pulse-dot" />LIVE</div>
        </div>

        {/* Body — key forces remount so mini animations restart fresh */}
        <div className="fl-body" key={active}>
          <div className="fl-preview">
            {MINI_MAP[f.id]}
          </div>
          <div className="fl-aside">
            <div className="fl-aside-title" style={{ color: f.color }}>{f.title}</div>
            <div className="fl-aside-desc">{f.desc}</div>
            <div className="fl-aside-stats">
              {f.stats.map((s, i) => (
                <div key={i} className="fl-stat" style={{ '--i': i }}>
                  <div className="fl-stat-v" style={{ color: f.color }}>{s.v}</div>
                  <div className="fl-stat-l">{s.l}</div>
                </div>
              ))}
            </div>
            <div className="fl-aside-dots">
              {SHOWCASE.map((_, i) => (
                <button key={i} className={`fl-dot ${i === active ? 'active' : ''}`}
                  style={{ '--fc': SHOWCASE[i].color }} onClick={() => handleSelect(i)} />
              ))}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="fl-progbar">
          <div className="fl-progbar-fill" style={{ width:`${prog}%`, background: f.color }} />
        </div>

        {/* Mouse-tracking glow */}
        <div className="fl-glow" />
      </TiltCard>
    </div>
  )
}

// ── Scroll Cinema ─────────────────────────────────────────────────────────────

const PARTICLE_SYMBOLS = [
  '$1.2M','BTC','ETH','LONG','SHORT','+0.08%','-2.3%','$48K',
  '0x7f..','WHALE','BNB','SOL','FUND','LIQ','ARB','0.083%',
  '>$5M','PERP','SPOT','+3.2%','CASCADE','ALERT','ON-CHAIN',
]

const CINEMA_TOOLS = [
  {
    id: 'liquidations-stream', num: '01', tag: 'LIQ',
    name: 'Liquidation\nStream',
    tagline: 'Real-time cascade detection',
    desc: 'Watch forced liquidations stream in across Binance, OKX, Bybit and Hyperliquid the instant they happen. Every long and short caught before the market reacts.',
    color: '#f23645',
    stats: [{ v:'$420M+', l:'Daily liquidated' }, { v:'<50ms', l:'Latency' }, { v:'4', l:'Perp exchanges' }],
    mini: <LiqMini />,
  },
  {
    id: 'big-transfers', num: '02', tag: 'WHALE',
    name: 'Whale\nAlerts',
    tagline: 'On-chain transfer monitoring',
    desc: 'Detect billion-dollar blockchain transfers the second they hit mempool. BTC, ETH, USDT, SOL and more — tracked 24/7 across 6 chains.',
    color: '#f59e0b',
    stats: [{ v:'6+', l:'Blockchains' }, { v:'$1M', l:'Min alert' }, { v:'<5s', l:'Detection lag' }],
    mini: <WhaleMini />,
  },
  {
    id: 'smart-money', num: '03', tag: 'SM',
    name: 'Smart\nMoney',
    tagline: 'Copy top on-chain traders',
    desc: 'Track the top 50 Hyperliquid wallets in real-time. Positions, leverage, realized PnL — follow the smart money before the market does.',
    color: '#a855f7',
    stats: [{ v:'Top 50', l:'Wallets tracked' }, { v:'Live', l:'PnL updates' }, { v:'HL', l:'Hyperliquid' }],
    mini: <SmartMini />,
  },
  {
    id: 'funding-rate', num: '04', tag: 'FUND',
    name: 'Funding\nRates',
    tagline: 'Cross-exchange spread finder',
    desc: 'Compare live perpetual funding rates across Binance, OKX and Bybit. Spot arbitrage opportunities the moment they appear.',
    color: '#3b82f6',
    stats: [{ v:'3', l:'Exchanges' }, { v:'200+', l:'Pairs tracked' }, { v:'1min', l:'Refresh rate' }],
    mini: <FundMini />,
  },
  {
    id: 'long-short-ratio', num: '05', tag: 'L/S',
    name: 'Long / Short\nRatio',
    tagline: 'Live market sentiment signal',
    desc: 'Know what the crowd is doing before the market moves. Real-time long/short positioning across BTC, ETH and SOL — aggregated from 4 exchanges.',
    color: '#00e87a',
    stats: [{ v:'3', l:'Pairs' }, { v:'Live', l:'Sentiment' }, { v:'4', l:'Exchanges' }],
    mini: <LSMini />,
  },
  {
    id: 'custom-alerts', num: '06', tag: 'ALT',
    name: 'Custom\nAlerts',
    tagline: 'Set price, volume & event triggers',
    desc: 'Build your own alert conditions — price levels, funding spikes, whale moves, liquidation cascades. Never miss a signal again.',
    color: '#eab308',
    stats: [{ v:'∞', l:'Alerts' }, { v:'<1s', l:'Trigger speed' }, { v:'6', l:'Alert types' }],
    mini: <AltMini />,
  },
]

function DataParticles({ color, active }) {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const particlesRef = useRef([])

  useEffect(() => {
    if (!active) { if (rafRef.current) cancelAnimationFrame(rafRef.current); return }
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
    if (particlesRef.current.length === 0) {
      particlesRef.current = Array.from({ length: 22 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        text: PARTICLE_SYMBOLS[Math.floor(Math.random() * PARTICLE_SYMBOLS.length)],
        speed: 0.18 + Math.random() * 0.32,
        opacity: 0.018 + Math.random() * 0.038,
        size: 10 + Math.floor(Math.random() * 5),
      }))
    }
    const r = parseInt(color.slice(1,3),16)
    const g = parseInt(color.slice(3,5),16)
    const b = parseInt(color.slice(5,7),16)
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particlesRef.current.forEach(p => {
        ctx.font = `${p.size}px 'DM Mono', monospace`
        ctx.fillStyle = `rgba(${r},${g},${b},${p.opacity})`
        ctx.fillText(p.text, p.x, p.y)
        p.y -= p.speed
        if (p.y < -20) {
          p.y = canvas.height + 20
          p.x = Math.random() * canvas.width
          p.text = PARTICLE_SYMBOLS[Math.floor(Math.random() * PARTICLE_SYMBOLS.length)]
        }
      })
      rafRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [active, color])

  return <canvas ref={canvasRef} className="sc-particles" />
}

function CinemaScene({ tool, index, total }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.28 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div ref={ref} className={`sc-scene${visible ? ' sc-visible' : ''}`}>
      <div className="sc-ambient" style={{ background:`radial-gradient(ellipse 55% 70% at 68% 50%, ${tool.color}12 0%, transparent 68%)` }} />
      <DataParticles color={tool.color} active={visible} />

      <div className="sc-content">
        {/* Left */}
        <div className="sc-left">
          <div className="sc-num-bg">{tool.num}</div>
          <div className="sc-tag" style={{ color:tool.color, background:tool.color+'12', borderColor:tool.color+'30' }}>
            {tool.tag}
          </div>
          <h2 className="sc-title">
            {tool.name.split('\n').map((line, i, arr) => (
              <span key={i}>{line}{i < arr.length-1 && <br/>}</span>
            ))}
          </h2>
          <p className="sc-tagline" style={{ color:tool.color }}>{tool.tagline}</p>
          <p className="sc-desc">{tool.desc}</p>
          <div className="sc-stats">
            {tool.stats.map((s, i) => (
              <div key={i} className="sc-stat">
                <span className="sc-stat-v" style={{ color:tool.color }}>{s.v}</span>
                <span className="sc-stat-l">{s.l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right */}
        <div className="sc-right">
          <div className="sc-frame" style={{ '--sc-fc': tool.color }}>
            <div className="sc-frame-top-accent" style={{ background:`linear-gradient(90deg, transparent, ${tool.color}60, transparent)` }} />
            <div className="sc-frame-chrome">
              <div className="sc-frame-dots">
                <span style={{background:'#ff5f57'}}/><span style={{background:'#febc2e'}}/><span style={{background:'#28c840'}}/>
              </div>
              <span className="sc-frame-url">cryptoterminal.app/{tool.id}</span>
              <span className="sc-frame-live"><span className="bm-pulse-dot" style={{background:tool.color}}/>LIVE</span>
            </div>
            <div className="sc-frame-body">
              {tool.mini}
            </div>
            <div className="sc-frame-glow" style={{ background:`radial-gradient(ellipse at 50% 110%, ${tool.color}22, transparent 65%)` }} />
          </div>
        </div>
      </div>

      {/* Side progress indicator */}
      <div className="sc-progress">
        <span className="sc-prog-label">{tool.num}/{String(total).padStart(2,'0')}</span>
        <div className="sc-prog-track">
          <div className="sc-prog-fill" style={{ height:`${((index+1)/total)*100}%`, background:tool.color }} />
        </div>
      </div>
    </div>
  )
}

function ScrollCinema() {
  return (
    <div className="sc-root">
      {CINEMA_TOOLS.map((tool, idx) => (
        <CinemaScene key={tool.id} tool={tool} index={idx} total={CINEMA_TOOLS.length} />
      ))}
    </div>
  )
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`ld3-faq-item ${open?'open':''}`} onClick={() => setOpen(o => !o)}>
      <div className="ld3-faq-q">
        <span>{q}</span>
        <svg className="ld3-faq-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div className="ld3-faq-a">{a}</div>
    </div>
  )
}

// ── Landing Page ──────────────────────────────────────────────────────────────
export default function LandingPage() {
  const { user, token, plan } = useAuth()
  const { t, lang, toggleLang } = useLang()
  const navigate = useNavigate()
  const isPro = plan === 'pro'
  const [billingYearly, setBillingYearly] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const pageRef = useRef(null)

  const FREE_FEATURES = Array.from({ length: 6  }, (_, i) => t(`free_feat_${i}`))
  const PRO_FEATURES  = Array.from({ length: 11 }, (_, i) => t(`pro_feat_${i}`))

  const handleGetPro = async () => {
    if (!token) { navigate('/register?plan=pro'); return }
    setCheckoutLoading(true)
    try { sessionStorage.setItem('tt_start_page', 'upgrade'); navigate('/app#upgrade') }
    finally { setCheckoutLoading(false) }
  }

  const onMove = (e) => {
    const rect = pageRef.current?.getBoundingClientRect(); if (!rect) return
    pageRef.current.style.setProperty('--mx', `${e.clientX - rect.left}px`)
    pageRef.current.style.setProperty('--my', `${e.clientY - rect.top}px`)
  }

  const BENTO = [
    { key:'liq',   title:'Liquidation Stream', desc:'Real-time long/short liquidations across all major exchanges.',     accent:'#ff4d6a', mini:<LiqMini />,   cls:'ld3-b-large', pro:true  },
    { key:'whale', title:'Whale Alerts',        desc:'Detect massive market transfers and whale moves the instant they happen.', accent:'#f59e0b', mini:<WhaleMini />, cls:'ld3-b-med',   pro:true  },
    { key:'fund',  title:'Funding Rate',        desc:'Live perpetual funding rates across Binance, OKX and Bybit.',      accent:'#3b82f6', mini:<FundMini />,  cls:'ld3-b-small', pro:true  },
    { key:'smart', title:'Smart Money',         desc:'Copy the top Hyperliquid traders with full position visibility.',  accent:'#a855f7', mini:<SmartMini />, cls:'ld3-b-small', pro:true  },
    { key:'ls',    title:'Long / Short Ratio',  desc:'Real-time BTC sentiment across all major exchanges.',              accent:'#00e87a', mini:<LSMini />,    cls:'ld3-b-small', pro:true  },
  ]

  return (
    <div ref={pageRef} className="ld3-page">
      {/* Background */}
      <div className="ld3-bg-grid" />
      <div className="ld3-bg-orb ld3-orb-1" />
      <div className="ld3-bg-orb ld3-orb-2" />
      <div className="ld3-bg-orb ld3-orb-3" />

      {/* ── Nav ── */}
      <nav className="ld3-nav">
        <Link to="/" className="ld3-nav-logo">
          <span className="ld3-nb">[</span>TT<span className="ld3-nb">]</span>
          <span className="ld3-nav-word">TRADING TERMINAL</span>
        </Link>
        <div className="ld3-nav-links">
          <a href="#features" className="ld3-nav-link">{t('nav_tools')}</a>
          <a href="#pricing"  className="ld3-nav-link">{t('nav_pricing')}</a>
          <a href="#faq"      className="ld3-nav-link">FAQ</a>
        </div>
        <div className="ld3-nav-right">
          <button className="ld3-lang" onClick={toggleLang}>{lang === 'en' ? 'TR' : 'EN'}</button>
          {user ? (
            <button className="ld3-btn-primary" onClick={() => { if (isPro) sessionStorage.setItem('tt_start_page','terminal'); navigate('/app') }}>
              {isPro ? t('nav_open_terminal') : t('nav_go_dashboard')}
            </button>
          ) : (
            <>
              <Link to="/login" className="ld3-nav-link">{t('nav_signin')}</Link>
              <button className="ld3-btn-primary" onClick={() => navigate('/register')}>{t('nav_start_free')}</button>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="ld3-hero">
        <div className="ld3-hero-l">
          <div className="ld3-hero-badge">
            <span className="ld3-hero-dot" />{t('hero_eyebrow')}
          </div>
          <h1 className="ld3-hero-h1">
            {t('hero_line1')}<br />
            <span className="ld3-hero-grad">{t('hero_accent')}</span>
          </h1>
          <p className="ld3-hero-sub">{t('hero_sub')}</p>
          <div className="ld3-hero-btns">
            <button className="ld3-btn-primary ld3-btn-lg" onClick={() => { if (!user) { navigate('/register'); return }; if (isPro) sessionStorage.setItem('tt_start_page','terminal'); navigate('/app') }}>
              {!user ? t('hero_start_free') : isPro ? t('hero_open') : t('hero_go_dashboard')}
              <span className="ld3-btn-ic">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </span>
            </button>
            <button className="ld3-btn-ghost ld3-btn-lg" onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior:'smooth' })}>
              {t('hero_see_pricing')}
            </button>
          </div>
          <div className="ld3-hero-stats">
            {[
              { v:'4',     l: t('hero_stat_exchange') },
              { v:'13+',   l: t('hero_stat_tools') },
              { v:'<50ms', l: t('hero_stat_latency') },
              { v:'24/7',  l: t('hero_stat_live') },
            ].map((s,i) => (
              <div key={i} className="ld3-hstat">
                <div className="ld3-hstat-v">{s.v}</div>
                <div className="ld3-hstat-l">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="ld3-hero-r">
          <HeroVisual />
        </div>
      </section>

      {/* ── Marquee ── */}
      <div className="ld3-mq-section">
        <Marquee items={MARQUEE_ITEMS} />
      </div>

      {/* ── Scroll Cinema ── */}
      <section id="features" className="sc-section">
        <div className="ld3-inner">
          <div className="ld3-section-hd">
            <h2 className="ld3-h2">{t('tools_title')}</h2>
            <p className="ld3-hsub">{t('tools_sub')}</p>
          </div>
        </div>
        <ScrollCinema />
      </section>

      {/* ── App Showcase (scroll-pinned) ── */}
      <AppShowcase />

      {/* ── Token Ticker ── */}
      <section className="ld3-section ld3-section-alt tt-section">
        <div className="ld3-inner">
          <div className="ld3-section-hd">
            <h2 className="ld3-h2">Every tool you need. <span className="tc2-title-em">All in one place.</span></h2>
            <p className="ld3-hsub">13 professional-grade modules. Live data. Zero tab-switching.</p>
          </div>
          <TokenTicker />
          <FeatureShowcase />
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="ld3-section">
        <div className="ld3-inner">
          <div className="ld3-section-hd">
            <h2 className="ld3-h2">{t('pricing_title')}</h2>
            <p className="ld3-hsub">{t('pricing_sub')}</p>
          </div>
          <div className="ld3-billing">
            <span className={!billingYearly ? 'on' : ''}>{t('billing_monthly')}</span>
            <button className="ld3-tog" onClick={() => setBillingYearly(v => !v)}>
              <span className={`ld3-tog-k ${billingYearly ? 'r' : ''}`} />
            </button>
            <span className={billingYearly ? 'on' : ''}>{t('billing_yearly')}</span>
            <span className="ld3-save">{t('billing_save')}</span>
          </div>
          <div className="ld3-price-grid">
            {/* ── Free card ── */}
            <TiltCard className="ld3-pcard">
              <div className="ld3-pcard-tier">{t('free_tier')}</div>
              <div className="ld3-pcard-price">$0 <span>/ {t('free_period')}</span></div>
              <p className="ld3-pcard-desc">{t('free_desc')}</p>
              <div className="ld3-pcard-divider" />
              <ul className="ld3-pcard-feats">
                {FREE_FEATURES.map((f,i) => (
                  <li key={i}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <button className="ld3-pcard-btn free" onClick={() => navigate(user ? '/app' : '/register')}>
                {user ? t('btn_open_terminal') : t('btn_start_free')}
              </button>
            </TiltCard>

            {/* ── Pro card ── */}
            <TiltCard className="ld3-pcard ld3-pcard-pro">
              <div className="ld3-pcard-glow" />
              <div className="ld3-pcard-topline" />
              <div className="ld3-pcard-popular">{isPro ? t('current_plan') : t('most_popular')}</div>
              <div className="ld3-pcard-tier pro">PRO</div>
              <div className="ld3-pcard-price pro">
                {billingYearly ? '$39' : '$49'} <span>/ mo</span>
              </div>
              {billingYearly && <div className="ld3-billed">{t('billed_yearly')}</div>}
              <p className="ld3-pcard-desc">{t('pro_desc')}</p>
              <div className="ld3-pcard-divider" />
              <ul className="ld3-pcard-feats pro">
                {PRO_FEATURES.map((f,i) => (
                  <li key={i}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                className={`ld3-pcard-btn pro ${checkoutLoading?'loading':''} ${isPro?'current':''}`}
                onClick={isPro ? () => navigate('/app') : handleGetPro}
                disabled={checkoutLoading}
              >
                {checkoutLoading ? <span className="ld3-spin" /> : isPro ? t('open_dashboard') : t('upgrade_cta')}
              </button>
              <div className="ld3-money-back">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                {t('money_back')}
              </div>
            </TiltCard>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="ld3-section ld3-section-alt">
        <div className="ld3-inner ld3-inner-narrow">
          <div className="ld3-section-hd">
            <h2 className="ld3-h2">{t('faq_title')}</h2>
            <p className="ld3-hsub">{t('faq_sub')}</p>
          </div>
          <div className="ld3-faq">
            {[1,2,3,4,5,6].map(n => (
              <FaqItem key={n} q={t(`faq_q${n}`)} a={t(`faq_a${n}`)} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA strip ── */}
      <section className="ld3-cta">
        <div className="ld3-cta-glow" />
        <div className="ld3-cta-inner">
          <h2 className="ld3-cta-h2">Start trading smarter today.</h2>
          <p className="ld3-cta-sub">Free to start. No credit card required.</p>
          <div className="ld3-cta-btns">
            <button className="ld3-btn-primary ld3-btn-lg" onClick={() => navigate(user ? '/app' : '/register')}>
              {user ? 'Open Terminal' : 'Get Started Free'}
              <span className="ld3-btn-ic">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </span>
            </button>
            <button className="ld3-btn-ghost ld3-btn-lg" onClick={handleGetPro}>View Pro Plan</button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="ld3-footer">
        <div className="ld3-footer-inner">
          <div className="ld3-footer-top">
            <div className="ld3-footer-logo">
              <span className="ld3-nb">[</span>TT<span className="ld3-nb">]</span>
            </div>
            <div className="ld3-footer-cols">
              <div className="ld3-footer-col">
                <div className="ld3-footer-col-h">Platform</div>
                <a href="#features" className="ld3-flink">{t('footer_tools')}</a>
                <a href="#pricing"  className="ld3-flink">{t('footer_pricing')}</a>
                <a href="#faq"      className="ld3-flink">FAQ</a>
              </div>
              <div className="ld3-footer-col">
                <div className="ld3-footer-col-h">Account</div>
                <Link to="/login"    className="ld3-flink">{t('footer_signin')}</Link>
                <Link to="/register" className="ld3-flink">{t('footer_register')}</Link>
              </div>
              <div className="ld3-footer-col">
                <div className="ld3-footer-col-h">Legal</div>
                <Link to="/privacy" className="ld3-flink">Privacy Policy</Link>
                <Link to="/terms"   className="ld3-flink">Terms of Service</Link>
              </div>
              <div className="ld3-footer-col">
                <div className="ld3-footer-col-h">Support</div>
                <a href="mailto:support@tradingtools.app" className="ld3-flink">support@tradingtools.app</a>
              </div>
            </div>
          </div>
          <div className="ld3-footer-bottom">
            <span className="ld3-footer-copy">{t('footer_copy')}</span>
            <div className="ld3-footer-legal">
              <Link to="/privacy" className="ld3-flink">Privacy</Link>
              <span>·</span>
              <Link to="/terms"   className="ld3-flink">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
