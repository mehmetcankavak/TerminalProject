export const COINS = [
    { sym: 'BTCUSDT', label: '$BTC' },
    { sym: 'ETHUSDT', label: '$ETH' },
    { sym: 'SOLUSDT', label: '$SOL' },
    { sym: 'XRPUSDT', label: '$XRP' },
    { sym: 'HYPEUSDT', label: '$HYPE' },
]

export const AUTOCOMPLETE_COMMANDS = [
    { cmd: 'l',     desc: '<sym> <usd> <lev>',       hint: '= long' },
    { cmd: 'long',  desc: '<sym> <usd> <lev>',       hint: 'Open a long position' },
    { cmd: 's',     desc: '<sym> <usd> <lev>',       hint: '= short' },
    { cmd: 'short', desc: '<sym> <usd> <lev>',       hint: 'Open a short position' },
    { cmd: 'c',       desc: '<sym> | all',              hint: '= close' },
    { cmd: 'close',   desc: '<sym> | all',              hint: 'Close positions' },
    { cmd: 'reduce',  desc: '<sym> <pct%|usd>',         hint: 'Kısmi pozisyon kapat' },
    { cmd: 'reverse', desc: '<sym> [lev]',              hint: 'Pozisyonu ters yöne çevir' },
    { cmd: 'be',      desc: '<sym>',                    hint: 'SL\'i entry\'ye taşı (break-even)' },
    { cmd: 'tp',      desc: '<sym> <price|pct%>',       hint: 'Take profit' },
    { cmd: 'sl',      desc: '<sym> <price|pct%>',       hint: 'Stop loss' },
    { cmd: 'b',     desc: '<sym> <usd> limit|market', hint: '= buy' },
    { cmd: 'buy',   desc: '<sym> <usd> limit|market', hint: 'Buy spot/perp' },
    { cmd: 'sell',  desc: '<sym> <usd> limit|market', hint: 'Sell spot/perp' },
    { cmd: 'size',  desc: '<sym> <usd> <risk%>',      hint: 'Calc position size' },
    { cmd: 'dca',   desc: '<sym> long|short <usd> <n> [lev]', hint: 'Dollar-cost average N orders' },
    { cmd: 'h',     desc: '<sym> [usd=500]',          hint: '= hedge' },
    { cmd: 'hedge', desc: '<sym> [usd=500]',          hint: 'Open opposite hedge position' },
    { cmd: 'panic', desc: 'yes',                      hint: 'Emergency close all' },
    { cmd: 'mode',  desc: 'paper | hyperliquid',      hint: 'Switch trading mode' },
]

export const ALL_COMMANDS = [
    { group: 'Pozisyon', items: [
        { cmd: 'long BTCUSDT 500 10',        desc: 'BTC long, $500 marjin, 10x kaldıraç' },
        { cmd: 'short ETHUSDT 300 5',        desc: 'ETH short, $300 marjin, 5x kaldıraç' },
        { cmd: 'close BTCUSDT',              desc: 'BTC pozisyonunu kapat' },
        { cmd: 'close all',                  desc: 'Tüm pozisyonları kapat' },
        { cmd: 'reduce BTCUSDT 50%',         desc: 'BTC pozisyonunun yarısını kapat' },
        { cmd: 'reduce ETHUSDT 500',         desc: 'ETH\'den $500 notional kapat' },
        { cmd: 'reverse BTCUSDT',            desc: 'BTC pozisyonunu ters yöne çevir' },
        { cmd: 'reverse BTCUSDT 20',         desc: 'BTC\'yi ters yöne 20x ile çevir' },
        { cmd: 'dca BTCUSDT long 1000 5 10', desc: 'BTC için $200\'er 5 long emir (10x)' },
        { cmd: 'hedge BTCUSDT 500',          desc: 'BTC için $500 ters pozisyon' },
    ]},
    { group: 'SL / TP', items: [
        { cmd: 'sl BTCUSDT 90000',           desc: 'BTC için $90K stop-loss' },
        { cmd: 'sl BTCUSDT 5%',              desc: 'BTC için %5 stop-loss' },
        { cmd: 'tp BTCUSDT 110000',          desc: 'BTC için $110K take-profit' },
        { cmd: 'tp BTCUSDT 10%',             desc: 'BTC için %10 take-profit' },
        { cmd: 'be BTCUSDT',                 desc: 'SL\'i BTC giriş fiyatına taşı (risksiz pozisyon)' },
    ]},
    { group: 'Spot / Limit', items: [
        { cmd: 'buy BTCUSDT 500 market',     desc: 'Market buy $500 BTC' },
        { cmd: 'sell ETHUSDT 200 limit',     desc: 'Limit sell $200 ETH' },
        { cmd: 'size BTCUSDT 10000 2%',      desc: '$10K hesap, %2 risk → pozisyon boyutu' },
    ]},
    { group: 'Sistem', items: [
        { cmd: 'mode paper',                 desc: 'Paper trading moduna geç' },
        { cmd: 'mode hyperliquid',           desc: 'Canlı trading moduna geç' },
        { cmd: 'panic yes',                  desc: '⚠ Tüm pozisyonları zorla kapat' },
    ]},
]

export const KEYBOARD_SHORTCUTS = [
    { key: '?',         desc: 'Bu yardım ekranını aç / kapat' },
    { key: 'Esc',       desc: 'Yardım ekranını kapat' },
    { key: '↑ / ↓',    desc: 'Komut geçmişinde gezin' },
    { key: 'Enter',     desc: 'Komutu gönder' },
    { key: 'Tab',       desc: 'Otomatik tamamla (önerilen ilk komut)' },
]

export const PRIO_COLORS = {
    HIGH: { border: '#ff3b5c', bg: 'rgba(255,59,92,0.06)' },
    MEDIUM: { border: '#e5a236', bg: 'rgba(229,162,54,0.04)' },
    MED: { border: '#e5a236', bg: 'rgba(229,162,54,0.04)' },
    LOW: { border: '#1a1c25', bg: 'transparent' },
}

export const LOG_COLORS = {
    info: '#b0ada8', success: '#00d992', error: '#ff3b5c',
    warning: '#e5a236', system: '#4e4d49', order: '#00d992', risk: '#ff3b5c',
}

export const SYMBOL_CMDS = new Set(['long','short','close','tp','sl','buy','sell','size','dca','hedge','reduce','reverse','be','l','s','c','cl','h','b'])
