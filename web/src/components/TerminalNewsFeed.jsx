import React, { useState, useCallback, useMemo } from 'react';
import { API_BASE } from '../config';
import { sendNewsToTelegram } from '../services/api';
import { useAuth } from '../context/AuthContext';

const PRIO_COLORS = {
    HIGH: { border: '#ff3b5c', bg: 'rgba(255,59,92,0.06)' },
    MEDIUM: { border: '#e5a236', bg: 'rgba(229,162,54,0.04)' },
    MED: { border: '#e5a236', bg: 'rgba(229,162,54,0.04)' },
    LOW: { border: '#1a1c25', bg: 'transparent' },
};

const SOURCE_TIER_STYLES = {
    official: { label: 'OFFICIAL', color: '#00d992', border: 'rgba(0,217,146,0.28)', bg: 'rgba(0,217,146,0.08)' },
    fast: { label: 'FAST', color: '#f0b90b', border: 'rgba(240,185,11,0.28)', bg: 'rgba(240,185,11,0.08)' },
    fallback: { label: 'FALLBACK', color: '#8b9eb7', border: 'rgba(139,158,183,0.20)', bg: 'rgba(139,158,183,0.06)' },
};

const EVENT_TYPE_STYLES = {
    listing:    { label: 'LISTING', color: '#00d992', border: 'rgba(0,217,146,0.24)', bg: 'rgba(0,217,146,0.07)' },
    delisting:  { label: 'DELIST', color: '#ff7b72', border: 'rgba(255,123,114,0.24)', bg: 'rgba(255,123,114,0.07)' },
    exploit:    { label: 'EXPLOIT', color: '#ff3b5c', border: 'rgba(255,59,92,0.24)', bg: 'rgba(255,59,92,0.07)' },
    regulation: { label: 'REG', color: '#f0b90b', border: 'rgba(240,185,11,0.24)', bg: 'rgba(240,185,11,0.07)' },
    operations: { label: 'OPS', color: '#7dd3fc', border: 'rgba(125,211,252,0.24)', bg: 'rgba(125,211,252,0.07)' },
    product:    { label: 'PRODUCT', color: '#c084fc', border: 'rgba(192,132,252,0.24)', bg: 'rgba(192,132,252,0.07)' },
    funding:    { label: 'FUNDING', color: '#34d399', border: 'rgba(52,211,153,0.24)', bg: 'rgba(52,211,153,0.07)' },
    macro:      { label: 'MACRO', color: '#f59e0b', border: 'rgba(245,158,11,0.24)', bg: 'rgba(245,158,11,0.07)' },
    general:    { label: 'NEWS', color: '#8b9eb7', border: 'rgba(139,158,183,0.20)', bg: 'rgba(139,158,183,0.06)' },
};

const NEWS_FILTERS = [
    { key: 'all', label: 'ALL' },
    { key: 'official', label: 'OFFICIAL' },
    { key: 'high', label: 'HIGH' },
    { key: 'listing', label: 'LISTINGS' },
    { key: 'exploit', label: 'EXPLOITS' },
];

const getLatencySignal = (latencyMs) => {
    if (latencyMs == null) return { label: 'N/A', color: '#8b9eb7', border: 'rgba(139,158,183,0.20)', bg: 'rgba(139,158,183,0.06)' };
    if (latencyMs === -1) return { label: 'DELAYED', color: '#8b9eb7', border: 'rgba(139,158,183,0.20)', bg: 'rgba(139,158,183,0.06)' };
    if (latencyMs < 1500) return { label: 'LIVE', color: '#00d992', border: 'rgba(0,217,146,0.24)', bg: 'rgba(0,217,146,0.07)' };
    if (latencyMs < 10000) return { label: 'FAST', color: '#f0b90b', border: 'rgba(240,185,11,0.24)', bg: 'rgba(240,185,11,0.07)' };
    return { label: 'LAGGED', color: '#ff7b72', border: 'rgba(255,123,114,0.22)', bg: 'rgba(255,123,114,0.07)' };
};

const getNewsSortTimestamp = (item) => {
    const receivedAt = item?.received_at ? new Date(item.received_at).getTime() : 0;
    const publishedAt = item?.published_at ? new Date(item.published_at).getTime() : 0;
    return Math.max(receivedAt, publishedAt, 0);
};

