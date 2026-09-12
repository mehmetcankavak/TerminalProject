// Run against Vite. All API traffic is intercepted; no real account or order is used.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5175'
const output = process.env.QA_OUTPUT || '/tmp/terminal-workspace-qa'
const screens = ['dashboard', 'terminal', 'portfolio', 'smart-money', 'spot-markets', 'stocks', 'etf', 'global-metrics', 'market-compass', 'long-short-ratio', 'funding-rate', 'liquidations-stream', 'system-alerts', 'alert-monitoring', 'custom-alerts', 'big-transfers', 'volume-monitor', 'token-unlock', 'economic-calendar', 'account-settings', 'upgrade']
const coins = [['BTC', 'Bitcoin', 64280], ['ETH', 'Ethereum', 3248], ['SOL', 'Solana', 142.36]]
const alerts = [{ id: 1, coin: 'BTC', symbol: 'BTCUSDT', direction: 'above', target_price: 72000, created_at: '2026-09-12T09:00:00Z', triggered: false }, { id: 2, coin: 'ETH', symbol: 'ETHUSDT', direction: 'below', target_price: 2800, created_at: '2026-09-12T09:00:00Z', triggered: true }]
const candles = Array.from({ length: 90 }, (_, i) => {
  const open = 64000 + i * 3 + Math.sin(i / 4) * 100
  const close = open + Math.cos(i) * 45
  return [1789200000000 + i * 900000, open, Math.max(open, close) + 30, Math.min(open, close) - 30, close, 25]
})
const marketGlobal = { total_market_cap: { usd: 2.73e12 }, total_volume: { usd: 118e9 }, market_cap_percentage: { btc: 54.1, eth: 13.4, usdt: 4.2, usdc: 2.1 }, market_cap_change_percentage_24h_usd: 2.4, active_cryptocurrencies: 11892 }
const testTraders = Array.from({ length: 8 }, (_, i) => ({ address: '0x' + String(i + 1).padStart(40, '0'), displayName: `Test Trader ${i + 1}`, accountValue: 124000 + i * 5000, pnl_alltime: 18000 + i * 100, roi_alltime: 0.24, pnl_month: 6000 }))
const volumeItems = coins.map(([symbol, , price], i) => ({ symbol: symbol + 'USDT', price, volume_24h: 12e9 / (i + 1), volume_7d_avg: 6e9, ratio: 2, anomaly_score: 4, band: 'active', change_24h_pct: i === 2 ? -0.71 : 2.14 }))

