// MobilePaywall — Apple HIG uyumlu, native-feel subscription paywall.
// IAP entegrasyonu hazır olduğunda `handleSubscribe` içindeki fallback
// `window.open(webCheckoutUrl)` yerine `IAP.purchase(productId)` çağrılacak.
import { useState, useEffect, useCallback } from 'react'
import { registerPlugin } from '@capacitor/core'
import { useAuth } from '../context/AuthContext'
import { haptic, isNative } from '../capacitor'
import { API_BASE } from '../config'
import LogoTT from '../components/LogoTT'

// Native StoreKit 2 bridge — implemented in mobile/ios/App/App/IAPPlugin.swift
const IAP = registerPlugin('IAP')

const IAP_PRODUCTS = {
  monthly: 'app.tradingtools.terminal.pro.monthly',
  yearly:  'app.tradingtools.terminal.pro.yearly',
}

// Keep in sync with PRO_TABS + SUB_PAGES.pro in MobileApp.jsx.
const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 14 15 20 7"/>
        <polyline points="14 7 20 7 20 13"/>
      </svg>
    ),
    title: 'Trading Terminal',
    desc: 'One-tap orders on Binance & Hyperliquid',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="13" rx="2"/>
        <path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      </svg>
    ),
    title: 'Wallet integration',
    desc: 'Connect Hyperliquid + Binance accounts',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="12" x2="3" y2="20"/><line x1="9" y1="6" x2="9" y2="20"/>
        <line x1="15" y1="9" x2="15" y2="20"/><line x1="21" y1="3" x2="21" y2="20"/>
      </svg>
    ),
    title: 'Portfolio sync',
    desc: 'Live P&L across connected exchanges',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    ),
    title: 'Price Alerts',
    desc: 'Unlimited price + volume triggers',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12c-2.66-2-6-3-10-3-4.5 0-8 2-10 4 2 2 6 3 10 3s8-1.5 10-4z"/>
      </svg>
    ),
    title: 'Smart Money tracking',
    desc: 'Follow whale wallets in real time',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      </svg>
    ),
    title: 'Big Transfers',
    desc: '$1M+ on-chain whale movements',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>
      </svg>
    ),
    title: 'Funding Rate',
    desc: 'Perp funding flow across 4 exchanges',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
    title: 'Volume Monitor',
    desc: 'Abnormal volume spikes & breakouts',
  },
]

const TERMS_URL = 'https://cryptoterminal-production.up.railway.app/terms'
const PRIVACY_URL = 'https://cryptoterminal-production.up.railway.app/privacy'
// Web app uses hash routing inside /app — direct upgrade page is /app#upgrade.
const WEB_CHECKOUT_URL = 'https://cryptoterminal-production.up.railway.app/app#upgrade'

