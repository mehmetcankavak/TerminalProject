import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import ParticleText from '../components/ParticleText'
import FeatureShowcase from '../components/FeatureShowcase'

const TOOLS = [
  { id: 'liquidations-stream', tag: 'LIQ',   pro: true  },
  { id: 'funding-rate',        tag: 'FUND',  pro: true  },
  { id: 'long-short-ratio',    tag: 'L/S',   pro: true  },
  { id: 'volume-monitor',      tag: 'VOL',   pro: true  },
  { id: 'big-transfers',       tag: 'WHALE', pro: true  },
  { id: 'token-unlock',        tag: 'VEST',  pro: true  },
  { id: 'custom-alerts',       tag: 'ALT',   pro: true  },
  { id: 'portfolio',           tag: 'PF',    pro: true  },
  { id: 'smart-money',         tag: 'SM',    pro: true  },
  { id: 'global-metrics',      tag: 'MKT',   pro: false },
  { id: 'economic-calendar',   tag: 'CAL',   pro: false },
  { id: 'spot-markets',        tag: 'SPOT',  pro: false },
  { id: 'terminal',            tag: 'TERM',  pro: true  },
]

// ─── Animated Terminal Preview ────────────────────────────────────────────────
function rnd(min, max, dec = 1) { return (min + Math.random() * (max - min)).toFixed(dec) }

const LINES_TEMPLATE = [
  { label: '[SYS]',    cls: '',          text: () => 'WebSocket connected — Binance · OKX · Bybit' },
  { label: '[LIQ]',    cls: 'tp-accent', text: () => `1h Long: $${rnd(95, 180)}M  Short: $${rnd(60, 120)}M` },
  { label: '[FUND]',   cls: 'tp-accent', text: () => `BTC Binance: +0.${rnd(60, 99, 0)}%  OKX: +0.${rnd(70, 99, 0)}%` },
  { label: '[WHALE]',  cls: 'tp-warn',   text: () => `BTC/USDT — $${rnd(1.2, 8.5)}M ${Math.random() > 0.5 ? 'SELL' : 'BUY'} — ${['Binance Perp', 'OKX Spot', 'Bybit Perp'][Math.floor(Math.random() * 3)]}` },
  { label: '[ALARM]',  cls: 'tp-warn',   text: () => `ETH/USDT target reached → $${rnd(2800, 4200, 0)}` },
  { label: '[L/S]',    cls: '',           text: () => { const l = rnd(48, 62, 1); return `BTC Long: ${l}%  Short: ${(100 - l).toFixed(1)}%  → ${l > 55 ? 'LONG HEAVY' : l < 45 ? 'SHORT HEAVY' : 'NEUTRAL'}` } },
  { label: '[SMART]',  cls: 'tp-accent',   text: () => { const addr = '0x' + Math.random().toString(16).slice(2,8) + '…' + Math.random().toString(16).slice(2,6); const coin = ['ETH','BTC','SOL','HYPE','ARB'][Math.floor(Math.random()*5)]; const side = Math.random() > 0.4 ? 'LONG' : 'SHORT'; return `HyperLiquid whale ${addr} opened ${coin} ${side} $${rnd(200, 900, 0)}K · ${rnd(2, 20, 0)}x lev` } },
  { label: '[UNLOCK]', cls: 'tp-dim',     text: () => `${['SUI','ARB','OP','JUP','PYTH'][Math.floor(Math.random()*5)]} — ${rnd(20, 200, 0)}M tokens — ${['Apr','May','Jun','Jul'][Math.floor(Math.random()*4)]} ${Math.floor(Math.random()*28+1)} — $${rnd(40, 350, 0)}M value` },
]