const fmt = (n, d = 2) => n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (n) => n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
const SYMBOL_PRIORITY = ['BTC', 'ETH', 'MSTR', 'SOL', 'BRENT', 'WTI', 'GOLD', 'SILVER', 'HYPE', 'XRP'];
const SYMBOL_RANK = SYMBOL_PRIORITY.reduce((acc, s, i) => { acc[s] = i; return acc; }, {});

const normalizeTokenSymbol = (raw) => {
    const s = String(raw || '').toUpperCase().replace(/USDT$/, '').trim();
    if (!s) return '';
    if (s === 'XAU') return 'GOLD';
    if (s === 'XAG') return 'SILVER';
    if (s === 'BZ' || s === 'BRENTOIL') return 'BRENT';
    if (s === 'CL' || s === 'CRUDE') return 'WTI';
    return s;
};

const displayTokenSymbol = (raw) => {
    const n = normalizeTokenSymbol(raw);
    if (n === 'BRENT') return 'BRENT';
    if (n === 'WTI') return 'WTI';
    return String(raw || '').toUpperCase().replace(/USDT$/, '') || n;
};

const symbolPriorityRank = (raw) => {
    const n = normalizeTokenSymbol(raw);
    return SYMBOL_RANK[n] ?? 999;
};

const TOKEN_ICON_SOURCES = {
    BTC: ['https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png'],
    ETH: ['https://coin-images.coingecko.com/coins/images/279/large/ethereum.png'],
    SOL: ['https://coin-images.coingecko.com/coins/images/4128/large/solana.png'],
    XRP: ['https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png'],
    HYPE: ['/logos/hyperliquid.png', 'https://app.hyperliquid.xyz/apple-touch-icon.png'],
    MSTR: [
        'https://financialmodelingprep.com/image-stock/MSTR.png',
        'https://api.faviconkit.com/strategy.com/64',
        'https://logo.clearbit.com/strategy.com',
    ],
    BRENT: ['/logos/brent-top.svg', 'https://s2.coinmarketcap.com/static/img/coins/64x64/7083.png'],
    WTI: ['https://s2.coinmarketcap.com/static/img/coins/64x64/7083.png'],
    GOLD: ['https://s2.coinmarketcap.com/static/img/coins/64x64/4705.png'],
    SILVER: ['https://s2.coinmarketcap.com/static/img/coins/64x64/4747.png'],
};

