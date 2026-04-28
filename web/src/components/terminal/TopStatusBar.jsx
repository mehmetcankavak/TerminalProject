// Üst durum çubuğu — TerminalPage.jsx'ten ayrıştırıldı.
// Equity/Free/uPnL/rPnL göstergeleri + bağlantı rozeti + connect butonları
// + ses/notif toggle + LEV/SIZE ayar paneli. Davranış / stil değişmedi.
import { fmt, fmtPnl } from '../../utils/format'
import { IconBell, IconBellOff, IconMonitor } from './icons'
import TransferButton from './TransferButton'

export default function TopStatusBar({
    balance,
    freeMargin,
    marginUsed,
    hlSpot,
    token,
    addLog,
    onTransferDone,
    unrealizedTotal,
    realizedToday,
    connect,
    confirmDisconnect,
    exchangeConnecting,
    exchangeConnected,
    exchangeStatusLabel,
    soundOn,
    setSoundOn,
    notifEnabled,
    toggleNotif,
    showShortcuts,
    setShowShortcuts,
    leverages,
    setLeverages,
    levInputs,
    setLevInputs,
    showLevSettings,
    setShowLevSettings,
    tradeBalance,
    setTradeBalance,
    balInput,
    setBalInput,
    showBalSettings,
    setShowBalSettings,
}) {
    return (
        <div className="nt-topbar">
            <div className="nt-brand">NINJA TERMINAL <span className="nt-beta">BETA</span></div>
            <div className="nt-topbar-info"></div>
            <div className="nt-topbar-right">
                <span title="Total Equity — cüzdan toplamı (pozisyon + bakiye)" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '.08em' }}>EQ</span>
                    <span style={{ fontWeight: 700 }}>${fmt(balance)}</span>
                </span>
                {freeMargin != null && freeMargin !== balance && (
                    <span title="Free Margin — yeni pozisyon açabileceğin kullanılabilir bakiye" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                        <span style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '.08em' }}>FREE</span>
                        <span style={{ color: 'var(--text-1)' }}>${fmt(freeMargin)}</span>
                    </span>
                )}
                {marginUsed > 0 && (
                    <span title="Margin Used — açık pozisyonlara ayrılmış teminat" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                        <span style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '.08em' }}>MARGIN</span>
                        <span style={{ color: '#f5a623' }}>${fmt(marginUsed)}</span>
                    </span>
                )}
                <span title="Unrealized PnL — açık pozisyonların şu anki kâr/zararı" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '.08em' }}>uPnL</span>
                    <span style={{ color: unrealizedTotal >= 0 ? 'var(--accent)' : 'var(--danger)', fontWeight: 700 }}>{fmtPnl(unrealizedTotal)}</span>
                </span>
                <span title="Realized PnL (bugün)" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '.08em' }}>rPnL</span>
                    <span style={{ color: realizedToday >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{fmtPnl(realizedToday)}</span>
                </span>
                {connect.tradingMode === 'LIVE' ? (
                    connect.hlTestnet ? (
                        <span style={{ background: '#f5a62322', color: '#f5a623', border: '1px solid #f5a62366', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, letterSpacing: 1 }} title="HL TESTNET — gerçek para değil, mock USDC">
                            ⚠ TESTNET · HL {connect.hlWallet && <span style={{ fontWeight: 400, opacity: 0.8 }}>{connect.hlWallet}</span>}
                        </span>
                    ) : (
                        <span style={{ background: '#00d99222', color: '#00d992', border: '1px solid #00d99244', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, letterSpacing: 1 }} title="HL MAINNET — gerçek para">
                            ● MAINNET · HL {connect.hlWallet && <span style={{ fontWeight: 400, opacity: 0.8 }}>{connect.hlWallet}</span>}
                        </span>
                    )
                ) : connect.tradingMode === 'LIVE_BINANCE' ? (
                    connect.bnbTestnet ? (
                        <span style={{ background: '#f5a62322', color: '#f5a623', border: '1px solid #f5a62366', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, letterSpacing: 1 }} title="Binance TESTNET">⚠ TESTNET · BINANCE</span>
                    ) : (
                        <span style={{ background: '#f0b90b22', color: '#f0b90b', border: '1px solid #f0b90b44', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, letterSpacing: 1 }} title="Binance MAINNET">● MAINNET · BINANCE</span>
                    )
                ) : exchangeConnecting ? (
                    <span style={{ background: '#4dd8ff22', color: '#4dd8ff', border: '1px solid #4dd8ff44', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>◌ CONNECTING...</span>
                ) : (
                    <span style={{ background: '#f5a62322', color: '#f5a623', border: '1px solid #f5a62344', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>◎ PAPER</span>
                )}
                {connect.tradingMode === 'LIVE' && hlSpot > 0.5 && (
                    <TransferButton
                        token={token}
                        hlTestnet={connect.hlTestnet}
                        spotBalance={hlSpot}
                        addLog={addLog}
                        onDone={onTransferDone}
                    />
                )}
                {connect.tradingMode === 'LIVE' ? (
                    <button onClick={() => confirmDisconnect('Hyperliquid', connect.disconnectHL)} style={{ background: '#ff3b5c22', color: '#ff3b5c', border: '1px solid #ff3b5c44', borderRadius: 4, padding: '2px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 1 }}>DISCONNECT</button>
                ) : connect.tradingMode === 'LIVE_BINANCE' ? (
                    <button onClick={() => confirmDisconnect('Binance', connect.disconnectBinance)} style={{ background: '#ff3b5c22', color: '#ff3b5c', border: '1px solid #ff3b5c44', borderRadius: 4, padding: '2px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 1 }}>DISCONNECT</button>
                ) : (
                    <>
                        <button onClick={() => connect.setShowHlModal(true)} style={{ background: '#00d99222', color: '#00d992', border: '1px solid #00d99244', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <img src="/logos/hyperliquid.png" width={16} height={16} style={{ borderRadius: 3, flexShrink: 0 }} alt="HL" />
                            {connect.hlPendingConnect ? 'CONNECTING...' : 'CONNECT'}
                        </button>
                        <button onClick={() => connect.setShowBnbModal(true)} style={{ background: '#f0b90b22', color: '#f0b90b', border: '1px solid #f0b90b44', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <img src="/logos/binance.png" width={16} height={16} style={{ borderRadius: 3, flexShrink: 0 }} alt="BNB" />
                            {connect.bnbConnecting ? 'CONNECTING...' : 'CONNECT'}
                        </button>
                    </>
                )}
                <div className={`nt-conn ${(exchangeConnected || exchangeConnecting) ? 'on' : ''}`} title={exchangeConnecting ? 'Exchange connection is being finalized' : exchangeConnected ? 'Live exchange wallet connected' : 'Paper mode active'}>
                    <span className="nt-conn-dot" />
                    {exchangeStatusLabel}
                </div>
                <button className={`nt-sound-btn ${soundOn ? 'on' : 'off'}`} onClick={() => setSoundOn(s => !s)} title={soundOn ? 'Ses kapalı yap' : 'Ses açık yap'}>
                    {soundOn ? <IconBell /> : <IconBellOff />}
                </button>
                <button className={`nt-sound-btn ${notifEnabled ? 'on' : 'off'}`} onClick={toggleNotif} title={notifEnabled ? 'Masaüstü bildirimlerini kapat' : 'Masaüstü bildirimlerini aç'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <IconMonitor />
                    <span style={{ fontSize: 9, color: notifEnabled ? 'var(--accent)' : 'var(--text-3)' }}>{notifEnabled ? 'ON' : 'OFF'}</span>
                </button>
                <button onClick={() => setShowShortcuts(s => !s)} title="Komut Yardımı (? tuşu)" style={{ background: showShortcuts ? 'var(--accent)' : 'transparent', color: showShortcuts ? '#000' : 'var(--text-3)', border: '1px solid var(--border-0)', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer', lineHeight: 1.4 }}>?</button>
                <div className="nt-lev-wrap">
                    <button className="nt-lev-btn" onClick={() => { setShowLevSettings(s => !s); setShowBalSettings(false); setLevInputs(leverages.map(String)) }}>
                        LEV x{leverages.join('/')}
                    </button>
                    {showLevSettings && (
                        <div className="nt-lev-panel">
                            <div className="nt-lev-title">Kaldıraç Ayarı</div>
                            {levInputs.map((v, i) => (
                                <div key={i} className="nt-lev-row">
                                    <span>x</span>
                                    <input className="nt-lev-input" type="number" min={1} max={125} value={v}
                                        onChange={e => setLevInputs(prev => prev.map((p, j) => j === i ? e.target.value : p))} />
                                </div>
                            ))}
                            <button className="nt-lev-save" onClick={() => {
                                const parsed = levInputs.map(v => Math.min(125, Math.max(1, parseInt(v) || 1)))
                                setLeverages(parsed)
                                localStorage.setItem('nt_leverages', JSON.stringify(parsed))
                                setShowLevSettings(false)
                            }}>Kaydet</button>
                        </div>
                    )}
                </div>
                <div className="nt-lev-wrap">
                    <button className="nt-lev-btn nt-bal-btn" title="Hızlı emir butonlarının kullanacağı marjin büyüklüğü — gerçek bakiyeniz değil." onClick={() => { setShowBalSettings(s => !s); setShowLevSettings(false); setBalInput(String(tradeBalance)) }}>
                        SIZE ${tradeBalance >= 1000 ? (tradeBalance / 1000).toFixed(tradeBalance % 1000 === 0 ? 0 : 1) + 'K' : tradeBalance}
                    </button>
                    {showBalSettings && (
                        <div className="nt-lev-panel nt-bal-panel">
                            <div className="nt-lev-title">Hızlı Emir Büyüklüğü</div>
                            <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 6, lineHeight: 1.4 }}>
                                Coin bar'daki tek tıkla emir butonlarının marjini. Gerçek cüzdan bakiyeniz değil.
                            </div>
                            <div className="nt-bal-presets">
                                {[1000, 5000, 10000, 25000, 50000].map(v => (
                                    <button key={v} className={`nt-bal-preset ${tradeBalance === v ? 'active' : ''}`} onClick={() => setBalInput(String(v))}>
                                        ${v >= 1000 ? (v / 1000) + 'K' : v}
                                    </button>
                                ))}
                            </div>
                            <div className="nt-lev-row">
                                <span>$</span>
                                <input className="nt-lev-input" style={{ width: '80px' }} type="number" min={1} value={balInput} onChange={e => setBalInput(e.target.value)} />
                            </div>
                            <button className="nt-lev-save" onClick={() => {
                                const parsed = Math.max(1, parseFloat(balInput) || 1000)
                                setTradeBalance(parsed)
                                localStorage.setItem('nt_trade_balance', String(parsed))
                                setShowBalSettings(false)
                            }}>Kaydet</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
