import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { haptic, secureGet } from '../../capacitor'
import { API_BASE } from '../../config'
import { useAccount, useSignTypedData } from 'wagmi'

const RANGES = [
  { key: '1D', label: '1D', windowKey: '24h' },
  { key: '1W', label: '1W', windowKey: '7d'  },
  { key: '1M', label: '1M', windowKey: '30d' },
  { key: '1Y', label: 'All', windowKey: 'all' },
]

const shortAddr = (a) => (a && a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : (a || ''))

function fmtUsd(n, digits = 2) {
  if (n == null || isNaN(n)) return '$0.00'
  return Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits })
}
function fmtNum(n, digits = 4) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
function timeAgo(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

// Map HL pnl_history (timestamp+pnl) to plot points using actual timestamps as x.
function pnlSeriesToPoints(series) {
  if (!Array.isArray(series) || series.length === 0) return []
  return series
    .filter(p => p && p.timestamp != null && p.pnl != null)
    .map(p => ({ x: Number(p.timestamp), y: Number(p.pnl) }))
}

function EquityChart({ points, isUp }) {
  const W = 320, H = 140
  if (!points || points.length < 2) return null
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const xScale = (x) => ((x - minX) / Math.max(maxX - minX, 1)) * W
  const yScale = (y) => H - ((y - minY) / Math.max(maxY - minY, 1)) * (H - 10) - 5
  const path = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${xScale(p.x).toFixed(2)},${yScale(p.y).toFixed(2)}`
  ).join(' ')
  const areaPath = `${path} L${W},${H} L0,${H} Z`
  const stroke = isUp ? '#00d992' : '#ff3b5c'
  const gradId = `pf-grad-${isUp ? 'up' : 'down'}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="140" preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

const IconUp      = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
const IconDown    = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
const IconHistory = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
const IconSwap    = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>

// ─── Bottom-sheet modal shell
function Sheet({ show, onClose, title, children, busy = false }) {
  if (!show) return null
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}>
      <div style={{
        background: 'var(--bg-2)', width: '100%', maxWidth: 480,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: '20px 20px calc(28px + var(--safe-bottom, 0px))',
        border: '1px solid rgba(255,255,255,0.06)',
        maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto 16px' }} />
        <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 14 }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

// ─── Send: USDC to another HL address
function SendModal({ show, onClose, available, onSent }) {
  const { token } = useAuth()
  const [destination, setDestination] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { if (!show) { setDestination(''); setAmount(''); setError(''); setSuccess(''); setBusy(false) } }, [show])

  const submit = async () => {
    setError(''); setSuccess('')
    const amt = parseFloat(amount)
    if (!destination.startsWith('0x') || destination.length !== 42) { setError('Invalid address (must be 0x... 42 characters)'); return }
    if (isNaN(amt) || amt <= 0) { setError('Invalid amount'); return }
    if (available != null && amt > available) { setError(`Insufficient balance (max $${available.toFixed(2)})`); return }
    setBusy(true)
    try {
      const res = await fetch(`${API_BASE}/api/hl/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ destination: destination.trim(), amount: amt }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Send failed')
      haptic('heavy')
      setSuccess(`✓ ${amt} USDC sent`)
      setTimeout(() => { onSent?.(); onClose() }, 1200)
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet show={show} onClose={onClose} title="Send USDC" busy={busy}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 14, lineHeight: 1.5 }}>
        Send USDC to another user on Hyperliquid. Free, instant.
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#666', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>DESTINATION ADDRESS</div>
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="0x..."
          autoCorrect="off" autoCapitalize="off" spellCheck={false}
          style={{
            width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '12px 14px', color: '#fff',
            fontSize: 13, fontFamily: 'var(--mono)', boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: '#666', fontWeight: 700, letterSpacing: 1 }}>AMOUNT (USDC)</span>
          {available != null && (
            <button onClick={() => setAmount(String(available))}
              style={{ background: 'transparent', border: 'none', color: '#00d992', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              MAX ${available.toFixed(2)}
            </button>
          )}
        </div>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number" inputMode="decimal" placeholder="0.00"
          style={{
            width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '12px 14px', color: '#fff',
            fontSize: 18, fontWeight: 700, fontFamily: 'var(--mono)', boxSizing: 'border-box',
          }}
        />
      </div>

      {error && (
        <div style={{ background: 'rgba(255,59,92,0.1)', border: '1px solid rgba(255,59,92,0.3)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#ff3b5c', marginBottom: 12 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: 'rgba(0,217,146,0.1)', border: '1px solid rgba(0,217,146,0.3)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#00d992', marginBottom: 12 }}>
          {success}
        </div>
      )}

      <button onClick={submit} disabled={busy}
        style={{
          width: '100%', padding: 14, borderRadius: 12, border: 'none',
          background: busy ? '#1a1c25' : '#00d992', color: busy ? '#4e4d49' : '#000',
          fontSize: 14, fontWeight: 800, letterSpacing: 1, cursor: busy ? 'wait' : 'pointer',
        }}>
        {busy ? 'SENDING…' : 'SEND'}
      </button>
    </Sheet>
  )
}

// ─── Receive: show wallet address + QR code
function ReceiveModal({ show, onClose, walletAddress }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    if (!walletAddress) return
    navigator.clipboard.writeText(walletAddress).catch(() => {})
    haptic('light')
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  const qrUrl = walletAddress
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(walletAddress)}&bgcolor=000000&color=00d992&qzone=2`
    : ''

  return (
    <Sheet show={show} onClose={onClose} title="Receive USDC">
      <div style={{ fontSize: 12, color: '#888', marginBottom: 16, lineHeight: 1.5 }}>
        Use this address to deposit USDC to Hyperliquid. Only <b>Arbitrum One</b> USDC is accepted.
      </div>

      {walletAddress ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div style={{ background: 'var(--bg)', padding: 12, borderRadius: 14, border: '1px solid rgba(0,217,146,0.2)' }}>
              <img src={qrUrl} alt="QR" width={240} height={240} style={{ display: 'block' }} />
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#666', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>ADRES</div>
            <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: '#fff', wordBreak: 'break-all', lineHeight: 1.5 }}>
              {walletAddress}
            </div>
          </div>

          <button onClick={copy}
            style={{
              width: '100%', padding: 14, borderRadius: 12, border: 'none',
              background: copied ? 'rgba(0,217,146,0.2)' : '#00d992',
              color: copied ? '#00d992' : '#000', fontSize: 14, fontWeight: 800,
              letterSpacing: 1, cursor: 'pointer',
            }}>
            {copied ? '✓ COPIED' : 'COPY ADDRESS'}
          </button>
        </>
      ) : (
        <div style={{ padding: '20px 0', textAlign: 'center', color: '#666', fontSize: 13 }}>
          Connect to Hyperliquid first
        </div>
      )}
    </Sheet>
  )
}

// ─── Swap: spot ↔ perp transfer
function SwapModal({ show, onClose, walletAddress, testnet, onDone }) {
  const { token } = useAuth()
  const { signTypedDataAsync } = useSignTypedData()
  const [toPerp, setToPerp] = useState(true)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState('idle')   // idle | preparing | signing | submitting
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { if (!show) { setAmount(''); setError(''); setSuccess(''); setBusy(false); setStep('idle') } }, [show])

  const submit = async () => {
    setError(''); setSuccess('')
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setError('Invalid amount'); return }
    if (!walletAddress) { setError('Wallet not connected'); return }
    setBusy(true); setStep('preparing')
    try {
      const prepRes = await fetch(`${API_BASE}/api/hl-transfer/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ main_wallet_address: walletAddress, amount: amt, to_perp: toPerp, testnet: !!testnet }),
      })
      const prep = await prepRes.json()
      if (!prep.ok) throw new Error(prep.error || 'prepare failed')

      setStep('signing')
      haptic('medium')
      const td = prep.typed_data
      const signature = await signTypedDataAsync({
        domain: td.domain, types: td.types, primaryType: td.primaryType, message: td.message,
      })

      setStep('submitting')
      const subRes = await fetch(`${API_BASE}/api/hl-transfer/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          main_wallet_address: walletAddress, testnet: !!testnet,
          action: prep.action, nonce: prep.nonce, signature,
        }),
      })
      const sub = await subRes.json()
      if (!sub.ok) throw new Error(sub.error || 'submit failed')

      haptic('heavy')
      setSuccess(`✓ ${amt} USDC transferred to ${toPerp ? 'Perp' : 'Spot'}`)
      setTimeout(() => { onDone?.(); onClose() }, 1200)
    } catch (e) {
      const msg = String(e.message || e)
      if (/reject|denied|user/i.test(msg)) setError('Signature rejected')
      else setError(msg)
    } finally {
      setBusy(false); if (step !== 'submitting') setStep('idle')
    }
  }

  const stepLabel = { idle: toPerp ? 'SPOT → PERP TRANSFER' : 'PERP → SPOT TRANSFER', preparing: 'PREPARING…', signing: 'WAITING FOR SIGNATURE…', submitting: 'SUBMITTING…' }[step]

  return (
    <Sheet show={show} onClose={onClose} title="Spot ⇄ Perp Transfer" busy={busy}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 14, lineHeight: 1.5 }}>
        Transfer USDC between Spot and Perp wallets on Hyperliquid. Requires a wallet signature.
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, background: 'var(--bg)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 4 }}>
        <button onClick={() => setToPerp(true)}
          style={{
            flex: 1, padding: 10, borderRadius: 8, border: 'none', cursor: 'pointer',
            background: toPerp ? 'rgba(0,217,146,0.15)' : 'transparent',
            color: toPerp ? '#00d992' : '#888', fontSize: 12, fontWeight: 700,
          }}>
          Spot → Perp
        </button>
        <button onClick={() => setToPerp(false)}
          style={{
            flex: 1, padding: 10, borderRadius: 8, border: 'none', cursor: 'pointer',
            background: !toPerp ? 'rgba(245,158,11,0.15)' : 'transparent',
            color: !toPerp ? '#f59e0b' : '#888', fontSize: 12, fontWeight: 700,
          }}>
          Perp → Spot
        </button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#666', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>AMOUNT (USDC)</div>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number" inputMode="decimal" placeholder="0.00"
          style={{
            width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '12px 14px', color: '#fff',
            fontSize: 18, fontWeight: 700, fontFamily: 'var(--mono)', boxSizing: 'border-box',
          }}
        />
      </div>

      {error && <div style={{ background: 'rgba(255,59,92,0.1)', border: '1px solid rgba(255,59,92,0.3)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#ff3b5c', marginBottom: 12 }}>{error}</div>}
      {success && <div style={{ background: 'rgba(0,217,146,0.1)', border: '1px solid rgba(0,217,146,0.3)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#00d992', marginBottom: 12 }}>{success}</div>}

      <button onClick={submit} disabled={busy}
        style={{
          width: '100%', padding: 14, borderRadius: 12, border: 'none',
          background: busy ? '#1a1c25' : '#00d992', color: busy ? '#4e4d49' : '#000',
          fontSize: 13, fontWeight: 800, letterSpacing: 1, cursor: busy ? 'wait' : 'pointer',
        }}>
        {stepLabel}
      </button>
    </Sheet>
  )
}

