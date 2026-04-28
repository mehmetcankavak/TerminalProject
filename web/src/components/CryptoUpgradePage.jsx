import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'

// ── Token Logos (inline SVG) ──
const UsdtLogo = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="16" fill="#26A17B"/>
    <path d="M17.922 17.383v-.002c-.11.008-.677.042-1.942.042-1.01 0-1.721-.03-1.971-.042v.003c-3.888-.171-6.79-.848-6.79-1.658 0-.809 2.902-1.486 6.79-1.66v2.644c.254.018.982.061 1.988.061 1.207 0 1.812-.05 1.925-.06v-2.643c3.88.173 6.775.85 6.775 1.658 0 .81-2.895 1.485-6.775 1.657m0-3.59v-2.366h5.414V7.819H8.595v3.608h5.414v2.365c-4.4.202-7.709 1.074-7.709 2.118 0 1.044 3.309 1.915 7.709 2.118v7.582h3.913v-7.584c4.393-.202 7.694-1.073 7.694-2.116 0-1.043-3.301-1.914-7.694-2.117" fill="#fff"/>
  </svg>
)

const UsdcLogo = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="16" fill="#2775CA"/>
    <path d="M20.022 18.124c0-2.12-1.28-2.852-3.838-3.156-1.828-.24-2.194-.736-2.194-1.592 0-.856.61-1.396 1.83-1.396 1.096 0 1.706.364 2.01 1.28a.458.458 0 00.428.304h.976a.416.416 0 00.426-.428v-.062a3.044 3.044 0 00-2.706-2.486v-1.464a.434.434 0 00-.428-.428h-.916a.434.434 0 00-.428.428v1.402c-1.828.242-2.986 1.462-2.986 2.922 0 1.998 1.218 2.79 3.778 3.094 1.706.304 2.254.672 2.254 1.654 0 .982-.854 1.654-2.01 1.654-1.584 0-2.132-.672-2.316-1.584a.442.442 0 00-.428-.304h-1.036a.416.416 0 00-.428.428v.062c.304 1.646 1.218 2.73 3.222 3.032v1.464a.434.434 0 00.428.428h.916a.434.434 0 00.428-.428v-1.464c1.828-.304 3.048-1.524 3.048-3.094z" fill="#fff"/>
    <path d="M12.708 24.77a9.404 9.404 0 01-5.478-5.478.342.342 0 00-.61 0 9.404 9.404 0 005.478 5.478.342.342 0 000-.61v.61zM19.292 7.23a9.404 9.404 0 015.478 5.478.342.342 0 00.61 0 9.404 9.404 0 00-5.478-5.478.342.342 0 000 .61v-.61zM12.708 7.23a.342.342 0 000-.61 9.404 9.404 0 00-5.478 5.478.342.342 0 00.61 0 9.404 9.404 0 014.868-4.868zM19.292 24.77a.342.342 0 000 .61 9.404 9.404 0 005.478-5.478.342.342 0 00-.61 0 9.404 9.404 0 01-4.868 4.868z" fill="#fff"/>
  </svg>
)

// ── Chain Logos (inline SVG) ──
const EthLogo = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="16" fill="#627EEA"/>
    <path d="M16.498 4v8.87l7.497 3.35L16.498 4z" fill="#fff" fillOpacity=".6"/>
    <path d="M16.498 4L9 16.22l7.498-3.35V4z" fill="#fff"/>
    <path d="M16.498 21.968v6.027L24 17.616l-7.502 4.352z" fill="#fff" fillOpacity=".6"/>
    <path d="M16.498 27.995v-6.028L9 17.616l7.498 10.379z" fill="#fff"/>
    <path d="M16.498 20.573l7.497-4.353-7.497-3.348v7.701z" fill="#fff" fillOpacity=".2"/>
    <path d="M9 16.22l7.498 4.353v-7.701L9 16.22z" fill="#fff" fillOpacity=".6"/>
  </svg>
)

