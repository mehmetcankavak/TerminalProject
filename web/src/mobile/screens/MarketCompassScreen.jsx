import { useState, useEffect } from 'react'
import { API_BASE } from '../../config'

// Market Compass — composite sentiment from all 7 underlying signals.
// Backend /api/sentiment/compass blends Smart Money + Big Transfers + Funding
// + Liquidations + Volume + ETF + Global F&G into a single directional score
// with a confidence reading.

const COMPONENT_META = {
  smart_money:   { label: 'Smart Money',    note: 'Whale fills, gerçek pozisyon' },
  big_transfers: { label: 'Big Transfers',  note: 'CEX flow + mint/burn' },
  liquidations:  { label: 'Liquidations',   note: 'Long flush → bullish (contra)' },
  funding:       { label: 'Funding Rate',   note: 'Oversold → bullish (contra)' },
  volume:        { label: 'Volume × Price', note: 'Aktif alım/satım baskısı' },
  etf:           { label: 'ETF Flow',       note: 'BTC + ETH ETF net yön' },
  global:        { label: 'Global Macro',   note: 'F&G + market cap momentum' },
}

const ORDER = ['smart_money', 'big_transfers', 'liquidations', 'funding', 'volume', 'etf', 'global']

function verdictTone(v) {
  if (v === 'BULLISH') return '#00d992'
  if (v === 'BEARISH') return '#f43f5e'
  return '#aaa'
}

// ─── Master Gauge ─────────────────────────────────────────────────────────
function MasterGauge({ data }) {
  if (!data) return null
  const score = data.score || 0
  const tone  = verdictTone(data.verdict)
  const pct   = Math.max(0, Math.min(100, (score + 1) * 50))
  return (
    <div style={{ padding: '16px 16px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8 }}>
          MASTER COMPASS · TÜM SİNYALLER
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 900, fontFamily: 'var(--mono)', color: tone }}>
            {score >= 0 ? '+' : ''}{score.toFixed(2)}
          </span>
          <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: 0.8, color: tone }}>
            {data.verdict}
          </span>
        </div>
      </div>

      {/* Big gauge bar */}
      <div style={{ position: 'relative', height: 12, marginBottom: 10 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 6,
          background: 'linear-gradient(to right, rgba(244,63,94,0.5) 0%, rgba(244,63,94,0.15) 35%, rgba(255,255,255,0.06) 50%, rgba(0,217,146,0.15) 65%, rgba(0,217,146,0.5) 100%)',
        }} />
        <div style={{
          position: 'absolute', top: -2, bottom: -2, left: '50%',
          width: 1, background: 'rgba(255,255,255,0.18)', transform: 'translateX(-50%)',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: pct + '%',
          width: 18, height: 18, borderRadius: '50%', background: tone,
          boxShadow: '0 0 14px ' + tone + 'cc',
          border: '3px solid #000', transform: 'translate(-50%, -50%)',
          transition: 'left 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }} />
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 9, color: '#555', fontWeight: 700, letterSpacing: 0.5, marginBottom: 10,
      }}>
        <span>BEARISH</span>
        <span>NÖTR</span>
        <span>BULLISH</span>
      </div>

      {/* Confidence row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(255,255,255,0.03)', borderRadius: 10,
        padding: '10px 12px', border: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#888', letterSpacing: 0.5 }}>
            KONSENSÜS
          </div>
          <div style={{
            fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)', marginTop: 2,
            color: data.confidence_label === 'HIGH' ? '#00d992'
                 : data.confidence_label === 'MEDIUM' ? '#fbbf24' : '#f43f5e',
          }}>
            {data.confidence_label}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#888', letterSpacing: 0.5 }}>
            UYUM / AYRIŞMA
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)', marginTop: 2, color: '#fff' }}>
            <span style={{ color: '#00d992' }}>{data.agree_count}</span>
            <span style={{ color: '#666' }}> / </span>
            <span style={{ color: '#f43f5e' }}>{data.diverge_count}</span>
            <span style={{ color: '#666', fontSize: 10, marginLeft: 4 }}>
              / {data.total_components}
            </span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#888', letterSpacing: 0.5 }}>
            GÜVEN
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)', marginTop: 2, color: '#fff' }}>
            {(data.confidence * 100).toFixed(0)}%
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Component Row ───────────────────────────────────────────────────────
function ComponentRow({ id, comp, weight }) {
  const meta = COMPONENT_META[id]
  const score = comp.score || 0
  const tone  = verdictTone(comp.verdict)
  const pct   = Math.max(0, Math.min(100, (score + 1) * 50))
  const available = comp.available !== false
  return (
    <div style={{
      padding: '12px 16px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      opacity: available ? 1 : 0.45,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
            {meta?.label || id}
            <span style={{
              fontSize: 9, fontWeight: 700, color: '#666', marginLeft: 8,
              fontFamily: 'var(--mono)', letterSpacing: 0.3,
            }}>
              ×{(weight * 100).toFixed(0)}%
            </span>
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 1 }}>
            {meta?.note}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)', color: tone }}>
            {available ? (score >= 0 ? '+' : '') + score.toFixed(2) : '—'}
          </div>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.6, color: tone, marginTop: 1 }}>
            {available ? comp.verdict : 'NO DATA'}
          </div>
        </div>
      </div>

      {/* Mini gauge */}
      <div style={{ position: 'relative', height: 5 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 3,
          background: 'linear-gradient(to right, rgba(244,63,94,0.4) 0%, rgba(244,63,94,0.1) 35%, rgba(255,255,255,0.05) 50%, rgba(0,217,146,0.1) 65%, rgba(0,217,146,0.4) 100%)',
        }} />
        <div style={{
          position: 'absolute', top: -1, bottom: -1, left: '50%',
          width: 1, background: 'rgba(255,255,255,0.15)', transform: 'translateX(-50%)',
        }} />
        {available && (
          <div style={{
            position: 'absolute', top: '50%', left: pct + '%',
            width: 8, height: 8, borderRadius: '50%', background: tone,
            boxShadow: '0 0 6px ' + tone + 'aa',
            border: '1.5px solid #000', transform: 'translate(-50%, -50%)',
            transition: 'left 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          }} />
        )}
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center', color: '#555', fontSize: 13 }}>
      Tüm sinyaller harmanlanıyor…
    </div>
  )
}

