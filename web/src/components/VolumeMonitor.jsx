import { useState, useEffect, useCallback } from 'react'
import { fetchVolume24h, getSymbolMeta, formatUSD } from '../services/api'
import { CoinLogo } from './FundingRate'

export default function VolumeMonitor() {
    const [data, setData] = useState([])
    const [loading, setLoading] = useState(true)
    const [limit, setLimit] = useState(15)

    const loadData = useCallback(async () => {
        try {
            const result = await fetchVolume24h(limit)
            if (result && result.length > 0) {
                setData(result)
            }
        } catch (e) {
            console.warn('Volume fetch error:', e)
        } finally {
            setLoading(false)
        }
    }, [limit])

    useEffect(() => {
        loadData()
        const id = setInterval(loadData, 30_000) // Refresh every 30s
        return () => clearInterval(id)
    }, [loadData])

    return (
        <div className="widget-card animate-fade-in">
            <div className="widget-header">
                <div>
                    <div className="widget-title">Volume Monitor</div>
                    <div className="widget-subtitle">24h Binance Spot · Top {limit}</div>
                </div>
                <div className="widget-actions">
                    <select className="filter-select" value={limit} onChange={e => setLimit(Number(e.target.value))}>
                        <option value={10}>Top 10</option>
                        <option value={15}>Top 15</option>
                        <option value={25}>Top 25</option>
                    </select>
                </div>
            </div>
            <div className="widget-body" style={{ padding: 0 }}>
                <div style={{ maxHeight: 650, overflowY: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Symbol</th>
                                <th>Price</th>
                                <th style={{ color: 'var(--green)' }}>Volume 24h</th>
                                <th>Change %</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && data.length === 0 && (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 20 }}>
                                        Loading...
                                    </td>
                                </tr>
                            )}
                            {data.map((row) => {
                                const meta = getSymbolMeta(row.symbol)
                                const changeColor = row.priceChangePct >= 0 ? 'var(--green)' : 'var(--red)'
                                return (
                                    <tr key={row.symbol}>
                                        <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>{row.rank}</td>
                                        <td>
                                            <div className="symbol-cell">
                                                <CoinLogo symbol={row.symbol} />
                                                <div>
                                                    <span className="symbol-name">{row.symbol}</span>
                                                    <span className="symbol-pair"> /{row.pair}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600 }}>
                                            ${row.price > 1 ? row.price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : row.price.toFixed(6)}
                                        </td>
                                        <td>
                                            <span className="text-green font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                                                {formatUSD(row.volume24h)}
                                            </span>
                                        </td>
                                        <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, color: changeColor }}>
                                            {row.priceChangePct >= 0 ? '+' : ''}{row.priceChangePct.toFixed(2)}%
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