function TerminalPreview({ title }) {
  const [visibleCount, setVisibleCount] = useState(0)
  const [lines, setLines] = useState(() => LINES_TEMPLATE.map(l => ({ ...l, rendered: l.text() })))
  const cycleRef = useRef(0)

  // Satırları sırayla göster (typing effect)
  useEffect(() => {
    if (visibleCount >= LINES_TEMPLATE.length) return
    const timer = setTimeout(() => setVisibleCount(c => c + 1), 400 + Math.random() * 200)
    return () => clearTimeout(timer)
  }, [visibleCount])

  // Her 4 saniyede rastgele 2-3 satırın rakamlarını güncelle
  useEffect(() => {
    if (visibleCount < LINES_TEMPLATE.length) return
    const interval = setInterval(() => {
      cycleRef.current++
      setLines(prev => {
        const next = [...prev]
        const indices = new Set()
        while (indices.size < 2 + Math.floor(Math.random() * 2)) {
          indices.add(1 + Math.floor(Math.random() * (LINES_TEMPLATE.length - 1)))
        }
        indices.forEach(i => { next[i] = { ...next[i], rendered: LINES_TEMPLATE[i].text() } })
        return next
      })
    }, 4000)
    return () => clearInterval(interval)
  }, [visibleCount])

  return (
    <div className="hero-terminal-preview">
      <div className="terminal-preview-bar">
        <span className="tp-dot tp-red" /><span className="tp-dot tp-yellow" /><span className="tp-dot tp-green" />
        <span className="tp-title">{title}</span>
      </div>
      <div className="terminal-preview-body">
        {lines.map((l, i) => (
          <div key={i} className={`tp-line ${l.cls} ${i < visibleCount ? 'tp-line-visible' : 'tp-line-hidden'}`}>
            <span className="tp-label">{l.label}</span> {l.rendered}
          </div>
        ))}
        <div className={`tp-cursor ${visibleCount >= LINES_TEMPLATE.length ? 'tp-cursor-blink' : ''}`}>_</div>
      </div>
    </div>
  )
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`faq-item ${open ? 'faq-item-open' : ''}`} onClick={() => setOpen(!open)}>
      <div className="faq-question">
        <span>{q}</span>
        <span className="faq-chevron">{open ? '−' : '+'}</span>
      </div>
      {open && <div className="faq-answer">{a}</div>}
    </div>
  )
}