// ─── Main Screen ─────────────────────────────────────────────────────────
// ─── Advisor Card — setup tespiti + risk uyarıları ─────────────────────────
// Bütün metinler durum tespiti niteliğinde, "AL/SAT" demez. "Neden?" açılır
// satırı her zaman kullanıcıya hangi koşulların tetiklediğini gösterir.
function AdvisorCard({ advisor }) {
  const [showReasons, setShowReasons] = useState(false)
  if (!advisor || !advisor.setup) return null
  const s = advisor.setup
  const risks = advisor.risks || []

  const toneColor =
    s.tone === 'bullish'          ? '#00d992'
  : s.tone === 'bearish'          ? '#f43f5e'
  : s.tone === 'contrarian_bull'  ? '#22d3ee'
  : s.tone === 'contrarian_bear'  ? '#f59e0b'
  :                                 '#aaa'

  return (
    <div style={{ padding: '12px 16px 4px' }}>
      {/* Setup kartı */}
      <div style={{
        background: `linear-gradient(180deg, ${toneColor}14 0%, rgba(255,255,255,0.02) 100%)`,
        border: `1px solid ${toneColor}33`,
        borderRadius: 14, padding: '12px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: toneColor, letterSpacing: 1 }}>
            DURUM TESPİTİ
          </div>
          <div style={{ fontSize: 9, color: '#555', fontFamily: 'var(--mono)' }}>{s.key}</div>
        </div>
        <div style={{ fontSize: 15, fontWeight: 900, color: toneColor, letterSpacing: 0.3, marginBottom: 6 }}>
          {s.title}
        </div>
        <div style={{ fontSize: 12, color: '#ccc', lineHeight: 1.5 }}>
          {s.message}
        </div>

        {s.reasons?.length > 0 && (
          <>
            <button onClick={() => setShowReasons(v => !v)}
              style={{
                marginTop: 8, padding: '4px 8px', borderRadius: 6,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                color: '#888', fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.3,
              }}>
              {showReasons ? '▾ NEDEN' : '▸ NEDEN'}
            </button>
            {showReasons && (
              <ul style={{
                marginTop: 8, paddingLeft: 18, fontSize: 11, color: '#999', lineHeight: 1.6,
                fontFamily: 'var(--mono)',
              }}>
                {s.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
          </>
        )}
      </div>

      {/* Risk uyarıları */}
      {risks.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{
            fontSize: 9, fontWeight: 800, color: '#f59e0b', letterSpacing: 1, marginBottom: 6, paddingLeft: 2,
          }}>
            DİKKAT
          </div>
          {risks.map(r => (
            <div key={r.key} style={{
              background: 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.18)',
              borderRadius: 10, padding: '8px 12px', marginBottom: 6,
            }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#f59e0b', marginBottom: 3 }}>
                {r.title}
              </div>
              <div style={{ fontSize: 11, color: '#bbb', lineHeight: 1.5 }}>
                {r.message}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* İzlemde — tetiklenmeye yakın setup'lar (collapsible) */}
      <WatchList watch={advisor.watch || []} />
    </div>
  )
}

// ─── Watch List — tetiklenmeye yakın setup'lar, tap ile aç-kapa ─────────────
function WatchItem({ w }) {
  const [open, setOpen] = useState(false)
  const toneColor =
    w.tone === 'bullish'         ? '#00d992'
  : w.tone === 'bearish'         ? '#f43f5e'
  : w.tone === 'contrarian_bull' ? '#22d3ee'
  : w.tone === 'contrarian_bear' ? '#f59e0b'
  : w.tone === 'risk'            ? '#f59e0b'
  :                                '#888'
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 10, marginBottom: 6, overflow: 'hidden',
    }}>
      <button onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer',
          background: 'transparent', border: 'none', padding: '9px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
        <span style={{ color: toneColor, fontSize: 11, fontWeight: 800, width: 10, flexShrink: 0 }}>
          {open ? '▾' : '▸'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: toneColor, marginBottom: 2 }}>
            {w.title}
          </div>
          <div style={{ fontSize: 10, color: '#888', fontFamily: 'var(--mono)' }}>
            {w.hook}
          </div>
        </div>
        {/* progress mini-bar */}
        <div style={{ width: 36, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ width: `${w.progress * 100}%`, height: '100%', background: toneColor }} />
        </div>
      </button>

      {open && (
        <div style={{ padding: '4px 12px 10px 30px' }}>
          {w.conditions.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11, marginBottom: 4 }}>
              <span style={{ color: c.met ? '#00d992' : '#666', fontWeight: 800, width: 10 }}>
                {c.met ? '✓' : '○'}
              </span>
              <span style={{ flex: 1, color: c.met ? '#aaa' : '#bbb' }}>{c.label}</span>
              <span style={{ fontFamily: 'var(--mono)', color: '#666', fontSize: 10 }}>
                {c.current.toFixed(2)} {c.op === 'gt' ? '→' : '←'} {c.threshold}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WatchList({ watch }) {
  if (!watch || !watch.length) return null
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{
        fontSize: 9, fontWeight: 800, color: '#888', letterSpacing: 1, marginBottom: 6, paddingLeft: 2,
      }}>
        İZLEMDE
      </div>
      {watch.map(w => <WatchItem key={w.key} w={w} />)}
    </div>
  )
}

export default function MarketCompassScreen() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const r = await fetch(`${API_BASE}/api/sentiment/compass`)
        if (!r.ok) { setError('HTTP ' + r.status); setLoading(false); return }
        const d = await r.json()
        if (!alive) return
        setData(d)
        setError(null)
      } catch (e) {
        setError(String(e?.message || e))
      } finally {
        setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 30_000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', color: 'var(--text)', paddingBottom: 32 }}>
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Market Compass</div>
        <div style={{ fontSize: 11, color: '#fff', marginTop: 2 }}>
          7 sinyalin kompozit yön analizi
        </div>
        <div style={{ fontSize: 9, color: '#666', marginTop: 4, fontFamily: 'var(--mono)', letterSpacing: 0.3 }}>
          KAYNAK · 7 underlying sentiment · 30s yenileme
        </div>
      </div>

      {loading
        ? <Skeleton />
        : error
          ? <div style={{ padding: '40px 24px', textAlign: 'center', color: '#f43f5e', fontSize: 13 }}>
              Hata: {error}
            </div>
          : (
            <>
              <MasterGauge data={data} />

              <AdvisorCard advisor={data.advisor} />

              <div style={{ padding: '16px 16px 0' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#666', letterSpacing: 1, marginBottom: 10 }}>
                  BİLEŞEN ANALİZİ
                </div>
              </div>

              <div>
                {ORDER.map(id => {
                  const comp = data.components?.[id]
                  const weight = data.weights?.[id] || 0
                  if (!comp) return null
                  return <ComponentRow key={id} id={id} comp={comp} weight={weight} />
                })}
              </div>

              <BacktestSection />
            </>
          )
      }
    </div>
  )
}

// ─── Backtest — setup'ların geçmiş BTC fiyatı üzerindeki edge'i ─────────────
// compass_history dolu mu, hangi setup tetiklenmiş, sonrası ne olmuş.
// Pahalı çağrı olduğu için on-mount'ta otomatik fetch eder ama refresh yok.
function BacktestSection() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [opened,  setOpened]  = useState(false)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`${API_BASE}/api/sentiment/backtest`)
      const j = await r.json()
      setData(j)
    } catch (e) { setError(String(e?.message || e)) }
    finally { setLoading(false) }
  }

  // Lazy: kullanıcı bölümü açana kadar fetch etme — pahalı çağrı.
  const toggle = () => {
    if (!opened && !data) load()
    setOpened(v => !v)
  }

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <button onClick={toggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', cursor: 'pointer',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10, color: '#ddd', fontSize: 12, fontWeight: 700, letterSpacing: 0.4,
        }}>
        <span style={{ color: '#888' }}>{opened ? '▾' : '▸'}</span>
        <span style={{ flex: 1, textAlign: 'left' }}>GEÇMİŞ PERFORMANS</span>
        <span style={{ fontSize: 9, color: '#666', fontFamily: 'var(--mono)' }}>
          BTC · setup → return
        </span>
      </button>

      {opened && (
        <div style={{ marginTop: 8 }}>
          {loading && (
            <div style={{ padding: 16, textAlign: 'center', color: '#666', fontSize: 12 }}>
              Hesaplanıyor…
            </div>
          )}
          {error && (
            <div style={{ padding: 12, textAlign: 'center', color: '#f43f5e', fontSize: 12 }}>
              Hata: {error}
            </div>
          )}
          {data && !loading && !error && <BacktestBody data={data} />}
        </div>
      )}
    </div>
  )
}