const BnbLogo = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="16" fill="#F3BA2F"/>
    <path d="M12.116 14.404L16 10.52l3.886 3.886 2.26-2.26L16 6l-6.144 6.144 2.26 2.26zM6 16l2.26-2.26L10.52 16l-2.26 2.26L6 16zm6.116 1.596L16 21.48l3.886-3.886 2.26 2.259L16 26l-6.144-6.144-.003-.003 2.263-2.257zM21.48 16l2.26-2.26L26 16l-2.26 2.26L21.48 16zm-3.188-.002h.002V16L16 18.294l-2.291-2.29-.004-.004.004-.003.401-.402.195-.195L16 13.706l2.293 2.293z" fill="#fff"/>
  </svg>
)

const SolLogo = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 397.7 311.7" fill="none">
    <defs>
      <linearGradient id="sol-a" x1="360.88" y1="351.46" x2="141.21" y2="-69.29" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#00FFA3"/><stop offset="1" stopColor="#DC1FFF"/></linearGradient>
      <linearGradient id="sol-b" x1="264.83" y1="401.6" x2="45.16" y2="-19.15" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#00FFA3"/><stop offset="1" stopColor="#DC1FFF"/></linearGradient>
      <linearGradient id="sol-c" x1="312.55" y1="376.69" x2="92.88" y2="-44.06" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#00FFA3"/><stop offset="1" stopColor="#DC1FFF"/></linearGradient>
    </defs>
    <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z" fill="url(#sol-a)"/>
    <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="url(#sol-b)"/>
    <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="url(#sol-c)"/>
  </svg>
)

const TronLogo = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="16" fill="#EF0027"/>
    <path d="M21.932 9.913L7.5 7.257l7.2 19.32 10.951-12.985-3.719-3.68zm-.681 1.316l2.07 2.048-7.088 8.402L12.1 10.06l9.151 1.169zm-10.313-.2l7.565 13.321-5.9-15.849 .335.528-2 2z" fill="#fff"/>
  </svg>
)

const ArbLogo = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="16" fill="#2D374B"/>
    <path d="M16 6.5l-8.5 14.7h3.1l5.4-9.35 5.4 9.35h3.1L16 6.5z" fill="#28A0F0"/>
    <path d="M16 6.5l-8.5 14.7h3.1l5.4-9.35 5.4 9.35h3.1L16 6.5z" fill="#28A0F0"/>
    <path d="M12.6 21.2l-1.55 2.68h9.9L19.4 21.2H12.6z" fill="#fff"/>
  </svg>
)

const CHAIN_META = {
  erc20:    { name: 'Ethereum',  sub: 'ERC-20',  logo: EthLogo },
  bsc:      { name: 'BNB Chain', sub: 'BEP-20',  logo: BnbLogo },
  solana:   { name: 'Solana',    sub: 'SPL',      logo: SolLogo },
  tron:     { name: 'Tron',      sub: 'TRC-20',   logo: TronLogo },
  arbitrum: { name: 'Arbitrum',  sub: 'Arb One',  logo: ArbLogo },
}

const chainAddressExplorerUrl = (chain, address) => {
  if (!chain || !address) return ''
  switch (chain) {
    case 'erc20': return `https://etherscan.io/address/${address}`
    case 'bsc': return `https://bscscan.com/address/${address}`
    case 'arbitrum': return `https://arbiscan.io/address/${address}`
    case 'solana': return `https://solscan.io/account/${address}`
    case 'tron': return `https://tronscan.org/#/address/${address}`
    default: return ''
  }
}

const chainTxExplorerUrl = (chain, txHash) => {
  if (!chain || !txHash) return ''
  switch (chain) {
    case 'erc20': return `https://etherscan.io/tx/${txHash}`
    case 'bsc': return `https://bscscan.com/tx/${txHash}`
    case 'arbitrum': return `https://arbiscan.io/tx/${txHash}`
    case 'solana': return `https://solscan.io/tx/${txHash}`
    case 'tron': return `https://tronscan.org/#/transaction/${txHash}`
    default: return ''
  }
}

