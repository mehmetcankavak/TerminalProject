export const fmt = (n, d = 2) =>
    n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

export const fmtUSD = (n) =>
    n == null ? '—'
    : n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B'
    : n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M'
    : n >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'K'
    : '$' + n.toFixed(2)

export const fmtPnl = (n) =>
    n == null ? '—' : (n >= 0 ? '+' : '-') + '$' + Math.abs(n).toFixed(2)

export const fmtPct = (n) =>
    n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(2) + '%'

export const timeAgo = (iso) => {
    if (!iso) return ''
    const s = Math.floor((Date.now() - new Date(iso)) / 1000)
    if (s < 0) return 'just now'
    if (s < 60) return `${s}s ago`
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
}

export const getAuthHeaders = (token) => token
    ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    : { 'Content-Type': 'application/json' }
