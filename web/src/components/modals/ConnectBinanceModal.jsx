export default function ConnectBinanceModal({
    show, onClose,
    bnbApiKey, setBnbApiKey,
    bnbApiSecret, setBnbApiSecret,
    bnbTestnet, setBnbTestnet,
    bnbConnecting, bnbError,
    onConnect,
}) {
    if (!show) return null
    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.90)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
            <div style={{ background: '#050507', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: 28, width: 420, maxWidth: '90vw' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div>
                        <div style={{ fontSize: 11, color: '#f0b90b', letterSpacing: 2, marginBottom: 4 }}>BINANCE CEX</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#e8e6e3' }}>Connect Binance</div>
                    </div>
                    <button onClick={() => onClose()} style={{ background: 'none', border: 'none', color: '#4e4d49', fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>

                <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: '#4e4d49', letterSpacing: 1, marginBottom: 6 }}>API KEY</div>
                    <input
                        type="password"
                        placeholder="Binance API Key..."
                        value={bnbApiKey}
                        onChange={e => setBnbApiKey(e.target.value)}
                        style={{ width: '100%', background: '#000', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '8px 10px', color: '#e8e6e3', fontSize: 13, fontFamily: 'var(--font-mono)', boxSizing: 'border-box' }}
                    />
                </div>

                <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: '#4e4d49', letterSpacing: 1, marginBottom: 6 }}>API SECRET</div>
                    <input
                        type="password"
                        placeholder="Binance API Secret..."
                        value={bnbApiSecret}
                        onChange={e => setBnbApiSecret(e.target.value)}
                        style={{ width: '100%', background: '#000', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '8px 10px', color: '#e8e6e3', fontSize: 13, fontFamily: 'var(--font-mono)', boxSizing: 'border-box' }}
                    />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, cursor: 'pointer', fontSize: 13, color: '#8a8884' }}>
                    <input type="checkbox" checked={bnbTestnet} onChange={e => setBnbTestnet(e.target.checked)} />
                    Use Testnet
                </label>

                {bnbError && (
                    <div style={{ background: '#ff3b5c15', border: '1px solid #ff3b5c44', borderRadius: 4, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: '#ff3b5c' }}>
                        {bnbError}
                    </div>
                )}

                <div style={{ background: '#fbbf2412', border: '1px solid #fbbf2455', borderRadius: 4, padding: '10px 12px', marginBottom: 16, lineHeight: 1.6 }}>
                    <div style={{ fontSize: 12, color: '#fbbf24', fontWeight: 600, marginBottom: 3 }}>⚠ Security Note</div>
                    <div style={{ fontSize: 11, color: '#c9a84c' }}>API key/secret yalnızca bu sekmenin belleğinde (sessionStorage) tutulur. Sekmeyi kapattığında otomatik silinir — diskte iz kalmaz. Sunucu DB'sine yazılmaz.</div>
                </div>

                <button
                    onClick={onConnect}
                    disabled={bnbConnecting || !bnbApiKey || !bnbApiSecret}
                    style={{ width: '100%', background: bnbConnecting || !bnbApiKey || !bnbApiSecret ? '#1a1c25' : '#f0b90b', color: bnbConnecting || !bnbApiKey || !bnbApiSecret ? '#4e4d49' : '#000', border: 'none', borderRadius: 4, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: bnbConnecting || !bnbApiKey || !bnbApiSecret ? 'not-allowed' : 'pointer', letterSpacing: 1 }}
                >
                    {bnbConnecting ? 'CONNECTING...' : 'CONNECT'}
                </button>
            </div>
        </div>
    )
}