export default function MobilePaywall({ onBack }) {
  const { user, plan, token, refresh } = useAuth()
  const [billing, setBilling] = useState('yearly')   // default to popular pick
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState('')

  // Pricing — must match App Store Connect products when IAP goes live.
  // Backend fallback values mirror PLAN_PRICE_MONTHLY/YEARLY env vars.
  const prices = { monthly: 59.99, yearly: 479.99 }
  const monthlyEquivalent = (prices.yearly / 12).toFixed(2)
  const savingsPct = Math.round((1 - prices.yearly / (prices.monthly * 12)) * 100)

  // Verify a StoreKit transaction with our backend and refresh the user.
  // Backend re-validates the JWS independently before granting Pro.
  const verifyTransaction = useCallback(async (jws) => {
    const res = await fetch(`${API_BASE}/billing/apple/verify-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jws }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.detail || 'Receipt verification failed')
    }
    await refresh?.()
    return res.json()
  }, [token, refresh])

  const handleSubscribe = useCallback(async () => {
    if (loading) return
    haptic('medium')
    setLoading(true)
    setError('')
    try {
      if (isNative) {
        // Native Apple IAP — StoreKit 2 purchase sheet
        const productId = IAP_PRODUCTS[billing]
        const result = await IAP.purchase({ productId })
        if (!result?.jwsRepresentation) {
          throw new Error('Purchase did not return a transaction')
        }
        await verifyTransaction(result.jwsRepresentation)
        haptic('heavy')
        // refresh() in verifyTransaction triggers a re-render — paywall
        // detects plan === 'pro' and switches to the success state.
      } else {
        // Web fallback — open Stripe / crypto checkout in a new tab
        const base = WEB_CHECKOUT_URL.replace(/#.*/, '')
        const hash = (WEB_CHECKOUT_URL.match(/#.*/) || [''])[0]
        const target = `${base}?plan=${billing}${hash}`
        window.open(target, '_blank', 'noopener')
      }
    } catch (e) {
      const msg = e?.message || 'Subscription failed. Please try again.'
      if (!/cancel/i.test(msg)) setError(msg)
    } finally {
      setLoading(false)
    }
  }, [billing, loading, verifyTransaction])

  const handleRestore = useCallback(async () => {
    if (restoring) return
    haptic('light')
    setRestoring(true)
    setError('')
    try {
      if (isNative) {
        // Pull current StoreKit entitlements from Apple
        const { transactions } = await IAP.restorePurchases()
        const active = transactions?.find(t => Object.values(IAP_PRODUCTS).includes(t.productId))
        if (active?.jwsRepresentation) {
          await verifyTransaction(active.jwsRepresentation)
          haptic('heavy')
          return
        }
      }
      // Fallback: refresh /auth/me — picks up plans activated via Stripe / crypto
      const updated = await refresh?.()
      if (updated?.plan !== 'pro') {
        setError('No active subscription found for this account.')
      }
    } catch (e) {
      setError(e?.message || 'Restore failed.')
    } finally {
      setRestoring(false)
    }
  }, [restoring, refresh, verifyTransaction])

  // Already pro — show a confirmation state instead of the offer.
  if (plan === 'pro') {
    return (
      <div className="m-paywall m-paywall-pro-state">
        <div className="m-paywall-bg">
          <div className="m-paywall-glow" />
        </div>
        <button className="m-paywall-close" onClick={() => { haptic('light'); onBack?.() }} aria-label="Close">✕</button>
        <div className="m-paywall-pro-content">
          <div className="m-paywall-pro-badge">
            <span>✦</span>
          </div>
          <h1 className="m-paywall-pro-title">You're Pro</h1>
          <p className="m-paywall-pro-sub">
            All features unlocked.
            {user?.plan_expires_at && (
              <><br/>Active until <strong>{new Date(user.plan_expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong></>
            )}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="m-paywall">
      {/* Atmospheric background */}
      <div className="m-paywall-bg" aria-hidden="true">
        <div className="m-paywall-glow" />
        <div className="m-paywall-grid" />
      </div>

      {/* Close button (top-right, glassy circle) */}
      <button className="m-paywall-close" onClick={() => { haptic('light'); onBack?.() }} aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      <div className="m-paywall-scroll">
        {/* Hero */}
        <header className="m-paywall-hero">
          <div className="m-paywall-logo">
            <LogoTT width={56} height={56} />
          </div>
          <div className="m-paywall-pro-pill">✦ PRO</div>
          <h1 className="m-paywall-title">
            Real-time edge,<br/>every market.
          </h1>
          <p className="m-paywall-sub">
            Unlock the full Trading Terminal — trading, alerts, whale tracking, and on-chain intel.
          </p>
        </header>

        {/* Plan selector */}
        <div className="m-paywall-plans" role="radiogroup" aria-label="Subscription plan">
          <button
            className={`m-paywall-plan${billing === 'monthly' ? ' selected' : ''}`}
            onClick={() => { haptic('light'); setBilling('monthly') }}
            role="radio"
            aria-checked={billing === 'monthly'}
          >
            <div className="m-paywall-plan-label">Monthly</div>
            <div className="m-paywall-plan-price">
              <span className="m-paywall-plan-amount">${prices.monthly}</span>
              <span className="m-paywall-plan-period">/mo</span>
            </div>
            <div className="m-paywall-plan-foot">Billed every month</div>
          </button>

          <button
            className={`m-paywall-plan${billing === 'yearly' ? ' selected' : ''}`}
            onClick={() => { haptic('light'); setBilling('yearly') }}
            role="radio"
            aria-checked={billing === 'yearly'}
          >
            {savingsPct > 0 && <div className="m-paywall-plan-badge">Save {savingsPct}%</div>}
            <div className="m-paywall-plan-label">Yearly</div>
            <div className="m-paywall-plan-price">
              <span className="m-paywall-plan-amount">${monthlyEquivalent}</span>
              <span className="m-paywall-plan-period">/mo</span>
            </div>
            <div className="m-paywall-plan-foot">${prices.yearly} billed yearly</div>
          </button>
        </div>

        {/* Feature list */}
        <ul className="m-paywall-features">
          {FEATURES.map((f, i) => (
            <li key={i} className="m-paywall-feature">
              <div className="m-paywall-feature-icon">{f.icon}</div>
              <div className="m-paywall-feature-text">
                <div className="m-paywall-feature-title">{f.title}</div>
                <div className="m-paywall-feature-desc">{f.desc}</div>
              </div>
            </li>
          ))}
        </ul>

        {/* Spacer so the CTA doesn't cover content */}
        <div className="m-paywall-bottom-spacer" />
      </div>

      {/* Fixed bottom CTA region */}
      <div className="m-paywall-cta-region">
        {error && <div className="m-paywall-error">{error}</div>}

        <button
          className="m-paywall-cta"
          onClick={handleSubscribe}
          disabled={loading}
        >
          {loading ? (
            <span className="m-spinner" />
          ) : (
            <>
              {isNative ? 'Subscribe' : 'Continue on Web'}
              <span className="m-paywall-cta-price">
                {billing === 'yearly' ? `$${prices.yearly}/yr` : `$${prices.monthly}/mo`}
              </span>
            </>
          )}
        </button>

        {/* Apple-required disclosures */}
        <p className="m-paywall-disclaimer">
          Auto-renews each {billing === 'yearly' ? 'year' : 'month'} until cancelled.
          Cancel anytime in your account settings.
        </p>

        <div className="m-paywall-links">
          <button onClick={handleRestore} disabled={restoring}>
            {restoring ? 'Restoring…' : 'Restore Purchases'}
          </button>
          <span className="m-paywall-dot">·</span>
          <a href={TERMS_URL} target="_blank" rel="noopener noreferrer">Terms</a>
          <span className="m-paywall-dot">·</span>
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">Privacy</a>
        </div>
      </div>
    </div>
  )
}
