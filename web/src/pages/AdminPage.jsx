import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'

function StatCard({ label, value, sub, color, small }) {
  return (
    <div className="adm-stat-card">
      <div className="adm-stat-label">{label}</div>
      <div className="adm-stat-value" style={{ color: color || 'var(--text-primary)', fontSize: small ? 20 : 26 }}>{value}</div>
      {sub && <div className="adm-stat-sub">{sub}</div>}
    </div>
  )
}

function GrowthChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="adm-chart-empty">No signups in the last 30 days</div>
  }
  const maxVal = Math.max(...data.map(d => d.total), 1)
  const barW = Math.max(6, Math.floor(560 / data.length) - 2)
  return (
    <svg width="100%" viewBox="0 0 580 80" className="adm-chart-svg">
      {data.map((d, i) => {
        const h = Math.max(2, (d.total / maxVal) * 65)
        const proH = Math.max(0, (d.pro / maxVal) * 65)
        const x = i * (barW + 2) + 10
        return (
          <g key={d.day}>
            <rect x={x} y={80 - h - 10} width={barW} height={h} fill="rgba(0,217,146,0.2)" rx="2" />
            {proH > 0 && <rect x={x} y={80 - proH - 10} width={barW} height={proH} fill="#00d992" rx="2" />}
            <title>{d.day}: {d.total} signups ({d.pro} pro)</title>
          </g>
        )
      })}
    </svg>
  )
}

