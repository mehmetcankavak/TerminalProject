// Chart paneli — search bar, TV/Lite toggle, timeframe butonları,
// stale göstergesi + asıl chart (TradingView ya da TerminalChart) wrapper.
// Sadece UI + minimal lookup hesabı; davranış / stil değişmedi.
import { fmt } from '../../utils/format'
import TerminalChart from '../TerminalChart'
import TradingViewChart from '../TradingViewChart'

export default function ChartPanel({
    chartSymbol,
    setChartSymbol,
    chartInterval,
    setChartInterval,
    chartMode,
    setChartMode,
    searchSymbol,
    setSearchSymbol,
    chartSearchInputRef,
    chartToolbarLockRef,
    liveChartTicker,
    chartStaleMs,
    connected,
    allSymbols,
    tickers,
    chartAlertLines,
    positions,
    openOrders,
    setInput,
    inputRef,
    setPositions,
    setTpInputs,
    setSlInputs,
    executeCommand,
}) {
    const q = searchSymbol.trim().toUpperCase()
    const pool = allSymbols.length > 0 ? allSymbols : Object.keys(tickers)
    const matches = q ? pool.filter(k => k.startsWith(q) || k.includes(q)).slice(0, 12) : []

    const positionKeyForChart = () => {
        const base = chartSymbol.replace('USDT', '')
        return Object.keys(positions).find(k => k === chartSymbol || k === base || k === `${base}-PERP` || k.startsWith(base))
    }
    const activePosKey = positionKeyForChart()
    const activePosition = activePosKey ? positions[activePosKey] : null
    const activeOrders = openOrders.filter(o => {
        const base = chartSymbol.replace('USDT', '')
        return o.symbol === chartSymbol || o.symbol === base || o.symbol.startsWith(base)
    })

    return (
        <div className="nt-chart">
            <div
                className="nt-chart-search-bar"
                onMouseDown={(e) => {
                    const target = e.target
                    if (target?.tagName === 'BUTTON' || target?.tagName === 'SELECT') return
                    e.stopPropagation()
                    chartToolbarLockRef.current = true
                    setTimeout(() => { chartToolbarLockRef.current = false }, 220)
                }}
                onClick={(e) => {
                    const target = e.target
                    if (target?.tagName === 'BUTTON' || target?.tagName === 'SELECT') return
                    chartSearchInputRef.current?.focus()
                    chartToolbarLockRef.current = true
                    setTimeout(() => { chartToolbarLockRef.current = false }, 220)
                }}
            >
                <div style={{ display: 'flex', gap: 2, paddingRight: 6, flexShrink: 0 }}>
                    {[{ k: 'tv', l: 'TV' }, { k: 'lite', l: 'Lite' }].map(({ k, l }) => (
                        <button key={k} onClick={() => {
                            setChartMode(k)
                            localStorage.setItem('nt_chart_mode', k)
                        }} style={{
                            background: chartMode === k ? 'rgba(0,217,146,0.12)' : 'none',
                            border: chartMode === k ? '1px solid rgba(0,217,146,0.35)' : '1px solid var(--border-1)',
                            borderRadius: 4, cursor: 'pointer', padding: '2px 8px',
                            fontSize: 10, fontWeight: 600,
                            color: chartMode === k ? 'var(--accent)' : 'var(--text-3)',
                            transition: 'all .15s', flexShrink: 0,
                        }}>{l}</button>
                    ))}
                </div>
                <div className="nt-chart-divider"></div>
                <span className="nt-chart-search-icon" aria-hidden="true">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                </span>
                <span className="nt-chart-ticker">{liveChartTicker}</span>
                {connected && chartStaleMs > 15000 && (
                    <span
                        title={`Son tick ${Math.round(chartStaleMs / 1000)}s önce. Fiyat gecikiyor — emir göndermeden önce teyit et.`}
                        style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: '.05em',
                            color: chartStaleMs > 60000 ? '#ff3b5c' : '#f5a623',
                            border: `1px solid ${chartStaleMs > 60000 ? 'rgba(255,59,92,0.5)' : 'rgba(245,166,35,0.5)'}`,
                            background: chartStaleMs > 60000 ? 'rgba(255,59,92,0.08)' : 'rgba(245,166,35,0.08)',
                            padding: '1px 6px', borderRadius: 3, marginLeft: 6,
                        }}
                    >
                        ◇ STALE {chartStaleMs >= 60000 ? `${Math.round(chartStaleMs / 60000)}m` : `${Math.round(chartStaleMs / 1000)}s`}
                    </span>
                )}
                <div className="nt-chart-divider"></div>
                <input
                    ref={chartSearchInputRef}
                    className="nt-chart-search-input"
                    type="text"
                    placeholder="Change symbol (e.g. SOL)"
                    value={searchSymbol}
                    spellCheck={false}
                    onChange={e => setSearchSymbol(e.target.value.toUpperCase())}
                    onMouseDown={(e) => e.stopPropagation()}
                    onFocus={() => { chartToolbarLockRef.current = true }}
                    onBlur={() => { chartToolbarLockRef.current = false }}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            let sym = searchSymbol.trim().toUpperCase()
                            if (sym) {
                                if (!sym.endsWith('USDT')) sym += 'USDT'
                                const exact = pool.find(k => k === sym)
                                const starts = pool.find(k => k.startsWith(sym.replace('USDT', '')) && k.endsWith('USDT'))
                                setChartSymbol(exact || starts || sym)
                                setSearchSymbol('')
                            }
                        }
                    }}
                />
                <div className="nt-chart-divider"></div>
                {['5m', '15m', '30m', '1h', '4h', '1d', '1w'].map(tf => (
                    <button key={tf} onClick={() => setChartInterval(tf)} style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: '0 6px',
                        fontSize: 11, fontWeight: chartInterval === tf ? 700 : 400,
                        color: chartInterval === tf ? 'var(--accent)' : 'var(--text-3)',
                        borderBottom: chartInterval === tf ? '2px solid var(--accent)' : '2px solid transparent',
                        lineHeight: '28px', transition: 'color .15s', flexShrink: 0,
                    }}>{tf}</button>
                ))}
                {matches.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'var(--bg-1)', border: '1px solid var(--border-0)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.5)', zIndex: 100, minWidth: 200, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {matches.map((sym, idx) => {
                            const price = tickers[sym]?.last_price
                            return (
                                <div
                                    key={sym}
                                    style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', background: idx === 0 ? 'var(--bg-2)' : 'transparent', color: 'var(--text-0)', borderBottom: '1px solid var(--border-0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
                                    onMouseLeave={e => e.currentTarget.style.background = idx === 0 ? 'var(--bg-2)' : 'transparent'}
                                    onClick={() => { setChartSymbol(sym); setSearchSymbol('') }}
                                >
                                    <span><span style={{ fontWeight: 600 }}>{sym.replace('USDT', '')}</span><span style={{ color: 'var(--text-3)', fontSize: 10 }}>/USDT</span></span>
                                    {price && <span style={{ color: 'var(--text-2)', fontSize: 11 }}>${fmt(price)}</span>}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
            {chartMode === 'tv' ? (
                <TradingViewChart symbol={chartSymbol} interval={chartInterval} />
            ) : (
                <TerminalChart
                    symbol={chartSymbol}
                    interval={chartInterval}
                    alertLines={chartAlertLines}
                    activePosition={activePosition}
                    activeOrders={activeOrders}
                    onPriceClick={p => {
                        if (chartToolbarLockRef.current || document.activeElement === chartSearchInputRef.current) return
                        setInput(prev => prev ? `${prev} ${p.toFixed(3)}` : String(p.toFixed(3)))
                        if (inputRef.current) inputRef.current.focus()
                    }}
                    onTpSlChange={(type, price) => {
                        const key = positionKeyForChart()
                        if (!key) return
                        const rounded = price.toFixed(3)
                        setPositions(prev => ({ ...prev, [key]: { ...prev[key], ...(type === 'tp' ? { take_profit: parseFloat(rounded) } : { stop_loss: parseFloat(rounded) }) } }))
                        if (type === 'tp') setTpInputs(prev => ({ ...prev, [key]: rounded }))
                        else setSlInputs(prev => ({ ...prev, [key]: rounded }))
                        executeCommand(`${type} ${key} ${rounded}`)
                    }}
                />
            )}
        </div>
    )
}