// ── Animated feature icons ──
const FeatureIcon = ({ type }) => {
  const icons = {
    terminal: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    ),
    chart: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
    shield: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    zap: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
  }
  return <span className="up-feat-icon">{icons[type]}</span>
}

const PRO_FEATURES = [
  { icon: 'terminal', label: 'Terminal + Fast Execution' },
  { icon: 'chart', label: 'Funding · L/S · Liquidation' },
  { icon: 'shield', label: 'Smart Money + Custom Alerts' },
  { icon: 'zap', label: 'Stocks · Volume · Token Unlock' },
]

export default function CryptoUpgradePage() {
  const { token, plan, user } = useAuth()
  const isPro = plan === 'pro'
  const pageRef = useRef(null)

  const [info, setInfo] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState(false)

  const [billing, setBilling] = useState('monthly')
  const [payToken, setPayToken] = useState('USDT')
  const [chain, setChain] = useState('')
  const [txHash, setTxHash] = useState('')

  const handlePointerMove = (e) => {
    const rect = pageRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    pageRef.current.style.setProperty('--ux', `${x}px`)
    pageRef.current.style.setProperty('--uy', `${y}px`)
  }

  useEffect(() => {
    let mounted = true
    const fetchData = async () => {
      setLoading(true)
      try {
        const [infoRes, payRes] = await Promise.all([
          fetch(`${API_BASE}/billing/crypto/info`),
          fetch(`${API_BASE}/billing/crypto/payments`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ])
        if (!mounted) return
        if (infoRes.ok) {
          const data = await infoRes.json()
          setInfo(data)
          const chains = Object.keys(data.wallets || {})
          if (chains.length > 0) setChain(chains[0])
        }
        if (payRes.ok) {
          const data = await payRes.json()
          setPayments(Array.isArray(data.payments) ? data.payments : [])
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchData()
    return () => { mounted = false }
  }, [token])

  const prices = info?.prices || { monthly: 49, yearly: 390 }
  const amount = prices[billing] || 0
  const walletAddress = info?.wallets?.[chain] || ''
  const addressExplorer = chainAddressExplorerUrl(chain, walletAddress)
  const txExplorer = chainTxExplorerUrl(chain, txHash.trim())
  const qrSrc = walletAddress
    ? `https://api.qrserver.com/v1/create-qr-code/?size=170x170&margin=8&data=${encodeURIComponent(walletAddress)}`
    : ''

  const yearlyDiscount = useMemo(() => {
    if (!prices?.monthly || !prices?.yearly) return 0
    const base = prices.monthly * 12
    if (!base) return 0
    return Math.max(0, Math.round((1 - prices.yearly / base) * 100))
  }, [prices])

  const submitPayment = async () => {
    if (!txHash.trim()) { setMsg('TX hash gerekli.'); return }
    if (!chain) { setMsg('Ağ seçimi yapmalısın.'); return }
    setSubmitting(true)
    setMsg('')
    try {
      const res = await fetch(`${API_BASE}/billing/crypto/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plan: billing,
          chain,
          token: payToken,
          tx_hash: txHash.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Payment submit failed')
      setMsg('✓ Ödeme kaydı alındı. Doğrulama sonrası planın aktifleşecek.')
      setTxHash('')
      setPayments(prev => [
        {
          id: data.payment_id,
          plan: billing,
          chain,
          token: payToken,
          amount,
          tx_hash: data.tx_hash,
          status: 'pending',
          created_at: new Date().toISOString(),
        },
        ...prev,
      ])
    } catch (e) {
      setMsg(e.message || 'Gönderim başarısız.')
    } finally {
      setSubmitting(false)
    }
  }

  const copyAddress = async () => {
    if (!walletAddress) return
    try {
      await navigator.clipboard.writeText(walletAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setMsg('Adres kopyalanamadı.')
    }
  }

  // ── Step indicator ──
  const steps = [
    { n: 1, label: 'Select Plan', done: true },
    { n: 2, label: 'Choose Network', done: !!chain },
    { n: 3, label: 'Send & Confirm', done: false },
  ]

  return (
    <div
      ref={pageRef}
      className="upgrade-page upgrade-page-v2"
      onMouseMove={handlePointerMove}
    >
      {/* Ambient background effects */}
      <div className="up-v2-glow" />
      <div className="up-v2-grid-bg" />

      {/* ── Hero ── */}
      <div className="upgrade-hero up-v2-hero">
        <div className="up-v2-hero-badge">
          <span className="up-v2-hero-dot" />
          CRYPTO BILLING
        </div>
        <h1 className="upgrade-title up-v2-title">
          {isPro ? 'Extend Your Pro' : 'Upgrade to Pro'}
        </h1>
        <p className="upgrade-sub up-v2-sub">
          {isPro
            ? 'Extend your plan securely with on-chain payment.'
            : 'Pay with USDT / USDC across 5+ networks. Instant verification, full access.'}
        </p>

        {/* Step indicator */}
        <div className="up-v2-steps">
          {steps.map((s, i) => (
            <div key={s.n} className={`up-v2-step ${s.done ? 'done' : ''}`}>
              <div className="up-v2-step-num">{s.done ? '✓' : s.n}</div>
              <span>{s.label}</span>
              {i < steps.length - 1 && <div className="up-v2-step-line" />}
            </div>
          ))}
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="upgrade-grid up-v2-grid">
        {/* Left: Pricing */}
        <div className="up-v2-pricing-section">
          {/* FREE card */}
          <div className="up-card up-v2-card up-v2-card-free">
            <div className="up-v2-card-head">
              <div className="up-plan">FREE</div>
              <div className="up-price">$0<span>/forever</span></div>
            </div>
            <ul>
              <li>Basic dashboard</li>
              <li>Spot / Market view</li>
              <li>Limited access</li>
            </ul>
          </div>

          {/* PRO card */}
          <div className="up-card up-v2-card up-v2-card-pro">
            <div className="up-v2-card-glow" />
            <div className="up-v2-popular-badge">MOST POPULAR</div>
            <div className="up-v2-card-head">
              <div className="up-plan">PRO</div>
              <div className="up-billing-toggle up-v2-toggle">
                <button className={billing === 'monthly' ? 'active' : ''} onClick={() => setBilling('monthly')}>Monthly</button>
                <button className={billing === 'yearly' ? 'active' : ''} onClick={() => setBilling('yearly')}>
                  Yearly
                  {yearlyDiscount > 0 && <span className="up-v2-save-tag">-{yearlyDiscount}%</span>}
                </button>
              </div>
              <div className="up-price up-v2-price-hero">
                ${amount}<span>/{billing === 'monthly' ? 'mo' : 'yr'}</span>
              </div>
            </div>
            <div className="up-v2-features">
              {PRO_FEATURES.map(f => (
                <div key={f.label} className="up-v2-feat-row">
                  <FeatureIcon type={f.icon} />
                  <span>{f.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Checkout */}
        <div className="upgrade-checkout up-v2-checkout">
          <div className="up-v2-checkout-glow" />
          {loading ? (
            <div className="upgrade-loading">
              <div className="up-v2-loader" />
              <span>Loading payment data...</span>
            </div>
          ) : (
            <>
              {/* Token select */}
              <div className="upgrade-row">
                <label>Token</label>
                <div className="upgrade-chip-row">
                  {[
                    { id: 'USDT', Logo: UsdtLogo, color: '#26A17B' },
                    { id: 'USDC', Logo: UsdcLogo, color: '#2775CA' },
                  ].map(({ id, Logo }) => (
                    <button key={id} className={`upgrade-chip up-v2-chip ${payToken === id ? 'active' : ''}`} onClick={() => setPayToken(id)}>
                      <Logo size={20} /> {id}
                    </button>
                  ))}
                </div>
              </div>

              {/* Network select */}
              <div className="upgrade-row">
                <label>Network</label>
                <div className="upgrade-chip-row wrap">
                  {Object.keys(info?.wallets || {}).map(c => {
                    const meta = CHAIN_META[c]
                    const ChainLogo = meta?.logo
                    return (
                      <button key={c} className={`upgrade-chip up-v2-chip ${chain === c ? 'active' : ''}`} onClick={() => setChain(c)}>
                        {ChainLogo && <ChainLogo size={16} />}
                        <span className="up-v2-chip-name">{meta?.name || c}</span>
                        <span className="up-v2-chip-sub">{meta?.sub || ''}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Amount */}
              <div className="upgrade-row">
                <label>Send Exactly</label>
                <div className="upgrade-amount up-v2-amount">
                  <span className="up-v2-amount-value">${amount}</span>
                  <span className="up-v2-amount-token">{payToken}</span>
                </div>
              </div>

              {/* Wallet address */}
              <div className="upgrade-row">
                <label>Wallet Address</label>
                <div className="upgrade-address-wrap up-v2-address">
                  <code>{walletAddress || 'No wallet configured for selected chain.'}</code>
                  <button
                    className={`up-v2-copy-btn ${copied ? 'copied' : ''}`}
                    onClick={copyAddress}
                    disabled={!walletAddress}
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                {addressExplorer && (
                  <div className="upgrade-meta-actions">
                    <a href={addressExplorer} target="_blank" rel="noreferrer" className="upgrade-meta-link">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      View on Explorer
                    </a>
                  </div>
                )}
                {qrSrc && (
                  <div className="upgrade-qr-wrap up-v2-qr">
                    <img className="upgrade-qr" src={qrSrc} alt="Wallet QR Code" />
                    <div className="upgrade-qr-note">
                      Scan to send. Verify network &amp; amount before confirming.
                    </div>
                  </div>
                )}
              </div>

              {/* TX Hash */}
              <div className="upgrade-row">
                <label>Transaction Hash (TX ID)</label>
                <p className="up-v2-field-hint">
                  After sending the payment from your wallet, paste the transaction hash here so we can verify it on-chain.
                </p>
                <input
                  className="upgrade-input up-v2-input"
                  placeholder="0x... / Solana signature / Tron txid"
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                />
                {txExplorer && (
                  <div className="upgrade-meta-actions">
                    <a href={txExplorer} target="_blank" rel="noreferrer" className="upgrade-meta-link">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      Verify TX on Explorer
                    </a>
                  </div>
                )}
              </div>

              {/* Submit */}
              <button
                className="upgrade-submit up-v2-submit"
                onClick={submitPayment}
                disabled={submitting || !txHash.trim() || !walletAddress}
              >
                {submitting ? (
                  <span className="up-v2-submit-loading">
                    <span className="auth-spinner" />
                    Processing...
                  </span>
                ) : (
                  <>Submit Payment</>
                )}
              </button>

              {msg && (
                <div className={`upgrade-msg ${msg.startsWith('✓') ? 'ok' : 'err'}`}>
                  {msg}
                </div>
              )}
              {isPro && user?.plan_expires_at && (
                <div className="upgrade-expiry">
                  Current expiry: {new Date(user.plan_expires_at).toLocaleDateString('tr-TR')}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Payment History ── */}
      {payments.length > 0 && (
        <div className="upgrade-history up-v2-history">
          <div className="upgrade-history-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Payment History
          </div>
          <table className="upgrade-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Plan</th>
                <th>Network</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id}>
                  <td className="up-v2-td-id">#{p.id}</td>
                  <td>{String(p.plan || '').toUpperCase()}</td>
                  <td>{String(p.chain || '').toUpperCase()} · {p.token}</td>
                  <td>${p.amount} {p.token}</td>
                  <td><span className={`upgrade-status ${p.status}`}>{String(p.status || '').toUpperCase()}</span></td>
                  <td className="up-v2-td-date">{String(p.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
