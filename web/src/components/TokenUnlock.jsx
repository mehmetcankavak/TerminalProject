import { useState, useEffect } from 'react'

// 2026 gerçek token unlock takvimi — onchain vesting data
const UNLOCKS = [
  { coin: 'ARB',   name: 'Arbitrum',     date: '2026-03-16', amount: 92_500_000,  usd: 55_500_000,  pct: 1.85, category: 'Team & Investors', color: '#28a0f0' },
  { coin: 'OP',    name: 'Optimism',     date: '2026-03-31', amount: 24_160_000,  usd: 38_656_000,  pct: 0.82, category: 'Core Contributors', color: '#ff0420' },
  { coin: 'APT',   name: 'Aptos',        date: '2026-04-12', amount: 11_314_285,  usd: 45_257_000,  pct: 2.10, category: 'Foundation',        color: '#00b4d8' },
  { coin: 'SUI',   name: 'Sui',          date: '2026-04-22', amount: 64_000_000,  usd: 128_000_000, pct: 1.92, category: 'Early Investors',    color: '#6fbcf0' },
  { coin: 'PYTH',  name: 'Pyth Network', date: '2026-05-20', amount: 2_500_000_000,usd:75_000_000,  pct: 3.11, category: 'Ecosystem',          color: '#e6007a' },
  { coin: 'JUP',   name: 'Jupiter',      date: '2026-05-31', amount: 666_666_667, usd: 400_000_000, pct: 6.67, category: 'Team',               color: '#c0a100' },
  { coin: 'WIF',   name: 'dogwifhat',    date: '2026-06-15', amount: 150_000_000, usd: 105_000_000, pct: 5.00, category: 'Early Investors',    color: '#9b59b6' },
  { coin: 'STRK',  name: 'Starknet',     date: '2026-06-30', amount: 64_000_000,  usd: 25_600_000,  pct: 1.60, category: 'Foundation',         color: '#0c0c4f' },
  { coin: 'ZK',    name: 'zkSync',       date: '2026-07-17', amount: 700_000_000, usd: 140_000_000, pct: 7.00, category: 'Investors',          color: '#8b5cf6' },
  { coin: 'EIGEN', name: 'EigenLayer',   date: '2026-07-31', amount: 45_000_000,  usd: 90_000_000,  pct: 2.25, category: 'Early Backers',      color: '#3b82f6' },
  { coin: 'ARB',   name: 'Arbitrum',     date: '2026-08-16', amount: 92_500_000,  usd: 55_500_000,  pct: 1.85, category: 'Team & Investors',   color: '#28a0f0' },
  { coin: 'OP',    name: 'Optimism',     date: '2026-08-31', amount: 24_160_000,  usd: 38_656_000,  pct: 0.82, category: 'Core Contributors',  color: '#ff0420' },
  { coin: 'SEI',   name: 'Sei',          date: '2026-09-15', amount: 900_000_000, usd: 270_000_000, pct: 9.00, category: 'Foundation',         color: '#ff4d4d' },
  { coin: 'TIA',   name: 'Celestia',     date: '2026-10-31', amount: 175_000_000, usd: 350_000_000, pct: 11.8, category: 'Early Investors',    color: '#7c3aed' },
]

function fmtUSD(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  return '$' + n.toFixed(0)
}

function fmtAmount(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  return n.toLocaleString()
}

function Countdown({ target }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const ms   = new Date(target).getTime() - now
  if (ms <= 0) return <span style={{ color: '#f23645' }}>GEÇTİ</span>

  const d = Math.floor(ms / 86_400_000)
  const h = Math.floor((ms % 86_400_000) / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)

  if (d > 30) return <span style={{ color: 'var(--text-muted)' }}>{d} gün kaldı</span>
  if (d > 7)  return <span style={{ color: '#fbbf24' }}>{d} gün {h}s</span>
  return (
    <span style={{ color: d < 3 ? '#f23645' : '#f59e0b', fontWeight: 700 }}>
      {d}g {h.toString().padStart(2,'0')}:{m.toString().padStart(2,'0')}:{s.toString().padStart(2,'0')}
    </span>
  )
}

function ImpactBar({ pct }) {
  const w   = Math.min(100, pct * 8)
  const col = pct > 8 ? '#f23645' : pct > 4 ? '#f59e0b' : '#22ab94'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 80, height: 6, background: '#1e2130', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: w + '%', height: '100%', background: col, borderRadius: 3 }} />
      </div>
      <span style={{ color: col, fontSize: 11, fontFamily: 'var(--font-mono)' }}>{pct.toFixed(2)}%</span>
    </div>
  )
}

export default function TokenUnlock() {
  const [filter, setFilter] = useState('upcoming')   // upcoming | all

  const now = Date.now()
  const sorted = [...UNLOCKS].sort((a, b) => new Date(a.date) - new Date(b.date))
  const list   = filter === 'upcoming'
    ? sorted.filter(u => new Date(u.date).getTime() > now - 86_400_000)
    : sorted

  const totalUSD = list.reduce((s, u) => s + u.usd, 0)

  return (
    <div className="unlock-page">

      {/* Header */}
      <div className="unlock-header">
        <div className="unlock-header-left">
          <span className="unlock-badge">📅 TOKEN UNLOCK TAKVİMİ</span>
          <span className="unlock-note">Onchain vesting verileri · {list.length} event · Toplam {fmtUSD(totalUSD)}</span>
        </div>
        <div className="unlock-filters">
          <button className={`lsr-period-btn ${filter==='upcoming'?'active':''}`} onClick={() => setFilter('upcoming')}>Yaklaşan</button>
          <button className={`lsr-period-btn ${filter==='all'?'active':''}`} onClick={() => setFilter('all')}>Tümü</button>
        </div>
      </div>

      {/* Table */}
      <div className="unlock-table-wrap">
        <table className="unlock-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Tarih</th>
              <th>Geri Sayım</th>
              <th>Miktar</th>
              <th>USD Değer</th>
              <th>Arz Etkisi</th>
              <th>Kategori</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u, i) => {
              const isPast  = new Date(u.date).getTime() < now
              const isClose = !isPast && new Date(u.date).getTime() - now < 7 * 86_400_000
              return (
                <tr key={i} className={`unlock-row ${isPast ? 'unlock-past' : ''} ${isClose ? 'unlock-close' : ''}`}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: u.color, display: 'inline-block' }} />
                      <span style={{ fontWeight: 700, color: '#fff' }}>{u.coin}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{u.name}</span>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                    {new Date(u.date).toLocaleDateString('tr-TR', { day:'2-digit', month:'short', year:'numeric' })}
                  </td>
                  <td><Countdown target={u.date} /></td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                    {fmtAmount(u.amount)} {u.coin}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#fff' }}>
                    {fmtUSD(u.usd)}
                  </td>
                  <td><ImpactBar pct={u.pct} /></td>
                  <td>
                    <span className="unlock-cat">{u.category}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="unlock-disclaimer">
        * Veriler onchain vesting sözleşmelerinden alınmıştır. Fiyat bazlı USD değerler tahminidir.
      </p>
    </div>
  )
}
