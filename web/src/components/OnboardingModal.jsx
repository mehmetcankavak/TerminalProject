import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'

export const ONBOARDING_KEY = 'tt_onboarding_v1'

// ── Icons (Tabler outline) ──────────────────────────────────────────────────
function IcoTrendingUp() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
}
function IcoBitcoin() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042-.347 1.97m1.563-8.864c4.924.869 6.14-6.025 1.215-6.893m-1.215 6.893-3.94-.694m5.155-6.2L8.29 4.26m5.908 1.042.348-1.97M7.48 20.364l3.126-17.727"/></svg>
}
function IcoTerminal() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
}
function IcoWallet() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><circle cx="17" cy="15" r="1" fill="currentColor"/></svg>
}
function IcoGrid() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>
}
function IcoLock() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
}
function IcoCheck() {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
}

// ── Screen 1: Identity ─────────────────────────────────────────────────────
function Screen1() {
  return (
    <div className="ob-screen ob-s1">
      <div className="ob-preview-panel">
        <div className="ob-preview-header">
          <span className="ob-preview-tag" style={{ color: '#e2484a' }}>◉ LIQUIDATION STREAM</span>
          <span className="ob-preview-live">LIVE</span>
        </div>
        <div className="ob-preview-row">
          <span className="ob-pr-badge ob-pr-long">LONG</span>
          <span className="ob-pr-coin">BTC</span>
          <span className="ob-pr-val" style={{ color: '#e2484a' }}>$4.2M</span>
          <span className="ob-pr-venue">Binance</span>
          <span className="ob-pr-time">14:32:07</span>
        </div>
        <div className="ob-preview-row">
          <span className="ob-pr-badge ob-pr-short">SHORT</span>
          <span className="ob-pr-coin">ETH</span>
          <span className="ob-pr-val" style={{ color: '#00d992' }}>$880K</span>
          <span className="ob-pr-venue">OKX</span>
          <span className="ob-pr-time">14:31:52</span>
        </div>
        <div className="ob-preview-row ob-preview-dim">
          <span className="ob-pr-badge ob-pr-long">LONG</span>
          <span className="ob-pr-coin">SOL</span>
          <span className="ob-pr-val" style={{ color: '#e2484a' }}>$210K</span>
          <span className="ob-pr-venue">Bybit</span>
          <span className="ob-pr-time">14:31:44</span>
        </div>
        <div className="ob-preview-sep" />
        <div className="ob-preview-header">
          <span className="ob-preview-tag" style={{ color: '#f59e0b' }}>◉ WHALE TRANSFERS</span>
          <span className="ob-preview-live">LIVE</span>
        </div>
        <div className="ob-preview-row">
          <span className="ob-pr-whale" style={{ color: '#f59e0b' }}>●</span>
          <span className="ob-pr-coin">USDT</span>
          <span className="ob-pr-val" style={{ color: '#f59e0b' }}>$12.4M</span>
          <span className="ob-pr-arrow">→</span>
          <span className="ob-pr-venue">Binance</span>
          <span className="ob-pr-time">3m</span>
        </div>
        <div className="ob-preview-row ob-preview-dim">
          <span className="ob-pr-whale" style={{ color: '#f59e0b' }}>●</span>
          <span className="ob-pr-coin">BTC</span>
          <span className="ob-pr-val" style={{ color: '#f59e0b' }}>$6.7M</span>
          <span className="ob-pr-arrow">→</span>
          <span className="ob-pr-venue">Unknown</span>
          <span className="ob-pr-time">11m</span>
        </div>
      </div>

      <div className="ob-identity-copy">
        <h1 className="ob-identity-h1">
          Professional<br />Trading Intelligence.<br />
          <span className="ob-identity-accent">On your phone.</span>
        </h1>
        <p className="ob-identity-sub">
          Smart Money signals, whale flows, liquidation data, funding rates — unified in one terminal.
        </p>
      </div>
    </div>
  )
}

