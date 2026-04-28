// Komut input + autocomplete dropdown (komut ve sembol) + log paneli.
// TerminalPage.jsx'ten ayrıştırıldı; davranış / stil aynen korundu.
import { fmt } from '../../utils/format'
import { LOG_COLORS } from '../../constants/terminal'

export default function CommandConsole({
    input,
    setInput,
    inputRef,
    onKeyDown,
    handleSubmit,
    cmdLoading,
    filteredCmds,
    symbolMatches,
    tickers,
    inputParts,
    logs,
    logRef,
    setLogs,
}) {
    return (
        <>
            <form className="nt-cmd" onSubmit={handleSubmit} style={{ position: 'relative' }}>
                <span className="nt-prompt">{cmdLoading ? '…' : '$'}</span>
                <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={cmdLoading ? 'işleniyor...' : 'write your command...'}
                    autoFocus
                    spellCheck={false}
                    className="nt-input"
                    disabled={cmdLoading}
                    style={cmdLoading ? { opacity: 0.5, cursor: 'wait' } : undefined}
                />
                {filteredCmds.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--bg-1)', border: '1px solid var(--border-0)', borderTop: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
                        {filteredCmds.map((c, idx) => (
                            <div
                                key={c.cmd}
                                style={{ display: 'flex', padding: '6px 12px', cursor: 'pointer', background: idx === 0 ? 'var(--bg-2)' : 'transparent', borderBottom: '1px solid var(--border-0)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
                                onMouseLeave={e => e.currentTarget.style.background = idx === 0 ? 'var(--bg-2)' : 'transparent'}
                                onClick={() => { setInput(c.cmd + ' '); inputRef.current?.focus() }}
                            >
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                                    <strong style={{ color: 'var(--text-0)', fontSize: 13 }}>{c.cmd}</strong>
                                    <span style={{ color: 'var(--accent)', fontSize: 11, marginLeft: 12 }}>{c.desc}</span>
                                </div>
                                <span style={{ color: 'var(--text-3)', fontSize: 10, alignSelf: 'center' }}>{c.hint}</span>
                            </div>
                        ))}
                    </div>
                )}
                {symbolMatches.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--bg-1)', border: '1px solid var(--border-0)', borderTop: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
                        {symbolMatches.map((sym, idx) => {
                            const price = tickers[sym]?.last_price
                            return (
                                <div
                                    key={sym}
                                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', cursor: 'pointer', background: idx === 0 ? 'var(--bg-2)' : 'transparent', borderBottom: '1px solid var(--border-0)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
                                    onMouseLeave={e => e.currentTarget.style.background = idx === 0 ? 'var(--bg-2)' : 'transparent'}
                                    onClick={() => { setInput(inputParts[0] + ' ' + sym + ' '); inputRef.current?.focus() }}
                                >
                                    <span><strong style={{ color: 'var(--text-0)', fontSize: 13 }}>{sym.replace('USDT', '')}</strong><span style={{ color: 'var(--text-3)', fontSize: 10 }}>/USDT</span></span>
                                    {price && <span style={{ color: 'var(--text-2)', fontSize: 11 }}>${fmt(price)}</span>}
                                </div>
                            )
                        })}
                    </div>
                )}
            </form>

            {/* Command Log */}
            <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: 4, right: 12, zIndex: 10 }}>
                    <svg
                        onClick={() => setLogs([])}
                        title="Clear Logs"
                        style={{ cursor: 'pointer', opacity: 0.6 }}
                        width="13" height="13" viewBox="0 0 24 24" fill="none"
                        stroke="var(--text-3)" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round"
                        onMouseEnter={e => { e.currentTarget.style.stroke = 'var(--accent)'; e.currentTarget.style.opacity = '1' }}
                        onMouseLeave={e => { e.currentTarget.style.stroke = 'var(--text-3)'; e.currentTarget.style.opacity = '0.6' }}
                    >
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </div>
                <div className="nt-log" ref={logRef}>
                    {logs.map((log, i) => (
                        <div
                            key={i}
                            style={{
                                color: LOG_COLORS[log.style] || LOG_COLORS.info,
                                fontSize: 10,
                                lineHeight: 1.5,
                                borderLeft: ['order', 'error', 'risk'].includes(log.style) ? `2px solid ${LOG_COLORS[log.style]}` : 'none',
                                paddingLeft: ['order', 'error', 'risk'].includes(log.style) ? 8 : 0,
                            }}
                        >
                            {log.text}
                        </div>
                    ))}
                </div>
            </div>
        </>
    )
}