function TokenBadgeLogo({ symbol, size = 14 }) {
    const normalized = normalizeTokenSymbol(symbol);
    if (normalized === 'BRENT') {
        return (
            <svg
                width={size}
                height={size}
                viewBox="0 0 18 18"
                style={{ borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}
                aria-hidden="true"
            >
                <path d="M0 0h18v18H0V0z" fill="#5D606B" />
                <path d="M9 2.5C9 2.5 4.5 9 4.5 12C4.5 14.485 6.515 16.5 9 16.5C11.485 16.5 13.5 14.485 13.5 12C13.5 9 9 2.5 9 2.5Z" fill="#fff" />
            </svg>
        );
    }
    const sources = TOKEN_ICON_SOURCES[normalized] || [];
    const fallback = normalized ? normalized.slice(0, 2) : '?';
    const [srcIdx, setSrcIdx] = useState(0);
    const src = sources[srcIdx];

    if (src) {
        return (
            <img
                src={src}
                alt={normalized}
                className="nt-news-token-logo"
                style={{ width: size, height: size }}
                onError={() => setSrcIdx((i) => i + 1)}
            />
        );
    }

    return (
        <span className="nt-news-token-logo nt-news-token-logo-fallback" style={{ width: size, height: size }}>
            {fallback}
        </span>
    );
}

const timeAgo = (iso) => {
    if (!iso) return '';
    const s = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (s < 0) return 'just now';
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
};

// Haber yaşı için "bizim ingest ettiğimiz an" (received_at) her zaman güvenilir,
// "kaynağın yayın tarihi" (published_at) bazen bozuk gelir. received_at'i öncelikli
// kullan, ikisi anlamlı farklıysa tooltip'te ham published_at'i göster.
const fmtNewsAge = (item) => {
    const rec = item?.received_at ? new Date(item.received_at).getTime() : 0;
    const pub = item?.published_at ? new Date(item.published_at).getTime() : 0;
    // received_at yoksa published_at'e düş
    const primary = rec || pub;
    if (!primary) return { label: '', title: '' };
    const label = timeAgo(new Date(primary).toISOString());
    // Tooltip: hem ingest hem publish tarihi
    const parts = [];
    if (rec) parts.push(`Seen: ${new Date(rec).toLocaleString()}`);
    if (pub && Math.abs(rec - pub) > 60_000) parts.push(`Published: ${new Date(pub).toLocaleString()}`);
    return { label, title: parts.join('\n') };
};

export default function TerminalNewsFeed({
    news,
    newsHealth = [],
    newsCoinInputs,
    setNewsCoinInputs,
    setChartSymbol,
    tickers,
    supportedSymbols = [],
    tradeBalance,
    leverages,
    sendOrder,
    addLog,
    wsConnected,
}) {
    const { token } = useAuth();
    const [isOpen, setIsOpen] = useState(true);
    const [feedReady, setFeedReady] = useState(false);
    const [activeFilter, setActiveFilter] = useState('all');
    const [showHealth, setShowHealth] = useState(false);
    const supportedSet = useMemo(() => new Set(supportedSymbols), [supportedSymbols]);
    // Track per-news send state: { [newsId]: 'idle'|'sending'|'ok'|'err' }
    const [tgState, setTgState] = useState({});

    const sortedNews = useMemo(
        () => [...news].sort((a, b) => getNewsSortTimestamp(b) - getNewsSortTimestamp(a)),
        [news]
    );

    const filteredNews = useMemo(() => {
        if (activeFilter === 'all') return sortedNews;
        return sortedNews.filter((item) => {
            const priority = String(item.priority || '').toUpperCase();
            const eventType = String(item.event_type || '').toLowerCase();
            const tier = String(item.source_tier || '').toLowerCase();
            if (activeFilter === 'official') return tier === 'official';
            if (activeFilter === 'high') return priority === 'HIGH';
            if (activeFilter === 'listing') return eventType === 'listing' || eventType === 'delisting';
            if (activeFilter === 'exploit') return eventType === 'exploit';
            return true;
        });
    }, [activeFilter, sortedNews]);

    const compactHealth = useMemo(() => {
        return [...(Array.isArray(newsHealth) ? newsHealth : [])]
            .sort((a, b) => {
                const tierScore = (tier) => tier === 'official' ? 0 : tier === 'fast' ? 1 : 2;
                const tierDiff = tierScore(a?.source_tier) - tierScore(b?.source_tier);
                if (tierDiff !== 0) return tierDiff;
                return Number(b?.events_1h || 0) - Number(a?.events_1h || 0);
            })
            .slice(0, 8);
    }, [newsHealth]);

    const handleSendTelegram = useCallback(async (newsId, n) => {
        if (tgState[newsId] === 'sending') return;
        setTgState(prev => ({ ...prev, [newsId]: 'sending' }));
        try {
            await sendNewsToTelegram(token, {
                headline: n.headline,
                source: n.source || '',
                latency_ms: n.latency_ms,
            });
            setTgState(prev => ({ ...prev, [newsId]: 'ok' }));
            addLog('Telegram\'a gönderildi ✓', 'system');
            setTimeout(() => setTgState(prev => ({ ...prev, [newsId]: 'idle' })), 3000);
        } catch (e) {
            setTgState(prev => ({ ...prev, [newsId]: 'err' }));
            addLog(`Telegram hatası: ${e.message}`, 'error');
            setTimeout(() => setTgState(prev => ({ ...prev, [newsId]: 'idle' })), 4000);
        }
    }, [token, tgState, addLog]);
    React.useEffect(() => {
        // 5 saniye sonra "loading..." yerine "empty state" göster
        const t = setTimeout(() => setFeedReady(true), 5000);
        return () => clearTimeout(t);
    }, []);

    // Sadece DOĞRUDAN tespit edilen tradable symbol'ü döndür.
    // Tema-inferred (BTC/ETH gibi dolaylı) asset'leri primary olarak gösterme.
    const getNewsCoin = (n) => {
        // primary_symbol varsa ve direct match ise kullan
        if (n.primary_symbol) {
            const primaryMa = n.mentioned_assets?.find(ma => ma.asset_id === n.primary_asset_id);
            if (
                primaryMa &&
                (!supportedSet.size || supportedSet.has(n.primary_symbol))
            ) {
                return n.primary_symbol;
            }
        }
        // Doğrudan ya da primary/theme kaynaklı ilk tradable asset
        const direct = n.mentioned_assets?.find(
            ma => ma.tradable_symbols?.some(sym => !supportedSet.size || supportedSet.has(sym))
        );
        if (direct) {
            return direct.tradable_symbols.find(sym => !supportedSet.size || supportedSet.has(sym)) || null;
        }
        return null;
    };

    if (!isOpen) {
        return (
            <div className="nt-news" style={{ width: '32px', flexShrink: 0, borderRight: '1px solid var(--border-0)', background: 'var(--bg-1)', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
                <button 
                    onClick={() => setIsOpen(true)} 
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-0)', cursor: 'pointer', padding: '12px 0px', width: '100%', display: 'flex', justifyContent: 'center', borderBottom: '1px solid var(--border-0)' }} 
                    title="Haberleri Aç"
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-0)'}
                >
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                         <polyline points="13 17 18 12 13 7"></polyline>
                         <line x1="6" y1="17" x2="11" y2="12"></line>
                         <line x1="6" y1="7" x2="11" y2="12"></line>
                     </svg>
                </button>
                <div style={{ writingMode: 'vertical-rl', color: 'var(--text-3)', fontSize: 10, letterSpacing: 2, marginTop: 16, opacity: 0.6 }}>
                    NEWS & TWEETS
                </div>
            </div>
        );
    }

    return (
        <div className="nt-news" style={{ transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
            <div className="nt-news-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '8px' }}>
                <span>NEWS & TWEETS</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                        onClick={() => setShowHealth((prev) => !prev)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: showHealth ? 'var(--accent)' : 'var(--text-3)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: 9,
                            letterSpacing: '.1em',
                            padding: '0 4px',
                        }}
                        title="News source health"
                    >
                        HEALTH
                    </button>
                    <button 
                        onClick={() => setIsOpen(false)} 
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center' }} 
                        title="Gizle / Tam Ekran Yap"
                        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-0)'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-3)'}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="11 17 6 12 11 7"></polyline>
                            <polyline points="18 17 13 12 18 7"></polyline>
                        </svg>
                    </button>
                </div>
            </div>
            {showHealth && (
                <div style={{
                    padding: '8px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: 'rgba(255,255,255,0.015)',
                }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: 6,
                    }}>
                        {compactHealth.map((row) => {
                            const tier = SOURCE_TIER_STYLES[(row.source_tier || 'fallback').toLowerCase()] || SOURCE_TIER_STYLES.fallback;
                            const lastLatency = getLatencySignal(row.last_latency_ms);
                            const isHealthy = !row.last_error && (row.events_1h > 0 || row.is_stream || row.fetches_total > 0);
                            return (
                                <div
                                    key={row.source_key}
                                    title={row.last_error || row.sample_source || row.source_key}
                                    style={{
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        background: 'rgba(255,255,255,0.02)',
                                        borderRadius: 6,
                                        padding: '6px 7px',
                                        minWidth: 0,
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                                            <span style={{
                                                width: 6,
                                                height: 6,
                                                borderRadius: '50%',
                                                background: isHealthy ? '#00d992' : '#ff7b72',
                                                flexShrink: 0,
                                            }} />
                                            <span style={{
                                                color: 'var(--text-1)',
                                                fontSize: 10,
                                                letterSpacing: '.06em',
                                                textTransform: 'uppercase',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {String(row.source_key || row.sample_source || '').replaceAll('_', ' ')}
                                            </span>
                                        </div>
                                        <span style={{
                                            color: tier.color,
                                            fontSize: 8,
                                            letterSpacing: '.08em',
                                            border: `1px solid ${tier.border}`,
                                            background: tier.bg,
                                            borderRadius: 4,
                                            padding: '2px 4px',
                                            flexShrink: 0,
                                        }}>
                                            {tier.label}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, color: 'var(--text-3)', fontSize: 10 }}>
                                        <span>{row.events_1h || 0}/h</span>
                                        <span>{row.events_24h || 0}/24h</span>
                                        <span style={{ color: lastLatency.color }}>
                                            {row.avg_latency_ms == null ? 'n/a' : row.avg_latency_ms < 1000 ? `${Math.round(row.avg_latency_ms)}ms` : `${(row.avg_latency_ms / 1000).toFixed(1)}s`}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {compactHealth.length === 0 && (
                        <div style={{ color: 'var(--text-3)', fontSize: 11 }}>No source health data yet</div>
                    )}
                </div>
            )}
            <div style={{
                display: 'flex',
                gap: 6,
                padding: '6px 8px 8px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                overflowX: 'auto',
                scrollbarWidth: 'none',
            }}>
                {NEWS_FILTERS.map((filter) => {
                    const active = activeFilter === filter.key;
                    return (
                        <button
                            key={filter.key}
                            onClick={() => setActiveFilter(filter.key)}
                            style={{
                                border: active ? '1px solid rgba(0,217,146,0.28)' : '1px solid rgba(255,255,255,0.08)',
                                background: active ? 'rgba(0,217,146,0.08)' : 'rgba(255,255,255,0.02)',
                                color: active ? 'var(--accent)' : 'var(--text-3)',
                                fontSize: 9,
                                letterSpacing: '.1em',
                                padding: '4px 7px',
                                borderRadius: 4,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.16s ease',
                            }}
                        >
                            {filter.label}
                        </button>
                    );
                })}
            </div>
            <div className="nt-news-feed">
                {news.length === 0 && (
                    <div className="nt-empty">
                        {feedReady
                            ? (wsConnected === false ? '⚠ Bağlantı yok — yeniden bağlanıyor' : 'Henüz haber yok')
                            : 'Feed yükleniyor…'}
                    </div>
                )}
                {news.length > 0 && filteredNews.length === 0 && (
                    <div className="nt-empty">No news for this filter</div>
                )}
                {filteredNews.map((n, i) => {
                    const prio = (n.priority || 'LOW').toUpperCase();
                    const p = PRIO_COLORS[prio] || PRIO_COLORS.LOW;
                    const relatedCoin = getNewsCoin(n);
                    const ageInfo = fmtNewsAge(n);
                    const timeLabel = ageInfo.label;
                    const tier = SOURCE_TIER_STYLES[(n.source_tier || 'fallback').toLowerCase()] || SOURCE_TIER_STYLES.fallback;
                    const latencySignal = getLatencySignal(n.latency_ms);
                    const eventType = EVENT_TYPE_STYLES[(n.event_type || 'general').toLowerCase()] || EVENT_TYPE_STYLES.general;
                    const corroborationCount = Number(n.corroboration_count || 1);
                    const corroboratingSources = Array.isArray(n.corroborating_sources) ? n.corroborating_sources : [];
                    
                    return (
                        <div key={n.id || i} className="nt-news-item" style={{ borderLeftColor: p.border, background: p.bg }}>
                            <div className="nt-news-left">
                                <div className="nt-news-source-row">
                                    <div className="nt-news-avatar" style={{ color: p.border }}>
                                        {(n.source || 'N').charAt(0).toUpperCase()}
                                    </div>
                                    <span className="nt-news-src">{(n.source || '').split('.')[0].replace('Cointelegraph', 'COINTELEGRAPH').replace('CoinDesk', 'COINDESK')}</span>
                                    <span className="nt-news-handle">@{((n.source || 'news').split('.')[0]).replace(/\s+/g, '')}</span>
                                    <span style={{ color: 'var(--text-3)', fontSize: 10 }}>•</span>
                                    <span className="nt-news-time" title={ageInfo.title}>{timeLabel}</span>
                                    <span style={{ color: 'var(--text-3)', fontSize: 10 }}>•</span>
                                    <span style={{
                                        fontSize: 9,
                                        lineHeight: 1,
                                        padding: '3px 5px',
                                        borderRadius: 4,
                                        color: eventType.color,
                                        border: `1px solid ${eventType.border}`,
                                        background: eventType.bg,
                                        letterSpacing: '.08em',
                                    }}>
                                        {eventType.label}
                                    </span>
                                    <span style={{ color: 'var(--text-3)', fontSize: 10 }}>•</span>
                                    <span style={{
                                        fontSize: 9,
                                        lineHeight: 1,
                                        padding: '3px 5px',
                                        borderRadius: 4,
                                        color: tier.color,
                                        border: `1px solid ${tier.border}`,
                                        background: tier.bg,
                                        letterSpacing: '.08em',
                                    }}>
                                        {tier.label}
                                    </span>
                                    {n.is_stream && (
                                        <span style={{
                                            fontSize: 9,
                                            lineHeight: 1,
                                            padding: '3px 5px',
                                            borderRadius: 4,
                                            color: '#7dd3fc',
                                            border: '1px solid rgba(125,211,252,0.22)',
                                            background: 'rgba(125,211,252,0.07)',
                                            letterSpacing: '.08em',
                                        }}>
                                            STREAM
                                        </span>
                                    )}
                                </div>
                                <div className="nt-news-headline" style={{
                                    color: '#fff',
                                    fontWeight: prio === 'HIGH' ? 500 : 400,
                                }}>{n.headline}</div>

                                {/* Entity resolution tags */}
                                {(n.primary_asset_id || (n.themes && n.themes.length > 0)) && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                        {n.primary_asset_id && (
                                            <span style={{
                                                fontSize: 10, fontWeight: 600, padding: '1px 5px',
                                                borderRadius: 3, border: '1px solid',
                                                borderColor: n.mentioned_assets?.[0]?.asset_type === 'equity' || n.mentioned_assets?.[0]?.asset_type === 'etf' ? '#b060ff' :
                                                             n.mentioned_assets?.[0]?.asset_type === 'commodity' || n.mentioned_assets?.[0]?.asset_type === 'index' ? '#e5a236' : '#00c8ff',
                                                color: n.mentioned_assets?.[0]?.asset_type === 'equity' || n.mentioned_assets?.[0]?.asset_type === 'etf' ? '#b060ff' :
                                                       n.mentioned_assets?.[0]?.asset_type === 'commodity' || n.mentioned_assets?.[0]?.asset_type === 'index' ? '#e5a236' : '#00c8ff',
                                                background: 'transparent',
                                            }}>
                                                {n.primary_symbol || n.primary_asset_id}
                                                {n.confidence > 0 && <span style={{ opacity: 0.6, marginLeft: 3 }}>{Math.round(n.confidence * 100)}%</span>}
                                            </span>
                                        )}
                                        {n.themes?.slice(0, 3).map(theme => (
                                            <span key={theme} style={{
                                                fontSize: 10, padding: '1px 5px', borderRadius: 3,
                                                background: 'rgba(255,255,255,0.05)', color: 'var(--text-3)',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                            }}>{theme}</span>
                                        ))}
                                    </div>
                                )}

                                <div className="nt-news-footer">
                                    <div className="nt-news-pill" style={{
                                        gap: 6,
                                        border: `1px solid ${tier.border}`,
                                        background: tier.bg,
                                        padding: '2px 6px',
                                        borderRadius: 4,
                                    }}>
                                        <span style={{ color: tier.color, fontSize: 9, letterSpacing: '.08em' }}>{tier.label}</span>
                                        <span style={{ color: 'rgba(255,255,255,0.12)', fontSize: 9 }}>·</span>
                                        <span style={{ color: latencySignal.color, fontSize: 9, letterSpacing: '.08em' }}>{latencySignal.label}</span>
                                    </div>
                                    {corroborationCount > 1 && (
                                        <div
                                            className="nt-news-pill"
                                            title={corroboratingSources.join(', ')}
                                            style={{
                                                border: '1px solid rgba(255,255,255,0.08)',
                                                background: 'rgba(255,255,255,0.03)',
                                            }}
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: '-1px' }}>
                                                <path d="M20 6 9 17l-5-5"></path>
                                            </svg>
                                            <span className="nt-news-lat">{corroborationCount} sources</span>
                                        </div>
                                    )}
                                    <div className="nt-news-pill">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: '-1px' }}>
                                            <circle cx="12" cy="12" r="10"></circle>
                                            <polyline points="12 6 12 12 16 14"></polyline>
                                        </svg>
                                        <span className="nt-news-ago" title={ageInfo.title}>{timeLabel}</span>
                                    </div>
                                    {n.latency_ms !== undefined && (
                                        <div className="nt-news-pill">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: '-1px' }}>
                                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                                            </svg>
                                            {n.latency_ms === -1
                                                ? <span className="nt-news-lat" style={{ opacity: 0.4 }}>delayed</span>
                                                : <span className="nt-news-lat">{n.latency_ms < 1000 ? `${n.latency_ms}ms` : `${(n.latency_ms/1000).toFixed(1)}s`}</span>
                                            }
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="nt-news-right">
                                {(() => {
                                    const key = n.id || i;
                                    const st = tgState[key] || 'idle';
                                    return (
                                        <button
                                            className="nt-news-btn-tg"
                                            disabled={st === 'sending'}
                                            style={st === 'ok' ? { color: 'var(--accent)' } : st === 'err' ? { color: 'var(--danger)' } : {}}
                                            onClick={() => handleSendTelegram(key, n)}
                                        >
                                            {st === 'sending' ? '…' : st === 'ok' ? '✓ Gönderildi' : st === 'err' ? '✗ Hata' : 'Send to Telegram'}
                                        </button>
                                    );
                                })()}

                                {(() => {
                                    const key = n.id || i;
                                    // Sadece doğrudan tespit edilen tradable asset'ler (tema-inferred BTC/ETH hariç)
                                    const entityAssets = (n.mentioned_assets || [])
                                        .filter(ma =>
                                            ma.tradable_symbols?.length > 0 &&
                                            !['theme_primary', 'theme_secondary'].includes(ma.match_type)
                                        )
                                        .sort((a, b) => {
                                            const sa = a.tradable_symbols?.[0] || '';
                                            const sb = b.tradable_symbols?.[0] || '';
                                            const ra = symbolPriorityRank(sa);
                                            const rb = symbolPriorityRank(sb);
                                            if (ra !== rb) return ra - rb;
                                            return b.confidence - a.confidence;
                                        });

                                    // Aktif coin: kullanıcı chip seçtiyse o, yoksa primary_symbol, yoksa input
                                    const activeCoin = newsCoinInputs[key + '_entity']
                                        || relatedCoin
                                        || (newsCoinInputs[key] ? newsCoinInputs[key].toUpperCase() + 'USDT' : null);
                                    const coin = activeCoin;
                                    const primaryAsset = (n.mentioned_assets || []).find(
                                        ma => ma.asset_id === n.primary_asset_id
                                    );
                                    const infoAssets = (n.mentioned_assets || [])
                                        .filter(ma =>
                                            !ma.tradable_symbols?.length &&
                                            (
                                                ma.asset_id === n.primary_asset_id ||
                                                !['theme_primary', 'theme_secondary'].includes(ma.match_type)
                                            )
                                        )
                                        .slice(0, 2);

                                    return (
                                    <div className="nt-news-trade-panel">
                                        <div
                                            className="nt-news-trade-header"
                                            style={{ cursor: coin ? 'pointer' : 'default' }}
                                            onClick={(e) => { if (coin && e.target.tagName !== 'INPUT') setChartSymbol(coin); }}
                                            title={coin ? `Grafiği görüntüle: ${coin}` : ''}
                                        >
                                            <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                                                {coin ? (
                                                    <>
                                                        <TokenBadgeLogo symbol={coin} />
                                                        <span className="nt-news-trade-sym">${displayTokenSymbol(coin)}</span>
                                                    </>
                                                ) : primaryAsset ? (
                                                    <>
                                                        <TokenBadgeLogo symbol={n.primary_symbol || n.primary_asset_id} />
                                                        <span
                                                            className="nt-news-trade-sym"
                                                            style={{
                                                                color: primaryAsset.asset_type === 'commodity' || primaryAsset.asset_type === 'index'
                                                                    ? '#e5a236'
                                                                    : primaryAsset.asset_type === 'equity' || primaryAsset.asset_type === 'etf'
                                                                        ? '#b060ff'
                                                                        : 'var(--accent)',
                                                            }}
                                                        >
                                                            ${n.primary_symbol || n.primary_asset_id}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <input
                                                        className="nt-news-coin-input"
                                                        placeholder="TOKEN"
                                                        value={newsCoinInputs[key] || ''}
                                                        onChange={e => setNewsCoinInputs(prev => ({ ...prev, [key]: e.target.value }))}
                                                        maxLength={10}
                                                    />
                                                )}
                                                {coin && tickers[coin] && (
                                                    <span className={`nt-news-trade-pct ${(tickers[coin].change_24h_pct || 0) >= 0 ? 'up' : 'dn'}`}>
                                                        24h: {fmtPct(tickers[coin].change_24h_pct)}
                                                    </span>
                                                )}
                                                {!coin && (() => {
                                                    if (infoAssets.length > 0) return (
                                                        <span style={{fontSize: 9, color: 'var(--text-3)'}}>
                                                            {infoAssets.map(ma =>
                                                                <span key={ma.asset_id} style={{marginRight:4}}>
                                                                    <span style={{color:'var(--text-2)'}}>{ma.display_name}</span>
                                                                    <span style={{opacity:0.5, marginLeft:2}}>{ma.asset_type}</span>
                                                                </span>
                                                            )}
                                                        </span>
                                                    );
                                                    return <span style={{fontSize:9,color:'var(--text-3)'}}>
                                                        {n.themes?.length > 0 ? n.themes[0] : 'No symbol detected'}
                                                    </span>;
                                                })()}
                                            </div>
                                            {coin && tickers[coin] && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <span className="nt-news-trade-price">${fmt(tickers[coin].last_price)}</span>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'stroke 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.stroke = 'var(--text-0)'} onMouseLeave={(e) => e.currentTarget.style.stroke = 'var(--text-3)'}>
                                                        <path d="M3 3v18h18" />
                                                        <path d="m19 9-5 5-4-4-3 2.8" />
                                                    </svg>
                                                </div>
                                            )}
                                        </div>

                                        {/* Birden fazla asset tespit edildiyse seçim chip'leri */}
                                        {entityAssets.length > 1 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, padding: '4px 0 2px' }}>
                                                {entityAssets.slice(0, 4).map(ma => {
                                                    const sym = ma.tradable_symbols[0];
                                                    const isActive = coin === sym;
                                                    return (
                                                        <button key={sym}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setNewsCoinInputs(prev => ({ ...prev, [key + '_entity']: sym }));
                                                                setChartSymbol(sym);
                                                            }}
                                                            style={{
                                                                fontSize: 9, padding: '2px 5px', borderRadius: 3,
                                                                border: `1px solid ${isActive ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}`,
                                                                background: isActive ? 'rgba(0,200,255,0.08)' : 'transparent',
                                                                color: isActive ? 'var(--accent)' : 'var(--text-3)',
                                                                cursor: 'pointer', whiteSpace: 'nowrap',
                                                            }}
                                                        >
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                                <TokenBadgeLogo symbol={sym} size={12} />
                                                                <span>{displayTokenSymbol(sym)}</span>
                                                            </span>
                                                            <span style={{ opacity: 0.5, marginLeft: 2 }}>
                                                                {Math.round(ma.confidence * 100)}%
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}


                                        {coin && (
                                            <>
                                            <div className="nt-news-trade-row">
                                                {leverages.map(x => {
                                                    const pos = Math.floor(tradeBalance * x);
                                                    const lbl = `$${pos >= 1000 ? (pos/1000).toFixed(1)+'K' : pos}`;
                                                    return <button key={'l'+x} style={{flex: 1}} className="nt-qbtn long sm" onClick={() => sendOrder(coin, 'buy', tradeBalance, x)}>{lbl}</button>;
                                                })}
                                            </div>
                                            <div className="nt-news-trade-row">
                                                {leverages.map(x => {
                                                    const pos = Math.floor(tradeBalance * x);
                                                    const lbl = `$${pos >= 1000 ? (pos/1000).toFixed(1)+'K' : pos}`;
                                                    return <button key={'s'+x} style={{flex: 1}} className="nt-qbtn short sm" onClick={() => sendOrder(coin, 'sell', tradeBalance, x)}>{lbl}</button>;
                                                })}
                                            </div>
                                            </>
                                        )}
                                    </div>
                                    )
                                })()}

                                <span className="nt-news-source-tag">Source: {(n.source || 'System').split('.')[0]}</span>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    );
}