export default function LandingPage() {
  const { user, token, plan } = useAuth()
  const { t, lang, toggleLang } = useLang()
  const navigate = useNavigate()
  const isPro = plan === 'pro'
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [billingYearly, setBillingYearly] = useState(true)

  const FREE_FEATURES = Array.from({ length: 6 },  (_, i) => t(`free_feat_${i}`))
  const PRO_FEATURES  = Array.from({ length: 11 }, (_, i) => t(`pro_feat_${i}`))

  const handleGetPro = async () => {
    if (!token) { navigate('/register?plan=pro'); return }
    setCheckoutLoading(true)
    try {
      sessionStorage.setItem('tt_start_page', 'upgrade')
      navigate('/app#upgrade')
    } finally {
      setCheckoutLoading(false)
    }
  }

  return (
    <div className="landing-page">
      <div className="landing-grid-bg" />

      {/* ── Nav ── */}
      <nav className="landing-nav landing-nav-full">
        <div className="landing-nav-inner">
          <Link to="/" className="landing-logo">
            <span className="logo-bracket">[</span>TT<span className="logo-bracket">]</span>
            <span className="logo-label">TRADING TERMINAL</span>
          </Link>
          <div className="landing-nav-links">
            <a href="#tools"   className="nav-link">{t('nav_tools')}</a>
            <a href="#pricing" className="nav-link">{t('nav_pricing')}</a>
            <a href="#faq"     className="nav-link">FAQ</a>
          </div>
          <div className="landing-nav-actions">
            <button className="lang-toggle" onClick={toggleLang}>
              {lang === 'en' ? 'TR' : 'EN'}
            </button>
            {user ? (
              <button className="btn-primary" onClick={() => {
                if (isPro) sessionStorage.setItem('tt_start_page', 'terminal')
                navigate('/app')
              }}>
                {isPro ? t('nav_open_terminal') : t('nav_go_dashboard')}
              </button>
            ) : (
              <>
                <Link to="/login" className="nav-link">{t('nav_signin')}</Link>
                <button className="btn-primary" onClick={() => navigate('/register')}>{t('nav_start_free')}</button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Trust Bar ── */}
      <div className="trust-bar">
        <div className="trust-bar-inner">
          <div className="trust-item">
            <span className="trust-dot" />
            {t('trust_traders')}
          </div>
          <div className="trust-sep" />
          <div className="trust-item">
            <span className="trust-dot" />
            {t('trust_uptime')}
          </div>
          <div className="trust-sep" />
          <div className="trust-item">
            <span className="trust-dot" />
            {t('trust_latency')}
          </div>
          <div className="trust-sep" />
          <div className="trust-item">
            <span className="trust-dot" />
            {t('trust_exchanges')}
          </div>
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div className="hero-eyebrow">
            <span className="hero-pulse" />
            {t('hero_eyebrow')}
          </div>
          <h1 className="hero-headline">
            {t('hero_line1')}<br />
            <span className="hero-accent">{t('hero_accent')}</span>
          </h1>
          <p className="hero-sub">{t('hero_sub')}</p>
          <div className="hero-cta-row">
            <button className="btn-primary btn-lg" onClick={() => {
              if (!user) { navigate('/register'); return }
              if (isPro) sessionStorage.setItem('tt_start_page', 'terminal')
              navigate('/app')
            }}>
              {!user ? t('hero_start_free') : isPro ? t('hero_open') : t('hero_go_dashboard')}
            </button>
            <button className="btn-ghost btn-lg" onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}>
              {t('hero_see_pricing')}
            </button>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-value">4</div>
              <div className="hero-stat-label">{t('hero_stat_exchange')}</div>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat">
              <div className="hero-stat-value">13+</div>
              <div className="hero-stat-label">{t('hero_stat_tools')}</div>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat">
              <div className="hero-stat-value">&lt;50ms</div>
              <div className="hero-stat-label">{t('hero_stat_latency')}</div>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat">
              <div className="hero-stat-value">24/7</div>
              <div className="hero-stat-label">{t('hero_stat_live')}</div>
            </div>
          </div>
        </div>

        {/* Terminal preview — animated */}
        <TerminalPreview title={t('hero_terminal_title')} />
      </section>

      {/* ── Particle Text ── */}
      <section className="landing-particle">
        <ParticleText />
      </section>

      {/* ── Feature Showcase ── */}
      <FeatureShowcase />

      {/* ── Tools Grid ── */}
      <section id="tools" className="landing-tools">
        <div className="landing-section-inner">
          <div className="section-eyebrow">{t('tools_eyebrow')}</div>
          <h2 className="section-title">{t('tools_title')}</h2>
          <p className="section-sub">{t('tools_sub')}</p>

          <div className="tools-grid">
            {TOOLS.map(tool => (
              <div key={tool.id} className={`tool-card ${tool.pro ? 'tool-card-pro' : ''}`}>
                <div className="tool-card-top">
                  <span className="tool-tag">{tool.tag}</span>
                  {tool.pro && <span className="tool-pro-badge">PRO</span>}
                </div>
                <div className="tool-label">{t(`label_${tool.id}`)}</div>
                <div className="tool-desc">{t(`desc_${tool.id}`)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="landing-pricing">
        <div className="landing-section-inner">
          <div className="section-eyebrow">{t('pricing_eyebrow')}</div>
          <h2 className="section-title">{t('pricing_title')}</h2>
          <p className="section-sub">{t('pricing_sub')}</p>

          {/* Billing toggle */}
          <div className="pricing-toggle">
            <span className={`pricing-toggle-label ${!billingYearly ? 'active' : ''}`}>{t('billing_monthly')}</span>
            <button className="pricing-toggle-switch" onClick={() => setBillingYearly(v => !v)}
              aria-label="Toggle billing period">
              <span className={`pricing-toggle-knob ${billingYearly ? 'yearly' : ''}`} />
            </button>
            <span className={`pricing-toggle-label ${billingYearly ? 'active' : ''}`}>{t('billing_yearly')}</span>
            <span className="pricing-toggle-save">{t('billing_save')}</span>
          </div>

          <div className="pricing-cards">
            {/* Free */}
            <div className="pricing-card pricing-card-free">
              <div className="pricing-card-tier">{t('free_tier')}</div>
              <div className="pricing-card-price">
                <span className="price-amount">$0</span>
                <span className="price-period">{t('free_period')}</span>
              </div>
              <div className="pricing-card-desc">{t('free_desc')}</div>
              <ul className="pricing-features">
                {FREE_FEATURES.map((f, i) => (
                  <li key={i} className="pricing-feature">
                    <span className="feature-check">✓</span>{f}
                  </li>
                ))}
              </ul>
              <button className="pricing-btn pricing-btn-free" onClick={() => navigate(user ? '/app' : '/register')}>
                {user ? t('btn_open_terminal') : t('btn_start_free')}
              </button>
            </div>

            {/* Pro */}
            <div className="pricing-card pricing-card-pro">
              <div className="pricing-card-glow" />
              <div className="pricing-pro-badge">{isPro ? t('current_plan') : t('most_popular')}</div>
              <div className="pricing-card-tier pricing-tier-pro">PRO</div>
              <div className="pricing-card-price">
                <span className="price-amount price-amount-pro">{billingYearly ? '$39' : '$49'}</span>
                <span className="price-period">/ mo</span>
              </div>
              {billingYearly && (
                <div className="pricing-billed-note">{t('billed_yearly')}</div>
              )}
              <div className="pricing-card-desc">{t('pro_desc')}</div>
              <ul className="pricing-features">
                {PRO_FEATURES.map((f, i) => (
                  <li key={i} className="pricing-feature pricing-feature-pro">
                    <span className="feature-check feature-check-pro">→</span>{f}
                  </li>
                ))}
              </ul>
              <button
                className={`pricing-btn pricing-btn-pro ${checkoutLoading ? 'pricing-btn-loading' : ''} ${isPro ? 'pricing-btn-current' : ''}`}
                onClick={isPro ? () => navigate('/app') : handleGetPro}
                disabled={checkoutLoading}
              >
                {checkoutLoading ? <span className="auth-spinner" /> : isPro ? t('open_dashboard') : t('upgrade_cta')}
              </button>
              <div className="pricing-card-note">{t('cancel_note')}</div>
              <div className="pricing-money-back">
                <span className="money-back-icon">✓</span>
                {t('money_back')}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="landing-faq">
        <div className="landing-section-inner">
          <h2 className="section-title">{t('faq_title')}</h2>
          <p className="section-sub">{t('faq_sub')}</p>
          <div className="faq-list">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <FaqItem key={n} q={t(`faq_q${n}`)} a={t(`faq_a${n}`)} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="footer-top">
            <div className="footer-logo"><span className="logo-bracket">[</span>TT<span className="logo-bracket">]</span></div>
            <div className="footer-cols">
              <div className="footer-col">
                <div className="footer-col-title">Platform</div>
                <a href="#tools"   className="footer-link">{t('footer_tools')}</a>
                <a href="#pricing" className="footer-link">{t('footer_pricing')}</a>
                <a href="#faq"     className="footer-link">FAQ</a>
              </div>
              <div className="footer-col">
                <div className="footer-col-title">Account</div>
                <Link to="/login"    className="footer-link">{t('footer_signin')}</Link>
                <Link to="/register" className="footer-link">{t('footer_register')}</Link>
              </div>
              <div className="footer-col">
                <div className="footer-col-title">Legal</div>
                <Link to="/privacy" className="footer-link">Privacy Policy</Link>
                <Link to="/terms"   className="footer-link">Terms of Service</Link>
              </div>
              <div className="footer-col">
                <div className="footer-col-title">Support</div>
                <a href="mailto:support@tradingtools.app" className="footer-link">support@tradingtools.app</a>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <div className="footer-copy">{t('footer_copy')}</div>
            <div className="footer-legal-links">
              <Link to="/privacy" className="footer-link">Privacy</Link>
              <span className="footer-dot">·</span>
              <Link to="/terms"   className="footer-link">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
