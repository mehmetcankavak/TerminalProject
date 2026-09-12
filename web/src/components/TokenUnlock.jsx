import { useMemo, useState } from 'react'
import { Search, Calendar, MoreHorizontal } from 'lucide-react'
import AssetLogo from './AssetLogo'

// 2026 token unlock calendar — on-chain vesting data
const UNLOCKS = [
  { coin: 'ARB',   name: 'Arbitrum',     date: '2026-03-16', amount: 92_500_000,   usd: 55_500_000,  pct: 1.85, category: 'Team & Investors' },
  { coin: 'OP',    name: 'Optimism',     date: '2026-03-31', amount: 24_160_000,   usd: 38_656_000,  pct: 0.82, category: 'Core Contributors' },
  { coin: 'APT',   name: 'Aptos',        date: '2026-04-12', amount: 11_314_285,   usd: 45_257_000,  pct: 2.10, category: 'Foundation' },
  { coin: 'SUI',   name: 'Sui',          date: '2026-04-22', amount: 64_000_000,   usd: 128_000_000, pct: 1.92, category: 'Early Investors' },
  { coin: 'PYTH',  name: 'Pyth Network', date: '2026-05-20', amount: 2_500_000_000, usd: 75_000_000, pct: 3.11, category: 'Ecosystem' },
  { coin: 'JUP',   name: 'Jupiter',      date: '2026-05-31', amount: 666_666_667,  usd: 400_000_000, pct: 6.67, category: 'Team' },
  { coin: 'WIF',   name: 'dogwifhat',    date: '2026-06-15', amount: 150_000_000,  usd: 105_000_000, pct: 5.00, category: 'Early Investors' },
  { coin: 'STRK',  name: 'Starknet',     date: '2026-06-30', amount: 64_000_000,   usd: 25_600_000,  pct: 1.60, category: 'Foundation' },
  { coin: 'ZK',    name: 'zkSync',       date: '2026-07-17', amount: 700_000_000,  usd: 140_000_000, pct: 7.00, category: 'Investors' },
  { coin: 'EIGEN', name: 'EigenLayer',   date: '2026-07-31', amount: 45_000_000,   usd: 90_000_000,  pct: 2.25, category: 'Early Backers' },
  { coin: 'ARB',   name: 'Arbitrum',     date: '2026-08-16', amount: 92_500_000,   usd: 55_500_000,  pct: 1.85, category: 'Team & Investors' },
  { coin: 'OP',    name: 'Optimism',     date: '2026-08-31', amount: 24_160_000,   usd: 38_656_000,  pct: 0.82, category: 'Core Contributors' },
  { coin: 'SEI',   name: 'Sei',          date: '2026-09-15', amount: 900_000_000,  usd: 270_000_000, pct: 9.00, category: 'Foundation' },
  { coin: 'TIA',   name: 'Celestia',     date: '2026-10-31', amount: 175_000_000,  usd: 350_000_000, pct: 11.8, category: 'Early Investors' },
  { coin: 'SOL',   name: 'Solana',       date: '2026-11-18', amount: 11_240_000,   usd: 1_883_150_000, pct: 2.35, category: 'Vesting' },
  { coin: 'WLD',   name: 'Worldcoin',    date: '2026-11-25', amount: 37_230_000,   usd: 111_690_000, pct: 1.82, category: 'Team' },
  { coin: 'AVAX',  name: 'Avalanche',    date: '2026-11-26', amount: 9_540_000,    usd: 286_200_000, pct: 1.56, category: 'Foundation' },
  { coin: 'APT',   name: 'Aptos',        date: '2026-12-12', amount: 11_310_000,   usd: 82_363_000,  pct: 0.73, category: 'Community' },
]

const CATEGORY_TONE = (cat = '') => {
  const c = cat.toLowerCase()
  if (c.includes('foundation')) return 'ws-badge-purple'
  if (c.includes('team') || c.includes('contributor')) return 'ws-badge-warn'
  if (c.includes('investor') || c.includes('backer')) return 'ws-badge-neg'
  if (c.includes('community') || c.includes('ecosystem')) return 'ws-badge-pos'
  return 'ws-badge-info'
}

const fmtUSD = n => '$' + Math.round(n).toLocaleString('en-US')
const fmtUSDShort = n => n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(0) + 'M' : '$' + n.toLocaleString('en-US')
const fmtAmount = n => Math.round(n).toLocaleString('en-US')
const fmtDate = d => new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })

