import { useEffect, useRef } from 'react'

const INTERVAL_MAP = {
  '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
  '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720',
  '1d': 'D', '1w': 'W', '1M': 'M',
}

let scriptLoaded = false
let scriptCallbacks = []

function loadTVScript(cb) {
  if (scriptLoaded) { cb(); return }
  scriptCallbacks.push(cb)
  if (scriptCallbacks.length > 1) return
  const s = document.createElement('script')
  s.src = 'https://s3.tradingview.com/tv.js'
  s.async = true
  s.onload = () => {
    scriptLoaded = true
    scriptCallbacks.forEach(fn => fn())
    scriptCallbacks = []
  }
  document.head.appendChild(s)
}

let uid = 0

export default function TradingViewChart({ symbol = 'BTCUSDT', interval = '15m' }) {
  const containerRef = useRef(null)
  const widgetRef    = useRef(null)
  const idRef        = useRef(`tv_chart_${++uid}`)

  useEffect(() => {
    const containerId = idRef.current
    const tvInterval  = INTERVAL_MAP[interval] || '15'
    // Binance perpetual format: BINANCE:BTCUSDT.P
    const tvSymbol    = `BINANCE:${symbol}${symbol.endsWith('USDT') ? '' : 'USDT'}.P`

    const create = () => {
      if (!containerRef.current || !window.TradingView) return
      if (widgetRef.current) {
        try { widgetRef.current.remove() } catch {}
        widgetRef.current = null
      }
      containerRef.current.innerHTML = `<div id="${containerId}" style="width:100%;height:100%"></div>`

      widgetRef.current = new window.TradingView.widget({
        autosize:           true,
        symbol:             tvSymbol,
        interval:           tvInterval,
        container_id:       containerId,
        theme:              'dark',
        style:              '1',
        locale:             'en',
        toolbar_bg:         '#000000',
        enable_publishing:  false,
        allow_symbol_change: false,
        save_image:         false,
        hide_top_toolbar:   false,
        withdateranges:     true,
        hide_side_toolbar:  false,
        details:            false,
        hotlist:            false,
        calendar:           false,
        backgroundColor:    '#000000',
        gridColor:          'rgba(255,255,255,0.05)',
        overrides: {
          'paneProperties.background':     '#000000',
          'paneProperties.backgroundType': 'solid',
          'scalesProperties.textColor':    '#8b9eb7',
          'scalesProperties.lineColor':    '#1a1a1a',
        },
        studies_overrides: {},
        disabled_features: ['header_symbol_search', 'symbol_search_hot_key'],
        enabled_features:  ['study_templates', 'side_toolbar_in_fullscreen_mode'],
      })
    }

    loadTVScript(create)

    return () => {
      if (widgetRef.current) {
        try { widgetRef.current.remove() } catch {}
        widgetRef.current = null
      }
    }
  }, [symbol, interval])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#000' }} />
  )
}
