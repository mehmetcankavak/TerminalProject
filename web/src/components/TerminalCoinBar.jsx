import React from 'react';

const fmt = (n, d = 2) => n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (n) => n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

export default function TerminalCoinBar({
    COINS,
    tickers,
    chartSymbol,
    setChartSymbol,
    leverages,
    tradeBalance,
    sendOrder,
    staleSymbols = [],
}) {
    const staleSet = React.useMemo(() => new Set(staleSymbols || []), [staleSymbols]);
    return (
        <div className="nt-coinbar">
            {COINS.map(coin => {
                const t = tickers[coin.sym];
                const price = t?.last_price;
                const pct = t?.change_24h_pct;
                const isStale = staleSet.has(coin.sym);

                return (
                    <div key={coin.sym} className={`nt-coin ${chartSymbol === coin.sym ? 'active-chart' : ''}`}>
                        <div className="nt-coin-head" style={{ cursor: 'pointer' }} onClick={() => setChartSymbol(coin.sym)}>
                            <span className="nt-coin-label">{coin.label}</span>
                            {isStale && (
                                <span
                                    title="Fiyat feed'i 30sn+ güncellenmedi — emir verirken dikkatli olun"
                                    style={{ background: '#f5a62322', color: '#f5a623', border: '1px solid #f5a62355', borderRadius: 3, padding: '0 4px', fontSize: 9, fontWeight: 700, letterSpacing: 1, marginLeft: 4 }}
                                >STALE</span>
                            )}
                            <span className={`nt-coin-pct ${(pct || 0) >= 0 ? 'up' : 'dn'}`}>{fmtPct(pct)}</span>
                            <span className="nt-coin-price" style={isStale ? { opacity: 0.55 } : undefined}>${price ? fmt(price) : '—'}</span>
                        </div>
                        <div className="nt-coin-row long">
                            {leverages.map(x => {
                                const pos = Math.floor(tradeBalance * x);
                                return (
                                    <button 
                                        key={x} 
                                        className="nt-qbtn long" 
                                        onClick={() => sendOrder(coin.sym, 'buy', tradeBalance, x)}
                                    >
                                        x{x} ${pos >= 1000 ? (pos/1000).toFixed(1)+'K' : pos}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="nt-coin-row short">
                            {leverages.map(x => {
                                const pos = Math.floor(tradeBalance * x);
                                return (
                                    <button 
                                        key={x} 
                                        className="nt-qbtn short" 
                                        onClick={() => sendOrder(coin.sym, 'sell', tradeBalance, x)}
                                    >
                                        x{x} ${pos >= 1000 ? (pos/1000).toFixed(1)+'K' : pos}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
