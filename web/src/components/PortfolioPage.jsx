import { useState, useEffect, useCallback } from 'react'
import { API_BASE } from '../config'
import { useAuth } from '../context/AuthContext'
import DataState from './DataState'

const fmt = (n, dec = 2) => n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const fmtPnl = (n) => n == null ? '—' : (n >= 0 ? '+$' : '-$') + fmt(Math.abs(n))
const fmtPct = (n) => n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
const normSide = (side) => String(side || '').trim().toLowerCase()
const isLongSide = (side) => {
    const s = normSide(side)
    return s === 'long' || s === 'buy'
}
const sideLabel = (side) => {
    const s = normSide(side)
    if (s === 'long' || s === 'buy') return 'LONG'
    if (s === 'short' || s === 'sell') return 'SHORT'
    return String(side || '—').toUpperCase()
}
const timeAgo = (iso) => {
    if (!iso) return '—'
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (s < 60) return `${s}s ago`
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
}

export default function PortfolioPage() {
    const { token } = useAuth()
    const [data, setData] = useState(null)
    const [loadingPf, setLoadingPf] = useState(true)
    const [errorPf, setErrorPf] = useState(null)
    const [activeTab, setActiveTab] = useState('positions')
    const [chartTab, setChartTab] = useState('overview')
    const [chartRange, setChartRange] = useState('all')

    // PnL chart hover state
    const [hoverPt, setHoverPt] = useState(null) // { idx, x, y, cum, pnl, label }

    // HL Send / Withdraw modal state
    const [hlModal, setHlModal] = useState(null) // null | 'send' | 'withdraw'
    const [hlAmount, setHlAmount] = useState('')
    const [hlDest, setHlDest] = useState('')
    const [hlBusy, setHlBusy] = useState(false)
    const [hlMsg, setHlMsg] = useState(null) // { ok, text }

    // Live exchange data
    const [liveData, setLiveData] = useState(null)

    const load = useCallback(() =>
        fetch(`${API_BASE}/api/portfolio`, token ? { headers: { Authorization: `Bearer ${token}` } } : {})
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
            .then(d => { setData(d); setErrorPf(null); setLoadingPf(false) })
            .catch(e => { setErrorPf(e.message); setLoadingPf(false) }), [token])

    const loadLive = useCallback(() => {
        if (!token) return
        fetch(`${API_BASE}/api/balances`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setLiveData(d) })
            .catch(() => {})
    }, [token])

    useEffect(() => {
        load()
        const id = setInterval(load, 30_000)  // trade history ağır — 30s yeterli
        return () => clearInterval(id)
    }, [load])

    useEffect(() => {
        loadLive()
        const id = setInterval(loadLive, 15_000)  // bakiye 15s
        return () => clearInterval(id)
    }, [loadLive])

    const openHlModal = (type) => {
        setHlModal(type)
        setHlAmount('')
        setHlDest('')
        setHlMsg(null)
    }

    const closeHlModal = () => { setHlModal(null); setHlMsg(null) }

    const submitHlAction = async () => {
        const amt = parseFloat(hlAmount)
        if (!isFinite(amt) || amt <= 0) { setHlMsg({ ok: false, text: 'Geçerli bir miktar girin' }); return }
        if (hlModal === 'send' && !hlDest.trim()) { setHlMsg({ ok: false, text: 'Hedef adres boş olamaz' }); return }
        setHlBusy(true)
        setHlMsg(null)
        try {
            const endpoint = hlModal === 'withdraw' ? '/api/hl/withdraw' : '/api/hl/send'
            const body = hlModal === 'withdraw'
                ? { amount: amt }
                : { destination: hlDest.trim(), amount: amt }
            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            })
            const data = await res.json()
            if (data.ok) {
                setHlMsg({ ok: true, text: hlModal === 'withdraw' ? `$${amt} çekim işlemi gönderildi` : `$${amt} gönderildi` })
                setTimeout(closeHlModal, 2000)
            } else {
                setHlMsg({ ok: false, text: data.error || 'İşlem başarısız' })
            }
        } catch (e) {
            setHlMsg({ ok: false, text: e.message })
        } finally {
            setHlBusy(false)
        }
    }

    const balance       = data?.balance ?? 0
    const available     = data?.available ?? 0
    const marginUsed    = data?.margin_used ?? liveData?.balances?.total_margin_used ?? 0
    const isHyperliquidPortfolio = data?.source === 'hyperliquid'
    const realizedPnl   = isHyperliquidPortfolio ? (data?.all_time_pnl ?? data?.realized_pnl ?? null) : (data?.realized_pnl ?? null)
    const unrealizedPnl = data?.unrealized_pnl ?? null
    const winRate       = data?.win_rate ?? null
    const tradeCount    = data?.trade_count ?? 0
    const winCount      = data?.win_count ?? 0
    const lossCount     = data?.loss_count ?? 0
    const breakevenCount= data?.breakeven_count ?? 0
    const avgWin        = data?.avg_win ?? null
    const avgLoss       = data?.avg_loss ?? null
    const bestTrade     = data?.best_trade ?? null
    const worstTrade    = data?.worst_trade ?? null
    const sharpe        = data?.sharpe ?? null
    const sortino       = data?.sortino ?? null
    const maxDrawdown   = data?.max_drawdown ?? null
    const maxDrawdownPct= data?.max_drawdown_pct ?? null
    const expectancy    = data?.expectancy ?? null
    const profitFactor  = data?.profit_factor ?? null
    const avgHoldMin    = data?.avg_hold_minutes ?? null
    const avgHoldCoveragePct = data?.avg_hold_coverage_pct ?? 0
    const totalFees     = data?.total_fees ?? 0
    const fundingClosed = data?.funding_closed ?? 0
    const fundingOpen   = data?.funding_open ?? 0
    const netPnlNow     = data?.net_pnl_now ?? null
    const positions     = data?.positions || []
    const trades        = data?.trades || []
    const pnlHistory    = data?.pnl_history || []
    const pnlWindows    = data?.pnl_windows || {}

    const pnlColor = (n) => n == null ? '' : n >= 0 ? 'green' : 'red'

    if (loadingPf || errorPf) {
        return (
            <div className="hl-pf-page">
                <DataState loading={loadingPf} error={errorPf} onRetry={load} minHeight={300} />
            </div>
        )
    }

    // Parse live exchange data
    const liveSource = liveData?.source
    const liveBalances = liveData?.balances
    const isLiveConnected = liveSource && liveSource !== 'paper' && liveBalances
    const canUseHlTransfers = isLiveConnected && liveSource === 'hyperliquid'

    // Chart Points Calculation
    const rangeHistory = pnlWindows?.[chartRange] || []
    const useOfficialHyperliquidChart = isHyperliquidPortfolio && rangeHistory.length > 0
    let currentCum = 0
    const chartPoints = useOfficialHyperliquidChart
        ? rangeHistory.map((p) => ({
            cum: p.pnl,
            pnl: null,
            isDynamic: false,
            date: p.timestamp ? new Date(p.timestamp).toISOString() : null,
            symbol: 'HL',
        }))
        : trades.reduce((acc, t, i) => {
            currentCum += (t.total_pnl ?? t.realized_pnl ?? 0)
            acc.push({ cum: currentCum, pnl: (t.total_pnl ?? t.realized_pnl ?? 0), isDynamic: false, date: t.closed_at, symbol: t.symbol, side: t.side, idx: i + 1 })
            return acc
        }, [])

    if (!useOfficialHyperliquidChart && positions.length > 0) {
        chartPoints.push({ cum: currentCum + (unrealizedPnl || 0), pnl: unrealizedPnl || 0, isDynamic: true, idx: trades.length + 1 })
    }
    
    if (chartPoints.length === 1) chartPoints.unshift({ cum: 0, pnl: 0, isDynamic: false })

    // Hover state formatting
    const hoveredPoint = hoverPt?.idx != null ? chartPoints[hoverPt.idx] : null;
    const lastCum = chartPoints[chartPoints.length - 1]?.cum || 0;
    const initialBalance = balance - lastCum;
    
    const currentDisplayBalance = hoveredPoint ? initialBalance + hoveredPoint.cum : balance;
    const currentDisplayPnl = hoveredPoint ? hoveredPoint.cum : realizedPnl;
    const displayDate = hoveredPoint?.date ? new Date(hoveredPoint.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }).replace('/', '/') : null;

    return (
        <>
        <div className="hl-pf-page">
            {/* ── Live Exchange Banner ── */}
            {isLiveConnected && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: 1,
                    marginBottom: 16,
                    border: '1px solid #0d2a1f',
                    background: '#020d08',
                    borderRadius: 4,
                    overflow: 'hidden',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#020d08', gridColumn: '1/-1', borderBottom: '1px solid #0d2a1f' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#39ff14', boxShadow: '0 0 6px #39ff1466', flexShrink: 0 }} />
                        <span style={{ fontSize: 10, letterSpacing: '.1em', color: '#39ff14', fontWeight: 700, textTransform: 'uppercase' }}>
                            Live — {liveSource === 'hyperliquid' ? 'HyperLiquid' : 'Binance Futures'}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#3a4a3a' }}>real-time</span>
                    </div>
                    {[
                        ['Account Value',    liveBalances.account_value  ?? liveBalances.total],
                        ['Available',        liveBalances.withdrawable    ?? liveBalances.available],
                        ['Margin Used',      liveBalances.total_margin_used],
                        ['Unrealized P&L',   liveBalances.unrealized_pnl],
                    ].map(([label, val]) => val != null && (
                        <div key={label} style={{ padding: '10px 14px', borderRight: '1px solid #0d2a1f' }}>
                            <div style={{ fontSize: 10, color: '#3a5a3a', letterSpacing: '.07em', marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
                            <div style={{
                                fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)',
                                color: label.includes('P&L')
                                    ? (val >= 0 ? '#39ff14' : '#ff3b5c')
                                    : '#c8e8c8',
                            }}>
                                {label.includes('P&L') ? (val >= 0 ? '+' : '') : ''}${fmt(val)}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {!isLiveConnected && token && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '8px 14px', border: '1px solid #1a1a1a', borderRadius: 4, background: '#090909' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2a2a2a', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: '#3a3a3a' }}>No live exchange connected —</span>
                    <span
                        onClick={() => window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page: 'terminal' } }))}
                        style={{ fontSize: 11, color: '#3a6a4a', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                        connect Binance or HyperLiquid in Terminal
                    </span>
                </div>
            )}

            {/* ── New App-Style Header ── */}
            <div style={{ padding: '24px', background: '#000', borderRadius: 16, border: '1px solid #1a1a1a', marginBottom: 24 }}>
                {/* Account row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {liveSource === 'hyperliquid' ? (
                            <img src="https://icons.llamao.fi/icons/protocols/hyperliquid" alt="HyperLiquid" style={{ width: 28, height: 28, borderRadius: 6 }} />
                        ) : liveSource === 'binance' ? (
                            <img src="/logos/binance.png" alt="Binance" style={{ width: 28, height: 28, borderRadius: 6 }} />
                        ) : (
                            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#39ff14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <div style={{ width: 12, height: 12, background: '#000', borderRadius: 2 }} />
                            </div>
                        )}
                        <div style={{ fontSize: 16, fontWeight: 600, color: '#c8e8c8' }}>
                            {liveSource === 'hyperliquid' ? 'HyperLiquid' : liveSource === 'binance' ? 'Binance' : 'Account 01'}
                        </div>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 8, cursor: 'pointer' }}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={() => canUseHlTransfers ? openHlModal('send') : null}
                            style={{
                                background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600, cursor: canUseHlTransfers ? 'pointer' : 'not-allowed', opacity: canUseHlTransfers ? 1 : 0.35
                            }}
                        >Send</button>
                        <button
                            onClick={() => canUseHlTransfers ? openHlModal('withdraw') : null}
                            style={{
                                background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600, cursor: canUseHlTransfers ? 'pointer' : 'not-allowed', opacity: canUseHlTransfers ? 1 : 0.35
                            }}
                        >Withdraw</button>
                    </div>
                </div>

                {/* Balance & PnL */}
                <div style={{ marginBottom: 32 }}>
                    <div style={{ fontSize: 42, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                        ${fmt(currentDisplayBalance)}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 500, marginTop: 4 }}>
                        <span style={{ color: '#fff' }}>{fmtPnl(currentDisplayPnl)}</span>
                        {' '}
                        {currentDisplayPnl != null && currentDisplayBalance - currentDisplayPnl > 0 ? (
                            <span style={{ color: currentDisplayPnl >= 0 ? '#39ff14' : '#ff3b5c' }}>
                                ({currentDisplayPnl > 0 ? '+' : ''}{fmtPct((currentDisplayPnl / (currentDisplayBalance - currentDisplayPnl)) * 100)})
                            </span>
                        ) : ''}
                        <span style={{ color: '#888', marginLeft: 8 }}>{chartRange.toUpperCase()}</span>
                    </div>
                </div>

                {/* Chart Area */}
                <div style={{ height: 220, position: 'relative', margin: '0 -16px' }}>
                    {(() => {
                        if (chartPoints.length === 0) {
                            return <div style={{ color: '#666', textAlign: 'center', paddingTop: 80 }}>No chart data</div>
                        }

                        const vals = chartPoints.map(p => p.cum)
                        const minV = Math.min(0, ...vals)
                        const maxV = Math.max(0, ...vals)
                        const range = maxV - minV || 1

                        const CW = 800, CH = 220
                        const CP = { t: 20, r: 40, b: 20, l: 0 }
                        const ciW = CW - CP.l - CP.r
                        const ciH = CH - CP.t - CP.b

                        const cToX = (i) => CP.l + (i / Math.max(chartPoints.length - 1, 1)) * ciW
                        const cToY = (v) => CP.t + ciH - ((v - minV) / range) * ciH
                        
                        // Pixelate the line
                        const pixelSize = 4;
                        const rects = [];
                        let stepPts = `${cToX(0)},${CH} `; // for the gradient area

                        for (let i = 0; i < chartPoints.length - 1; i++) {
                            const p1 = chartPoints[i];
                            const p2 = chartPoints[i+1];
                            let x1 = Math.round(cToX(i) / pixelSize) * pixelSize;
                            let y1 = Math.round(cToY(p1.cum) / pixelSize) * pixelSize;
                            let x2 = Math.round(cToX(i+1) / pixelSize) * pixelSize;
                            let y2 = Math.round(cToY(p2.cum) / pixelSize) * pixelSize;

                            stepPts += `${x1},${y1} ${x2},${y1} ${x2},${y2} `;

                            // Draw horizontal line
                            for (let x = x1; x < x2; x += pixelSize) {
                                rects.push({ x, y: y1 });
                            }
                            // Draw vertical line at x2
                            let startY = Math.min(y1, y2);
                            let endY = Math.max(y1, y2);
                            for (let y = startY; y <= endY; y += pixelSize) {
                                rects.push({ x: x2, y });
                            }
                        }
                        if (chartPoints.length > 0) {
                            let lx = Math.round(cToX(chartPoints.length - 1) / pixelSize) * pixelSize;
                            let ly = Math.round(cToY(chartPoints[chartPoints.length - 1].cum) / pixelSize) * pixelSize;
                            rects.push({ x: lx, y: ly });
                            stepPts += `${lx},${ly} ${lx},${CH} 0,${CH}`;
                        }

                        // Remove duplicate rects to keep DOM clean
                        const uniqueRects = Array.from(new Set(rects.map(r => `${r.x},${r.y}`))).map(str => {
                            const [x, y] = str.split(',').map(Number);
                            return { x, y };
                        });

                        return (
                            <svg 
                                width="100%" height="100%" viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none"
                                onMouseMove={e => {
                                    const rect = e.currentTarget.getBoundingClientRect()
                                    const svgX = ((e.clientX - rect.left) / rect.width) * CW
                                    const idx  = Math.min(chartPoints.length - 1, Math.max(0, Math.round((svgX - CP.l) / ciW * (chartPoints.length - 1))))
                                    setHoverPt({ idx, x: cToX(idx) })
                                }}
                                onMouseLeave={() => setHoverPt(null)}
                                style={{ cursor: 'crosshair' }}
                            >
                                {/* Defs for glow and area */}
                                <defs>
                                    <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
                                        <feGaussianBlur stdDeviation="3" result="blur" />
                                        <feMerge>
                                            <feMergeNode in="blur" />
                                            <feMergeNode in="SourceGraphic" />
                                        </feMerge>
                                    </filter>
                                    <linearGradient id="area-fade" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#39ff14" stopOpacity="0.3" />
                                        <stop offset="100%" stopColor="#39ff14" stopOpacity="0.0" />
                                    </linearGradient>
                                    <pattern id="pixelGrid" width="8" height="8" patternUnits="userSpaceOnUse">
                                        <rect width="8" height="8" fill="none" />
                                        <path d="M 8 0 L 0 0 0 8" fill="none" stroke="#0a150a" strokeWidth="1" />
                                    </pattern>
                                </defs>

                                {/* Area Fill with Gradient */}
                                <polygon points={stepPts} fill="url(#area-fade)" />

                                {/* Grid Background over Gradient to make gradient look pixelated */}
                                <rect width="100%" height="100%" fill="url(#pixelGrid)" opacity="0.8" />

                                {/* Pixelated Line */}
                                <g filter="url(#neon-glow)">
                                    {uniqueRects.map((r, i) => (
                                        <rect key={`pt-${i}`} x={r.x} y={r.y} width={pixelSize - 1} height={pixelSize - 1} fill="#39ff14" />
                                    ))}
                                </g>

                                {/* Hover State */}
                                {hoverPt?.idx != null && (
                                    <>
                                        <line x1={hoverPt.x} y1={0} x2={hoverPt.x} y2={CH} stroke="#39ff14" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
                                        <rect x={hoverPt.x - 2} y={cToY(chartPoints[hoverPt.idx].cum) - 2} width="4" height="4" fill="#fff" filter="url(#neon-glow)" />
                                        {displayDate && (
                                            <text x={hoverPt.x} y={CP.t - 5} textAnchor="middle" fill="#aaa" fontSize="10" fontFamily="var(--font-mono)">
                                                {displayDate}
                                            </text>
                                        )}
                                    </>
                                )}

                                {/* Labels */}
                                <text x={CW - 5} y={cToY(maxV) + 4} textAnchor="end" fill="#888" fontSize="11" fontFamily="var(--font-mono)">${maxV.toFixed(2)}</text>
                                <text x={CW - 5} y={cToY(minV) + 4} textAnchor="end" fill="#888" fontSize="11" fontFamily="var(--font-mono)">${minV.toFixed(2)}</text>
                                <text x={CW - 5} y={cToY(0) + 4} textAnchor="end" fill="#666" fontSize="11" fontFamily="var(--font-mono)">$0.00</text>
                            </svg>
                        )
                    })()}
                </div>

                {/* Timeframes */}
                <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 12, marginTop: 16 }}>
                    {[['24h','1D'],['7d','1W'],['30d','1M'],['all','1Y']].map(([key, label]) => (
                        <button key={key} onClick={() => setChartRange(key)} style={{
                            background: chartRange === key ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: chartRange === key ? '#fff' : '#666',
                            border: 'none',
                            padding: '6px 16px',
                            borderRadius: 20,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Top Grid ── */}
            <div className="hl-pf-top-grid" style={{ gridTemplateColumns: '320px 1fr' }}>

                {/* Orta Kolon — Summary */}
                <div className="hl-pf-card hl-pf-summary-list">
                    <div className="hl-pf-summary-item" style={{ borderBottom: '1px solid var(--border-0)', paddingBottom: 8, marginBottom: 4 }}>
                        <span style={{ color: '#8b9eb7', fontSize: 13 }}>Statistics</span>
                        <span style={{ color: '#8b9eb7', fontSize: 12 }}>All-time</span>
                    </div>
                    <div className="hl-pf-summary-item">
                        <span className="hl-pf-summary-lbl">Total P&amp;L</span>
                        <span className={`hl-pf-summary-val ${pnlColor(realizedPnl)}`}>
                            {realizedPnl != null ? fmtPnl(realizedPnl) : '—'}
                        </span>
                    </div>
                    <div className="hl-pf-summary-item">
                        <span className="hl-pf-summary-lbl">Win Rate</span>
                        <span className={`hl-pf-summary-val ${winRate != null ? (winRate >= 50 ? 'green' : 'red') : ''}`}>
                            {winRate != null ? `${winRate}%` : '—'}
                            {tradeCount > 0 && <span style={{ color: '#8b9eb7', fontWeight: 400 }}> ({winCount}W / {lossCount}L / {breakevenCount}BE)</span>}
                        </span>
                    </div>
                    <div className="hl-pf-summary-item">
                        <span className="hl-pf-summary-lbl">Total Trades</span>
                        <span className="hl-pf-summary-val">{tradeCount}</span>
                    </div>
                    <div className="hl-pf-summary-item">
                        <span className="hl-pf-summary-lbl">Avg Win</span>
                        <span className="hl-pf-summary-val green">{avgWin ? fmtPnl(avgWin) : '—'}</span>
                    </div>
                    <div className="hl-pf-summary-item">
                        <span className="hl-pf-summary-lbl">Avg Loss</span>
                        <span className="hl-pf-summary-val red">{avgLoss ? fmtPnl(avgLoss) : '—'}</span>
                    </div>
                    <div className="hl-pf-summary-item">
                        <span className="hl-pf-summary-lbl">Best Trade</span>
                        <span className="hl-pf-summary-val green">
                            {bestTrade ? `${fmtPnl(bestTrade.realized_pnl)} (${bestTrade.symbol.replace('USDT', '')})` : '—'}
                        </span>
                    </div>
                    <div className="hl-pf-summary-item">
                        <span className="hl-pf-summary-lbl">Worst Trade</span>
                        <span className="hl-pf-summary-val red">
                            {worstTrade ? `${fmtPnl(worstTrade.realized_pnl)} (${worstTrade.symbol.replace('USDT', '')})` : '—'}
                        </span>
                    </div>
                    <div className="hl-pf-summary-item" style={{ borderTop: '1px dashed var(--border-0)', paddingTop: 8, marginTop: 4 }}>
                        <span className="hl-pf-summary-lbl">Sharpe Ratio</span>
                        <span className={`hl-pf-summary-val ${sharpe == null ? '' : sharpe >= 1 ? 'green' : sharpe >= 0 ? '' : 'red'}`}>
                            {sharpe != null ? sharpe.toFixed(2) : tradeCount < 2 ? 'N/A' : '—'}
                        </span>
                    </div>
                    <div className="hl-pf-summary-item">
                        <span className="hl-pf-summary-lbl">Sortino Ratio</span>
                        <span className={`hl-pf-summary-val ${sortino == null ? '' : sortino >= 1 ? 'green' : sortino >= 0 ? '' : 'red'}`}>
                            {sortino != null ? sortino.toFixed(2) : tradeCount < 2 ? 'N/A' : '—'}
                        </span>
                    </div>
                    <div className="hl-pf-summary-item">
                        <span className="hl-pf-summary-lbl">Max Drawdown</span>
                        <span className={`hl-pf-summary-val ${maxDrawdown > 0 ? 'red' : ''}`}>
                            {maxDrawdown != null && maxDrawdown > 0
                                ? `-$${fmt(maxDrawdown)} (${maxDrawdownPct}%)`
                                : tradeCount < 2 ? 'N/A' : '—'}
                        </span>
                    </div>
                    <div className="hl-pf-summary-item">
                        <span className="hl-pf-summary-lbl">Expectancy / Trade</span>
                        <span className={`hl-pf-summary-val ${expectancy == null ? '' : expectancy >= 0 ? 'green' : 'red'}`}>
                            {expectancy == null ? '—' : fmtPnl(expectancy)}
                        </span>
                    </div>
                    <div className="hl-pf-summary-item">
                        <span className="hl-pf-summary-lbl">Profit Factor</span>
                        <span className="hl-pf-summary-val">{profitFactor == null ? '—' : profitFactor.toFixed(2)}</span>
                    </div>
                    <div className="hl-pf-summary-item">
                        <span className="hl-pf-summary-lbl">Avg Hold Time</span>
                        <span className="hl-pf-summary-val">{avgHoldMin == null ? '—' : `${avgHoldMin.toFixed(1)}m`}</span>
                    </div>
                    {tradeCount > 0 && (
                        <div style={{ color: '#8b9eb7', fontSize: 10, marginTop: -4 }}>
                            Hold-time coverage: {avgHoldCoveragePct.toFixed(1)}%
                        </div>
                    )}
                    {tradeCount < 2 && (
                        <div style={{ color: '#8b9eb7', fontSize: 10, marginTop: -4 }}>
                            Sharpe/Sortino için en az 2 kapanmış işlem gerekir.
                        </div>
                    )}
                    <div className="hl-pf-summary-item" style={{ borderTop: '1px dashed var(--border-0)', paddingTop: 8, marginTop: 4 }}>
                        <span className="hl-pf-summary-lbl">Open Positions</span>
                        <span className="hl-pf-summary-val">{positions.length}</span>
                    </div>
                </div>

                {/* Sağ Kolon — P&L Overview */}
                <div className="hl-pf-card hl-pf-chart-area">
                    <div style={{ color: '#8b9eb7', fontSize: 13, borderBottom: '1px solid var(--border-0)', paddingBottom: 12, marginBottom: 12 }}>
                        P&amp;L Overview
                    </div>

                    <div style={{ padding: '0 0 12px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ color: '#8b9eb7', fontSize: 11, marginBottom: 4 }}>{isHyperliquidPortfolio ? 'ALL-TIME PNL' : 'REALIZED TODAY'}</div>
                                <div style={{ fontSize: 22, fontWeight: 500 }} className={pnlColor(realizedPnl)}>
                                    {fmtPnl(realizedPnl)}
                                </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ color: '#8b9eb7', fontSize: 11, marginBottom: 4 }}>UNREALIZED</div>
                                    <div style={{ fontSize: 22, fontWeight: 500 }} className={pnlColor(unrealizedPnl)}>
                                        {fmtPnl(unrealizedPnl)}
                                    </div>
                                </div>
                            </div>
                            <div style={{ borderTop: '1px solid var(--border-0)', paddingTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <div style={{ color: '#8b9eb7', fontSize: 11 }}>
                                    NET NOW
                                    <div className={pnlColor(netPnlNow)} style={{ fontSize: 16, fontWeight: 500, marginTop: 3 }}>
                                        {fmtPnl(netPnlNow)}
                                    </div>
                                </div>
                                <div style={{ color: '#8b9eb7', fontSize: 11, textAlign: 'right' }}>
                                    FUNDING (CLOSED/OPEN)
                                    <div style={{ fontSize: 13, marginTop: 3 }}>
                                        <span className={pnlColor(fundingClosed)}>{fmtPnl(fundingClosed)}</span>
                                        <span style={{ color: '#8b9eb7' }}> / </span>
                                        <span className={pnlColor(fundingOpen)}>{fmtPnl(fundingOpen)}</span>
                                    </div>
                                </div>
                                <div style={{ color: '#8b9eb7', fontSize: 11, gridColumn: '1 / -1' }}>
                                    PNL EXPLAIN:
                                    <span style={{ marginLeft: 6 }} className={pnlColor(realizedPnl)}>{fmtPnl(realizedPnl)}</span>
                                    <span style={{ color: '#8b9eb7' }}> + </span>
                                    <span className={pnlColor(unrealizedPnl)}>{fmtPnl(unrealizedPnl)}</span>
                                    <span style={{ color: '#8b9eb7' }}> = </span>
                                    <span className={pnlColor(netPnlNow)}>{fmtPnl(netPnlNow)}</span>
                                    <span style={{ color: '#8b9eb7', marginLeft: 8 }}>Fees: {fmtPnl(-Math.abs(totalFees || 0))}</span>
                                </div>
                            </div>
                            <div style={{ borderTop: '1px solid var(--border-0)', paddingTop: 12 }}>
                                <div style={{ color: '#8b9eb7', fontSize: 11, marginBottom: 8 }}>LAST 5 CLOSED TRADES</div>
                                {trades.length === 0 ? (
                                    <div style={{ color: '#8b9eb7', fontSize: 12 }}>No closed trades yet</div>
                                ) : (
                                    [...trades].reverse().slice(0, 5).map((t, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                                            <span>
                                                <span style={{ color: '#fff' }}>{t.symbol.replace('USDT', '')}</span>
                                                {' '}
                                                <span style={{ color: isLongSide(t.side) ? 'var(--accent)' : 'var(--danger)', fontSize: 10 }}>
                                                    {sideLabel(t.side)}
                                                </span>
                                            </span>
                                            <span className={(t.total_pnl ?? t.realized_pnl) >= 0 ? 'green' : 'red'}>
                                                {fmtPnl(t.total_pnl ?? t.realized_pnl)}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                </div>
            </div>

            {/* ── Tablo Bölümü ── */}
            <div className="hl-pf-bottom-section">
                <div className="hl-pf-tabs">
                    <div
                        className={`hl-pf-tab ${activeTab === 'positions' ? 'active' : ''}`}
                        onClick={() => setActiveTab('positions')}
                    >
                        Positions ({positions.length})
                    </div>
                    <div
                        className={`hl-pf-tab ${activeTab === 'history' ? 'active' : ''}`}
                        onClick={() => setActiveTab('history')}
                    >
                        Trade History ({trades.length})
                    </div>
                </div>

                <div className="hl-pf-table-wrapper">
                    {activeTab === 'positions' && (
                        <table className="hl-pf-table">
                            <thead>
                                <tr>
                                    <th>Coin</th>
                                    <th>Side</th>
                                    <th>Size</th>
                                    <th>Position Value</th>
                                    <th>Entry Price</th>
                                    <th>Mark Price</th>
                                    <th>Unrealized PNL</th>
                                    <th>ROE %</th>
                                    <th>Funding</th>
                                    <th>Liq Dist</th>
                                    <th>Leverage</th>
                                    <th>TP/SL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {positions.length === 0 ? (
                                    <tr>
                                        <td colSpan={12} style={{ textAlign: 'center', color: '#8b9eb7', padding: '24px 0' }}>
                                            No open positions
                                        </td>
                                    </tr>
                                ) : (
                                    positions.map((p, i) => {
                                        const ep = p.entry_price
                                        const leverage = p.leverage || 1
                                        
                                        // Use internal state if user is typing, else fallback to API values
                                        const tpVal = p.take_profit || ''
                                        const slVal = p.stop_loss || ''

                                        const calcPnl = (targetPrice) => {
                                            const t = parseFloat(targetPrice)
                                            if (!t || !ep || !p.quantity) return null
                                            const raw = isLongSide(p.side) ? (t - ep) * p.quantity : (ep - t) * p.quantity
                                            const pct = ep ? (raw / (ep * p.quantity)) * leverage * 100 : 0
                                            return { usd: raw, pct }
                                        }

                                        const slPnl = slVal ? calcPnl(slVal) : null
                                        const tpPnl = tpVal ? calcPnl(tpVal) : null

                                        return (
                                        <tr key={i}>
                                            <td>
                                                <div className="hl-pair-col">
                                                    <span className="hl-pair-sym">{p.symbol.replace('USDT', '')}</span>
                                                    <span className={`hl-pair-lev ${isLongSide(p.side) ? 'green' : 'red'}`}>{leverage}x</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={isLongSide(p.side) ? 'hl-side-long' : 'hl-side-short'}>
                                                    {sideLabel(p.side)}
                                                </span>
                                            </td>
                                            <td>{p.quantity?.toFixed(4)}</td>
                                            <td>${fmt(p.quantity * p.current_price)}</td>
                                            <td>${fmt(ep, 3)}</td>
                                            <td>${fmt(p.current_price, 3)}</td>
                                            <td>
                                                <span className={p.unrealized_pnl >= 0 ? 'hl-side-long' : 'hl-side-short'}>
                                                    {fmtPnl(p.unrealized_pnl)}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={p.unrealized_pnl_pct >= 0 ? 'hl-side-long' : 'hl-side-short'}>
                                                    {fmtPct(p.unrealized_pnl_pct)}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={p.accumulated_funding >= 0 ? 'hl-side-long' : 'hl-side-short'}>
                                                    {fmtPnl(p.accumulated_funding)}
                                                </span>
                                            </td>
                                            <td>
                                                {p.liq_distance_pct == null ? (
                                                    <span style={{ color: '#8b9eb7' }}>—</span>
                                                ) : (
                                                    <span className={p.liq_distance_pct < 5 ? 'hl-side-short' : p.liq_distance_pct < 12 ? '' : 'hl-side-long'}>
                                                        {fmtPct(p.liq_distance_pct)} <span style={{ color: '#8b9eb7', fontSize: 10 }}>(est)</span>
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <span className={isLongSide(p.side) ? 'hl-side-long' : 'hl-side-short'}>
                                                    {leverage}x
                                                </span>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                                                    <span style={{color: '#8b9eb7', fontSize: 11}}>TP: {tpVal ? `$${fmt(tpVal, 3)}` : '—'}</span>
                                                    <span style={{ color: '#8b9eb7' }}>/</span>
                                                    <span style={{color: '#8b9eb7', fontSize: 11}}>SL: {slVal ? `$${fmt(slVal, 3)}` : '—'}</span>
                                                </div>
                                                {(tpPnl || slPnl) && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', fontSize: 10, lineHeight: 1.2 }}>
                                                        {tpPnl && (
                                                            <span style={{ color: '#39ff14' }}>
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                                                TP: +${Math.abs(tpPnl.usd).toFixed(2)} (+{Math.abs(tpPnl.pct).toFixed(2)}%)
                                                            </span>
                                                        )}
                                                        {slPnl && (
                                                            <span style={{ color: '#ff3b5c' }}>
                                                                SL: -${Math.abs(slPnl.usd).toFixed(2)} (-{Math.abs(slPnl.pct).toFixed(2)}%)
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    )}

                    {activeTab === 'history' && (
                        <table className="hl-pf-table">
                            <thead>
                                <tr>
                                    <th>Coin</th>
                                    <th>Side</th>
                                    <th>Leverage</th>
                                    <th>Quantity</th>
                                    <th>Entry Price</th>
                                    <th>Exit Price</th>
                                    <th>Trade PNL</th>
                                    <th>Funding</th>
                                    <th>Net PNL</th>
                                    <th>ROE %</th>
                                    <th>Closed</th>
                                </tr>
                            </thead>
                            <tbody>
                                {trades.length === 0 ? (
                                    <tr>
                                        <td colSpan={11} style={{ textAlign: 'center', color: '#8b9eb7', padding: '24px 0' }}>
                                            No trade history yet
                                        </td>
                                    </tr>
                                ) : (
                                    [...trades].reverse().map((t, i) => (
                                        <tr key={i}>
                                            <td>
                                                <span className="hl-pair-sym">{t.symbol.replace('USDT', '')}</span>
                                            </td>
                                            <td>
                                                <span
                                                    className={isLongSide(t.side) ? 'hl-side-long' : 'hl-side-short'}
                                                    style={{ color: isLongSide(t.side) ? '#00d992' : '#ff3b5c', fontWeight: 600 }}
                                                >
                                                    {sideLabel(t.side)}
                                                </span>
                                            </td>
                                            <td>{t.leverage}x</td>
                                            <td>{t.quantity?.toFixed(4)}</td>
                                            <td>${fmt(t.entry_price, 3)}</td>
                                            <td>${fmt(t.exit_price, 3)}</td>
                                            <td>
                                                <span className={t.realized_pnl >= 0 ? 'hl-side-long' : 'hl-side-short'}>
                                                    {fmtPnl(t.realized_pnl)}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={(t.funding_pnl || 0) >= 0 ? 'hl-side-long' : 'hl-side-short'}>
                                                    {fmtPnl(t.funding_pnl || 0)}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={(t.total_pnl || t.realized_pnl) >= 0 ? 'hl-side-long' : 'hl-side-short'}>
                                                    {fmtPnl(t.total_pnl || t.realized_pnl)}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={t.pnl_pct >= 0 ? 'hl-side-long' : 'hl-side-short'}>
                                                    {fmtPct(t.pnl_pct)}
                                                </span>
                                            </td>
                                            <td style={{ color: '#8b9eb7' }}>{timeAgo(t.closed_at)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>

        {/* ── HL Send / Withdraw Modal ── */}
        {hlModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={closeHlModal}>
                <div style={{ background: '#0a0a0a', border: '1px solid #222', borderRadius: 8, padding: '28px 32px', minWidth: 340, maxWidth: 420 }}
                    onClick={e => e.stopPropagation()}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 20, letterSpacing: '.06em' }}>
                        {hlModal === 'withdraw' ? '⬇ Withdraw to Arbitrum' : '➤ Send USDC'}
                    </div>

                    {hlModal === 'send' && (
                        <div style={{ marginBottom: 12 }}>
                            <label style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 4 }}>DESTINATION ADDRESS</label>
                            <input
                                autoFocus
                                placeholder="0x..."
                                value={hlDest}
                                onChange={e => setHlDest(e.target.value)}
                                style={{ width: '100%', boxSizing: 'border-box', background: '#111', border: '1px solid #222', color: '#fff', borderRadius: 4, padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 12 }}
                            />
                        </div>
                    )}

                    <div style={{ marginBottom: 20 }}>
                        <label style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 4 }}>AMOUNT (USDC)</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <input
                                autoFocus={hlModal === 'withdraw'}
                                type="number" min="1" step="1"
                                placeholder="0.00"
                                value={hlAmount}
                                onChange={e => setHlAmount(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') submitHlAction() }}
                                style={{ flex: 1, background: '#111', border: '1px solid #222', color: '#fff', borderRadius: 4, padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 13 }}
                            />
                            {liveData?.balances?.withdrawable > 0 && (
                                <button onClick={() => setHlAmount(String(Math.floor(liveData.balances.withdrawable)))}
                                    style={{ background: '#151515', border: '1px solid #222', color: 'var(--text-2)', borderRadius: 4, padding: '0 10px', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                                    MAX ${Math.floor(liveData.balances.withdrawable)}
                                </button>
                            )}
                        </div>
                    </div>

                    {hlMsg && (
                        <div style={{ marginBottom: 14, padding: '8px 10px', borderRadius: 4, background: hlMsg.ok ? 'rgba(0,217,146,0.08)' : 'rgba(255,59,92,0.08)', border: `1px solid ${hlMsg.ok ? 'rgba(0,217,146,0.25)' : 'rgba(255,59,92,0.25)'}`, fontFamily: 'var(--font-mono)', fontSize: 11, color: hlMsg.ok ? 'var(--accent)' : 'var(--danger)' }}>
                            {hlMsg.text}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={closeHlModal}
                            style={{ flex: 1, background: 'transparent', border: '1px solid #222', color: 'var(--text-2)', borderRadius: 4, padding: '9px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                            Cancel
                        </button>
                        <button onClick={submitHlAction} disabled={hlBusy}
                            style={{ flex: 1, background: hlBusy ? '#111' : (hlModal === 'withdraw' ? 'rgba(245,166,35,0.15)' : 'rgba(0,217,146,0.12)'), border: `1px solid ${hlModal === 'withdraw' ? 'rgba(245,166,35,0.4)' : 'rgba(0,217,146,0.35)'}`, color: hlBusy ? 'var(--text-3)' : (hlModal === 'withdraw' ? '#f5a623' : 'var(--accent)'), borderRadius: 4, padding: '9px', cursor: hlBusy ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700 }}>
                            {hlBusy ? 'İşleniyor…' : (hlModal === 'withdraw' ? 'Withdraw' : 'Send')}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    )
}