// ── Screen 2: Signal Stack ─────────────────────────────────────────────────
const SIGNAL_CARDS = [
  {
    accent: '#f59e0b',
    label: 'ON-CHAIN FLOW',
    rows: ['$12.4M USDT → Binance · 3m ago', '$6.7M BTC → Unknown · 11m ago'],
  },
  {
    accent: '#e2484a',
    label: 'LIQUIDATION FEED',
    rows: ['LONG  BTC  $4.2M  Binance  14:32:07', 'LONG  ETH  $880K  OKX  14:31:52'],
  },
  {
    accent: '#3b82f6',
    label: 'FUNDING MONITOR',
    rows: ['BTC/USDT  +0.0112%  4h  ↑', 'ETH/USDT  −0.0034%  4h  ↓'],
  },
  {
    accent: '#a855f7',
    label: 'SMART MONEY',
    rows: ['#3  +$847K PnL 24H  Net Long BTC', '#7  +$412K PnL 24H  Net Short ETH'],
  },
]

function Screen2() {
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setVis(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div className="ob-screen ob-s2">
      {SIGNAL_CARDS.map((card, i) => (
        <div
          key={card.label}
          className="ob-sig-card"
          style={{
            borderLeftColor: card.accent,
            opacity: vis ? 1 : 0,
            transform: vis ? 'none' : 'translateY(14px)',
            transition: `opacity .32s ease ${i * 90}ms, transform .32s ease ${i * 90}ms`,
          }}
        >
          <div className="ob-sig-label" style={{ color: card.accent }}>{card.label}</div>
          {card.rows.map((row, j) => (
            <div key={j} className="ob-sig-row">{row}</div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Screen 3: Tab Structure ────────────────────────────────────────────────
const TAB_DEFS = [
  {
    id: 'stocks',
    icon: <IcoTrendingUp />,
    label: 'Stocks',
    desc: 'Global equities, ETF flows, earnings data',
    features: ['ETF Data', 'Global Metrics'],
  },
  {
    id: 'markets',
    icon: <IcoBitcoin />,
    label: 'Crypto',
    desc: 'Markets, liquidations, funding, sentiment',
    features: ['Liquidation Stream', 'Funding Rates', 'Market Compass'],
  },
  {
    id: 'terminal',
    icon: <IcoTerminal />,
    label: 'Terminal',
    desc: 'Order entry, Smart Money, Whale Alerts',
    features: ['Smart Money', 'Whale Alerts'],
  },
  {
    id: 'wallet',
    icon: <IcoWallet />,
    label: 'Wallet',
    desc: 'Connect exchange, track portfolio, PnL',
    features: ['Open Positions', 'PnL History'],
  },
  {
    id: 'menu',
    icon: <IcoGrid />,
    label: 'More',
    desc: 'Alerts, Market Compass, On-chain data',
    features: ['Price Alerts', 'Big Transfers'],
  },
]

const ALL_FEATURES = [
  { label: 'Liquidation Stream', accent: '#e2484a' },
  { label: 'Whale Transfers',    accent: '#f59e0b' },
  { label: 'Funding Rates',      accent: '#3b82f6' },
  { label: 'Smart Money',        accent: '#a855f7' },
  { label: 'Market Compass',     accent: '#00d992' },
  { label: 'Price Alerts',       accent: '#00d992' },
  { label: 'Big Transfers',      accent: '#f59e0b' },
  { label: 'ETF Data',           accent: '#3b82f6' },
  { label: 'Volume Monitor',     accent: '#6b7280' },
  { label: 'Global Metrics',     accent: '#6b7280' },
]

function Screen3() {
  const [active, setActive] = useState('markets')
  const info = TAB_DEFS.find(t => t.id === active)

  return (
    <div className="ob-screen ob-s3">
      <div className="ob-tabs-preview">
        {TAB_DEFS.map(tab => (
          <button
            key={tab.id}
            className={`ob-tp-btn${active === tab.id ? ' ob-tp-active' : ''}`}
            onClick={() => setActive(tab.id)}
          >
            <span className="ob-tp-icon">{tab.icon}</span>
            <span className="ob-tp-label">{tab.label}</span>
          </button>
        ))}
      </div>

      {info && (
        <div className="ob-tab-ann" key={active}>
          <div className="ob-tab-ann-inside">Inside this tab:</div>
          <div className="ob-tab-ann-desc">{info.desc}</div>
          <div className="ob-tab-ann-feats">
            {info.features.map(f => (
              <span key={f} className="ob-tab-ann-feat"><IcoCheck />{f}</span>
            ))}
          </div>
        </div>
      )}

      <div className="ob-feat-grid">
        <div className="ob-feat-grid-label">15+ tools across all surfaces</div>
        <div className="ob-feat-grid-chips">
          {ALL_FEATURES.map(f => (
            <span
              key={f.label}
              className="ob-feat-chip"
              style={{ color: f.accent, borderColor: `${f.accent}30` }}
            >
              {f.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Screen 4: Exchange Connection ──────────────────────────────────────────
function Screen4({ choice, setChoice }) {
  return (
    <div className="ob-screen ob-s4">
      <div className="ob-choices">
        {/* Card B — Explore First (default) */}
        <button
          className={`ob-choice${choice === 'explore' ? ' ob-choice-on' : ''}`}
          onClick={() => setChoice('explore')}
        >
          <div className="ob-choice-top">
            <span className="ob-choice-tag" style={{ color: '#3b82f6' }}>MARKET INTELLIGENCE</span>
            {choice === 'explore' && <span className="ob-choice-chk"><IcoCheck /></span>}
          </div>
          <div className="ob-choice-name">Explore First</div>
          <p className="ob-choice-body">Full access to signals, flows, and analytics. Exchange features unlocked later.</p>
          <div className="ob-choice-note">Add exchange anytime from Settings.</div>
        </button>

        {/* Card A — Connect Exchange */}
        <button
          className={`ob-choice${choice === 'connect' ? ' ob-choice-on ob-choice-green' : ''}`}
          onClick={() => setChoice('connect')}
        >
          <div className="ob-choice-top">
            <span className="ob-choice-tag" style={{ color: '#00d992' }}>LIVE TRADING</span>
            {choice === 'connect' && <span className="ob-choice-chk"><IcoCheck /></span>}
          </div>
          <div className="ob-choice-name">Connect Exchange</div>
          <p className="ob-choice-body">Real-time positions, orders, and PnL tracking.</p>
          <div className="ob-choice-note">Read-only key is sufficient for portfolio view.</div>
        </button>
      </div>

      {choice === 'connect' && (
        <div className="ob-exchange-drop">
          <div className="ob-exchange-drop-label">Select your exchange:</div>
          <div className="ob-exchange-opts">
            <div className="ob-exchange-opt">
              <span className="ob-exchange-opt-name">HyperLiquid</span>
              <span className="ob-exchange-opt-tag" style={{ color: '#00d992' }}>DEX</span>
            </div>
            <div className="ob-exchange-opt">
              <span className="ob-exchange-opt-name">Binance</span>
              <span className="ob-exchange-opt-tag" style={{ color: '#f59e0b' }}>CEX</span>
            </div>
          </div>
          <div className="ob-exchange-sec">
            <IcoLock />
            <span>Keys stored encrypted. We never request withdrawal permissions.</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Screen 5: Activation ───────────────────────────────────────────────────
function Screen5({ isConnect }) {
  return (
    <div className="ob-screen ob-s5">
      <div className="ob-act-logo">[ TT ]</div>
      <h2 className="ob-act-h2">
        {isConnect
          ? <>You're in.<br />Your exchange is connected.</>
          : <>You're in.<br />Start with the signals.</>}
      </h2>
      <p className="ob-act-sub">
        {isConnect
          ? 'Portfolio sync takes ~30 seconds. Head to Wallet to see your positions.'
          : 'Liquidation stream, whale flows, and funding rates are live. No setup needed.'}
      </p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function OnboardingModal() {
  const { user } = useAuth()
  const [done, setDone] = useState(() => localStorage.getItem(ONBOARDING_KEY) === '1')
  const [step, setStep] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const [choice, setChoice] = useState('explore')

  if (done) return null

  const TOTAL = 5
  const isLast = step === TOTAL - 1

  const dismiss = (dest) => {
    localStorage.setItem(ONBOARDING_KEY, '1')
    setLeaving(true)
    setTimeout(() => {
      setDone(true)
      if (dest) window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page: dest } }))
    }, 220)
  }

  const skip   = () => dismiss('markets')
  const finish = () => dismiss(choice === 'connect' ? 'wallet' : 'markets')
  const next   = () => step < TOTAL - 1 ? setStep(s => s + 1) : finish()
  const back   = () => step > 0 && setStep(s => s - 1)

  const CTAS = [
    'Get Started',
    'See the full picture →',
    'Got it, continue →',
    choice === 'connect' ? 'Connect Exchange →' : 'Start Exploring →',
    choice === 'connect' ? 'View My Portfolio' : 'Open Crypto Feed',
  ]

  const HEADLINES = {
    1: 'Every signal. One place.',
    2: 'Five surfaces. Zero fluff.',
    3: "Connect your exchange.\nOr don't — yet.",
  }

  const SUBTITLES = {
    1: 'From on-chain whale flows to exchange liquidations — structured, live, actionable.',
    2: "Everything is one tab away. Here's where to find it.",
    3: 'Live portfolio, PnL tracking, and order execution require an API key. Everything else works immediately.',
  }

  return createPortal(
    <div className={`ob-overlay${leaving ? ' ob-leaving' : ''}`} role="dialog" aria-modal="true">
      <div className="ob-modal">

        {/* Top bar */}
        <div className="ob-topbar">
          <span className="ob-logo">[ TT ]</span>
          {!isLast && <button className="ob-skip" onClick={skip}>Skip intro</button>}
        </div>

        {/* Progress dots — steps 0–3 */}
        {!isLast && (
          <div className="ob-dots">
            {Array.from({ length: TOTAL - 1 }, (_, i) => (
              <span
                key={i}
                className={`ob-dot${i === step ? ' ob-dot-active' : i < step ? ' ob-dot-done' : ''}`}
              />
            ))}
            <span className="ob-step-counter">{step + 1} / {TOTAL - 1}</span>
          </div>
        )}

        {/* Section headline (steps 1–3; step 0 has own headline inside Screen1) */}
        {step > 0 && !isLast && HEADLINES[step] && (
          <div className="ob-header-block">
            <h2 className="ob-title" style={{ whiteSpace: 'pre-line' }}>{HEADLINES[step]}</h2>
            {SUBTITLES[step] && <p className="ob-subtitle">{SUBTITLES[step]}</p>}
          </div>
        )}

        {/* Content — key forces remount on each step → entrance animation */}
        <div className="ob-content" key={step}>
          {step === 0 && <Screen1 />}
          {step === 1 && <Screen2 />}
          {step === 2 && <Screen3 />}
          {step === 3 && <Screen4 choice={choice} setChoice={setChoice} />}
          {step === 4 && <Screen5 isConnect={choice === 'connect'} />}
        </div>

        {/* Footer */}
        <div className={`ob-footer${isLast ? ' ob-footer-act' : ''}`}>
          {isLast ? (
            <>
              <button className="ob-btn ob-btn-primary" onClick={finish}>{CTAS[step]}</button>
              <button className="ob-btn-link" onClick={() => dismiss('markets')}>Go to home screen</button>
            </>
          ) : (
            <>
              {step > 0
                ? <button className="ob-btn ob-btn-ghost" onClick={back}>← Back</button>
                : <div />
              }
              <button className="ob-btn ob-btn-primary" onClick={next}>{CTAS[step]}</button>
            </>
          )}
        </div>

      </div>
    </div>,
    document.body
  )
}