function StatBox({ label, value, color, prefix = '' }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: '#666', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4, color: color || '#fff', fontFamily: 'var(--mono)' }}>
        {prefix}{value}
      </div>
    </div>
  )
}

function PerfRow({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 12 }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ fontWeight: 700, color: valueColor || '#fff', fontFamily: 'var(--mono)' }}>{value}</span>
    </div>
  )
}

function formatHold(mins) {
  if (mins == null) return '—'
  if (mins < 60) return `${mins.toFixed(0)}m`
  const h = mins / 60
  if (h < 24) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

function ActionButton({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 0',
      }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%',
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#ddd' }}>{label}</span>
    </button>
  )
}

export default function PortfolioScreen() {
  const { token } = useAuth()
  const { address: walletAddress } = useAccount()
  const [portfolio, setPortfolio] = useState(null)
  const [trades, setTrades]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [range, setRange]         = useState('1Y')
  const [tab, setTab]             = useState('positions')
  const [error, setError]         = useState('')
  const [showSend, setShowSend]   = useState(false)
  const [showRecv, setShowRecv]   = useState(false)
  const [showSwap, setShowSwap]   = useState(false)

  // HL session info for swap modal
  const [hlTestnet, setHlTestnet] = useState(false)
  useEffect(() => {
    secureGet('tt_hl_agent_v1').then(saved => {
      if (saved?.testnet) setHlTestnet(true)
    }).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    if (!token) return
    setError('')
    try {
      const [pfRes, thRes] = await Promise.all([
        fetch(`${API_BASE}/api/portfolio`,     { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/api/trade-history`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (pfRes.ok) setPortfolio(await pfRes.json())
      if (thRes.ok) {
        const th = await thRes.json()
        setTrades(Array.isArray(th.trades) ? th.trades : [])
      }
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  const totalEquity   = portfolio?.balance ?? portfolio?.balance_total ?? 0
  const available     = portfolio?.available ?? portfolio?.balance_available ?? totalEquity
  const marginUsed    = portfolio?.margin_used ?? null
  const realizedPnl   = portfolio?.realized_pnl   ?? 0
  const unrealizedPnl = portfolio?.unrealized_pnl ?? 0
  const netPnlNow     = portfolio?.net_pnl_now ?? (realizedPnl + unrealizedPnl)
  const hlConnected   = portfolio?.source === 'hyperliquid'
  const hlWallet      = portfolio?.hl_wallet || walletAddress || ''
  const positions     = Array.isArray(portfolio?.positions) ? portfolio.positions : []
  const mode          = portfolio?.mode || 'PAPER'
  const source        = portfolio?.source || 'paper'

  // HL metrics — backend already computes these; just show them transparently.
  const tradeCount    = portfolio?.trade_count ?? null
  const winCount      = portfolio?.win_count ?? null
  const lossCount     = portfolio?.loss_count ?? null
  const breakevenCount = portfolio?.breakeven_count ?? null
  const winRate       = portfolio?.win_rate ?? null
  const avgWin        = portfolio?.avg_win ?? null
  const avgLoss       = portfolio?.avg_loss ?? null
  const bestTrade     = portfolio?.best_trade ?? null
  const worstTrade    = portfolio?.worst_trade ?? null
  const profitFactor  = portfolio?.profit_factor ?? null
  const expectancy    = portfolio?.expectancy ?? null
  const avgHoldMin    = portfolio?.avg_hold_minutes ?? null
  const totalFees     = portfolio?.total_fees ?? null
  const fundingClosed = portfolio?.funding_closed ?? null
  const pnlWindows    = portfolio?.pnl_windows || {}

  // Resolve PnL series for the selected range from HL pnl_windows.
  const rangeWindowKey = RANGES.find(r => r.key === range)?.windowKey || 'all'
  const equityPoints = useMemo(() => {
    const series = pnlWindows[rangeWindowKey] || pnlWindows.all || portfolio?.pnl_history || []
    return pnlSeriesToPoints(series)
  }, [pnlWindows, rangeWindowKey, portfolio?.pnl_history])

  // Range %change relative to start of selected window (real HL data)
  const rangePnl = equityPoints.length > 0
    ? equityPoints[equityPoints.length - 1].y - equityPoints[0].y
    : netPnlNow
  const rangeBase = Math.max(Math.abs(totalEquity - rangePnl), 1)
  const rangePct  = (rangePnl / rangeBase) * 100
  const isUp      = rangePnl >= 0

  if (loading) {
    return (
      <div style={{ padding: 80, textAlign: 'center' }}>
        <div style={{ fontSize: 28, animation: 'm-spin 1s linear infinite', display: 'inline-block', color: '#666' }}>◌</div>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', color: 'var(--text)', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>Portfolio</div>
        <span style={{
          fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: '3px 8px', borderRadius: 12,
          background: source === 'hyperliquid' ? 'rgba(0,217,146,0.15)' : 'rgba(245,158,11,0.15)',
          color: source === 'hyperliquid' ? '#00d992' : '#f59e0b',
        }}>
          {source === 'hyperliquid' ? `HL · ${mode}` : 'PAPER'}
        </span>
      </div>
      {hlWallet && (
        <div
          onClick={() => { navigator.clipboard?.writeText(hlWallet).catch(() => {}); haptic('light') }}
          style={{ padding: '0 20px 4px', fontSize: 11, color: '#666', fontFamily: 'var(--mono)', cursor: 'pointer' }}
          title="Tap to copy"
        >
          {shortAddr(hlWallet)} <span style={{ color: '#444' }}>·</span> <span style={{ color: '#555' }}>tap to copy</span>
        </div>
      )}

      {/* Total balance */}
      <div style={{ padding: '0 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#666', marginTop: 12 }}>
          TOTAL EQUITY
        </div>
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1.4, marginTop: 4 }}>
          {fmtUsd(totalEquity)}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: isUp ? '#00d992' : '#ff3b5c', fontFamily: 'var(--mono)' }}>
            {isUp ? '+' : ''}{fmtUsd(rangePnl)}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: isUp ? '#00d992' : '#ff3b5c' }}>
            ({isUp ? '+' : ''}{rangePct.toFixed(2)}%)
          </span>
          <span style={{ fontSize: 12, color: '#666', marginLeft: 'auto' }}>{range}</span>
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: 160, marginTop: 20, padding: '0 8px' }}>
        <EquityChart points={equityPoints} isUp={isUp} />
      </div>

      {/* Range selector */}
      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '12px 30px 20px', color: '#666', fontSize: 12, fontWeight: 700 }}>
        {RANGES.map(r => (
          <span key={r.key}
            onClick={() => { haptic('light'); setRange(r.key) }}
            style={{
              padding: '4px 14px', borderRadius: 14,
              background: range === r.key ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: range === r.key ? '#fff' : '#666', cursor: 'pointer',
            }}>
            {r.label}
          </span>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', padding: '4px 24px 24px', gap: 8 }}>
        <ActionButton icon={<IconUp />}      label="Send"    onClick={() => {
          haptic('light')
          if (!hlConnected) { setError('Connect to Hyperliquid first'); return }
          setShowSend(true)
        }} />
        <ActionButton icon={<IconDown />}    label="Receive" onClick={() => {
          haptic('light')
          if (!hlWallet) { setError('Connect wallet first'); return }
          setShowRecv(true)
        }} />
        <ActionButton icon={<IconSwap />}    label="Swap"    onClick={() => {
          haptic('light')
          if (!hlConnected) { setError('Connect to Hyperliquid first'); return }
          setShowSwap(true)
        }} />
        <ActionButton icon={<IconHistory />} label="History" onClick={() => { haptic('light'); setTab('history') }} />
      </div>

      {/* Stats grid */}
      <div style={{ padding: '0 20px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <StatBox label="Realized PnL"  value={fmtUsd(realizedPnl)}   color={realizedPnl >= 0 ? '#00d992' : '#ff3b5c'} prefix={realizedPnl >= 0 ? '+' : ''} />
        <StatBox label="Unrealized"    value={fmtUsd(unrealizedPnl)} color={unrealizedPnl >= 0 ? '#00d992' : '#ff3b5c'} prefix={unrealizedPnl >= 0 ? '+' : ''} />
        <StatBox label="Available"     value={fmtUsd(available)} />
        <StatBox label="Margin Used"   value={marginUsed != null ? fmtUsd(marginUsed) : '—'} />
        {hlConnected && totalFees != null && (
          <StatBox label="Total Fees" value={fmtUsd(totalFees)} color="#ff3b5c" prefix="−" />
        )}
        {hlConnected && fundingClosed != null && (
          <StatBox label="Funding (Closed)" value={fmtUsd(fundingClosed)} color={fundingClosed >= 0 ? '#00d992' : '#ff3b5c'} prefix={fundingClosed >= 0 ? '+' : ''} />
        )}
      </div>

      {/* Performance metrics — only when HL has computed values */}
      {hlConnected && (tradeCount != null && tradeCount > 0) && (
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: '#666', marginBottom: 8 }}>PERFORMANCE</div>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px' }}>
            <PerfRow label="Trades" value={`${tradeCount}${winCount != null ? ` (${winCount}W / ${lossCount || 0}L${breakevenCount ? ` / ${breakevenCount}BE` : ''})` : ''}`} />
            {winRate != null  && <PerfRow label="Win Rate"      value={`${winRate.toFixed(1)}%`} valueColor={winRate >= 50 ? '#00d992' : '#ff3b5c'} />}
            {profitFactor != null && <PerfRow label="Profit Factor" value={profitFactor.toFixed(2)} valueColor={profitFactor >= 1 ? '#00d992' : '#ff3b5c'} />}
            {expectancy != null && <PerfRow label="Expectancy"   value={`${expectancy >= 0 ? '+' : ''}${fmtUsd(expectancy)}`} valueColor={expectancy >= 0 ? '#00d992' : '#ff3b5c'} />}
            {avgWin != null   && <PerfRow label="Avg Win"        value={`+${fmtUsd(avgWin)}`}  valueColor="#00d992" />}
            {avgLoss != null  && <PerfRow label="Avg Loss"       value={fmtUsd(avgLoss)}       valueColor="#ff3b5c" />}
            {bestTrade != null  && <PerfRow label="Best Trade"   value={`+${fmtUsd(bestTrade)}`}  valueColor="#00d992" />}
            {worstTrade != null && <PerfRow label="Worst Trade"  value={fmtUsd(worstTrade)}       valueColor="#ff3b5c" />}
            {avgHoldMin != null && <PerfRow label="Avg Hold"     value={formatHold(avgHoldMin)} />}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ padding: '0 20px', display: 'flex', gap: 16, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        {[
          { key: 'positions', label: `Positions (${positions.length})` },
          { key: 'history',   label: `History (${trades.length})` },
        ].map(t => (
          <button key={t.key}
            onClick={() => { haptic('light'); setTab(t.key) }}
            style={{
              background: 'transparent', border: 'none', padding: '12px 0',
              borderBottom: tab === t.key ? '2px solid #00d992' : '2px solid transparent',
              color: tab === t.key ? '#fff' : '#666',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: '12px 20px' }}>
        {error && (
          <div style={{ background: 'rgba(255,59,92,0.1)', border: '1px solid rgba(255,59,92,0.3)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#ff3b5c', marginBottom: 12 }}>
            {error}
          </div>
        )}

        {tab === 'positions' && (
          positions.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: '#666', fontSize: 13 }}>
              No open positions
            </div>
          ) : positions.map((p, i) => {
            const sym = (p.symbol || '').replace(/USDT$/i, '')
            const sideUp = (p.side || '').toLowerCase() === 'long'
            return (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12, padding: '12px 14px', marginBottom: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--mono)' }}>{sym}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                      background: sideUp ? 'rgba(0,217,146,0.12)' : 'rgba(255,59,92,0.12)',
                      color: sideUp ? '#00d992' : '#ff3b5c', letterSpacing: 0.5,
                    }}>
                      {sideUp ? 'LONG' : 'SHORT'} · {p.leverage || 1}x
                    </span>
                  </div>
                  <span style={{
                    fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)',
                    color: (p.unrealized_pnl || 0) >= 0 ? '#00d992' : '#ff3b5c',
                  }}>
                    {(p.unrealized_pnl || 0) >= 0 ? '+' : ''}{fmtUsd(p.unrealized_pnl)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888', fontFamily: 'var(--mono)' }}>
                  <span>Entry: ${fmtNum(p.entry_price, 2)}</span>
                  <span>Now: ${fmtNum(p.current_price, 2)}</span>
                  <span>{((p.unrealized_pnl_pct || 0) >= 0 ? '+' : '')}{(p.unrealized_pnl_pct || 0).toFixed(2)}%</span>
                </div>
              </div>
            )
          })
        )}

        {tab === 'history' && (
          trades.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: '#666', fontSize: 13 }}>
              No trade history yet
            </div>
          ) : trades.slice(0, 50).map((t, i) => {
            const sym = (t.symbol || '').replace(/USDT$/i, '')
            const sideUp = (t.side || '').toLowerCase() === 'long' || (t.side || '').toLowerCase() === 'buy'
            const pnl = Number(t.realized_pnl ?? t.pnl ?? 0)
            const pnlUp = pnl >= 0
            return (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: sideUp ? 'rgba(0,217,146,0.12)' : 'rgba(255,59,92,0.12)',
                    color: sideUp ? '#00d992' : '#ff3b5c',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 800,
                  }}>
                    {sideUp ? '↑' : '↓'}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)' }}>
                      {sym} {sideUp ? 'LONG' : 'SHORT'}
                    </div>
                    <div style={{ fontSize: 10, color: '#666', fontFamily: 'var(--mono)' }}>
                      {timeAgo(t.closed_at || t.timestamp || t.ts)} · qty {fmtNum(t.quantity, 4)}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: pnlUp ? '#00d992' : '#ff3b5c', fontFamily: 'var(--mono)' }}>
                    {pnlUp ? '+' : ''}{fmtUsd(pnl)}
                  </div>
                  {t.fee != null && (
                    <div style={{ fontSize: 10, color: '#666', fontFamily: 'var(--mono)' }}>
                      fee {fmtUsd(Number(t.fee))}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      <SendModal    show={showSend} onClose={() => setShowSend(false)} available={available} onSent={load} />
      <ReceiveModal show={showRecv} onClose={() => setShowRecv(false)} walletAddress={hlWallet} />
      <SwapModal    show={showSwap} onClose={() => setShowSwap(false)} walletAddress={walletAddress} testnet={hlTestnet} onDone={load} />
    </div>
  )
}
