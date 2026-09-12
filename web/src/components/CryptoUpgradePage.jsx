import { useEffect, useMemo, useState } from 'react'
import { Monitor, BarChart3, Users, FileText, Info, ArrowRight, ArrowLeft, Network, Copy, Check, ExternalLink } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'

const CHAIN_META = {
  erc20:    { name: 'Ethereum',  sub: 'ERC-20' },
  bsc:      { name: 'BNB Chain', sub: 'BEP-20' },
  solana:   { name: 'Solana',    sub: 'SPL'    },
  tron:     { name: 'Tron',      sub: 'TRC-20' },
  arbitrum: { name: 'Arbitrum',  sub: 'Arb One' },
}

const chainAddressExplorerUrl = (chain, address) => {
  if (!chain || !address) return ''
  switch (chain) {
    case 'erc20':    return `https://etherscan.io/address/${address}`
    case 'bsc':      return `https://bscscan.com/address/${address}`
    case 'arbitrum': return `https://arbiscan.io/address/${address}`
    case 'solana':   return `https://solscan.io/account/${address}`
    case 'tron':     return `https://tronscan.org/#/address/${address}`
    default:         return ''
  }
}

const chainTxExplorerUrl = (chain, txHash) => {
  if (!chain || !txHash) return ''
  switch (chain) {
    case 'erc20':    return `https://etherscan.io/tx/${txHash}`
    case 'bsc':      return `https://bscscan.com/tx/${txHash}`
    case 'arbitrum': return `https://arbiscan.io/tx/${txHash}`
    case 'solana':   return `https://solscan.io/tx/${txHash}`
    case 'tron':     return `https://tronscan.org/#/transaction/${txHash}`
    default:         return ''
  }
}

const FEATURES = [
  { Icon: Monitor,   title: 'Terminal + Fast Execution',    desc: 'Real-time data, advanced charts and fast order execution.' },
  { Icon: BarChart3, title: 'Funding · L/S · Liquidation',  desc: 'Track funding rates, long / short ratios and liquidations.' },
  { Icon: Users,     title: 'Smart Money + Custom Alerts',  desc: 'Follow smart money and set custom alerts.' },
  { Icon: FileText,  title: 'Stocks · Volume · Token Unlock', desc: 'Access stocks, ETF data, volume metrics and token unlocks.' },
]

const STATUS_BADGE = { confirmed: 'ws-badge-pos', approved: 'ws-badge-pos', pending: 'ws-badge-warn', rejected: 'ws-badge-neg', failed: 'ws-badge-neg' }

function PlanCard({ id, title, price, per, billed, badge, selected, onSelect }) {
  return (
    <button type="button" className={`up-plan ${selected ? 'selected' : ''}`} onClick={() => onSelect(id)}>
      <div className="up-plan-top">
        <span className={`ws-radio ${selected ? 'on' : ''}`} />
        <span className="up-plan-title">{title}</span>
        {badge && <span className="ws-badge ws-badge-pos up-plan-badge">{badge}</span>}
      </div>
      <div className="up-plan-price">
        <span className="up-plan-amount">${price}</span>
        <span className="up-plan-per">per month</span>
      </div>
      <div className="up-plan-billed">{billed}</div>
    </button>
  )
}

