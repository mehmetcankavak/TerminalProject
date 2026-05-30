import { useState, useEffect, useCallback } from 'react'
import { haptic } from '../../capacitor'
import { API_BASE } from '../../config'

// ETF Data screen — Yahoo Finance + optional CoinGlass netflow.
// Sentiment is volume-weighted directional read across all ETFs in the type.

function fmtUSD(n) {
  if (n == null || !isFinite(n)) return '—'
  const v = Number(n)
  if (Math.abs(v) >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'
  if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'
  if (Math.abs(v) >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(0)
}

function fmtPrice(p) {
  if (p == null || isNaN(p)) return '—'
  if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (p >= 1)    return '$' + p.toFixed(2)
  return '$' + p.toFixed(4)
}

const TYPES = [
  { key: 'BTC', label: 'BTC ETFs' },
  { key: 'ETH', label: 'ETH ETFs' },
]

// ─── Sentiment Gauge ─────────────────────────────────────────────────────────
function ETFSentiment({ etfs, summary }) {
  if (!etfs || !etfs.length) {
    return (
      <div style={{ padding: '12px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ fontSize: 10, color: '#555', fontWeight: 700, letterSpacing: 0.5 }}>
          SENTIMENT · ETF · yükleniyor…
        </div>
      </div>
    )
  }
  let bullVol = 0, bearVol = 0
  let dominant = null
  for (const e of etfs) {
    const vol = (e.volume || 0) * (e.price || 0)
    if ((e.changePct || 0) >= 0) bullVol += vol
    else                         bearVol += vol
    if (!dominant || vol > (dominant.volume || 0) * (dominant.price || 0)) dominant = e
  }
  const total  = bullVol + bearVol
  const score  = total > 0 ? (bullVol - bearVol) / total : 0
  const verdict = score >  0.3 ? 'INFLOW'
                : score < -0.3 ? 'OUTFLOW'
                :                'NEUTRAL'
  const tone = verdict === 'INFLOW'  ? '#00d992'
             : verdict === 'OUTFLOW' ? '#f43f5e'
             :                          '#aaa'
  const pct = Math.max(0, Math.min(100, (score + 1) * 50))
  const avgChange = total > 0
    ? etfs.reduce((s, e) => s + (e.changePct || 0) * ((e.volume || 0) * (e.price || 0)), 0) / total
    : 0
  const cgToday = summary?.today

  return (
    <div style={{ padding: '12px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8 }}>
          SENTIMENT · ETF · 24H
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)', color: tone }}>
            {score >= 0 ? '+' : ''}{score.toFixed(2)}
          </span>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.6, color: tone }}>
            {verdict}
          </span>
        </div>
      </div>

      <div style={{ position: 'relative', height: 8, marginBottom: 8 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 4,
          background: 'linear-gradient(to right, rgba(244,63,94,0.5) 0%, rgba(244,63,94,0.15) 35%, rgba(255,255,255,0.06) 50%, rgba(0,217,146,0.15) 65%, rgba(0,217,146,0.5) 100%)',
        }} />
        <div style={{
          position: 'absolute', top: -2, bottom: -2, left: '50%',
          width: 1, background: 'rgba(255,255,255,0.18)', transform: 'translateX(-50%)',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: pct + '%',
          width: 12, height: 12, borderRadius: '50%', background: tone,
          boxShadow: '0 0 10px ' + tone + '99',
          border: '2px solid #000', transform: 'translate(-50%, -50%)',
          transition: 'left 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#555', fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>
        <span>OUTFLOW</span>
        <span>NÖTR</span>
        <span>INFLOW</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10, padding: '8px 8px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#aaa', letterSpacing: 0.5 }}>TOTAL VOL</div>
          <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff', marginTop: 3 }}>
            {fmtUSD(total)}
          </div>
          <div style={{ fontSize: 9, color: '#888', fontFamily: 'var(--mono)', marginTop: 1 }}>{etfs.length} ETF</div>
        </div>
        <div style={{
          background: avgChange >= 0 ? 'rgba(0,217,146,0.06)' : 'rgba(244,63,94,0.06)',
          border: '1px solid ' + (avgChange >= 0 ? 'rgba(0,217,146,0.15)' : 'rgba(244,63,94,0.15)'),
          borderRadius: 10, padding: '8px 8px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: avgChange >= 0 ? '#00d992' : '#f43f5e', letterSpacing: 0.5 }}>AVG CHANGE</div>
          <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff', marginTop: 3 }}>
            {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}%
          </div>
          <div style={{ fontSize: 9, color: '#888', fontFamily: 'var(--mono)', marginTop: 1 }}>volume ağırlıklı</div>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10, padding: '8px 8px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#fbbf24', letterSpacing: 0.5 }}>DOMINANT</div>
          <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff', marginTop: 3 }}>
            {dominant?.symbol || '—'}
          </div>
          <div style={{ fontSize: 9, color: '#888', fontFamily: 'var(--mono)', marginTop: 1 }}>
            {dominant ? fmtUSD((dominant.volume || 0) * (dominant.price || 0)) : '—'}
          </div>
        </div>
        <div style={{
          background: cgToday != null ? (cgToday >= 0 ? 'rgba(0,217,146,0.06)' : 'rgba(244,63,94,0.06)') : 'rgba(255,255,255,0.03)',
          border: '1px solid ' + (cgToday != null ? (cgToday >= 0 ? 'rgba(0,217,146,0.15)' : 'rgba(244,63,94,0.15)') : 'rgba(255,255,255,0.06)'),
          borderRadius: 10, padding: '8px 8px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: cgToday != null ? (cgToday >= 0 ? '#00d992' : '#f43f5e') : '#aaa', letterSpacing: 0.5 }}>NET FLOW</div>
          <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff', marginTop: 3 }}>
            {cgToday != null ? (cgToday >= 0 ? '+' : '') + cgToday.toFixed(0) + 'M' : '—'}
          </div>
          <div style={{ fontSize: 9, color: '#888', fontFamily: 'var(--mono)', marginTop: 1 }}>
            {cgToday != null ? 'bugün' : 'Coinglass key'}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── ETF Row ─────────────────────────────────────────────────────────────────
function ETFRow({ etf, maxVol }) {
  const isUp = (etf.changePct || 0) >= 0
  const tone = isUp ? '#00d992' : '#f43f5e'
  const vol  = (etf.volume || 0) * (etf.price || 0)
  const pct  = maxVol > 0 ? Math.min(100, (vol / maxVol) * 100) : 0
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 16px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: 4, flexShrink: 0,
        background: etf.color || '#6b7280',
      }} />
      <div style={{ width: 90, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', fontFamily: 'var(--mono)' }}>
          {etf.symbol}
        </div>
        <div style={{
          fontSize: 9, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden',
          textOverflow: 'ellipsis', marginTop: 1,
        }}>
          {(etf.longName || '').slice(0, 18)}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2,
          overflow: 'hidden', marginBottom: 4,
        }}>
          <div style={{
            height: '100%', width: pct + '%', borderRadius: 2,
            background: tone, transition: 'width 0.4s',
          }} />
        </div>
        <div style={{ fontSize: 10, color: '#888', fontFamily: 'var(--mono)' }}>
          {fmtUSD(vol)}
        </div>
      </div>
      <div style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
          {fmtPrice(etf.price)}
        </div>
        <div style={{ fontSize: 11, color: tone, fontWeight: 700, marginTop: 2 }}>
          {isUp ? '+' : ''}{(etf.changePct || 0).toFixed(2)}%
        </div>
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
          <div style={{ width: 90, flexShrink: 0 }}>
            <div style={{ height: 13, width: 50, borderRadius: 4, background: 'rgba(255,255,255,0.08)', marginBottom: 4 }} />
            <div style={{ height: 9, width: 70, borderRadius: 4, background: 'rgba(255,255,255,0.05)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ height: 3, width: '60%', borderRadius: 2, background: 'rgba(255,255,255,0.06)', marginBottom: 6 }} />
            <div style={{ height: 10, width: 60, borderRadius: 4, background: 'rgba(255,255,255,0.05)' }} />
          </div>
          <div style={{ width: 60 }}>
            <div style={{ height: 13, width: 50, borderRadius: 4, background: 'rgba(255,255,255,0.08)', marginBottom: 3, marginLeft: 'auto' }} />
            <div style={{ height: 10, width: 40, borderRadius: 4, background: 'rgba(255,255,255,0.05)', marginLeft: 'auto' }} />
          </div>
        </div>
      ))}
    </>
  )
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function ETFScreen() {
  const [type,    setType]    = useState('BTC')
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/etf-data?type=${type}`)
      if (!r.ok) return
      const d = await r.json()
      setData(d)
    } catch {}
    finally { setLoading(false) }
  }, [type])

  useEffect(() => {
    setLoading(true)
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  const etfs    = data?.etfs    || []
  const summary = data?.summary || null
  const sortedEtfs = [...etfs].sort((a, b) => ((b.volume || 0) * (b.price || 0)) - ((a.volume || 0) * (a.price || 0)))
  const maxVol = sortedEtfs.length ? (sortedEtfs[0].volume || 0) * (sortedEtfs[0].price || 0) : 1

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', color: 'var(--text)', paddingBottom: 32 }}>
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>ETF Data</div>
            <div style={{ fontSize: 11, color: '#fff', marginTop: 2 }}>
              Inflows · Volumes · Yahoo Finance
            </div>
            <div style={{ fontSize: 9, color: '#666', marginTop: 4, fontFamily: 'var(--mono)', letterSpacing: 0.3 }}>
              KAYNAK · Yahoo Finance{data?.hasCoinGlass ? ' + Coinglass netflow' : ''}
            </div>
          </div>
          {data?.totalAUM > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#666', fontWeight: 700, letterSpacing: 0.5 }}>TOTAL AUM</div>
              <div style={{ fontSize: 16, fontWeight: 900, fontFamily: 'var(--mono)', color: '#fff' }}>
                {fmtUSD(data.totalAUM)}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
          {TYPES.map(t => (
            <button key={t.key}
              onClick={() => { haptic('light'); setType(t.key) }}
              style={{
                background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer',
                borderBottom: type === t.key ? '2px solid #00d992' : '2px solid transparent',
                color: type === t.key ? '#fff' : '#666',
                fontSize: 13, fontWeight: 700,
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <ETFSentiment etfs={etfs} summary={summary} />

      <div style={{ display: 'flex', padding: '8px 16px', fontSize: 10, fontWeight: 700, color: '#666', letterSpacing: 0.5, alignItems: 'center', gap: 10 }}>
        <div style={{ width: 8 }} />
        <div style={{ width: 90 }}>ETF</div>
        <div style={{ flex: 1 }}>HACİM</div>
        <div style={{ textAlign: 'right' }}>FİYAT · DEĞİŞİM</div>
      </div>

      {loading
        ? <Skeleton />
        : sortedEtfs.length === 0
          ? <div style={{ padding: '40px 24px', textAlign: 'center', color: '#666', fontSize: 13 }}>ETF verisi alınamadı</div>
          : sortedEtfs.map(etf => <ETFRow key={etf.symbol} etf={etf} maxVol={maxVol} />)
      }

      {summary && Object.keys(summary).length > 0 && (
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#666', letterSpacing: 1, marginBottom: 8 }}>
            NETFLOW · COINGLASS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {[
              ['today',  'Bugün',  summary.today],
              ['week',   '7 Gün',  summary.week],
              ['month',  '30 Gün', summary.month],
              ['threeMonth', '90 Gün', summary.threeMonth],
            ].map(([k, label, v]) => (
              <div key={k} style={{
                background: v != null && v >= 0 ? 'rgba(0,217,146,0.06)' : (v != null ? 'rgba(244,63,94,0.06)' : 'rgba(255,255,255,0.03)'),
                border: '1px solid ' + (v != null && v >= 0 ? 'rgba(0,217,146,0.15)' : (v != null ? 'rgba(244,63,94,0.15)' : 'rgba(255,255,255,0.06)')),
                borderRadius: 10, padding: '8px 8px',
              }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: '#aaa', letterSpacing: 0.5 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: v != null && v >= 0 ? '#00d992' : (v != null ? '#f43f5e' : '#888'), marginTop: 3 }}>
                  {v != null ? (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(0) + 'M' : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