async function main() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    let plan = 'pro'
    await context.addInitScript(() => {
      localStorage.setItem('nt_token', 'visual-test-only')
      localStorage.setItem('tt_onboarding_v1', '1')
      localStorage.setItem('nt_chart_mode', 'lite')
      for (const key of ['smart-money', 'big-transfers', 'liquidations-stream']) localStorage.setItem('tt_spotlight_' + key, '1')
      class OfflineSocket extends EventTarget {
        static OPEN = 1
        readyState = 0
        send() {}
        close() {}
        constructor(url) {
          super()
          if (url.includes('miniTicker')) setTimeout(() => {
            for (const [symbol, price] of [['BTC', 64280], ['ETH', 3248], ['SOL', 142.36], ['BNB', 582], ['XRP', 0.53], ['DOGE', 0.16], ['AVAX', 32]]) this.onmessage?.({ data: JSON.stringify({ data: { s: symbol + 'USDT', c: String(price), o: String(price / 1.0214) } }) })
          }, 20)
        }
      }
      window.WebSocket = OfflineSocket
    })
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin === base && !/^\/(api|auth)\//.test(url.pathname)) return route.continue()
      // Static artwork is allowed; account, market and order APIs remain isolated.
      if (route.request().resourceType() === 'image') return route.continue()
      let data = null
      if (url.pathname === '/auth/me') data = { id: 999, email: 'preview@example.com', name: 'Mehmet', plan, is_admin: false }
      else if (url.pathname === '/api/alerts') data = alerts
      else if (url.pathname === '/api/status') data = { mode: 'PAPER', balance: 10000, free_margin: 10000, positions: {}, news: [], tickers: Object.fromEntries(coins.map(([s, , price]) => [s + 'USDT', { last_price: price, change_24h_pct: 2.14 }])) }
      else if (url.pathname === '/api/binance/klines') data = { data: candles }
      else if (url.pathname === '/api/market/cmc_top') data = { status: 'ok', data: coins.map(([symbol, name, price], i) => ({ id: i + 1, symbol, name, cmcRank: i + 1, tags: [], quotes: [{ name: 'USD', price, percentChange1h: 0.2, percentChange24h: i === 2 ? -0.71 : 2.14, percentChange7d: 3.1, marketCap: price * 1000000, volume24h: price * 10000 }] })) }
      else if (url.pathname === '/api/funding/snapshot') data = { rates: Object.fromEntries(coins.map(([s]) => [s, Object.fromEntries(['binance', 'okx', 'bybit', 'bitget', 'hyperliquid'].map((ex, i) => [ex, { rate: i === 1 ? -0.0001 : 0.0001 }]))])) }
      else if (url.pathname.includes('LongShort')) data = [{ longAccount: '0.524', shortAccount: '0.476', longShortRatio: '1.1', timestamp: Date.now() }]
      else if (url.pathname === '/api/email/settings') data = { enabled: false }
      else if (url.pathname === '/api/telegram/status') data = { connected: false }
      else if (url.pathname === '/api/portfolio') data = { balance: 48725, available: 12430, margin_used: 8000, realized_pnl: 4212, unrealized_pnl: 2891, net_pnl_now: 7103, total_fees: 48,
        positions: coins.map(([symbol, , price]) => ({ symbol: symbol + 'USDT', side: 'long', quantity: 0.2, entry_price: price * 0.98, current_price: price, leverage: 5, unrealized_pnl: 250, unrealized_pnl_pct: 2.14, accumulated_funding: -4, liq_distance_pct: 28 })),
        trades: Array.from({ length: 20 }, (_, i) => ({ symbol: 'BTCUSDT', side: 'long', quantity: 0.1, leverage: 5, entry_price: 62000, exit_price: 64000, realized_pnl: 180 + Math.sin(i) * 300, pnl_pct: 2.1, closed_at: new Date().toISOString() })) }
      else if (url.pathname === '/api/balances') data = {}
      else if (url.pathname === '/api/market/global') data = { status: 'ok', data: marketGlobal }
      else if (url.pathname === '/api/v3/global') data = { data: marketGlobal }
      else if (url.pathname.includes('/fng/')) data = { data: [{ value: '62', value_classification: 'Greed' }] }
      else if (url.pathname === '/api/v3/coins/markets') data = coins.map(([symbol, name, current_price], i) => ({ id: name.toLowerCase(), symbol, name, current_price, market_cap: 1e12 / (i + 1), price_change_percentage_24h: i === 2 ? -0.71 : 2.14 }))
      else if (url.pathname === '/api/v3/search/trending') data = { coins: [] }
      else if (url.pathname === '/api/stocks/assets_ranking') data = { status: 'ok', data: ['AAPL', 'MSFT', 'NVDA'].map((code, i) => ({ rank: i + 1, code, name: code + ' Inc.', market_cap: '$2.68 T', price: '$173.24', today: '1.27%', today_dir: 'up', country: 'USA' })) }
      else if (url.pathname === '/api/market/volume-monitor') data = { items: volumeItems, majors: volumeItems, sentiment: { bull_volume: 18e9, bear_volume: 8e9, score: 0.38 } }
      else if (url.pathname === '/api/liq-stats') data = { stats: Object.fromEntries(['h1', 'h4', 'h12', 'h24'].map((p, i) => [p, { long: 1e6 * (i + 1), short: 2e6 * (i + 1) }])), coins: Object.fromEntries(coins.map(([symbol], i) => [symbol, { long: 1e6 / (i + 1), short: 2e6 / (i + 1) }])) }
      else if (url.pathname === '/api/etf-data') data = { totalAUM: 56e9, hasCoinGlass: true, etfs: ['IBIT', 'FBTC', 'ARKB', 'GBTC'].map((symbol, i) => ({ symbol, longName: symbol + ' Bitcoin ETF', price: 32 + i, volume: 10e6, changePct: i === 3 ? -1 : 2 })), summary: { today: 318, week: 1120, month: 3260, threeMonth: 7840 } }
      else if (url.pathname === '/api/smart-money/leaderboard') data = testTraders
      else if (url.pathname === '/api/smart-money/followed') data = { followed: {} }
      else if (url.pathname === '/api/smart-money/fills') data = { fills: [] }
      else if (url.pathname === '/api/smart-money/sentiment') data = { score: 0.3, verdict: 'BULLISH', long_vol: 12e6, short_vol: 8e6, long_count: 18, short_count: 12, by_coin: [] }
      else if (url.pathname.startsWith('/api/smart-money/positions/')) data = { positions: [] }
      else if (url.pathname === '/api/big-transfers/feed') data = { transfers: coins.map(([asset], i) => ({ chain: 'eth', asset, tx_hash: 'test-' + i, ts: Date.now(), amount_usd: 12e6, from: '0x1234567890123456', to: '0x9876543210987654', from_label: 'Test Exchange', flow_category: 'outflow' })) }
      if (data !== null) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Offline visual test' }) })
    })
    const page = await context.newPage()
    const runtimeErrors = []
    page.on('pageerror', error => runtimeErrors.push(error.message))
    const results = []
    async function navigate(name) {
      await page.evaluate(name => window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page: name } })), name)
      await page.waitForFunction(name => document.querySelector('.ct-workspace')?.dataset.page === name, name)
      await page.waitForTimeout(450)
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(base + '/app')
      await page.locator('.ct-workspace').waitFor()
      for (const name of screens) {
        await navigate(name)
        const state = await page.evaluate(() => ({
          activePage: document.querySelector('.ct-workspace').dataset.page,
          background: getComputedStyle(document.querySelector('.main-content')).backgroundColor,
          contentWidth: document.querySelector('.main-content').getBoundingClientRect().width,
          sidebarVisible: getComputedStyle(document.querySelector('.ct-workspace > .sb-sidebar')).display !== 'none',
          overflow: document.documentElement.scrollWidth > innerWidth,
        }))
        assert.equal(state.activePage, name)
        assert.equal(state.background, 'rgb(255, 255, 255)')
        assert.equal(state.overflow, false, `${name}: viewport overflow at ${width}`)
        assert.equal(state.sidebarVisible, width > 768)
        assert.ok(state.contentWidth >= (width > 768 ? width - 240 : width - 1))
        await page.screenshot({ path: `${output}/${width}-${name}.png` })
        results.push({ width, name, ...state })
      }
    }
    // The mobile drawer must open, navigate, and then close.
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.locator('.mobile-sidebar .sb-item').filter({ hasText: /^Terminal/ }).click()
    await page.waitForFunction(() => document.querySelector('.ct-workspace').dataset.page === 'terminal')
    assert.equal(await page.locator('.mobile-sidebar-overlay').count(), 0)
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.locator('.mobile-sidebar .sb-item').filter({ hasText: /^Dashboard/ }).click()
    // Keyboard navigation and account forms remain reachable.
    await page.setViewportSize({ width: 1440, height: 1000 })
    await navigate('dashboard')
    const stripFits = await page.locator('.ds-strip').evaluate(el => el.scrollHeight <= el.clientHeight + 1)
    assert.ok(stripFits, 'All market-strip rows must fit without clipping')
    await page.getByRole('textbox', { name: 'Search watchlist' }).fill('ETH')
    assert.equal(await page.locator('.ds-watch-row').count(), 1)
    await page.getByRole('textbox', { name: 'Search watchlist' }).fill('')
    await navigate('smart-money')
    assert.equal(await page.locator('.ct-trader-row').count(), testTraders.length)
    await page.locator('.ct-trader-row').first().click()
    await page.locator('.ct-smart-detail').waitFor()
    await page.screenshot({ path: `${output}/1440-smart-money-detail.png` })
    await navigate('stocks')
    await page.locator('.stx2-row').first().click()
    await page.locator('.ct-stock-detail .stx-modal-content').waitFor()
    assert.equal(await page.locator('.ct-stock-detail .stx-modal-overlay').evaluate(el => getComputedStyle(el).position), 'static')
    await page.screenshot({ path: `${output}/1440-stocks-detail.png` })
    await navigate('dashboard')
    await page.keyboard.press('Control+k')
    await page.locator('.cmdk-input').fill('Portfolio')
    await page.locator('.cmdk-input').press('Enter')
    await page.waitForFunction(() => document.querySelector('.ct-workspace').dataset.page === 'portfolio')
    await navigate('account-settings')
    await page.getByRole('button', { name: /^Change/ }).click()
    assert.equal(await page.locator('.acc2-modal input[type=password]').count(), 3)
    await page.locator('.acc2-modal-close').click()
    // Inspect the real chart canvas with deterministic candle fixtures.
    await navigate('terminal')
    await page.waitForTimeout(800)
    const coloredPixels = await page.locator('canvas').evaluateAll(canvases => canvases.reduce((total, canvas) => {
      const context = canvas.getContext('2d')
      if (!context) return total
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      let count = 0
      for (let i = 0; i < pixels.length; i += 16) {
        if (pixels[i + 3] > 100 && Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 60) count++
      }
      return total + count
    }, 0))
    assert.ok(coloredPixels > 20, 'Candle chart should contain rendered financial data')
    // Public pages do not inherit the workspace theme.
    for (const route of ['/', '/login', '/register']) {
      await page.goto(base + route)
      assert.equal(await page.locator('.ct-workspace').count(), 0)
    }
    plan = 'free'
    await page.goto(base + '/app')
    await page.locator('.ct-workspace').waitFor()
    await navigate('terminal')
    assert.equal(await page.locator('.progate-preview').count(), 1, 'Free plan must retain the limited preview')
    assert.equal(await page.locator('.progate-preview-content').evaluate(el => getComputedStyle(el).pointerEvents), 'none')
    assert.deepEqual(runtimeErrors, [])
    fs.writeFileSync(`${output}/results.json`, JSON.stringify({ results, runtimeErrors, coloredPixels, interactionChecks: 'passed' }, null, 2))
    console.log(`PASS: ${results.length} responsive views, menu/form/plan checks, ${coloredPixels} colored chart pixels`)
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