function BacktestBody({ data }) {
  if (!data.available) {
    return (
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px dashed rgba(255,255,255,0.08)',
        borderRadius: 10, padding: '18px 14px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 12, color: '#888', lineHeight: 1.6 }}>
          {data.message || 'Henüz yeterli veri yok.'}
        </div>
        <div style={{ fontSize: 10, color: '#555', marginTop: 8, fontFamily: 'var(--mono)' }}>
          compass_history dolarken sonuçlar burada görünecek.
        </div>
      </div>
    )
  }

  const setups = Object.entries(data.results_by_setup || {})
  if (setups.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: '#666', fontSize: 12 }}>
        Hiç işlenebilir tetiklenme yok.
      </div>
    )
  }

  return (
    <>
      <div style={{ fontSize: 10, color: '#555', marginBottom: 8, fontFamily: 'var(--mono)' }}>
        {data.processed} tetiklenme · {data.skipped} atlandı
      </div>
      {setups.map(([key, horizons]) => (
        <SetupBacktestCard key={key} setupKey={key} horizons={horizons} />
      ))}
    </>
  )
}

function SetupBacktestCard({ setupKey, horizons }) {
  const titleMap = {
    EARLY_ACCUMULATION:  'Erken Birikim',
    DISTRIBUTION_TOP:    'Tepe Uyarısı',
    CAPITULATION_BOTTOM: 'Panik Satışı',
    TREND_CONTINUATION:  'Trend Devamı',
  }
  const ORDER = ['1h', '6h', '24h', '7d']

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 10, padding: '10px 12px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#ddd' }}>
          {titleMap[setupKey] || setupKey}
        </div>
        <div style={{ fontSize: 9, color: '#555', fontFamily: 'var(--mono)' }}>{setupKey}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {ORDER.map(h => {
          const s = horizons[h] || {}
          const isEmpty = !s.samples
          const isWeak  = s.insufficient_samples
          const ret  = s.avg_return_pct
          const win  = s.win_rate_pct
          const tone = ret == null ? '#555' : ret >= 0 ? '#00d992' : '#f43f5e'

          return (
            <div key={h} style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 8, padding: '6px 4px', textAlign: 'center',
              opacity: isWeak ? 0.55 : 1,
            }}>
              <div style={{ fontSize: 9, color: '#666', fontWeight: 700 }}>{h.toUpperCase()}</div>
              {isEmpty
                ? <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>—</div>
                : (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 800, color: tone, fontFamily: 'var(--mono)', marginTop: 2 }}>
                      {ret >= 0 ? '+' : ''}{ret?.toFixed(2)}%
                    </div>
                    <div style={{ fontSize: 9, color: '#888', fontFamily: 'var(--mono)', marginTop: 1 }}>
                      {win?.toFixed(0)}% · n={s.samples}
                    </div>
                  </>
                )
              }
            </div>
          )
        })}
      </div>

      {ORDER.some(h => horizons[h]?.insufficient_samples) && (
        <div style={{ fontSize: 9, color: '#666', marginTop: 6, fontStyle: 'italic' }}>
          Soluk hücreler: &lt; 10 örnek, istatistiksel olarak henüz güvenilir değil.
        </div>
      )}
    </div>
  )
}
