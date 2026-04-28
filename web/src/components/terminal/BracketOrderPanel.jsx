// Bracket Order Panel — TerminalPage.jsx'ten ayrıştırıldı.
// Hesaplamalar (R:R, position sizing, contracts) burada local; state TerminalPage'de.
export default function BracketOrderPanel({
    bracketMode,
    setBracketMode,
    bracketTP,
    setBracketTP,
    bracketSL,
    setBracketSL,
    bracketRisk,
    setBracketRisk,
    curPrice,
    tradeBalance,
}) {
    const tpNum = parseFloat(bracketTP), slNum = parseFloat(bracketSL)
    const riskPct = parseFloat(bracketRisk) || 1

    let rr = null
    if (curPrice && Number.isFinite(tpNum) && Number.isFinite(slNum) && tpNum > 0 && slNum > 0) {
        const reward = Math.abs(tpNum - curPrice)
        const risk = Math.abs(curPrice - slNum)
        if (risk > 0) rr = (reward / risk).toFixed(2)
    }

    let posSizeUSD = null, maxLossUSD = null, contracts = null
    if (curPrice && Number.isFinite(slNum) && slNum > 0 && slNum !== curPrice) {
        const riskAmount = tradeBalance * (riskPct / 100)
        const slDist = Math.abs(curPrice - slNum) / curPrice
        if (slDist > 0) {
            posSizeUSD = riskAmount / slDist
            maxLossUSD = riskAmount
            contracts = posSizeUSD / curPrice
        }
    }

    const tpPct = curPrice && Number.isFinite(tpNum) ? (((tpNum - curPrice) / curPrice) * 100).toFixed(2) : null
    const slPct = curPrice && Number.isFinite(slNum) ? (((slNum - curPrice) / curPrice) * 100).toFixed(2) : null
    const fmtUSD = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`

    return (
        <div style={{ border: '1px solid #171717', background: 'linear-gradient(180deg,#090909 0%,#050505 100%)', padding: '8px 10px', marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: bracketMode ? 8 : 0 }}>
                <span style={{ fontSize: 10, letterSpacing: '.08em', color: 'var(--text-2)', textTransform: 'uppercase' }}>Bracket Order</span>
                <button
                    onClick={() => setBracketMode(v => !v)}
                    style={{
                        background: bracketMode ? 'rgba(0,217,146,0.12)' : 'transparent',
                        border: `1px solid ${bracketMode ? 'rgba(0,217,146,0.4)' : '#1f1f1f'}`,
                        color: bracketMode ? 'var(--accent)' : 'var(--text-3)',
                        borderRadius: 4, padding: '2px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: '.06em',
                    }}
                >{bracketMode ? '● ON' : '○ OFF'}</button>
            </div>
            {bracketMode && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, letterSpacing: '.05em' }}>TP</span>
                        <input
                            value={bracketTP}
                            onChange={e => setBracketTP(e.target.value)}
                            placeholder="Take-profit fiyatı"
                            style={{ background: '#0a0a0a', border: '1px solid #1d2d1d', color: 'var(--text-0)', borderRadius: 0, padding: '5px 8px', fontSize: 11, fontFamily: 'var(--font-mono)', outline: 'none' }}
                        />
                        {tpPct !== null && (
                            <span style={{ fontSize: 10, color: parseFloat(tpPct) >= 0 ? 'var(--accent)' : 'var(--danger)', minWidth: 44, textAlign: 'right' }}>
                                {parseFloat(tpPct) >= 0 ? '+' : ''}{tpPct}%
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 700, letterSpacing: '.05em' }}>SL</span>
                        <input
                            value={bracketSL}
                            onChange={e => setBracketSL(e.target.value)}
                            placeholder="Stop-loss fiyatı"
                            style={{ background: '#0a0a0a', border: '1px solid #2d1d1d', color: 'var(--text-0)', borderRadius: 0, padding: '5px 8px', fontSize: 11, fontFamily: 'var(--font-mono)', outline: 'none' }}
                        />
                        {slPct !== null && (
                            <span style={{ fontSize: 10, color: parseFloat(slPct) >= 0 ? 'var(--accent)' : 'var(--danger)', minWidth: 44, textAlign: 'right' }}>
                                {parseFloat(slPct) >= 0 ? '+' : ''}{slPct}%
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: '#f5a623', fontWeight: 700, letterSpacing: '.05em' }}>Risk</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input
                                value={bracketRisk}
                                onChange={e => {
                                    setBracketRisk(e.target.value)
                                    localStorage.setItem('nt_bracket_risk', e.target.value)
                                }}
                                placeholder="1"
                                style={{ width: 48, background: '#0a0a0a', border: '1px solid #2d2a1a', color: 'var(--text-0)', borderRadius: 0, padding: '5px 6px', fontSize: 11, fontFamily: 'var(--font-mono)', outline: 'none', textAlign: 'right' }}
                            />
                            <span style={{ fontSize: 10, color: '#f5a623' }}>%</span>
                            {posSizeUSD !== null && (
                                <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-2)' }}>
                                    → <b style={{ color: 'var(--text-0)' }}>{fmtUSD(posSizeUSD)}</b> pozisyon
                                    &nbsp;·&nbsp;kaybedilecek maks: <b style={{ color: 'var(--danger)' }}>{fmtUSD(maxLossUSD)}</b>
                                </span>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4, borderTop: '1px solid #141414', flexWrap: 'wrap', gap: 4 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                            {curPrice ? `Güncel: $${curPrice.toLocaleString()}` : 'Fiyat bekleniyor…'}
                        </span>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            {contracts !== null && (
                                <span style={{ fontSize: 10, color: 'var(--text-2)' }}>
                                    {contracts >= 1 ? contracts.toFixed(3) : contracts.toFixed(5)} <span style={{ color: 'var(--text-3)' }}>adet</span>
                                </span>
                            )}
                            {rr !== null && (
                                <span style={{
                                    fontSize: 10, fontWeight: 700, letterSpacing: '.05em',
                                    color: parseFloat(rr) >= 2 ? 'var(--accent)' : parseFloat(rr) >= 1 ? '#f5a623' : 'var(--danger)',
                                }}>
                                    R:R = 1:{rr}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
