import { ALL_COMMANDS, KEYBOARD_SHORTCUTS } from '../../constants/terminal'

export default function ShortcutsModal({ show, onClose, onCommandSelect }) {
    if (!show) return null
    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9998, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 60, overflowY: 'auto' }}
            onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
            <div
                style={{ background: 'var(--bg-1)', border: '1px solid var(--border-0)', borderRadius: 10, width: 680, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.8)', marginBottom: 40 }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border-0)' }}>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: 1 }}>KOMUT REHBERİ</div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>Terminalde <strong style={{ color: 'var(--text-2)' }}>?</strong> tuşuna basarak aç/kapat</div>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '2px 6px' }}>✕</button>
                </div>

                <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    {ALL_COMMANDS.map(group => (
                        <div key={group.group}>
                            <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>{group.group.toUpperCase()}</div>
                            {group.items.map(item => (
                                <div
                                    key={item.cmd}
                                    style={{ display: 'flex', flexDirection: 'column', marginBottom: 6, cursor: 'pointer', padding: '4px 6px', borderRadius: 4 }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    onClick={() => { onCommandSelect(item.cmd.split(' ')[0] + ' '); onClose() }}
                                >
                                    <code style={{ fontSize: 11, color: 'var(--text-0)', fontFamily: 'monospace', background: 'var(--bg-0)', padding: '2px 6px', borderRadius: 3, display: 'inline-block', width: 'fit-content' }}>
                                        {item.cmd}
                                    </code>
                                    <span style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2, paddingLeft: 2 }}>{item.desc}</span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>

                <div style={{ borderTop: '1px solid var(--border-0)', padding: '12px 20px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>KLAVYE KISA YOLLARI</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
                        {KEYBOARD_SHORTCUTS.map(s => (
                            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <kbd style={{ background: 'var(--bg-0)', border: '1px solid var(--border-0)', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-1)', minWidth: 36, textAlign: 'center' }}>{s.key}</kbd>
                                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.desc}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-0)', padding: '8px 20px', fontSize: 10, color: 'var(--text-3)', textAlign: 'center' }}>
                    Komuta tıklayarak input'a yapıştır · <span style={{ color: 'var(--accent)' }}>Tab</span> ile otomatik tamamla
                </div>
            </div>
        </div>
    )
}