export default function CryptoUpgradePage() {
  const { token, plan, user } = useAuth()
  const isPro = plan === 'pro'

  const [info, setInfo]             = useState(null)
  const [payments, setPayments]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg]               = useState('')
  const [copied, setCopied]         = useState(false)

  const [billing, setBilling]   = useState('monthly')
  const [payToken, setPayToken] = useState('USDT')
  const [chain, setChain]       = useState('')
  const [txHash, setTxHash]     = useState('')
  const [step, setStep]         = useState(1)

  useEffect(() => {
    let mounted = true
    const fetchData = async () => {
      setLoading(true)
      try {
        const [infoRes, payRes] = await Promise.all([
          fetch(`${API_BASE}/billing/crypto/info`),
          fetch(`${API_BASE}/billing/crypto/payments`, { headers: { Authorization: `Bearer ${token}` } }),
        ])
        if (!mounted) return
        if (infoRes.ok) setInfo(await infoRes.json())
        if (payRes.ok) {
          const data = await payRes.json()
          setPayments(Array.isArray(data.payments) ? data.payments : [])
        }
      } catch {
        /* network errors leave the defaults in place */
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchData()
    return () => { mounted = false }
  }, [token])

  const prices = info?.prices || { monthly: 49, yearly: 390 }
  const monthly = prices.monthly || 49
  const yearly  = prices.yearly || 390
  const yearlyPerMonth = Math.round(yearly / 12)
  const yearlyDiscount = useMemo(() => Math.max(0, Math.round((1 - yearly / (monthly * 12)) * 100)), [monthly, yearly])
  const amount = billing === 'monthly' ? monthly : yearly

  const chains = Object.keys(info?.wallets || {})
  const walletAddress = info?.wallets?.[chain] || ''
  const addressExplorer = chainAddressExplorerUrl(chain, walletAddress)
  const txExplorer = chainTxExplorerUrl(chain, txHash.trim())
  const qrSrc = walletAddress
    ? `https://api.qrserver.com/v1/create-qr-code/?size=170x170&margin=8&data=${encodeURIComponent(walletAddress)}`
    : ''

  const submitPayment = async () => {
    if (!txHash.trim()) { setMsg('Transaction hash is required.'); return }
    if (!chain) { setMsg('Please select a network.'); return }
    setSubmitting(true)
    setMsg('')
    try {
      const res = await fetch(`${API_BASE}/billing/crypto/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: billing, chain, token: payToken, tx_hash: txHash.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Payment submit failed')
      setMsg('✓ Payment received. Your plan activates once the transaction is verified.')
      setTxHash('')
      setPayments(prev => [{
        id: data.payment_id, plan: billing, chain, token: payToken, amount,
        tx_hash: data.tx_hash, status: 'pending', created_at: new Date().toISOString(),
      }, ...prev])
    } catch (e) {
      setMsg(e.message || 'Submission failed.')
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
      setMsg('Could not copy the address.')
    }
  }

  const steps = [
    { n: 1, label: 'Select Plan' },
    { n: 2, label: 'Choose Network' },
    { n: 3, label: 'Send & Confirm' },
  ]
  const currentStep = step === 3 ? 3 : chain ? 2 : 1

  return (
    <div className="ws-page up-page">
      <div className="ws-page-head">
        <div className="ws-page-head-left">
          <h1 className="ws-title">{isPro ? 'Extend Your Pro' : 'Upgrade to Pro'}</h1>
        </div>
      </div>

      {/* Steps */}
      <div className="ws-steps up-steps">
        {steps.map((s, i) => (
          <div key={s.n} className="ws-row ws-flex-1">
            <div className={`ws-step ${currentStep === s.n ? 'active' : ''}`}>
              <span className="ws-step-num">{s.n}</span>
              <span>{s.label}</span>
            </div>
            {i < steps.length - 1 && <div className="ws-step-line" />}
          </div>
        ))}
      </div>

      {/* Plans */}
      <div className="up-plans">
        <PlanCard id="monthly" title="Monthly" price={monthly} billed="Billed monthly"
          selected={billing === 'monthly'} onSelect={setBilling} />
        <PlanCard id="yearly" title="Yearly" price={yearlyPerMonth}
          billed={<>Billed yearly &nbsp;<b>${yearly}</b></>}
          badge={yearlyDiscount > 0 ? `Save ${yearlyDiscount}%` : null}
          selected={billing === 'yearly'} onSelect={setBilling} />
      </div>

      <div className="ws-divider" />

      {step !== 3 ? (
        <>
          <h2 className="ws-h2">Select Network</h2>
          <p className="ws-subtitle" style={{ marginTop: 4 }}>Choose the network you will use to send payment.</p>

          <div className="up-network">
            <div className="up-network-select">
              <Network size={20} className="ws-muted" />
              <select className="ws-select ws-select-lg" value={chain} onChange={e => setChain(e.target.value)} disabled={loading}>
                <option value="">{loading ? 'Loading networks…' : 'Select network'}</option>
                {chains.map(c => (
                  <option key={c} value={c}>{CHAIN_META[c]?.name || c} · {CHAIN_META[c]?.sub || ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="ws-note ws-mt-16">
            <Info size={16} />
            {chain
              ? <span>Send <b>{amount} {payToken}</b> on <b>{CHAIN_META[chain]?.name || chain}</b>. Make sure your wallet supports this network.</span>
              : 'Please select a network to continue.'}
          </div>

          <div className="ws-row ws-mt-24">
            <button className="ws-btn ws-btn-primary ws-btn-lg" disabled={!chain} onClick={() => setStep(3)}>
              Next: Send &amp; Confirm <ArrowRight size={16} />
            </button>
            <button className="ws-btn ws-btn-lg" onClick={() => { setChain(''); setStep(1) }}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <h2 className="ws-h2">Send &amp; Confirm</h2>
          <p className="ws-subtitle" style={{ marginTop: 4 }}>
            Send exactly the amount below to the wallet, then paste the transaction hash so we can verify it on-chain.
          </p>

          <div className="up-confirm">
            <div className="ws-stack">
              <div className="ws-field">
                <label>Token</label>
                <div className="ws-pills">
                  {['USDT', 'USDC'].map(t => (
                    <button key={t} className={`ws-pill ${payToken === t ? 'active' : ''}`} onClick={() => setPayToken(t)}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="ws-field">
                <label>Send exactly</label>
                <div className="up-amount"><b>${amount}</b> {payToken} <span className="ws-muted">· {CHAIN_META[chain]?.name || chain}</span></div>
              </div>
              <div className="ws-field">
                <label>Wallet address</label>
                <div className="up-address">
                  <code>{walletAddress || 'No wallet configured for the selected network.'}</code>
                  <button className="ws-btn ws-btn-sm" onClick={copyAddress} disabled={!walletAddress}>
                    {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                  </button>
                </div>
                {addressExplorer && (
                  <a className="ws-link ws-small" href={addressExplorer} target="_blank" rel="noreferrer">
                    <ExternalLink size={13} /> View on explorer
                  </a>
                )}
              </div>
              <div className="ws-field">
                <label>Transaction hash (TX ID)</label>
                <input className="ws-input ws-mono" placeholder="0x… / Solana signature / Tron txid"
                  value={txHash} onChange={e => setTxHash(e.target.value)} />
                {txExplorer && (
                  <a className="ws-link ws-small" href={txExplorer} target="_blank" rel="noreferrer">
                    <ExternalLink size={13} /> Verify TX on explorer
                  </a>
                )}
              </div>
              {msg && <div className={`ws-note ${msg.startsWith('✓') ? 'ws-note-ok' : 'ws-note-err'}`}>{msg}</div>}
              {isPro && user?.plan_expires_at && (
                <div className="ws-meta">Current expiry: {new Date(user.plan_expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
              )}
              <div className="ws-row">
                <button className="ws-btn ws-btn-primary ws-btn-lg" onClick={submitPayment} disabled={submitting || !txHash.trim() || !walletAddress}>
                  {submitting ? <><span className="ws-spinner" /> Processing…</> : 'Submit Payment'}
                </button>
                <button className="ws-btn ws-btn-lg" onClick={() => setStep(2)}><ArrowLeft size={16} /> Back</button>
              </div>
            </div>
            {qrSrc && (
              <div className="up-qr">
                <img src={qrSrc} alt="Wallet QR code" width={170} height={170} />
                <div className="ws-meta ws-center">Scan to send. Verify network &amp; amount before confirming.</div>
              </div>
            )}
          </div>
        </>
      )}

      <div className="ws-divider" />

      {/* Features */}
      <h2 className="ws-h2">Included Features</h2>
      <div className="up-features">
        {FEATURES.map(({ Icon, title, desc }) => (
          <div key={title} className="up-feature">
            <Icon size={30} strokeWidth={1.4} className="up-feature-icon" />
            <div>
              <div className="up-feature-title">{title}</div>
              <div className="up-feature-desc">{desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="ws-divider" />

      {/* Payment history */}
      <h2 className="ws-h2">Payment History</h2>
      <div className="ws-card ws-card-flat ws-mt-16">
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr><th>ID</th><th>Plan</th><th>Network</th><th>Amount</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr><td colSpan={6} style={{ whiteSpace: 'normal' }}>
                  <div className="ws-empty">
                    <div className="ws-empty-icon"><FileText size={30} strokeWidth={1.4} /></div>
                    <div className="ws-empty-title">No payment history yet.</div>
                    <div className="ws-empty-sub">Your transactions will appear here after purchase.</div>
                  </div>
                </td></tr>
              ) : payments.map(p => (
                <tr key={p.id}>
                  <td className="ws-muted">#{p.id}</td>
                  <td className="ws-ink">{String(p.plan || '').replace(/^\w/, c => c.toUpperCase())}</td>
                  <td>{CHAIN_META[p.chain]?.name || String(p.chain || '').toUpperCase()} · {p.token}</td>
                  <td className="ws-ink ws-num">${p.amount} {p.token}</td>
                  <td><span className={`ws-badge ${STATUS_BADGE[p.status] || ''}`}>{String(p.status || '').replace(/^\w/, c => c.toUpperCase())}</span></td>
                  <td className="ws-muted ws-num">{String(p.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
