import React from 'react';
import { API_BASE } from '../config';

const getAuthHeaders = (token) => token
    ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };

const fmt = (n, d = 2) => n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const normSide = (side) => String(side || '').trim().toLowerCase();
const isLongSide = (side) => {
    const s = normSide(side);
    return s === 'long' || s === 'buy';
};
const sideLabel = (side) => isLongSide(side) ? 'LONG' : 'SHORT';

function ClosePositionModal({ modal, tickers, onClose, onConfirmMarket, onConfirmLimit, addLog }) {
    const [limitPrice, setLimitPrice] = React.useState('');

    // Sadece modal AÇILDIĞINDA fiyatı pre-fill et. Daha sonra ticker tick'leri
    // input'u resetlemesin — kullanıcı yazdığı her şeyi kaybetmesin.
    // tickers dep'ten çıkarıldı; modal.symbol değişimi yeni modal demektir.
    React.useEffect(() => {
        if (!modal) return;
        const lastPrice = tickers?.[modal.symbol]?.last_price ?? modal.position?.current_price ?? modal.position?.entry_price ?? 0;
        setLimitPrice(lastPrice ? String(Number(lastPrice).toFixed(3)) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [modal?.symbol, modal?.mode]);

    React.useEffect(() => {
        if (!modal) return;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [modal, onClose]);

    if (!modal) return null;

    const { symbol, position, mode } = modal;
    const lastPrice = tickers?.[symbol]?.last_price ?? position?.current_price ?? position?.entry_price ?? 0;
    const quantity = Number(position?.quantity || 0);
    const leverage = Number(position?.leverage || 1);
    const side = isLongSide(position?.side) ? 'LONG' : 'SHORT';
    const notional = Number(lastPrice || position?.entry_price || 0) * quantity;
    const accent = mode === 'market' ? '#79dfd1' : '#8de0c7';
    const buttonLabel = mode === 'market' ? 'Market Close' : 'Limit Close';
    const title = mode === 'market' ? 'Market Close' : 'Limit Close';
    const subtitle = mode === 'market'
        ? 'This will attempt to immediately close the full position.'
        : 'Reduce-only limit emir HL\'ye gönderilir. Fiyat hedefe ulaşınca pozisyon kapanır.';

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(2, 7, 9, 0.78)',
                backdropFilter: 'blur(6px)',
                zIndex: 12000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: 'min(460px, calc(100vw - 32px))',
                    background: 'linear-gradient(180deg, #10191b 0%, #0b1214 100%)',
                    border: '1px solid rgba(121, 223, 209, 0.16)',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.03)',
                    borderRadius: 18,
                    padding: 22,
                    color: '#d8e5e1',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
                    <div>
                        <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: '#6c908b', marginBottom: 10 }}>
                            Position Exit
                        </div>
                        <div style={{ fontSize: 28, lineHeight: 1.05, fontWeight: 600, color: '#eef7f4', marginBottom: 8 }}>
                            {title}
                        </div>
                        <div style={{ fontSize: 12, color: '#8ea4a0', maxWidth: 320 }}>
                            {subtitle}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: 999,
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: 'rgba(255,255,255,0.03)',
                            color: '#97aba7',
                            cursor: 'pointer',
                            fontSize: 16,
                            lineHeight: 1,
                        }}
                    >
                        ×
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                    {[
                        ['Symbol', symbol.replace('USDT', '')],
                        ['Side', `${side} · ${leverage}x`],
                        ['Size', `${quantity.toFixed(quantity >= 1 ? 3 : 4)} ${symbol.replace('USDT', '')}`],
                        ['Position Value', `${fmt(notional)} USDC`],
                    ].map(([label, value]) => (
                        <div key={label} style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12 }}>
                            <div style={{ fontSize: 10, color: '#6f8581', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>{label}</div>
                            <div style={{ fontSize: 14, color: '#e4efec', fontWeight: 600 }}>{value}</div>
                        </div>
                    ))}
                </div>

                {mode === 'limit' ? (
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 10, color: '#6f8581', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Limit Price</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                            <input
                                value={limitPrice}
                                onChange={(e) => setLimitPrice(e.target.value)}
                                placeholder="Price (USDC)"
                                style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    color: '#eef7f4',
                                    borderRadius: 12,
                                    padding: '13px 14px',
                                    fontSize: 14,
                                    fontFamily: 'var(--font-mono)',
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setLimitPrice(lastPrice ? String(Number(lastPrice).toFixed(3)) : '')}
                                style={{
                                    borderRadius: 12,
                                    border: '1px solid rgba(121, 223, 209, 0.2)',
                                    background: 'rgba(121, 223, 209, 0.08)',
                                    color: accent,
                                    padding: '0 14px',
                                    cursor: 'pointer',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    letterSpacing: '.08em',
                                    textTransform: 'uppercase',
                                }}
                            >
                                Mid
                            </button>
                        </div>
                        <div style={{ marginTop: 10, fontSize: 11, color: '#829894' }}>
                            Market close tam aktif. Limit close command backend’i sonraki adımda bağlanacak.
                        </div>
                    </div>
                ) : (
                    <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 12, background: 'linear-gradient(180deg, rgba(121, 223, 209, 0.08) 0%, rgba(121, 223, 209, 0.03) 100%)', border: '1px solid rgba(121, 223, 209, 0.12)' }}>
                        <div style={{ fontSize: 11, color: '#8ecdc1', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Execution</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                            <span style={{ color: '#d7e6e2' }}>Reference Price</span>
                            <strong style={{ color: '#eef7f4' }}>{lastPrice ? fmt(lastPrice, 3) : '—'}</strong>
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
                    <button
                        onClick={onClose}
                        style={{
                            flex: '0 0 auto',
                            borderRadius: 12,
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: 'transparent',
                            color: '#93a8a4',
                            padding: '13px 16px',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: '.08em',
                            textTransform: 'uppercase',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            if (mode === 'market') {
                                onConfirmMarket(symbol);
                                onClose();
                                return;
                            }
                            const px = parseFloat(limitPrice);
                            if (!px || px <= 0) {
                                addLog('[error] Geçersiz limit fiyatı', 'error');
                                return;
                            }
                            onConfirmLimit(symbol, px);
                            onClose();
                        }}
                        style={{
                            flex: 1,
                            borderRadius: 12,
                            border: '1px solid rgba(121, 223, 209, 0.18)',
                            background: mode === 'market'
                                ? 'linear-gradient(180deg, rgba(121, 223, 209, 0.95) 0%, rgba(101, 204, 189, 0.9) 100%)'
                                : 'linear-gradient(180deg, rgba(121, 223, 209, 0.14) 0%, rgba(121, 223, 209, 0.08) 100%)',
                            color: mode === 'market' ? '#042825' : '#8fd2c6',
                            padding: '13px 18px',
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: 800,
                            letterSpacing: '.08em',
                            textTransform: 'uppercase',
                        }}
                    >
                        {buttonLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function TerminalBottomTabs({
    token,
    activeTab,
    fetchTab,
    tabLoading,
    posEntries,
    openOrders,
    tradeHistory,
    fundingHistory,
    balances,
    tickers,
    editingTPSL,
    setEditingTPSL,
    focusedSL,
    setFocusedSL,
    slInputs,
    setSlInputs,
    focusedTP,
    setFocusedTP,
    tpInputs,
    setTpInputs,
    setPositions,
    addLog,
    fetchOpenOrdersSilently
}) {
    const [closeModal, setCloseModal] = React.useState(null);
    const [collapsed, setCollapsed] = React.useState(false);

    const sendCmd = (cmd) => {
        addLog(`$ ${cmd}`, 'info');
        fetch(`${API_BASE}/api/command`, { 
            method: 'POST', 
            headers: getAuthHeaders(token), 
            body: JSON.stringify({ command: cmd }) 
        })
        .then(r => r.json())
        .then(d => {
            d.results?.forEach(r => addLog(r.text, r.style || 'info'))
            if (fetchOpenOrdersSilently) {
                setTimeout(fetchOpenOrdersSilently, 500)
            }
        })
        .catch(e => addLog(`[error] ${e.message}`, 'error'));
    };

    const openCloseModal = React.useCallback((mode, sym, pos) => {
        setCloseModal({ mode, symbol: sym, position: pos });
    }, []);

    return (
        <div className="hl-pf-bottom-section" style={{ marginTop: 0 }}>
            <div className="hl-pf-tabs">
                {/* Collapse toggle */}
                <button
                    onClick={() => setCollapsed(v => !v)}
                    title={collapsed ? 'Paneli aç' : 'Paneli küçült'}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-3)',
                        cursor: 'pointer',
                        padding: '0 8px 0 0',
                        fontSize: 13,
                        lineHeight: 1,
                        flexShrink: 0,
                        alignSelf: 'center',
                        transition: 'color .15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--text-1)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
                >
                    {collapsed ? '▲' : '▼'}
                </button>
                {[
                    { id: 'balances',  label: 'Balances' },
                    { id: 'positions', label: `Positions (${posEntries.length})` },
                    { id: 'orders',    label: `Open Orders (${openOrders.length})` },
                    { id: 'history',   label: 'Trade History' },
                    { id: 'funding',   label: 'Funding History' },
                ].map(t => (
                    <div
                        key={t.id}
                        className={`hl-pf-tab${activeTab === t.id ? ' active' : ''}`}
                        onClick={() => { if (collapsed) setCollapsed(false); fetchTab(t.id) }}
                    >
                        {t.label}
                    </div>
                ))}
                <div className="hl-pf-tab" style={{ marginLeft: 'auto' }}
                    onClick={() => fetchTab(activeTab)} title="Refresh">↻</div>
                {activeTab === 'positions' && posEntries.length > 0 && (
                    <button 
                        className="nt-close-all-btn"
                        style={{ marginLeft: 12, padding: '2px 8px', background: 'transparent', color: '#ff3b5c', border: '1px solid rgba(255,59,92,0.3)', borderRadius: 4, cursor: 'pointer', fontSize: 11, transition: 'all 0.2s', alignSelf: 'center' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,59,92,0.1)'; e.currentTarget.style.borderColor = '#ff3b5c' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,59,92,0.3)' }}
                        onClick={() => {
                            sendCmd('panic');
                        }}
                    >
                        Close All
                    </button>
                )}
            </div>

            <div className="hl-pf-table-wrapper" style={{ minHeight: collapsed ? 0 : 180, display: collapsed ? 'none' : undefined }}>
                {tabLoading && (
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: '#4e4d49', fontSize: 12 }}>Loading...</div>
                )}

                {/* ── BALANCES ── */}
                {!tabLoading && activeTab === 'balances' && (
                    <table className="hl-pf-table">
                        <thead><tr><th>Asset</th><th>Total</th><th>Available</th><th>Margin Used</th><th>Unrealized PnL</th></tr></thead>
                        <tbody>
                            {!balances ? (
                                <tr><td colSpan="5" style={{ textAlign: 'center', color: '#4e4d49', padding: '32px 16px' }}>No balance data</td></tr>
                            ) : (
                                <tr>
                                    <td><strong style={{ color: '#e8e6e3' }}>USDC</strong></td>
                                    <td>${fmt(balances.account_value)}</td>
                                    <td style={{ color: '#00d992' }}>${fmt(balances.withdrawable)}</td>
                                    <td style={{ color: '#f5a623' }}>${fmt(balances.total_margin_used)}</td>
                                    <td style={{ color: balances.unrealized_pnl >= 0 ? '#00d992' : '#ff3b5c' }}>
                                        {balances.unrealized_pnl >= 0 ? '+' : ''}${fmt(balances.unrealized_pnl)}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}

                {/* ── POSITIONS ── */}
                {!tabLoading && activeTab === 'positions' && (
                    <table className="hl-pf-table">
                        <thead>
                            <tr>
                                <th>Coin</th><th>Size</th><th>Position Value</th>
                                <th>Entry Price</th><th>Mark Price</th><th>PNL (ROE%)</th>
                                <th>Liq. Price</th><th>Margin</th><th>Funding</th>
                                <th>Action</th>
                                <th>TP/SL</th>
                            </tr>
                        </thead>
                        <tbody>
                            {posEntries.length === 0 ? (
                                <tr><td colSpan="11" style={{ textAlign: 'center', color: '#8b9eb7', padding: '32px 16px' }}>No open positions</td></tr>
                            ) : posEntries.map(([sym, pos]) => {
                                const longSide = isLongSide(pos.side);
                                const lp = tickers[sym]?.last_price ?? pos.current_price;
                                const ep = pos.entry_price;
                                const leverage = pos.leverage || 1;
                                const pnl = longSide ? (lp - ep) * pos.quantity : (ep - lp) * pos.quantity;
                                const pnlPct = ep ? ((pnl / (ep * pos.quantity)) * leverage * 100) : 0;
                                const margin = ep * pos.quantity;
                                // Likidasyon fiyatı: borsa gönderdiyse onu kullan, yoksa tahmini hesapla.
                                const liqFromExchange = pos.liquidation_price ?? pos.liq_price_est;
                                const liqPrice = liqFromExchange ?? (longSide
                                    ? ep * (1 - 1 / leverage + 0.005)
                                    : ep * (1 + 1 / leverage - 0.005));
                                const liqIsEstimate = pos.liquidation_price == null;
                                // Likidasyon mesafesi — %5 altında kırmızı uyarı rozeti
                                const liqDistPct = lp && liqPrice ? Math.abs((lp - liqPrice) / lp) * 100 : null;
                                const liqDanger = liqDistPct != null && liqDistPct < 5;
                                const liqWarn = liqDistPct != null && liqDistPct < 15 && !liqDanger;
                                const marginMode = pos.margin_mode
                                    ? pos.margin_mode.charAt(0).toUpperCase() + pos.margin_mode.slice(1)
                                    : 'Cross';
                                const marginDisplay = pos.margin_used != null
                                    ? pos.margin_used
                                    : margin / leverage;
                                
                                const slVal = focusedSL === sym ? (slInputs[sym] !== undefined ? slInputs[sym] : '') : (pos.stop_loss || '');
                                const tpVal = focusedTP === sym ? (tpInputs[sym] !== undefined ? tpInputs[sym] : '') : (pos.take_profit || '');
                                
                                const calcPnl = (targetPrice) => {
                                    const t = parseFloat(targetPrice);
                                    if (!t || !ep || !pos.quantity) return null;
                                    const raw = longSide ? (t - ep) * pos.quantity : (ep - t) * pos.quantity;
                                    return { usd: raw, pct: ep ? (raw / (ep * pos.quantity)) * leverage * 100 : 0 };
                                };
                                const slPnl = slVal ? calcPnl(slVal) : null;
                                const tpPnl = tpVal ? calcPnl(tpVal) : null;

                                return (
                                    <tr key={sym} style={{ borderLeft: `2px solid ${longSide ? '#00d992' : '#ff3b5c'}` }}>
                                        <td style={{ paddingLeft: 12 }}>
                                            <div className="hl-pair-col">
                                                <span className="hl-pair-sym">{sym}</span>
                                                <span className={`hl-pair-lev ${longSide ? 'green' : 'red'}`}>{leverage}x</span>
                                            </div>
                                        </td>
                                        <td><span className={longSide ? 'hl-side-long' : 'hl-side-short'}>{pos.quantity?.toFixed(4)} {sym.replace('USDT','')}</span></td>
                                        <td>{margin.toFixed(2)} USDC</td>
                                        <td>{ep?.toFixed(3)}</td>
                                        <td>{lp?.toFixed(3)}</td>
                                        <td>
                                            <span className={pnl >= 0 ? 'hl-side-long' : 'hl-side-short'}>{pnl >= 0 ? '+' : ''}${pnl?.toFixed(2)} ({pnlPct > 0 ? '+' : ''}{pnlPct?.toFixed(1)}%)</span>
                                            {ep && pos.quantity && (
                                                <div style={{ marginTop: 4, width: '100%', height: 2, background: 'var(--border-0)', borderRadius: 2, overflow: 'hidden' }}>
                                                    <div style={{ width: `${Math.min(100, Math.abs(pnlPct))}%`, height: '100%', background: pnl >= 0 ? 'var(--accent)' : 'var(--danger)' }} />
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                <span style={{ color: liqDanger ? '#ff3b5c' : liqWarn ? '#f5a623' : '#ff3b5c', fontWeight: liqDanger ? 700 : 400 }}>
                                                    {fmt(liqPrice)}
                                                </span>
                                                {liqDistPct != null && (
                                                    <span
                                                        title={`Likidasyona ${liqDistPct.toFixed(1)}% mesafe`}
                                                        style={{
                                                            fontSize: 9, padding: '1px 4px', borderRadius: 2,
                                                            background: liqDanger ? 'rgba(255,59,92,0.15)' : liqWarn ? 'rgba(245,166,35,0.15)' : 'rgba(139,158,183,0.1)',
                                                            color: liqDanger ? '#ff3b5c' : liqWarn ? '#f5a623' : 'var(--text-3)',
                                                            fontWeight: 700,
                                                        }}
                                                    >
                                                        {liqDistPct.toFixed(1)}%
                                                    </span>
                                                )}
                                                {liqIsEstimate && (
                                                    <span title="Borsa likidasyon fiyatı alınamadı — bakım marjını olmadan tahmini hesaplandı" style={{ fontSize: 9, color: 'var(--text-3)', fontStyle: 'italic' }}>
                                                        ~est
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            ${marginDisplay.toFixed(2)}{' '}
                                            <span className="hl-text-sub" style={{ color: marginMode === 'Isolated' ? '#f5a623' : 'var(--text-3)' }}>
                                                ({marginMode})
                                            </span>
                                        </td>
                                        <td>—</td>
                                        <td>
                                            <a className="hl-action-link" onClick={() => openCloseModal('limit', sym, pos)}>Limit</a>{' '}
                                            <a className="hl-action-link" onClick={() => openCloseModal('market', sym, pos)}>Market</a>
                                        </td>
                                        <td style={{ position: 'relative' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', background: editingTPSL === sym ? 'var(--bg-2)' : 'transparent', padding: '4px 6px', borderRadius: 4, transition: 'background 0.2s' }} 
                                                 onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
                                                 onMouseLeave={e => e.currentTarget.style.background = editingTPSL === sym ? 'var(--bg-2)' : 'transparent'}
                                                 onClick={() => setEditingTPSL(sym)}>
                                                <div style={{ display: 'flex', flexDirection: 'column', fontSize: 11, lineHeight: 1.3 }}>
                                                    <span style={{ color: (tpInputs[sym] || pos.take_profit) ? '#00d992' : 'var(--text-3)' }}>TP: {tpInputs[sym] || pos.take_profit || '—'}</span>
                                                    <span style={{ color: (slInputs[sym] || pos.stop_loss) ? '#ff3b5c' : 'var(--text-3)' }}>SL: {slInputs[sym] || pos.stop_loss || '—'}</span>
                                                </div>
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                            </div>
                                            {(tpPnl || slPnl) && (
                                                <div style={{ display: 'flex', flexDirection: 'column', fontSize: 10, lineHeight: 1.2, marginTop: 4, paddingLeft: 6 }}>
                                                    {tpPnl && <span style={{ color: '#00d992' }}>+${Math.abs(tpPnl.usd).toFixed(2)}</span>}
                                                    {slPnl && <span style={{ color: '#ff3b5c' }}>-${Math.abs(slPnl.usd).toFixed(2)}</span>}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}

                {/* ── OPEN ORDERS ── */}
                {!tabLoading && activeTab === 'orders' && (
                    <table className="hl-pf-table">
                        <thead><tr><th>Coin</th><th>Side</th><th>Type</th><th>Price</th><th>Size</th><th>Filled</th><th>Time</th><th>Action</th></tr></thead>
                        <tbody>
                            {openOrders.length === 0 ? (
                                <tr><td colSpan="8" style={{ textAlign: 'center', color: '#4e4d49', padding: '32px 16px' }}>No open orders</td></tr>
                            ) : openOrders.map((o, i) => (
                                <tr key={i}>
                                    <td><strong>{o.symbol}</strong></td>
                                    <td><span style={{ color: isLongSide(o.side) ? '#00d992' : '#ff3b5c' }}>{sideLabel(o.side)}</span></td>
                                    <td style={{ color: '#8a8884' }}>{o.type}</td>
                                    <td>${fmt(o.price)}</td>
                                    <td>{o.quantity}</td>
                                    <td style={{ color: '#4e4d49' }}>{o.filled?.toFixed(4) ?? '0'}</td>
                                    <td style={{ color: '#4e4d49', fontSize: 11 }}>{o.timestamp ? new Date(o.timestamp).toLocaleTimeString() : '—'}</td>
                                    <td>
                                        <a 
                                            className="hl-action-link" 
                                            style={{ color: '#ff3b5c' }} 
                                            onClick={() => { 
                                                addLog(`$ cancel ${o.symbol}`, 'info'); 
                                                fetch(`${API_BASE}/api/command`, { method: 'POST', headers: getAuthHeaders(token), body: JSON.stringify({ command: `cancel ${o.symbol} ${o.oid}` }) })
                                                .then(r => r.json())
                                                .then(d => { 
                                                    d.results?.forEach(r => addLog(r.text, r.style)); 
                                                    fetchTab('orders'); 
                                                });
                                            }}
                                        >
                                            Cancel
                                        </a>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* ── TRADE HISTORY ── */}
                {!tabLoading && activeTab === 'history' && (
                    <table className="hl-pf-table">
                        <thead><tr><th>Coin</th><th>Side</th><th>Price</th><th>Size</th><th>Fee</th><th>Realized PnL</th><th>Time</th></tr></thead>
                        <tbody>
                            {tradeHistory.length === 0 ? (
                                <tr><td colSpan="7" style={{ textAlign: 'center', color: '#4e4d49', padding: '32px 16px' }}>No trade history</td></tr>
                            ) : tradeHistory.map((t, i) => (
                                <tr key={i}>
                                    <td><strong>{t.symbol}</strong></td>
                                    <td><span style={{ color: isLongSide(t.side) ? '#00d992' : '#ff3b5c' }}>{sideLabel(t.side)}</span></td>
                                    <td>${fmt(t.price)}</td>
                                    <td>{t.quantity}</td>
                                    <td style={{ color: '#ff3b5c' }}>${fmt(t.fee, 4)}</td>
                                    <td style={{ color: t.realized_pnl >= 0 ? '#00d992' : '#ff3b5c' }}>
                                        {t.realized_pnl >= 0 ? '+' : ''}${fmt(t.realized_pnl)}
                                    </td>
                                    <td style={{ color: '#4e4d49', fontSize: 11 }}>{t.timestamp ? new Date(t.timestamp).toLocaleString() : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* ── FUNDING HISTORY ── */}
                {!tabLoading && activeTab === 'funding' && (
                    <table className="hl-pf-table">
                        <thead><tr><th>Coin</th><th>Funding Payment</th><th>Position Size</th><th>Time</th></tr></thead>
                        <tbody>
                            {fundingHistory.length === 0 ? (
                                <tr><td colSpan="4" style={{ textAlign: 'center', color: '#4e4d49', padding: '32px 16px' }}>No funding history</td></tr>
                            ) : fundingHistory.map((f, i) => (
                                <tr key={i}>
                                    <td><strong>{f.symbol}</strong></td>
                                    <td style={{ color: f.funding >= 0 ? '#00d992' : '#ff3b5c' }}>
                                        {f.funding >= 0 ? '+' : ''}${fmt(f.funding, 4)}
                                    </td>
                                    <td>{fmt(f.position_size, 4)}</td>
                                    <td style={{ color: '#4e4d49', fontSize: 11 }}>{f.timestamp ? new Date(f.timestamp).toLocaleString() : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ═══ TP/SL Full Screen Modal ═══ */}
            {editingTPSL && (() => {
                const sym = editingTPSL;
                const posEntry = posEntries.find(([s]) => s === sym);
                if (!posEntry) return null;
                const pos = posEntry[1];
                const lp = tickers[sym]?.last_price ?? pos.current_price;
                const ep = pos.entry_price;
                const leverage = pos.leverage || 1;
                
                const slVal = slInputs[sym] !== undefined ? slInputs[sym] : (pos.stop_loss || '');
                const tpVal = tpInputs[sym] !== undefined ? tpInputs[sym] : (pos.take_profit || '');

                const calcPnl = (targetPrice) => {
                    const t = parseFloat(targetPrice);
                    if (!t || !ep || !pos.quantity) return null;
                    const raw = isLongSide(pos.side) ? (t - ep) * pos.quantity : (ep - t) * pos.quantity;
                    return { usd: raw, pct: ep ? (raw / (ep * pos.quantity)) * leverage * 100 : 0 };
                };
                const slPnl = slVal ? calcPnl(slVal) : null;
                const tpPnl = tpVal ? calcPnl(tpVal) : null;

                return (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                         onClick={() => setEditingTPSL(null)}>
                        <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border-0)', width: 420, borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.8)', padding: '24px', display: 'flex', flexDirection: 'column', color: 'var(--text-0)' }}
                             onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                                <span style={{ fontSize: 16, fontWeight: 600 }}>TP/SL for Position</span>
                                <span style={{ cursor: 'pointer', color: 'var(--text-2)' }} onClick={() => setEditingTPSL(null)}>✕</span>
                            </div>

                            {/* Summary Rows */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24, fontSize: 13 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-3)' }}>Coin</span>
                                    <span><span style={{ color: isLongSide(pos.side) ? '#00d992' : '#ff3b5c', paddingRight: 8, fontSize: 11 }}>{sideLabel(pos.side)} {leverage}x</span><strong>{sym.replace('USDT','')}</strong></span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-3)' }}>Position</span>
                                    <span style={{ color: 'var(--text-2)' }}>{pos.quantity?.toFixed(4)} {sym.replace('USDT','')}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-3)' }}>Entry Price</span>
                                    <span>{fmt(ep, 4)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-3)' }}>Mark Price</span>
                                    <span style={{ color: 'var(--text-1)' }}>{fmt(lp, 4)}</span>
                                </div>
                            </div>

                            {/* Inputs Sections */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
                                {/* Take Profit */}
                                <div style={{ background: 'var(--bg-1)', borderRadius: 8, padding: 12, border: '1px solid var(--border-0)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>TP Price</div>
                                            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-0)', borderRadius: 4, padding: '4px 8px', border: '1px solid transparent' }} onFocus={e => e.currentTarget.style.borderColor = '#00d992'} onBlur={e => e.currentTarget.style.borderColor = 'transparent'}>
                                                <input style={{ flex: 1, background: 'transparent', border: 'none', color: '#00d992', fontSize: 14, outline: 'none', width: '100%', fontWeight: 500 }} type="number" placeholder="0.00" value={tpVal} onChange={e => setTpInputs(prev => ({ ...prev, [sym]: e.target.value }))} />
                                            </div>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Gain %</div>
                                            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-0)', borderRadius: 4, padding: '4px 8px', justifyContent: 'space-between' }}>
                                                <span style={{ color: '#00d992', fontSize: 14, fontWeight: 500 }}>{tpPnl ? tpPnl.pct.toFixed(2) : '--'}</span>
                                                <span style={{ color: 'var(--text-3)', fontSize: 11 }}>%</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, fontSize: 11, color: 'var(--text-2)' }}>
                                        Expected profit: <span style={{ color: '#00d992', marginLeft: 4 }}>{tpPnl ? `$${Math.abs(tpPnl.usd).toFixed(2)} USDC` : '--'}</span>
                                    </div>
                                </div>

                                {/* Stop Loss */}
                                <div style={{ background: 'var(--bg-1)', borderRadius: 8, padding: 12, border: '1px solid var(--border-0)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>SL Price</div>
                                            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-0)', borderRadius: 4, padding: '4px 8px', border: '1px solid transparent' }} onFocus={e => e.currentTarget.style.borderColor = '#ff3b5c'} onBlur={e => e.currentTarget.style.borderColor = 'transparent'}>
                                                <input style={{ flex: 1, background: 'transparent', border: 'none', color: '#ff3b5c', fontSize: 14, outline: 'none', width: '100%', fontWeight: 500 }} type="number" placeholder="0.00" value={slVal} onChange={e => setSlInputs(prev => ({ ...prev, [sym]: e.target.value }))} />
                                            </div>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Loss %</div>
                                            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-0)', borderRadius: 4, padding: '4px 8px', justifyContent: 'space-between' }}>
                                                <span style={{ color: '#ff3b5c', fontSize: 14, fontWeight: 500 }}>{slPnl ? slPnl.pct.toFixed(2) : '--'}</span>
                                                <span style={{ color: 'var(--text-3)', fontSize: 11 }}>%</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, fontSize: 11, color: 'var(--text-2)' }}>
                                        Expected loss: <span style={{ color: '#ff3b5c', marginLeft: 4 }}>{slPnl ? `-$${Math.abs(slPnl.usd).toFixed(2)} USDC` : '--'}</span>
                                    </div>
                                </div>
                            </div>

                            <button 
                                style={{ width: '100%', padding: '12px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 15, cursor: 'pointer', transition: 'background 0.2s', marginBottom: 16 }}
                                onMouseEnter={e => e.currentTarget.style.background = '#00f5a4'}
                                onMouseLeave={e => e.currentTarget.style.background = 'var(--accent)'}
                                onClick={() => {
                                    if (tpInputs[sym]) sendCmd(`tp ${sym} ${tpInputs[sym]}`);
                                    if (slInputs[sym]) sendCmd(`sl ${sym} ${slInputs[sym]}`);
                                    // Chart'ın görmesi için positions state'ini anında güncelle
                                    setPositions(prev => ({
                                        ...prev,
                                        [sym]: {
                                            ...prev[sym],
                                            ...(tpInputs[sym] ? { take_profit: parseFloat(tpInputs[sym]) } : {}),
                                            ...(slInputs[sym] ? { stop_loss:   parseFloat(slInputs[sym]) } : {}),
                                        }
                                    }));
                                    setEditingTPSL(null);
                                }}
                            >
                                Confirm
                            </button>

                            <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5, textAlign: 'center' }}>
                                By default take-profit and stop-loss orders apply to the entire position. Take-profit and stop-loss automatically cancel after closing the position.
                            </div>
                        </div>
                    </div>
                );
            })()}

            <ClosePositionModal
                modal={closeModal}
                tickers={tickers}
                onClose={() => setCloseModal(null)}
                onConfirmMarket={(symbol) => sendCmd(`close ${symbol}`)}
                onConfirmLimit={(symbol, price) => sendCmd(`close ${symbol} limit @${price}`)}
                addLog={addLog}
            />
        </div>
    );
}