function countdown(target, now) {
  const ms = new Date(target).getTime() - now
  if (ms <= 0) return 'Geçti'
  const d = Math.floor(ms / 86_400_000)
  const h = Math.floor((ms % 86_400_000) / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return `${d}g ${h}s ${m}d`
}

const DATE_FILTERS = [
  { id: 'all',  label: 'Tüm Tarihler' },
  { id: '7d',   label: '7 Gün İçinde' },
  { id: '30d',  label: '30 Gün İçinde' },
  { id: 'past', label: 'Geçmiş Dahil' },
]
const IMPACT_FILTERS = [
  { id: 'all',  label: 'Arz Etkisi: Tümü' },
  { id: 'low',  label: 'Arz Etkisi: < 1%' },
  { id: 'mid',  label: 'Arz Etkisi: 1–5%' },
  { id: 'high', label: 'Arz Etkisi: > 5%' },
]

export default function TokenUnlock() {
  const [query, setQuery]       = useState('')
  const [category, setCategory] = useState('all')
  const [dateRange, setDate]    = useState('all')
  const [impact, setImpact]     = useState('all')
  const [sort, setSort]         = useState({ key: 'date', dir: 'asc' })

  const now = Date.now()
  const categories = useMemo(() => [...new Set(UNLOCKS.map(u => u.category))].sort(), [])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = UNLOCKS.filter(u => {
      const t = new Date(u.date).getTime()
      if (dateRange !== 'past' && t < now - 86_400_000) return false
      if (dateRange === '7d' && t > now + 7 * 86_400_000) return false
      if (dateRange === '30d' && t > now + 30 * 86_400_000) return false
      if (category !== 'all' && u.category !== category) return false
      if (impact === 'low' && u.pct >= 1) return false
      if (impact === 'mid' && (u.pct < 1 || u.pct > 5)) return false
      if (impact === 'high' && u.pct <= 5) return false
      if (q && !u.coin.toLowerCase().includes(q) && !u.name.toLowerCase().includes(q)) return false
      return true
    })
    const dir = sort.dir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      if (sort.key === 'date') return (new Date(a.date) - new Date(b.date)) * dir
      if (sort.key === 'usd')  return (a.usd - b.usd) * dir
      if (sort.key === 'pct')  return (a.pct - b.pct) * dir
      return 0
    })
    return rows
  }, [query, category, dateRange, impact, sort, now])

  const upcoming = UNLOCKS.filter(u => new Date(u.date).getTime() >= now - 86_400_000)
  const in7  = upcoming.filter(u => new Date(u.date).getTime() <= now + 7 * 86_400_000)
  const in30 = upcoming.filter(u => new Date(u.date).getTime() <= now + 30 * 86_400_000)
  const biggest = upcoming.reduce((m, u) => (!m || u.usd > m.usd ? u : m), null)
  const avgPct = upcoming.length ? upcoming.reduce((s, u) => s + u.pct, 0) / upcoming.length : 0

  const toggleSort = key => setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))
  const SortIcon = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M7 15l5 5 5-5M7 9l5-5 5 5" /></svg>

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <div className="ws-page-head-left">
          <h1 className="ws-title">Token Unlock</h1>
          <p className="ws-subtitle" style={{ fontSize: 16 }}>Token unlock schedule.</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="tu-toolbar">
        <div className="ws-search tu-search">
          <Search size={16} />
          <input className="ws-input ws-input-lg" placeholder="Token ara..." value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <select className="ws-select ws-select-lg tu-select" value={category} onChange={e => setCategory(e.target.value)}>
          <option value="all">Tüm Kategoriler</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="ws-select ws-select-lg tu-select" value={dateRange} onChange={e => setDate(e.target.value)}>
          {DATE_FILTERS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <select className="ws-select ws-select-lg tu-select" value={impact} onChange={e => setImpact(e.target.value)}>
          {IMPACT_FILTERS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <button className="ws-btn ws-btn-lg ws-btn-icon tu-cal" style={{ marginLeft: 'auto' }} title="Takvim" onClick={() => setDate(d => d === '30d' ? 'all' : '30d')}>
          <Calendar size={18} />
        </button>
      </div>

      {/* Table */}
      <div className="ws-table-wrap">
        <table className="ws-table ws-table-tall tu-table">
          <thead>
            <tr>
              <th>Token</th>
              <th><span className="ws-th-sort" onClick={() => toggleSort('date')}>Tarih <SortIcon /></span></th>
              <th>Geri Sayım</th>
              <th>Miktar</th>
              <th><span className="ws-th-sort" onClick={() => toggleSort('usd')}>USD Değer <SortIcon /></span></th>
              <th><span className="ws-th-sort" onClick={() => toggleSort('pct')}>Arz Etkisi <SortIcon /></span></th>
              <th>Kategori</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={8}><div className="ws-empty"><div className="ws-empty-title">Bu filtrelerle eşleşen unlock yok.</div></div></td></tr>
            ) : list.map((u, i) => {
              const past = new Date(u.date).getTime() < now
              return (
                <tr key={`${u.coin}-${u.date}-${i}`} style={past ? { opacity: 0.55 } : undefined}>
                  <td>
                    <div className="ws-asset">
                      <span className="ws-asset-logo ws-asset-logo-lg"><AssetLogo symbol={u.coin} type="crypto" size={36} radius={18} /></span>
                      <div className="ws-asset-stack">
                        <span className="ws-asset-sym" style={{ fontSize: 14 }}>{u.coin}</span>
                        <span className="ws-asset-name" style={{ fontSize: 13 }}>{u.name}</span>
                      </div>
                    </div>
                  </td>
                  <td className="ws-ink ws-num" style={{ fontSize: 14 }}>{fmtDate(u.date)}</td>
                  <td className="ws-ink ws-num" style={{ fontSize: 14 }}>{countdown(u.date, now)}</td>
                  <td className="ws-ink ws-num" style={{ fontSize: 14 }}>{fmtAmount(u.amount)} {u.coin}</td>
                  <td className="ws-ink ws-num" style={{ fontSize: 14 }}>{fmtUSD(u.usd)}</td>
                  <td className={`ws-num ws-bold ${u.pct > 0.8 ? 'ws-neg' : 'ws-pos'}`} style={{ fontSize: 14 }}>{u.pct.toFixed(2)}%</td>
                  <td><span className={`ws-badge ${CATEGORY_TONE(u.category)}`}>{u.category}</span></td>
                  <td className="ws-right"><button className="ws-iconbtn" title="Daha fazla"><MoreHorizontal size={18} /></button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="ws-divider" />

      {/* Summary */}
      <h2 className="ws-h3" style={{ fontSize: 17 }}>Yaklaşan Token Unlock Özeti</h2>
      <div className="tu-summary">
        <div className="tu-sum-cell">
          <div className="tu-sum-label">7 Gün İçinde</div>
          <div className="tu-sum-big">{in7.length} <span>token</span></div>
          <div className="tu-sum-val">{fmtUSDShort(in7.reduce((s, u) => s + u.usd, 0))} <span>toplam değer</span></div>
        </div>
        <div className="tu-sum-cell">
          <div className="tu-sum-label">30 Gün İçinde</div>
          <div className="tu-sum-big">{in30.length} <span>token</span></div>
          <div className="tu-sum-val">{fmtUSDShort(in30.reduce((s, u) => s + u.usd, 0))} <span>toplam değer</span></div>
        </div>
        <div className="tu-sum-cell">
          <div className="tu-sum-label">En Büyük Unlock</div>
          {biggest ? (
            <div className="tu-sum-biggest">
              <span className="ws-asset-logo ws-asset-logo-lg"><AssetLogo symbol={biggest.coin} type="crypto" size={36} radius={18} /></span>
              <div>
                <div className="ws-bold" style={{ fontSize: 15 }}>{biggest.coin}</div>
                <div className="ws-text" style={{ fontSize: 14 }}>{fmtAmount(biggest.amount)} {biggest.coin}</div>
                <div className="ws-bold" style={{ fontSize: 15 }}>{fmtUSDShort(biggest.usd)}</div>
              </div>
              <div className="tu-sum-impact">
                <div className="ws-muted" style={{ fontSize: 13 }}>Arz Etkisi</div>
                <div className={`ws-bold ${biggest.pct > 0.8 ? 'ws-neg' : 'ws-pos'}`} style={{ fontSize: 18 }}>{biggest.pct.toFixed(2)}%</div>
              </div>
            </div>
          ) : <div className="ws-muted">—</div>}
        </div>
        <div className="tu-sum-cell">
          <div className="tu-sum-label">Ortalama Arz Etkisi</div>
          <div className="tu-sum-big">{avgPct.toFixed(2)}%</div>
          <div className="ws-muted" style={{ fontSize: 14 }}>({upcoming.length} token)</div>
        </div>
      </div>
    </div>
  )
}
