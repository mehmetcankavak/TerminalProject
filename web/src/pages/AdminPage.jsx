import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'

function fmtMoney(n) {
  if (n == null) return '—'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'
  return '$' + n.toLocaleString()
}

function StatCard({ label, value, sub, accent, warn }) {
  const color = accent ? '#00e87a' : warn ? '#f59e0b' : null
  return (
    <div className={`adm2-stat ${accent ? 'accent' : warn ? 'warn' : ''}`}>
      <div className="adm2-stat-label">{label}</div>
      <div className="adm2-stat-val" style={color ? { color } : {}}>{value}</div>
      {sub && <div className="adm2-stat-sub">{sub}</div>}
    </div>
  )
}

function GrowthChart({ data }) {
  if (!data || data.length === 0)
    return <div className="adm2-chart-empty">No signups in the last 30 days</div>
  const maxVal = Math.max(...data.map(d => d.total), 1)
  const W = 560, H = 80, gap = 2
  const barW = Math.max(5, Math.floor(W / data.length) - gap)
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 16}`} preserveAspectRatio="none" className="adm2-chart-svg">
      <defs>
        <linearGradient id="admFreeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00e87a" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#00e87a" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id="admProGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00e87a" stopOpacity="1" />
          <stop offset="100%" stopColor="#00e87a" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      {data.map((d, i) => {
        const totalH = Math.max(2, (d.total / maxVal) * H)
        const proH   = Math.max(0, (d.pro / maxVal) * H)
        const x      = i * (barW + gap)
        return (
          <g key={d.day}>
            <rect x={x} y={H - totalH} width={barW} height={totalH} fill="url(#admFreeGrad)" rx="2" />
            {proH > 0 && <rect x={x} y={H - proH} width={barW} height={proH} fill="url(#admProGrad)" rx="2" />}
            <title>{d.day}: {d.total} total, {d.pro} pro</title>
          </g>
        )
      })}
    </svg>
  )
}

export default function AdminPage() {
  const { token, isAdmin } = useAuth()
  const [stats,           setStats]           = useState(null)
  const [users,           setUsers]           = useState([])
  const [growth,          setGrowth]          = useState([])
  const [recent,          setRecent]          = useState([])
  const [pendingPayments, setPendingPayments] = useState([])
  const [paymentsHistory, setPaymentsHistory] = useState([])
  const [loading,              setLoading]              = useState(true)
  const [planLoading,          setPlanLoading]          = useState(null)
  const [paymentsLoading,      setPaymentsLoading]      = useState(false)
  const [paymentActionLoading, setPaymentActionLoading] = useState(null)
  const [paymentMsg,           setPaymentMsg]           = useState('')
  const [search,  setSearch]  = useState('')
  const [tab,     setTab]     = useState('overview')

  const headers = { Authorization: `Bearer ${token}` }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, uRes, gRes, rRes, pRes, hRes] = await Promise.all([
        fetch(`${API_BASE}/admin/stats`,                      { headers }),
        fetch(`${API_BASE}/admin/users`,                      { headers }),
        fetch(`${API_BASE}/admin/growth`,                     { headers }),
        fetch(`${API_BASE}/admin/recent`,                     { headers }),
        fetch(`${API_BASE}/billing/crypto/pending`,           { headers }),
        fetch(`${API_BASE}/billing/crypto/history?limit=100`, { headers }),
      ])
      if (sRes.ok) setStats(await sRes.json())
      if (uRes.ok) setUsers(await uRes.json())
      if (gRes.ok) setGrowth(await gRes.json())
      if (rRes.ok) setRecent(await rRes.json())
      if (pRes.ok) { const d = await pRes.json(); setPendingPayments(Array.isArray(d.payments) ? d.payments : []) }
      if (hRes.ok) { const d = await hRes.json(); setPaymentsHistory(Array.isArray(d.payments) ? d.payments : []) }
    } finally { setLoading(false) }
  }, [token])

  useEffect(() => { fetchAll() }, [fetchAll])

  const togglePlan = async (user) => {
    const newPlan = user.plan === 'pro' ? 'free' : 'pro'
    setPlanLoading(user.id)
    try {
      await fetch(`${API_BASE}/admin/users/${user.id}/plan`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: newPlan }),
      })
      setUsers(u => u.map(x => x.id === user.id ? { ...x, plan: newPlan } : x))
      if (stats) {
        const delta  = newPlan === 'pro' ? 1 : -1
        const newPro = stats.pro_users + delta
        setStats(s => ({
          ...s,
          pro_users:       newPro,
          free_users:      s.free_users - delta,
          mrr_usd:         newPro * s.plan_price_usd,
          arr_usd:         newPro * s.plan_price_usd * 12,
          conversion_rate: Math.round(newPro / s.total_users * 1000) / 10,
        }))
      }
    } finally { setPlanLoading(null) }
  }

  const exportCSV = () => {
    fetch(`${API_BASE}/admin/users/export.csv`, { headers })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'users.csv'; a.click()
        URL.revokeObjectURL(url)
      })
  }

  const fetchPendingPayments = useCallback(async () => {
    setPaymentsLoading(true); setPaymentMsg('')
    try {
      const res = await fetch(`${API_BASE}/billing/crypto/pending`, { headers })
      if (!res.ok) throw new Error('Failed to load pending payments')
      const data = await res.json()
      setPendingPayments(Array.isArray(data.payments) ? data.payments : [])
    } catch (e) { setPaymentMsg(e.message || 'Failed') }
    finally { setPaymentsLoading(false) }
  }, [token])

  const fetchPaymentHistory = useCallback(async () => {
    setPaymentsLoading(true); setPaymentMsg('')
    try {
      const res = await fetch(`${API_BASE}/billing/crypto/history?limit=100`, { headers })
      if (!res.ok) throw new Error('Failed to load history')
      const data = await res.json()
      setPaymentsHistory(Array.isArray(data.payments) ? data.payments : [])
    } catch (e) { setPaymentMsg(e.message || 'Failed') }
    finally { setPaymentsLoading(false) }
  }, [token])

  const handleVerifyPayment = async (paymentId) => {
    setPaymentActionLoading(`verify-${paymentId}`); setPaymentMsg('')
    try {
      const res  = await fetch(`${API_BASE}/billing/crypto/verify/${paymentId}`, { method: 'POST', headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Verification failed')
      setPaymentMsg(`✓ Payment #${paymentId} verified. User upgraded/extended.`)
      await fetchPendingPayments(); await fetchPaymentHistory(); await fetchAll()
    } catch (e) { setPaymentMsg(e.message || 'Verification failed') }
    finally { setPaymentActionLoading(null) }
  }

  const handleRejectPayment = async (paymentId) => {
    if (!window.confirm(`Reject payment #${paymentId}?`)) return
    setPaymentActionLoading(`reject-${paymentId}`); setPaymentMsg('')
    try {
      const res  = await fetch(`${API_BASE}/billing/crypto/reject/${paymentId}`, { method: 'POST', headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Reject failed')
      setPaymentMsg(`Payment #${paymentId} rejected.`)
      await fetchPendingPayments(); await fetchPaymentHistory()
    } catch (e) { setPaymentMsg(e.message || 'Reject failed') }
    finally { setPaymentActionLoading(null) }
  }

  const copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); setPaymentMsg('✓ Copied') }
    catch { setPaymentMsg('Clipboard copy failed') }
  }

  const chainExplorerUrl = (chain, txHash) => {
    if (!txHash) return ''
    switch ((chain || '').toLowerCase()) {
      case 'erc20':    return `https://etherscan.io/tx/${txHash}`
      case 'bsc':      return `https://bscscan.com/tx/${txHash}`
      case 'arbitrum': return `https://arbiscan.io/tx/${txHash}`
      case 'solana':   return `https://solscan.io/tx/${txHash}`
      case 'tron':     return `https://tronscan.org/#/transaction/${txHash}`
      default:         return ''
    }
  }

  if (!isAdmin) {
    return (
      <div className="adm2-forbidden">
        <div className="adm2-forbidden-icon">🔒</div>
        <div className="adm2-forbidden-text">Admin access required</div>
      </div>
    )
  }

  const filtered = users.filter(u => u.email.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="adm2-page">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="adm2-header">
        <div className="adm2-header-left">
          <div className="adm2-header-badge">ADMIN</div>
          <div>
            <div className="adm2-header-title">Admin Panel</div>
            <div className="adm2-header-sub">Trading Tools · Internal Dashboard</div>
          </div>
        </div>
        <div className="adm2-header-actions">
          <button className="adm2-btn secondary" onClick={exportCSV}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            CSV Export
          </button>
          <button className="adm2-btn primary" onClick={fetchAll} disabled={loading}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="adm2-loading">
          <div className="adm2-loading-spinner" />
          <span>Loading dashboard…</span>
        </div>
      ) : (
        <>
          {/* ── Stats Grid ────────────────────────────────────────── */}
          <div className="adm2-stats-grid">
            <StatCard label="Total Users"     value={stats?.total_users ?? '—'} />
            <StatCard label="Pro Users"       value={stats?.pro_users ?? '—'}   accent sub={`+${stats?.new_pro_30d ?? 0} this month`} />
            <StatCard label="Free Users"      value={stats?.free_users ?? '—'} />
            <StatCard label="Conversion"      value={`${stats?.conversion_rate ?? 0}%`} accent sub="free → pro" />
            <StatCard label="MRR"             value={fmtMoney(stats?.mrr_usd)}  accent sub={`${fmtMoney(stats?.arr_usd)} ARR`} />
            <StatCard label="Plan Price"      value={`$${stats?.plan_price_usd ?? 29}/mo`} />
            <StatCard label="New Users (30d)" value={stats?.new_users_30d ?? '—'} sub={`+${stats?.new_pro_30d ?? 0} pro`} />
            <StatCard label="Active Alerts"   value={stats?.total_alerts ?? '—'} />
            <StatCard
              label="Pending Crypto"
              value={pendingPayments.length}
              warn={pendingPayments.length > 0}
              sub={pendingPayments.length > 0 ? 'Needs verification' : 'All caught up'}
            />
          </div>

          {/* ── Tabs ──────────────────────────────────────────────── */}
          <div className="adm2-tabs">
            <button className={`adm2-tab ${tab === 'overview'  ? 'active' : ''}`} onClick={() => setTab('overview')}>
              Overview
            </button>
            <button className={`adm2-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
              Users <span className="adm2-tab-count">{users.length}</span>
            </button>
            <button
              className={`adm2-tab ${tab === 'payments' ? 'active' : ''} ${pendingPayments.length > 0 ? 'has-badge' : ''}`}
              onClick={() => { setTab('payments'); fetchPendingPayments(); fetchPaymentHistory() }}
            >
              Crypto Payments
              {pendingPayments.length > 0 && <span className="adm2-tab-alert">{pendingPayments.length}</span>}
            </button>
          </div>

          {/* ── Overview Tab ──────────────────────────────────────── */}
          {tab === 'overview' && (
            <div className="adm2-tab-content">
              <div className="adm2-overview-grid">
                {/* Growth Chart */}
                <div className="adm2-card adm2-chart-card">
                  <div className="adm2-card-hdr">
                    <span className="adm2-section-label">USER GROWTH · 30 DAYS</span>
                    <div className="adm2-legend">
                      <span className="adm2-legend-dot pro" />
                      <span>Pro</span>
                      <span className="adm2-legend-dot free" />
                      <span>Free</span>
                    </div>
                  </div>
                  <div className="adm2-chart-wrap">
                    <GrowthChart data={growth} />
                  </div>
                  <div className="adm2-chart-axis">
                    {growth.length > 0 && (
                      <>
                        <span>{growth[0]?.day?.slice(5)}</span>
                        <span>{growth[Math.floor(growth.length / 2)]?.day?.slice(5)}</span>
                        <span>{growth[growth.length - 1]?.day?.slice(5)}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Revenue KPIs */}
                <div className="adm2-card adm2-kpi-card">
                  <div className="adm2-card-hdr">
                    <span className="adm2-section-label">REVENUE</span>
                  </div>
                  <div className="adm2-kpi-list">
                    <div className="adm2-kpi-row">
                      <span className="adm2-kpi-lbl">Monthly Recurring</span>
                      <span className="adm2-kpi-val accent">{fmtMoney(stats?.mrr_usd)}</span>
                    </div>
                    <div className="adm2-kpi-row">
                      <span className="adm2-kpi-lbl">Annual Run Rate</span>
                      <span className="adm2-kpi-val accent">{fmtMoney(stats?.arr_usd)}</span>
                    </div>
                    <div className="adm2-kpi-divider" />
                    <div className="adm2-kpi-row">
                      <span className="adm2-kpi-lbl">Pro Subscribers</span>
                      <span className="adm2-kpi-val">{stats?.pro_users ?? '—'}</span>
                    </div>
                    <div className="adm2-kpi-row">
                      <span className="adm2-kpi-lbl">Plan Price</span>
                      <span className="adm2-kpi-val">${stats?.plan_price_usd ?? 29}/mo</span>
                    </div>
                    <div className="adm2-kpi-row">
                      <span className="adm2-kpi-lbl">Conversion Rate</span>
                      <span className="adm2-kpi-val accent">{stats?.conversion_rate ?? 0}%</span>
                    </div>
                    <div className="adm2-kpi-divider" />
                    <div className="adm2-kpi-row">
                      <span className="adm2-kpi-lbl">New Users (30d)</span>
                      <span className="adm2-kpi-val">{stats?.new_users_30d ?? '—'}</span>
                    </div>
                    <div className="adm2-kpi-row">
                      <span className="adm2-kpi-lbl">New Pro (30d)</span>
                      <span className="adm2-kpi-val accent">+{stats?.new_pro_30d ?? 0}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Signups */}
              <div className="adm2-card">
                <div className="adm2-card-hdr">
                  <span className="adm2-section-label">RECENT SIGNUPS</span>
                  <span className="adm2-section-count">{recent.length}</span>
                </div>
                <div className="adm2-table-wrap">
                  <table className="adm2-table">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Plan</th>
                        <th>Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map(u => (
                        <tr key={u.id}>
                          <td className="adm2-cell-email">{u.email}</td>
                          <td><span className={`adm2-badge ${u.plan}`}>{u.plan.toUpperCase()}</span></td>
                          <td className="adm2-cell-mono">{u.created_at?.slice(0, 16).replace('T', ' ')}</td>
                        </tr>
                      ))}
                      {recent.length === 0 && (
                        <tr><td colSpan={3} className="adm2-empty-cell">No users yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Users Tab ─────────────────────────────────────────── */}
          {tab === 'users' && (
            <div className="adm2-tab-content">
              <div className="adm2-card">
                <div className="adm2-card-hdr">
                  <span className="adm2-section-label">ALL USERS <span className="adm2-section-count">{filtered.length}</span></span>
                  <input
                    className="adm2-search"
                    placeholder="Search by email…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <div className="adm2-table-wrap">
                  <table className="adm2-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Email</th>
                        <th>Plan</th>
                        <th>Joined</th>
                        <th>Stripe</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(u => (
                        <tr key={u.id}>
                          <td className="adm2-cell-id">#{u.id}</td>
                          <td className="adm2-cell-email">{u.email}</td>
                          <td><span className={`adm2-badge ${u.plan}`}>{u.plan.toUpperCase()}</span></td>
                          <td className="adm2-cell-mono">{u.created_at?.slice(0, 10)}</td>
                          <td className="adm2-cell-mono">
                            {u.stripe_customer_id
                              ? <span className="adm2-stripe-id">{u.stripe_customer_id}</span>
                              : <span className="adm2-null">—</span>}
                          </td>
                          <td>
                            <button
                              className={`adm2-action-btn ${u.plan === 'pro' ? 'downgrade' : 'upgrade'}`}
                              onClick={() => togglePlan(u)}
                              disabled={planLoading === u.id}
                            >
                              {planLoading === u.id ? '…' : u.plan === 'pro' ? '↓ Free' : '↑ Pro'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length === 0 && <div className="adm2-empty">No users found</div>}
                </div>
              </div>
            </div>
          )}

          {/* ── Payments Tab ──────────────────────────────────────── */}
          {tab === 'payments' && (
            <div className="adm2-tab-content">
              {/* Pending */}
              <div className="adm2-card">
                <div className="adm2-card-hdr">
                  <div className="adm2-card-hdr-left">
                    <span className="adm2-section-label">PENDING CRYPTO PAYMENTS</span>
                    {pendingPayments.length > 0 && (
                      <span className="adm2-pending-alert">{pendingPayments.length} need action</span>
                    )}
                  </div>
                  <button
                    className="adm2-btn secondary"
                    onClick={() => { fetchPendingPayments(); fetchPaymentHistory() }}
                    disabled={paymentsLoading}
                  >
                    {paymentsLoading ? 'Loading…' : '↻ Refresh'}
                  </button>
                </div>

                <div className="adm2-payments-help">
                  Verify only after confirming destination wallet, chain/token, and amount match.
                </div>

                {paymentMsg && (
                  <div className={`adm2-payments-msg ${paymentMsg.startsWith('✓') ? 'ok' : 'err'}`}>
                    {paymentMsg}
                  </div>
                )}

                <div className="adm2-table-wrap">
                  <table className="adm2-table adm2-table-payments">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>User</th>
                        <th>Plan</th>
                        <th>Network</th>
                        <th>Amount</th>
                        <th>Tx Hash</th>
                        <th>Wallet</th>
                        <th>Submitted</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingPayments.map(p => {
                        const explorer = chainExplorerUrl(p.chain, p.tx_hash)
                        return (
                          <tr key={p.id} className="adm2-row-pending">
                            <td className="adm2-cell-id">#{p.id}</td>
                            <td>
                              <div className="adm2-cell-email">{p.email}</div>
                              <div className="adm2-cell-id">UID: {p.user_id}</div>
                            </td>
                            <td>
                              <span className={`adm2-badge ${p.plan === 'yearly' ? 'pro' : 'free'}`}>
                                {String(p.plan || '').toUpperCase()}
                              </span>
                            </td>
                            <td className="adm2-cell-network">
                              <span className="adm2-chain">{String(p.chain || '').toUpperCase()}</span>
                              <span className="adm2-token">{p.token}</span>
                            </td>
                            <td className="adm2-cell-amount">${p.amount} <span className="adm2-token">{p.token}</span></td>
                            <td className="adm2-cell-hash">
                              <div className="adm2-hash-row">
                                <button className="adm2-copy-btn" onClick={() => copyText(p.tx_hash)}>Copy</button>
                                {explorer && <a className="adm2-link" href={explorer} target="_blank" rel="noreferrer">↗ View</a>}
                              </div>
                              <span className="adm2-hash-preview">{p.tx_hash?.slice(0, 18)}…</span>
                            </td>
                            <td className="adm2-cell-hash">
                              <div className="adm2-hash-row">
                                <button className="adm2-copy-btn" onClick={() => copyText(p.wallet_address)}>Copy</button>
                              </div>
                              <span className="adm2-hash-preview">{p.wallet_address?.slice(0, 18)}…</span>
                            </td>
                            <td className="adm2-cell-mono">{String(p.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                            <td>
                              <div className="adm2-pay-actions">
                                <button
                                  className="adm2-action-btn upgrade"
                                  onClick={() => handleVerifyPayment(p.id)}
                                  disabled={!!paymentActionLoading}
                                >
                                  {paymentActionLoading === `verify-${p.id}` ? '…' : '✓ Verify'}
                                </button>
                                <button
                                  className="adm2-action-btn downgrade"
                                  onClick={() => handleRejectPayment(p.id)}
                                  disabled={!!paymentActionLoading}
                                >
                                  {paymentActionLoading === `reject-${p.id}` ? '…' : '✕ Reject'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {pendingPayments.length === 0 && <div className="adm2-empty">No pending crypto payments.</div>}
                </div>
              </div>

              {/* History */}
              <div className="adm2-card" style={{ marginTop: 16 }}>
                <div className="adm2-card-hdr">
                  <span className="adm2-section-label">PAYMENT HISTORY <span className="adm2-section-count">{paymentsHistory.length}</span></span>
                </div>
                <div className="adm2-table-wrap">
                  <table className="adm2-table adm2-table-payments">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>User</th>
                        <th>Status</th>
                        <th>Plan</th>
                        <th>Network</th>
                        <th>Amount</th>
                        <th>Tx Hash</th>
                        <th>Created</th>
                        <th>Verified At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentsHistory.map(p => {
                        const explorer = chainExplorerUrl(p.chain, p.tx_hash)
                        return (
                          <tr key={`hist-${p.id}`}>
                            <td className="adm2-cell-id">#{p.id}</td>
                            <td>
                              <div className="adm2-cell-email">{p.email}</div>
                              <div className="adm2-cell-id">UID: {p.user_id}</div>
                            </td>
                            <td>
                              <span className={`adm2-status-badge ${p.status === 'verified' ? 'ok' : 'err'}`}>
                                {String(p.status || '').toUpperCase()}
                              </span>
                            </td>
                            <td className="adm2-cell-mono">{String(p.plan || '').toUpperCase()}</td>
                            <td className="adm2-cell-network">
                              <span className="adm2-chain">{String(p.chain || '').toUpperCase()}</span>
                              <span className="adm2-token">{p.token}</span>
                            </td>
                            <td className="adm2-cell-amount">${p.amount} <span className="adm2-token">{p.token}</span></td>
                            <td className="adm2-cell-hash">
                              <div className="adm2-hash-row">
                                <button className="adm2-copy-btn" onClick={() => copyText(p.tx_hash)}>Copy</button>
                                {explorer && <a className="adm2-link" href={explorer} target="_blank" rel="noreferrer">↗ View</a>}
                              </div>
                              <span className="adm2-hash-preview">{p.tx_hash?.slice(0, 18)}…</span>
                            </td>
                            <td className="adm2-cell-mono">{String(p.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                            <td className="adm2-cell-mono">
                              {p.verified_at ? String(p.verified_at).slice(0, 16).replace('T', ' ') : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {paymentsHistory.length === 0 && <div className="adm2-empty">No verified/rejected payments yet.</div>}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
