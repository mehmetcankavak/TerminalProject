import { useEffect, useRef, useState } from 'react'
import { createChart, CrosshairMode, CandlestickSeries } from 'lightweight-charts'
import { API_BASE } from '../config'

export default function TerminalChart({ symbol = 'BTCUSDT', interval = '15m', activePosition = null, activeOrders = [], alertLines = [], onPriceClick, onTpSlChange }) {
    const chartContainerRef = useRef(null)
    const chartRef = useRef(null)
    const seriesRef = useRef(null)
    const wsRef = useRef(null)
    const linesRef = useRef({ entry: null, sl: null, tp: null })
    const ordersLinesRef = useRef({})
    const alertLinesRef = useRef([])
    const [loading, setLoading] = useState(true)
    const [seriesReady, setSeriesReady] = useState(0)
    const [chartError, setChartError] = useState('')
    const pollRef = useRef(null)

    const clickHandlerRef   = useRef(onPriceClick)
    const onTpSlChangeRef   = useRef(onTpSlChange)
    const activePosRef      = useRef(activePosition)
    const dragState         = useRef({ dragging: null, price: null }) // dragging: 'tp'|'sl'|null
    const hoverState        = useRef(null)                             // 'tp'|'sl'|null

    useEffect(() => { clickHandlerRef.current  = onPriceClick  }, [onPriceClick])
    useEffect(() => { onTpSlChangeRef.current  = onTpSlChange  }, [onTpSlChange])
    useEffect(() => { activePosRef.current     = activePosition }, [activePosition])

    useEffect(() => {
        const series = seriesRef.current
        if (!series || seriesReady === 0) return

        if (!activePosition) {
            // Remove lines if position closed
            if (linesRef.current.entry) { try { series.removePriceLine(linesRef.current.entry) } catch(e){} linesRef.current.entry = null }
            if (linesRef.current.sl) { try { series.removePriceLine(linesRef.current.sl) } catch(e){} linesRef.current.sl = null }
            if (linesRef.current.tp) { try { series.removePriceLine(linesRef.current.tp) } catch(e){} linesRef.current.tp = null }
            return
        }

        if (activePosition.entry_price) {
            const sideColor = activePosition.side === 'LONG' ? '#00d992' : '#ff3b5c'
            const qty = activePosition.quantity ? ` ${activePosition.quantity}` : ''
            const ep = parseFloat(activePosition.entry_price)

            if (!linesRef.current.entry) {
                linesRef.current.entry = series.createPriceLine({
                    price: ep, color: sideColor, lineWidth: 2, lineStyle: 2,
                    axisLabelVisible: true, title: `Entry${qty}`,
                })
            } else {
                linesRef.current.entry.applyOptions({ price: ep, color: sideColor, title: `Entry${qty}` })
            }

            if (activePosition.take_profit) {
                const tp = parseFloat(activePosition.take_profit)
                if (!linesRef.current.tp) {
                    linesRef.current.tp = series.createPriceLine({
                        price: tp, color: '#00d992', lineWidth: 1.5, lineStyle: 0,
                        axisLabelVisible: true, title: 'TP',
                    })
                } else {
                    linesRef.current.tp.applyOptions({ price: tp })
                }
            } else if (linesRef.current.tp) {
                try { series.removePriceLine(linesRef.current.tp) } catch(e){}
                linesRef.current.tp = null
            }

            if (activePosition.stop_loss) {
                const sl = parseFloat(activePosition.stop_loss)
                if (!linesRef.current.sl) {
                    linesRef.current.sl = series.createPriceLine({
                        price: sl, color: '#ff3b5c', lineWidth: 1.5, lineStyle: 0,
                        axisLabelVisible: true, title: 'SL',
                    })
                } else {
                    linesRef.current.sl.applyOptions({ price: sl })
                }
            } else if (linesRef.current.sl) {
                try { series.removePriceLine(linesRef.current.sl) } catch(e){}
                linesRef.current.sl = null
            }
        }
    }, [activePosition?.entry_price, activePosition?.take_profit, activePosition?.stop_loss, activePosition?.quantity, activePosition?.side, seriesReady])

    // Effect for open orders
    useEffect(() => {
        const series = seriesRef.current
        if (!series || seriesReady === 0) return

        const currentIds = new Set(activeOrders.map(o => o.oid))

        // Remove lines for orders that no longer exist
        Object.keys(ordersLinesRef.current).forEach(oid => {
            if (!currentIds.has(oid)) {
                try { series.removePriceLine(ordersLinesRef.current[oid]) } catch(e){}
                delete ordersLinesRef.current[oid]
            }
        })

        // Create or update lines for existing orders
        activeOrders.forEach(o => {
            const price = parseFloat(o.price)
            if (!price) return
            const color = o.side === 'BUY' ? '#00d992' : '#ff3b5c'
            const title = `Lmt ${o.side === 'BUY' ? 'L' : 'S'} ${o.quantity}`

            if (ordersLinesRef.current[o.oid]) {
                ordersLinesRef.current[o.oid].applyOptions({ price, color, title })
            } else {
                ordersLinesRef.current[o.oid] = series.createPriceLine({
                    price, color, lineWidth: 1, lineStyle: 1, // Dotted
                    axisLabelVisible: true, title
                })
            }
        })
    }, [activeOrders, seriesReady])

    // Effect for alert lines
    useEffect(() => {
        const series = seriesRef.current
        if (!series || seriesReady === 0) return

        alertLinesRef.current.forEach((ln) => {
            try { series.removePriceLine(ln) } catch (e) {}
        })
        alertLinesRef.current = []

        alertLines.forEach((a) => {
            const line = series.createPriceLine({
                price: parseFloat(a.target_price),
                color: a.direction === 'above' ? '#00d992' : '#ff3b5c',
                lineWidth: 1.5,
                lineStyle: 2,
                axisLabelVisible: true,
                title: `ALARM ${a.direction === 'above' ? '▲' : '▼'}`,
            })
            alertLinesRef.current.push(line)
        })
    }, [alertLines, seriesReady])

    useEffect(() => {
        if (!chartContainerRef.current) return

        // 1. Create Chart
        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: 'solid', color: 'transparent' },
                textColor: '#8b9eb7',
            },
            grid: {
                vertLines: { color: 'rgba(26, 28, 37, 0.5)' },
                horzLines: { color: 'rgba(26, 28, 37, 0.5)' },
            },
            crosshair: {
                mode: CrosshairMode.Normal,
            },
            rightPriceScale: {
                borderColor: 'rgba(26, 28, 37, 0.8)',
            },
            timeScale: {
                borderColor: 'rgba(26, 28, 37, 0.8)',
                timeVisible: true,
                secondsVisible: false,
            },
        })

        const candlestickSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#00d992',
            downColor: '#ff3b5c',
            borderVisible: false,
            wickUpColor: '#00d992',
            wickDownColor: '#ff3b5c',
        })

        chartRef.current = chart
        seriesRef.current = candlestickSeries
        setSeriesReady(c => c + 1)

        // 2. Click Handler
        chart.subscribeClick((param) => {
            if (dragState.current.dragging) return // ignore click at end of drag
            if (param.point && param.seriesData && param.seriesData.size > 0) {
                const price = candlestickSeries.coordinateToPrice(param.point.y)
                if (price && clickHandlerRef.current) {
                    clickHandlerRef.current(price)
                }
            }
        })

        // 3. TP/SL Drag Logic
        const SNAP_PX = 8

        const getPriceLineCoord = (type) => {
            const line = linesRef.current[type]
            if (!line) return null
            const opts = line.options()
            return candlestickSeries.priceToCoordinate(opts.price)
        }

        chart.subscribeCrosshairMove((param) => {
            if (!param.point) return
            const y = param.point.y

            if (dragState.current.dragging) {
                // Update line in real time
                const price = candlestickSeries.coordinateToPrice(y)
                if (!price) return
                dragState.current.price = price
                const line = linesRef.current[dragState.current.dragging]
                if (line) line.applyOptions({ price })
                return
            }

            // Hover detection
            const tpY = getPriceLineCoord('tp')
            const slY = getPriceLineCoord('sl')
            let hit = null
            if (tpY !== null && Math.abs(y - tpY) <= SNAP_PX) hit = 'tp'
            else if (slY !== null && Math.abs(y - slY) <= SNAP_PX) hit = 'sl'

            if (hit !== hoverState.current) {
                hoverState.current = hit
                chartContainerRef.current.style.cursor = hit ? 'ns-resize' : 'default'
            }
        })

        const onMouseDown = (e) => {
            if (!hoverState.current) return
            e.preventDefault()
            dragState.current = { dragging: hoverState.current, price: null }
            chart.applyOptions({ handleScroll: false, handleScale: false })
        }

        const onMouseUp = () => {
            const { dragging, price } = dragState.current
            if (!dragging) return
            dragState.current = { dragging: null, price: null }
            chart.applyOptions({ handleScroll: true, handleScale: true })
            chartContainerRef.current.style.cursor = hoverState.current ? 'ns-resize' : 'default'
            if (price && onTpSlChangeRef.current) {
                onTpSlChangeRef.current(dragging, price)
            }
        }

        chartContainerRef.current.addEventListener('mousedown', onMouseDown)
        window.addEventListener('mouseup', onMouseUp)

        // 3. Resize Observer
        const handleResize = () => {
            chart.applyOptions({ width: chartContainerRef.current.clientWidth })
        }
        window.addEventListener('resize', handleResize)

        // 4. Fetch Historical Data from Binance
        setLoading(true)
        setChartError('')

        const fetchKlines = async () => {
            try {
                const res = await fetch(`${API_BASE}/api/binance/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=1000`)
                const payload = await res.json()
                const data = payload?.data

                if (!Array.isArray(data)) {
                    throw new Error(payload?.msg || 'Symbol not available on backend Binance proxy')
                }

                const cdata = data.map(d => ({
                    time: d[0] / 1000,
                    open: parseFloat(d[1]),
                    high: parseFloat(d[2]),
                    low: parseFloat(d[3]),
                    close: parseFloat(d[4]),
                }))
                candlestickSeries.setData(cdata)
                setLoading(false)
                setChartError('')

                // 5. Poll latest candles via backend so school networks that block
                // direct Binance browser traffic can still see chart updates.
                clearInterval(pollRef.current)
                pollRef.current = setInterval(async () => {
                    // Tab arka plandaysa polling yapma — bandwidth tasarrufu
                    if (document.hidden) return
                    try {
                        const pollRes = await fetch(`${API_BASE}/api/binance/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=2`)
                        const pollPayload = await pollRes.json()
                        const latest = Array.isArray(pollPayload?.data) ? pollPayload.data : []
                        latest.forEach(k => {
                            candlestickSeries.update({
                                time: k[0] / 1000,
                                open: parseFloat(k[1]),
                                high: parseFloat(k[2]),
                                low: parseFloat(k[3]),
                                close: parseFloat(k[4]),
                            })
                        })
                    } catch (err) { console.warn('[Chart] poll update error', err) }
                }, 2000)
            } catch (err) {
                console.error('Failed to load chart data', err)
                setChartError(`No Binance data via backend proxy for ${symbol}`)
                setLoading(false)
            }
        }
        
        fetchKlines()

        return () => {
            window.removeEventListener('resize', handleResize)
            window.removeEventListener('mouseup', onMouseUp)
            chartContainerRef.current?.removeEventListener('mousedown', onMouseDown)
            if (wsRef.current) wsRef.current.close()
            clearInterval(pollRef.current)
            linesRef.current = { entry: null, sl: null, tp: null }
            ordersLinesRef.current = {}
            // seriesReady counter — no reset needed, increment on next mount triggers effects
            chart.remove()
        }
    }, [symbol, interval])

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {loading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b9eb7', zIndex: 10 }}>
                    Loading chart data...
                </div>
            )}
            {!loading && chartError && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b9eb7', zIndex: 10, textAlign: 'center', padding: 24, background: 'rgba(5,8,12,0.35)' }}>
                    <div>
                        <div style={{ fontSize: 14, color: '#d5dbe3', marginBottom: 6 }}>{chartError}</div>
                        <div style={{ fontSize: 12, color: '#8b9eb7' }}>
                            The browser may be blocked from direct exchange traffic, so chart data is now requested through the local backend proxy.
                        </div>
                    </div>
                </div>
            )}
            <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
        </div>
    )
}