export default function AdminPage() {
  const { token, isAdmin } = useAuth()
  const [stats, setStats]   = useState(null)
  const [users, setUsers]   = useState([])
  const [growth, setGrowth] = useState([])
  const [recent, setRecent] = useState([])
  const [pendingPayments, setPendingPayments] = useState([])
  const [paymentsHistory, setPaymentsHistory] = useState([])
  const [loading, setLoading]       = useState(true)
  const [planLoading, setPlanLoading] = useState(null)
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [paymentActionLoading, setPaymentActionLoading] = useState(null)
  const [paymentMsg, setPaymentMsg] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab]       = useState('overview')

  const headers = { Authorization: `Bearer ${token}` }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, uRes, gRes, rRes, pRes, hRes] = await Promise.all([
        fetch(`${API_BASE}/admin/stats`,  { headers }),
        fetch(`${API_BASE}/admin/users`,  { headers }),
        fetch(`${API_BASE}/admin/growth`, { headers }),
        fetch(`${API_BASE}/admin/recent`, { headers }),
        fetch(`${API_BASE}/billing/crypto/pending`, { headers }),
        fetch(`${API_BASE}/billing/crypto/history?limit=100`, { headers }),
      ])
      if (sRes.ok) setStats(await sRes.json())
      if (uRes.ok) setUsers(await uRes.json())
      if (gRes.ok) setGrowth(await gRes.json())
      if (rRes.ok) setRecent(await rRes.json())
      if (pRes.ok) {
        const pData = await pRes.json()
        setPendingPayments(Array.isArray(pData.payments) ? pData.payments : [])
      }
      if (hRes.ok) {
        const hData = await hRes.json()
        setPaymentsHistory(Array.isArray(hData.payments) ? hData.payments : [])
      }
    } finally {
      setLoading(false)
    }
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
        const delta = newPlan === 'pro' ? 1 : -1
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
    } finally {
      setPlanLoading(null)
    }
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
    setPaymentsLoading(true)
    setPaymentMsg('')
    try {
      const res = await fetch(`${API_BASE}/billing/crypto/pending`, { headers })
      if (!res.ok) throw new Error('Failed to load pending payments')
      const data = await res.json()
      setPendingPayments(Array.isArray(data.payments) ? data.payments : [])
    } catch (e) {
      setPaymentMsg(e.message || 'Failed to load pending payments')
    } finally {
      setPaymentsLoading(false)
    }
  }, [token])

  const fetchPaymentHistory = useCallback(async () => {
    setPaymentsLoading(true)
    setPaymentMsg('')
    try {
      const res = await fetch(`${API_BASE}/billing/crypto/history?limit=100`, { headers })
      if (!res.ok) throw new Error('Failed to load payment history')
      const data = await res.json()
      setPaymentsHistory(Array.isArray(data.payments) ? data.payments : [])
    } catch (e) {
      setPaymentMsg(e.message || 'Failed to load payment history')
    } finally {
      setPaymentsLoading(false)
    }
  }, [token])

  const handleVerifyPayment = async (paymentId) => {
    setPaymentActionLoading(`verify-${paymentId}`)
    setPaymentMsg('')
    try {
      const res = await fetch(`${API_BASE}/billing/crypto/verify/${paymentId}`, {
        method: 'POST',
        headers,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Verification failed')
      setPaymentMsg(`✓ Payment #${paymentId} verified. User upgraded/extended.`)
      await fetchPendingPayments()
      await fetchPaymentHistory()
      await fetchAll()
    } catch (e) {
      setPaymentMsg(e.message || 'Verification failed')
    } finally {
      setPaymentActionLoading(null)
    }
  }

  const handleRejectPayment = async (paymentId) => {
    const ok = window.confirm(`Reject payment #${paymentId}?`)
    if (!ok) return
    setPaymentActionLoading(`reject-${paymentId}`)
    setPaymentMsg('')
    try {
      const res = await fetch(`${API_BASE}/billing/crypto/reject/${paymentId}`, {
        method: 'POST',
        headers,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Reject failed')
      setPaymentMsg(`Payment #${paymentId} rejected.`)
      await fetchPendingPayments()
      await fetchPaymentHistory()
    } catch (e) {
      setPaymentMsg(e.message || 'Reject failed')
    } finally {
      setPaymentActionLoading(null)
    }
  }

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setPaymentMsg('✓ Copied to clipboard')
    } catch {
      setPaymentMsg('Clipboard copy failed')
    }
  }

  const chainExplorerUrl = (chain, txHash) => {
    if (!txHash) return ''
    switch ((chain || '').toLowerCase()) {
      case 'erc20': return `https://etherscan.io/tx/${txHash}`
      case 'bsc': return `https://bscscan.com/tx/${txHash}`
      case 'arbitrum': return `https://arbiscan.io/tx/${txHash}`
      case 'solana': return `https://solscan.io/tx/${txHash}`
      case 'tron': return `https://tronscan.org/#/transaction/${txHash}`
      default: return ''
    }
  }

  if (!isAdmin) {
    return (
      <div className="adm-forbidden">
        <div className="adm-forbidden-icon">🔒</div>
        <div>Admin access required</div>
      </div>
    )
  }

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="adm-page">
      <div className="adm-header">
        <div>
          <h1 className="adm-title">Admin Panel</h1>
          <div className="adm-subtitle">Trading Tools — Internal Dashboard</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="adm-refresh" onClick={exportCSV}>↓ CSV Export</button>
          <button className="adm-refresh" onClick={fetchAll}>↻ Refresh</button>
        </div>
      </div>

      {loading ? (
        <div className="adm-loading">Loading...</div>
      ) : (
        <>
          <div className="adm-stats-grid">
            <StatCard label="Total Users"     value={stats?.total_users ?? '—'} />
            <StatCard label="Pro Users"       value={stats?.pro_users ?? '—'} color="#00d992"
              sub={`+${stats?.new_pro_30d ?? 0} this month`} />
            <StatCard label="Free Users"      value={stats?.free_users ?? '—'} color="var(--text-muted)" />
            <StatCard label="Conversion"      value={`${stats?.conversion_rate ?? 0}%`} color="#00d992" sub="free → pro" />
            <StatCard label="MRR"             value={`$${(stats?.mrr_usd ?? 0).toLocaleString()}`} color="#00d992"
              sub={`$${(stats?.arr_usd ?? 0).toLocaleString()} ARR`} />
            <StatCard label="Plan Price"      value={`$${stats?.plan_price_usd ?? 29}/mo`} />
            <StatCard label="New Users (30d)" value={stats?.new_users_30d ?? '—'} sub={`+${stats?.new_pro_30d ?? 0} pro`} />
            <StatCard label="Active Alerts"   value={stats?.total_alerts ?? '—'} />
            <StatCard
              label="Pending Crypto"
              value={pendingPayments.length}
              color={pendingPayments.length > 0 ? '#f0b90b' : 'var(--text-primary)'}
              sub={pendingPayments.length > 0 ? 'Manual verification required' : 'All caught up'}
              small
            />
          </div>

          <div className="adm-tabs">
            <button className={`adm-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
            <button className={`adm-tab ${tab === 'users'    ? 'active' : ''}`} onClick={() => setTab('users')}>Users ({users.length})</button>
            <button
              className={`adm-tab ${tab === 'payments' ? 'active' : ''}`}
              onClick={() => {
                setTab('payments')
                fetchPendingPayments()
                fetchPaymentHistory()
              }}
            >
              Crypto Payments ({pendingPayments.length})
            </button>
          </div>

          {tab === 'overview' && (
            <>
              <div className="adm-section" style={{ marginBottom: 16 }}>
                <div className="adm-section-hdr">
                  <span>User Growth — Last 30 Days</span>
                  <div className="adm-legend">
                    <span className="adm-legend-pro">■ Pro</span>
                    <span className="adm-legend-free">■ Free</span>
                  </div>
                </div>
                <div style={{ padding: '16px 20px' }}>
                  <GrowthChart data={growth} />
                </div>
              </div>

              <div className="adm-section">
                <div className="adm-section-hdr"><span>Recent Signups</span></div>
                <table className="adm-table">
                  <thead><tr><th>Email</th><th>Plan</th><th>Joined</th></tr></thead>
                  <tbody>
                    {recent.map(u => (
                      <tr key={u.id}>
                        <td className="adm-email">{u.email}</td>
                        <td><span className={`adm-plan-badge ${u.plan}`}>{u.plan.toUpperCase()}</span></td>
                        <td className="adm-date">{u.created_at?.slice(0, 16).replace('T', ' ')}</td>
                      </tr>
                    ))}
                    {recent.length === 0 && <tr><td colSpan={3} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No users yet</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === 'users' && (
            <div className="adm-section">
              <div className="adm-section-hdr">
                <span>All Users ({filtered.length})</span>
                <input className="adm-search" placeholder="Search by email..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <table className="adm-table">
                <thead>
                  <tr><th>ID</th><th>Email</th><th>Plan</th><th>Joined</th><th>Stripe</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {filtered.map(u => (
                    <tr key={u.id}>
                      <td className="adm-id">#{u.id}</td>
                      <td className="adm-email">{u.email}</td>
                      <td><span className={`adm-plan-badge ${u.plan}`}>{u.plan.toUpperCase()}</span></td>
                      <td className="adm-date">{u.created_at?.slice(0, 10)}</td>
                      <td className="adm-stripe">
                        {u.stripe_customer_id
                          ? <span className="adm-stripe-id">{u.stripe_customer_id}</span>
                          : <span className="adm-no-stripe">—</span>}
                      </td>
                      <td>
                        <button
                          className={`adm-toggle ${u.plan === 'pro' ? 'toggle-downgrade' : 'toggle-upgrade'}`}
                          onClick={() => togglePlan(u)}
                          disabled={planLoading === u.id}
                        >
                          {planLoading === u.id ? '...' : u.plan === 'pro' ? '↓ Free' : '↑ Pro'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <div className="adm-empty">No users found</div>}
            </div>
          )}

          {tab === 'payments' && (
            <div className="adm-section">
              <div className="adm-section-hdr">
                <span>Pending Crypto Payments ({pendingPayments.length})</span>
                <button
                  className="adm-refresh"
                  onClick={() => {
                    fetchPendingPayments()
                    fetchPaymentHistory()
                  }}
                >
                  {paymentsLoading ? 'Loading...' : '↻ Refresh Payments'}
                </button>
              </div>

              <div className="adm-payments-help">
                Verify only if destination wallet, chain/token, and amount are correct.
              </div>
              {paymentMsg && (
                <div className={`adm-payments-msg ${paymentMsg.startsWith('✓') ? 'ok' : 'err'}`}>
                  {paymentMsg}
                </div>
              )}

              <table className="adm-table adm-payments-table">
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
                      <tr key={p.id}>
                        <td className="adm-id">#{p.id}</td>
                        <td>
                          <div className="adm-email">{p.email}</div>
                          <div className="adm-id">UID: {p.user_id}</div>
                        </td>
                        <td>
                          <span className={`adm-plan-badge ${p.plan === 'yearly' ? 'pro' : 'free'}`}>
                            {String(p.plan || '').toUpperCase()}
                          </span>
                        </td>
                        <td className="adm-date">{String(p.chain || '').toUpperCase()} · {p.token}</td>
                        <td className="adm-email">${p.amount} {p.token}</td>
                        <td className="adm-mono-cell">
                          <button className="adm-mini-btn" onClick={() => copyText(p.tx_hash)}>Copy</button>
                          {explorer && (
                            <a className="adm-mini-link" href={explorer} target="_blank" rel="noreferrer">Open</a>
                          )}
                          <span className="adm-mono-preview">{p.tx_hash}</span>
                        </td>
                        <td className="adm-mono-cell">
                          <button className="adm-mini-btn" onClick={() => copyText(p.wallet_address)}>Copy</button>
                          <span className="adm-mono-preview">{p.wallet_address}</span>
                        </td>
                        <td className="adm-date">{String(p.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                        <td>
                          <div className="adm-pay-actions">
                            <button
                              className="adm-toggle toggle-upgrade"
                              onClick={() => handleVerifyPayment(p.id)}
                              disabled={paymentActionLoading === `verify-${p.id}` || paymentActionLoading === `reject-${p.id}`}
                            >
                              {paymentActionLoading === `verify-${p.id}` ? '...' : '✓ Verify'}
                            </button>
                            <button
                              className="adm-toggle toggle-downgrade"
                              onClick={() => handleRejectPayment(p.id)}
                              disabled={paymentActionLoading === `verify-${p.id}` || paymentActionLoading === `reject-${p.id}`}
                            >
                              {paymentActionLoading === `reject-${p.id}` ? '...' : '✕ Reject'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {pendingPayments.length === 0 && (
                <div className="adm-empty">No pending crypto payments.</div>
              )}

              <div className="adm-history-divider" />

              <div className="adm-section-hdr">
                <span>Verified / Rejected History ({paymentsHistory.length})</span>
              </div>

              <table className="adm-table adm-payments-table">
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
                        <td className="adm-id">#{p.id}</td>
                        <td>
                          <div className="adm-email">{p.email}</div>
                          <div className="adm-id">UID: {p.user_id}</div>
                        </td>
                        <td>
                          <span className={`adm-status-badge ${p.status === 'verified' ? 'verified' : 'rejected'}`}>
                            {String(p.status || '').toUpperCase()}
                          </span>
                        </td>
                        <td className="adm-date">{String(p.plan || '').toUpperCase()}</td>
                        <td className="adm-date">{String(p.chain || '').toUpperCase()} · {p.token}</td>
                        <td className="adm-email">${p.amount} {p.token}</td>
                        <td className="adm-mono-cell">
                          <button className="adm-mini-btn" onClick={() => copyText(p.tx_hash)}>Copy</button>
                          {explorer && (
                            <a className="adm-mini-link" href={explorer} target="_blank" rel="noreferrer">Open</a>
                          )}
                          <span className="adm-mono-preview">{p.tx_hash}</span>
                        </td>
                        <td className="adm-date">{String(p.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                        <td className="adm-date">
                          {p.verified_at ? String(p.verified_at).slice(0, 16).replace('T', ' ') : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {paymentsHistory.length === 0 && (
                <div className="adm-empty">No verified/rejected payments yet.</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
