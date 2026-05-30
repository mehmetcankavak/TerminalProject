import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  const [rows, setRows] = useState([
    { id:1, side:'LONG',  sym:'BTC',  val:4.2,  ex:'Binance',     new:false },
    { id:2, side:'SHORT', sym:'ETH',  val:1.8,  ex:'OKX',         new:false },
    { id:3, side:'LONG',  sym:'SOL',  val:0.9,  ex:'Bybit',       new:false },
    { id:4, side:'SHORT', sym:'HYPE', val:2.1,  ex:'Hyperliquid', new:false },
  ])
  const [total, setTotal] = useState(18.4)
  const [sparkData, setSparkData] = useState([12,14,11,18,15,22,19,24,18,20,25,18])
  const nextId = useRef(5)

  useEffect(() => {
    const syms=['BTC','ETH','SOL','BNB','HYPE','ARB','DOGE','AVAX','SUI','WIF']
    const exs=['Binance','OKX','Bybit','Hyperliquid']
    const id = setInterval(() => {
      const val = parseFloat(rnd(0.3, 11))
      const entry = {
        id: nextId.current++,
        side: Math.random() > .5 ? 'LONG' : 'SHORT',
        sym: syms[Math.floor(Math.random() * syms.length)],
        val, ex: exs[Math.floor(Math.random() * exs.length)], new: true
      }
      setRows(p => [entry, ...p.slice(0, 3)])
      setTotal(t => parseFloat((t + val * 0.1).toFixed(1)))
      setSparkData(p => [...p.slice(1), parseFloat(rnd(10, 30))])
      setTimeout(() => setRows(p => p.map(r => r.id === entry.id ? { ...r, new: false } : r)), 600)
    }, 1800)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="bm-liq">
      <div className="bm-liq-header">
        <div className="bm-live-badge"><span className="bm-pulse-dot" />LIVE FEED</div>
        <div className="bm-liq-total">
          <span className="bm-liq-total-val">${total}M</span>
          <span className="bm-liq-total-lbl">liquidated</span>
        </div>
      </div>
      <div className="bm-liq-spark">
        <Sparkline data={sparkData} color="#ff4d6a" height={28} />
      </div>
      <div className="bm-liq-feed">
        {rows.map((r, i) => (
          <div key={r.id} className={`bm-liq-row ${r.side === 'LONG' ? 'long' : 'short'} ${r.new ? 'new' : ''}`}
               style={{ opacity: 1 - i * 0.18 }}>
            <div className={`bm-liq-badge ${r.side === 'LONG' ? 'long' : 'short'}`}>{r.side}</div>
            <span className="bm-liq-sym">{r.sym}<span className="bm-liq-pair">/USDT</span></span>
            <div className="bm-liq-right">
              <span className={`bm-liq-amt ${r.val > 5 ? 'big' : ''}`}>${r.val.toFixed(1)}M</span>
              <span className="bm-liq-ex">{r.ex}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function WhaleMini() {
  const CHAINS = { BTC:'₿', ETH:'Ξ', USDT:'₮', SOL:'◎', BNB:'⬡' }
  const CHAIN_COLOR = { BTC:'#f59e0b', ETH:'#a78bfa', USDT:'#00e87a', SOL:'#9945ff', BNB:'#f0b90b' }
  const [transfer, setTransfer] = useState({
    chain:'ETH', sym:'USDT', val:48.2,
    from:'0x1a4f...9e2c', to:'0x7f2a...c891',
    label:'Binance Hot Wallet', new:false
  })
  const [history, setHistory] = useState([48.2, 12.1, 93.4, 31.0, 67.8, 22.5, 55.3])

  useEffect(() => {
    const chains = ['ETH','BTC','USDT','SOL']
    const labels = ['Binance Hot Wallet','Unknown Wallet','Coinbase Custody','Jump Trading','OKX Exchange','DWF Labs']
    const addr = () => '0x'+Math.random().toString(16).slice(2,6)+'...'+Math.random().toString(16).slice(2,6)
    const id = setInterval(() => {
      const chain = chains[Math.floor(Math.random()*chains.length)]
      const val = parseFloat(rnd(5, 150))
      setTransfer({ chain, sym:chain==='BTC'?'BTC':chain==='SOL'?'SOL':'USDT',
        val, from:addr(), to:addr(),
        label:labels[Math.floor(Math.random()*labels.length)], new:true })
      setHistory(p => [...p.slice(1), val])
      setTimeout(() => setTransfer(t => ({ ...t, new: false })), 700)
    }, 3000)
    return () => clearInterval(id)
  }, [])

  const col = CHAIN_COLOR[transfer.chain] || '#f59e0b'

  return (
    <div className="bm-whale">
      <div className="bm-whale-spark">
        <Sparkline data={history} color={col} height={24} />
      </div>
      <div className={`bm-whale-card ${transfer.new ? 'new' : ''}`} style={{ '--wc': col }}>
        <div className="bm-whale-chain">
          <span className="bm-whale-icon" style={{ color: col }}>{CHAINS[transfer.chain] || '◈'}</span>
          <span className="bm-whale-chain-name">{transfer.chain}</span>
          <span className="bm-whale-confirmed"><span className="bm-pulse-dot green" />ON-CHAIN</span>
        </div>
        <div className="bm-whale-amount" style={{ color: col }}>${transfer.val.toFixed(1)}M</div>
        <div className="bm-whale-flow">
          <div className="bm-whale-addr-box">
            <div className="bm-whale-addr-lbl">FROM</div>
            <div className="bm-whale-addr">{transfer.from}</div>
          </div>
          <div className="bm-whale-arrow">
            <svg width="32" height="12" viewBox="0 0 32 12"><path d="M0 6h26M22 2l6 4-6 4" stroke={col} strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
          </div>
          <div className="bm-whale-addr-box right">
            <div className="bm-whale-addr-lbl">TO</div>
            <div className="bm-whale-addr">{transfer.to}</div>
            <div className="bm-whale-label" style={{ color: col }}>{transfer.label}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FundMini() {
  const [rates, setRates] = useState([
    { sym:'BTC', bnb:0.0082, okx:0.0091, byb:0.0076, hist:[0.006,0.007,0.008,0.0082] },
    { sym:'ETH', bnb:0.0071, okx:0.0065, byb:0.0079, hist:[0.005,0.006,0.007,0.0071] },
    { sym:'SOL', bnb:-0.003, okx:-0.002, byb:-0.004, hist:[-0.001,-0.002,-0.003,-0.003] },
    { sym:'HYPE',bnb:0.0120, okx:0.0118, byb:0.0125, hist:[0.008,0.010,0.011,0.012] },
  ])
  useEffect(() => {
    const id = setInterval(() => setRates(prev => prev.map(r => {
      const delta = (Math.random() - 0.49) * 0.002
      const nb = parseFloat((r.bnb + delta).toFixed(4))
      return { ...r, bnb: nb, okx: parseFloat((r.okx + delta*0.9).toFixed(4)), byb: parseFloat((r.byb + delta*1.1).toFixed(4)), hist: [...r.hist.slice(1), nb] }
    })), 2000)
    return () => clearInterval(id)
  }, [])

  const maxAbs = Math.max(...rates.map(r => Math.abs(r.bnb)), 0.015)

  return (
    <div className="bm-fund">
      <div className="bm-fund-header">
        <span className="bm-fund-exlbl">SYM</span>
        <span className="bm-fund-exlbl">BNB</span>
        <span className="bm-fund-exlbl">OKX</span>
        <span className="bm-fund-exlbl">BYBIT</span>
        <span className="bm-fund-exlbl">TREND</span>
      </div>
      {rates.map(r => {
        const pos = r.bnb >= 0
        return (
          <div key={r.sym} className="bm-fund-row">
            <span className="bm-fund-sym">{r.sym}</span>
            <span className={`bm-fund-rate ${pos?'pos':'neg'}`}>{r.bnb>=0?'+':''}{(r.bnb*100).toFixed(3)}%</span>
            <span className={`bm-fund-rate sm ${r.okx>=0?'pos':'neg'}`}>{r.okx>=0?'+':''}{(r.okx*100).toFixed(3)}%</span>
            <span className={`bm-fund-rate sm ${r.byb>=0?'pos':'neg'}`}>{r.byb>=0?'+':''}{(r.byb*100).toFixed(3)}%</span>
            <div className="bm-fund-spark">
              <Sparkline data={r.hist} color={pos?'#00e87a':'#ff4d6a'} height={18} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SmartMini() {
  const [traders, setTraders] = useState([
    { id:1, addr:'0x7f2a...c891', sym:'HYPE', side:'LONG',  lev:10, pnl:84200, size:2.4 },
    { id:2, addr:'0x3e9b...12fa', sym:'BTC',  side:'SHORT', lev:5,  pnl:31500, size:1.1 },
    { id:3, addr:'0xaa19...e73b', sym:'SOL',  side:'LONG',  lev:8,  pnl:12300, size:0.7 },
  ])
  const [totalPnl, setTotalPnl] = useState(128000)

  useEffect(() => {
    const id = setInterval(() => {
      setTraders(prev => prev.map(t => ({
        ...t,
        pnl: Math.max(0, t.pnl + (Math.random() - 0.38) * 500)
      })))
      setTotalPnl(p => Math.max(0, p + (Math.random() - 0.38) * 800))
    }, 1500)
    return () => clearInterval(id)
  }, [])

  const fmt = (n) => n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${n.toFixed(0)}`

  return (
    <div className="bm-smart">
      <div className="bm-smart-header">
        <div className="bm-smart-total">
          <div className="bm-smart-total-lbl">TOP TRADERS TODAY</div>
          <div className="bm-smart-total-pnl">{fmt(totalPnl)} <span className="bm-smart-total-tag">realized PnL</span></div>
        </div>
      </div>
      <div className="bm-smart-list">
        {traders.map((t, i) => (
          <div key={t.id} className="bm-smart-row">
            <div className="bm-smart-rank">#{i+1}</div>
            <div className="bm-smart-info">
              <span className="bm-smart-addr">{t.addr}</span>
              <div className="bm-smart-tags">
                <span className={`bm-smart-side ${t.side==='LONG'?'long':'short'}`}>{t.side}</span>
                <span className="bm-smart-sym">{t.sym}</span>
                <span className="bm-smart-lev">{t.lev}x</span>
              </div>
            </div>
            <div className="bm-smart-right">
              <div className="bm-smart-pnl">{fmt(t.pnl)}</div>
              <div className="bm-smart-bar-wrap">
                <div className="bm-smart-bar" style={{ width:`${Math.min(t.size/3*100,100)}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LSMini() {
  const [data, setData] = useState({
    btc: 58.4, eth: 52.1, sol: 61.3
  })
  const [hist, setHist] = useState([54,56,55,58,57,59,58,60,58,59,61,58])

  useEffect(() => {
    const id = setInterval(() => {
      setData(d => ({
        btc: Math.max(30, Math.min(70, d.btc + (Math.random()-0.47)*1.2)),
        eth: Math.max(30, Math.min(70, d.eth + (Math.random()-0.50)*1.0)),
        sol: Math.max(30, Math.min(70, d.sol + (Math.random()-0.45)*1.4)),
      }))
      setHist(p => [...p.slice(1), parseFloat(rnd(45,65))])
    }, 1600)
    return () => clearInterval(id)
  }, [])

  const pairs = [
    { sym:'BTC', long: data.btc },
    { sym:'ETH', long: data.eth },
    { sym:'SOL', long: data.sol },
  ]
  const mainLong = data.btc.toFixed(1)
  const mainShort = (100 - data.btc).toFixed(1)
  const signal = data.btc > 55 ? 'bull' : data.btc < 45 ? 'bear' : 'neutral'

  return (
    <div className="bm-ls">
      <div className="bm-ls-spark">
        <Sparkline data={hist} color="#00e87a" height={24} />
      </div>
      <div className="bm-ls-main">
        <div className="bm-ls-bar-outer">
          <div className="bm-ls-long-fill" style={{ width:`${mainLong}%` }}>
            <span className="bm-ls-bar-lbl">{mainLong}%</span>
          </div>
          <div className="bm-ls-short-fill" style={{ width:`${mainShort}%` }}>
            <span className="bm-ls-bar-lbl right">{mainShort}%</span>
          </div>
        </div>
        <div className="bm-ls-bar-labels">
          <span className="bm-ls-ll">▲ LONG</span>
          <span className="bm-ls-sl">SHORT ▼</span>
        </div>
      </div>
      <div className="bm-ls-pairs">
        {pairs.map(p => (
          <div key={p.sym} className="bm-ls-pair-row">
            <span className="bm-ls-pair-sym">{p.sym}</span>
            <div className="bm-ls-mini-bar-wrap">
              <div className="bm-ls-mini-long" style={{ width:`${p.long}%` }} />
              <div className="bm-ls-mini-short" style={{ width:`${(100-p.long)}%` }} />
            </div>
            <span className={`bm-ls-pair-pct ${p.long>55?'bull':p.long<45?'bear':'neut'}`}>{p.long.toFixed(0)}%L</span>
          </div>
        ))}
      </div>
      <div className={`bm-ls-signal ${signal}`}>
        {signal==='bull'?'🟢 LONG HEAVY':signal==='bear'?'🔴 SHORT HEAVY':'⚪ NEUTRAL'}
      </div>
    </div>
  )
}

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
    liq: <LiqMini />, whale: <WhaleMini />, fund: <FundMini />,
    smart: <SmartMini />, ls: <LSMini />,
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
    <div ref={pageRef} className="ld3-page" onMouseMove={onMove}>
      {/* Background */}
      <div className="ld3-bg-grid" />
      <div className="ld3-bg-orb ld3-orb-1" />
      <div className="ld3-bg-orb ld3-orb-2" />
      <div className="ld3-bg-orb ld3-orb-3" />
      <div className="ld3-spotlight" />

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
          <div className="ld3-term-shell">
            <div className="ld3-term-glow" />
            <TerminalPreview />
          </div>
        </div>
      </section>

      {/* ── Marquee ── */}
      <div className="ld3-mq-section">
        <Marquee items={MARQUEE_ITEMS} />
      </div>

      {/* ── Feature Showcase ── */}
      <section id="features" className="ld3-section fl-section">
        <div className="ld3-inner">
          <div className="ld3-section-hd">
            <div className="tc2-hd-tag">LIVE PREVIEW</div>
            <h2 className="ld3-h2">{t('tools_title')}</h2>
            <p className="ld3-hsub">{t('tools_sub')}</p>
          </div>
          <FeatureShowcase />
        </div>
      </section>

      {/* ── All tools ── */}
      <section className="ld3-section ld3-section-alt tc2-section">
        <div className="ld3-inner">
          <div className="ld3-section-hd">
            <div className="tc2-hd-tag">ALL TOOLS</div>
            <h2 className="ld3-h2">13 tools. <span className="tc2-title-em">One terminal.</span></h2>
            <p className="ld3-hsub">No switching tabs. No missed signals. Everything in one place.</p>
          </div>
          <div className="tc2-grid">
            {TOOLS.map((tool, i) => (
              <TiltCard
                key={tool.id}
                className="tc2-card"
                style={{
                  '--tc-color': tool.color,
                  '--tc-dim': tool.dim,
                  animationDelay: `${i * 55}ms`,
                }}
              >
                {/* accent top bar */}
                <div className="tc2-accent-bar" />
                {/* index number */}
                <span className="tc2-idx">{String(i + 1).padStart(2, '0')}</span>
                {/* icon */}
                <div className="tc2-icon-wrap">
                  <ToolIcon id={tool.id} color={tool.color} />
                </div>
                {/* tag + pro row */}
                <div className="tc2-meta-row">
                  <span className="tc2-tag">{tool.tag}</span>
                  {tool.pro && (
                    <span className="tc2-pro">
                      <span className="tc2-pro-shine" />
                      PRO
                    </span>
                  )}
                </div>
                {/* name */}
                <div className="tc2-name">{t(`label_${tool.id}`)}</div>
                {/* desc */}
                <div className="tc2-desc">{t(`desc_${tool.id}`)}</div>
                {/* hover glow */}
                <div className="tc2-glow" />
              </TiltCard>
            ))}
          </div>
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
            <TiltCard className="ld3-pcard">
              <div className="ld3-pcard-tier">{t('free_tier')}</div>
              <div className="ld3-pcard-price">$0 <span>/ {t('free_period')}</span></div>
              <p className="ld3-pcard-desc">{t('free_desc')}</p>
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
