export const translations = {
  en: {
    // ── Showcase ─────────────────────────────────────────────
    showcase_title: 'See it in action',
    showcase_sub:   'Live mock data — exactly what the real dashboard looks like.',

    // ── Trust Bar ────────────────────────────────────────────
    trust_traders:    'Open Beta — Join Early',
    trust_uptime:     '99.9% uptime',
    trust_latency:    '<50ms data latency',
    trust_exchanges:  '4 exchanges connected',

    // ── Testimonials ─────────────────────────────────────────
    social_title:     'Trusted by professional traders',
    social_sub:       'From retail to institutional — Trading Tools fits every style.',
    t1_text: 'The liquidation heatmap alone is worth the subscription. I catch entries that I used to completely miss.',
    t1_name: 'Alex R.',
    t1_role: 'Futures Trader · 4y',
    t2_text: 'Finally one dashboard for everything. No more switching between Coinglass, Bybit and TradingView tabs.',
    t2_name: 'Sarah K.',
    t2_role: 'Crypto Analyst · 6y',
    t3_text: 'The whale transfer feed caught a $8M move 3 minutes before the candle. Paid for itself on day one.',
    t3_name: 'Marcus T.',
    t3_role: 'Prop Trader · 8y',

    // ── FAQ ──────────────────────────────────────────────────
    faq_title: 'Frequently asked questions',
    faq_sub:   "Can't find the answer? Email us at support@tradingtools.app",
    faq_q1: 'Which exchanges are supported?',
    faq_a1: 'Binance, OKX, Bybit and HyperLiquid. Data is aggregated in real-time via WebSocket for all four exchanges simultaneously.',
    faq_q2: 'Do I need an API key to use it?',
    faq_a2: 'No API key required for monitoring tools (liquidations, funding, heatmap, alerts). API key is only needed if you want to place live orders via the terminal.',
    faq_q3: 'What is the difference between Free and Pro?',
    faq_a3: 'Free gives you the dashboard, spot market list, global metrics and economic calendar. Pro unlocks all 12 tools including liquidation stream, funding rate tracker, whale transfers, volume monitor and custom alerts.',
    faq_q4: 'Can I cancel my subscription anytime?',
    faq_a4: 'Yes. Cancel anytime from your account settings — no questions asked, no hidden fees. Your Pro access continues until the end of the billing period.',
    faq_q5: 'Is there a money-back guarantee?',
    faq_a5: 'Yes. If you are not satisfied within the first 7 days, email us and we will issue a full refund, no questions asked.',
    faq_q6: 'How is this different from TradingView or Coinglass?',
    faq_a6: 'TradingView is for charting. Coinglass is for liquidation data only. Trading Tools combines liquidations, funding, whale tracking, volume spikes, token unlocks and custom alerts in a single terminal — built for active traders who need everything in one place.',

    // ── Money-back ───────────────────────────────────────────
    money_back: '7-day money-back guarantee',

    // ── Landing Nav ──────────────────────────────────────────
    nav_tools:        'Tools',
    nav_pricing:      'Pricing',
    nav_signin:       'Sign In',
    nav_start_free:   'Get Started Free',
    nav_open_terminal:'Open Terminal',
    nav_go_dashboard: 'Go to Dashboard',

    // ── Hero ─────────────────────────────────────────────────
    hero_eyebrow:     'LIVE — MARKETS OPEN',
    hero_line1:       'See Every Move',
    hero_accent:      'Before It Happens.',
    hero_sub:         'Real-time liquidations, whale alerts, smart money tracking and funding rates — one professional terminal for every market edge.',
    hero_start_free:  'Get Started Free',
    hero_open:        'Open Terminal',
    hero_go_dashboard:'Go to Dashboard',
    hero_see_pricing: 'View Pricing',
    hero_stat_exchange: 'Exchange data',
    hero_stat_tools:    'Pro tools',
    hero_stat_latency:  'Price latency',
    hero_stat_live:     'Live monitoring',
    hero_terminal_title: 'Trading Tools — LIVE',

    // ── Tools section ─────────────────────────────────────────
    tools_eyebrow:    'TOOLS',
    tools_title:      'Everything in one platform',
    tools_sub:        '13 professional tools. Real-time data. Zero latency.',

    // Tool descriptions (keyed by tool id)
    'desc_liquidations-stream': 'Binance · OKX · Bybit · HyperLiquid — 1h/4h/12h/24h liquidation totals and coin-based treemap.',
    'desc_funding-rate':        '4 exchanges (Binance, OKX, Bybit, Hype) on one screen. Countdown to next funding.',
    'desc_long-short-ratio':    'All accounts + top trader ratio. 5m/15m/1h/4h/1d filters. BTC gauge indicator.',
    'desc_volume-monitor':      'Catch abnormal volume spikes instantly. 24h volume comparison across all coins.',
    'desc_big-transfers':       '$200K+ large transaction flow. Live Bloomberg-style feed.',
    'desc_token-unlock':        '2026 vesting calendar. Countdown timers, supply impact and categories.',
    'desc_custom-alerts':       'Set price targets, create alerts. Instant sound + push notification.',
    'desc_portfolio':           'Track your positions, PnL, win rate and trade history. Real-time balance updates.',
    'desc_smart-money':         'Follow top HyperLiquid traders. Live position tracking and copy trade signals.',
    'desc_global-metrics':      'Total market cap, BTC dominance, Fear & Greed index.',
    'desc_economic-calendar':   'Macroeconomic calendar. Fed, NFP, CPI — events that move markets.',
    'desc_spot-markets':        'Live price list. Track all coins on one screen.',
    'desc_terminal':            'Command-based order entry. SL/TP, market/limit, paper & live mode.',

    // Tool labels
    'label_liquidations-stream': 'Liquidation Stream',
    'label_funding-rate':        'Funding Rate',
    'label_long-short-ratio':    'Long/Short Ratio',
    'label_volume-monitor':      'Volume Monitor',
    'label_big-transfers':       'Whale Transfers',
    'label_token-unlock':        'Token Unlock',
    'label_custom-alerts':       'Custom Alerts',
    'label_portfolio':           'Portfolio',
    'label_smart-money':         'Smart Money',
    'label_global-metrics':      'Global Metrics',
    'label_economic-calendar':   'Economic Calendar',
    'label_spot-markets':        'Spot Markets',
    'label_terminal':            'Trade Terminal',

    // ── Pricing ───────────────────────────────────────────────
    pricing_eyebrow:    'PRICING',
    pricing_title:      'Simple and transparent pricing',
    pricing_sub:        'Start free. Upgrade when ready.',
    billing_monthly:    'Monthly',
    billing_yearly:     'Yearly',
    billing_save:       'Save 20%',
    billed_yearly:      'Billed as $468/year',
    free_tier:          'FREE',
    free_period:        '/ forever',
    free_desc:          'Explore the platform',
    pro_desc:           'For professional and active traders',
    most_popular:       'MOST POPULAR',
    current_plan:       'CURRENT PLAN',
    open_dashboard:     'Open Dashboard →',
    upgrade_cta:        'Upgrade to Pro →',
    cancel_note:        'Cancel anytime · No hidden fees',
    btn_start_free:     'Get Started Free',
    btn_open_terminal:  'Open Terminal',

    free_feat_0: 'Dashboard & statistics',
    free_feat_1: 'Spot market list',
    free_feat_2: 'Global metrics',
    free_feat_3: 'Economic calendar',
    free_feat_4: 'System notifications',
    free_feat_5: 'Paper trading mode',

    pro_feat_0:  'Unlimited access to all tools',
    pro_feat_1:  'Liquidation Stream (4 exchanges)',
    pro_feat_2:  'Funding Rate tracker',
    pro_feat_3:  'Long/Short Ratio gauge',
    pro_feat_4:  'Whale Transfer feed ($200K+)',
    pro_feat_5:  'Token Unlock calendar',
    pro_feat_6:  'Custom price alerts (sound + push)',
    pro_feat_7:  'Volume spike radar',
    pro_feat_8:  'Live order routing (API key)',
    pro_feat_9:  'Priority news feed',
    pro_feat_10: 'Full risk engine (10 layers)',

    // ── Footer ────────────────────────────────────────────────
    footer_tools:     'Tools',
    footer_pricing:   'Pricing',
    footer_signin:    'Sign In',
    footer_register:  'Register',
    footer_copy:      '© 2026 Trading Tools. Professional crypto terminal.',

    // ── Sidebar ───────────────────────────────────────────────
    tools_menu:       'Tools Menu',
    logout:           'Logout',
    upgrade_to_pro:   'Upgrade to Pro',

    // ── ProGate ───────────────────────────────────────────────
    pro_only_title:   'This feature is Pro only',
    pro_only_desc:    'Upgrade to Pro for unlimited access to all tools.',
    pro_list_live_order:  'Live order routing (API key)',
    pro_list_watchlist:   'Unlimited watchlist',
    go_pro:           'Upgrade to Pro →',
    redirecting:      'Redirecting...',
    secure_payment:   'Secure payment via Stripe · Cancel anytime',
    click_to_access:  'Click to access',
    preview_upgrade_text: 'You are viewing a limited preview. Upgrade to PRO for full access.',

    // ── App ───────────────────────────────────────────────────
    welcome_pro:      'Welcome to Pro! All features are now active.',
    coming_soon_label: 'coming soon',

    // ── Login ─────────────────────────────────────────────────
    forgot_password:  'Forgot Password',
    no_account:       "Don't have an account?",
    free_register:    'Sign Up Free',

    // ── ForgotPassword ────────────────────────────────────────
    reset_title:        'Reset Your Password',
    reset_done_title:   'Link created.',
    reset_done_sub:     'The reset link is currently visible in the server logs.\nEmail integration coming soon.',
    reset_back_login:   'Back to sign in',
    reset_email_label:  'Email Address',
    reset_email_ph:     'example@email.com',
    reset_send_btn:     'Send Reset Link',
    reset_invalid_link: 'Invalid reset link.',
    reset_request_new:  'Request a new link',

    // ── ResetPassword ─────────────────────────────────────────
    newpw_title:      'Set New Password',
    newpw_done:       'Password updated. Redirecting to sign in...',
    newpw_label:      'New Password',
    newpw_ph:         'Min. 8 characters',
    newpw_confirm:    'Confirm Password',
    newpw_confirm_ph: 'Repeat password',
    newpw_btn:        'Update Password',
    err_mismatch:     'Passwords do not match',
    err_min_chars:    'Minimum 8 characters required',
    err_generic:      'An error occurred',
    err_connection:   'Connection error',
  },

  tr: {
    // ── Showcase ─────────────────────────────────────────────
    showcase_title: 'Canlı önizleme',
    showcase_sub:   'Simüle veri — gerçek dashboardun tam olarak böyle görünüyor.',

    // ── Trust Bar ────────────────────────────────────────────
    trust_traders:    'Açık Beta — Erken Katıl',
    trust_uptime:     '%99.9 uptime',
    trust_latency:    '<50ms veri gecikmesi',
    trust_exchanges:  '4 borsa bağlı',

    // ── Testimonials ─────────────────────────────────────────
    social_title:     'Profesyonel traderların tercihi',
    social_sub:       'Bireysel yatırımcıdan kurumsal traderlara — Trading Tools her stile uyar.',
    t1_text: 'Likidyon ısı haritası başlı başına aboneliğe değiyor. Daha önce tamamen kaçırdığım girişleri yakalıyorum.',
    t1_name: 'Alex R.',
    t1_role: 'Futures Trader · 4 yıl',
    t2_text: 'Sonunda her şey tek dashboardda. Artık Coinglass, Bybit ve TradingView sekmeleri arasında geçiş yok.',
    t2_name: 'Sarah K.',
    t2_role: 'Kripto Analist · 6 yıl',
    t3_text: 'Balina transfer feed\'i mumu oluşmadan 3 dakika önce 8M dolarlık bir hareketi yakaladı. İlk gün kendini amorti etti.',
    t3_name: 'Marcus T.',
    t3_role: 'Prop Trader · 8 yıl',

    // ── FAQ ──────────────────────────────────────────────────
    faq_title: 'Sık sorulan sorular',
    faq_sub:   "Cevap bulamadın mı? support@tradingtools.app adresine yaz.",
    faq_q1: 'Hangi borsalar destekleniyor?',
    faq_a1: 'Binance, OKX, Bybit ve HyperLiquid. Veriler dört borsa için eş zamanlı WebSocket ile gerçek zamanlı olarak toplanır.',
    faq_q2: 'Kullanmak için API key gerekiyor mu?',
    faq_a2: 'İzleme araçları için (likidasyonlar, fonlama, ısı haritası, alarmlar) API key gerekmez. API key yalnızca terminal üzerinden canlı emir iletmek istiyorsan gereklidir.',
    faq_q3: 'Ücretsiz ve Pro arasındaki fark nedir?',
    faq_a3: 'Ücretsiz: dashboard, spot piyasa listesi, global metrikler ve ekonomik takvim. Pro: likasiyon stream, fonlama takibi, balina transferleri, hacim monitörü ve özel alarmlar dahil tüm 12 araç.',
    faq_q4: 'Aboneliği istediğim zaman iptal edebilir miyim?',
    faq_a4: 'Evet. Hesap ayarlarından istediğin zaman iptal edebilirsin — soru sorulmaz, gizli ücret yok. Pro erişimin fatura döneminin sonuna kadar devam eder.',
    faq_q5: 'Para iadesi garantisi var mı?',
    faq_a5: 'Evet. İlk 7 gün içinde memnun kalmazsan bize yaz, hiçbir soru sormadan tam iade yapıyoruz.',
    faq_q6: 'TradingView veya Coinglass\'tan farkı ne?',
    faq_a6: 'TradingView grafik için, Coinglass sadece likasiyon verisi için. Trading Tools likasiyon, fonlama, balina takibi, hacim spike, token unlock ve özel alarmları tek terminalde birleştirir — her şeyin tek yerden olmasına ihtiyaç duyan aktif traderlar için.',

    // ── Money-back ───────────────────────────────────────────
    money_back: '7 günlük para iadesi garantisi',

    // ── Landing Nav ──────────────────────────────────────────
    nav_tools:        'Araçlar',
    nav_pricing:      'Fiyatlandırma',
    nav_signin:       'Giriş Yap',
    nav_start_free:   'Ücretsiz Başla',
    nav_open_terminal:'Terminali Aç',
    nav_go_dashboard: 'Dashboard\'a Git',

    // ── Hero ─────────────────────────────────────────────────
    hero_eyebrow:     'CANLI — PİYASALAR AÇIK',
    hero_line1:       'Her Hareketi Gör',
    hero_accent:      'Olmadan Önce.',
    hero_sub:         'Gerçek zamanlı likidasyonlar, balina alarmları, smart money takibi ve fonlama oranları — her fırsatta önde olmak için tek terminal.',
    hero_start_free:  'Ücretsiz Başla',
    hero_open:        'Terminali Aç',
    hero_go_dashboard:'Dashboard\'a Git',
    hero_see_pricing: 'Fiyatları Gör',
    hero_stat_exchange: 'Borsa verisi',
    hero_stat_tools:    'Pro araç',
    hero_stat_latency:  'Fiyat gecikmesi',
    hero_stat_live:     'Canlı izleme',
    hero_terminal_title: 'Trading Tools — CANLI',

    // ── Tools section ─────────────────────────────────────────
    tools_eyebrow:    'ARAÇLAR',
    tools_title:      'Her şey tek platformda',
    tools_sub:        '13 profesyonel araç. Gerçek zamanlı veri. Sıfır gecikme.',

    // Tool descriptions
    'desc_liquidations-stream': 'Binance · OKX · Bybit · HyperLiquid — 1h/4h/12h/24h rekt toplamları ve coin bazlı treemap.',
    'desc_funding-rate':        '4 borsa (Binance, OKX, Bybit, Hype) aynı ekranda. Bir sonraki ödemeye geri sayım.',
    'desc_long-short-ratio':    'Tüm hesaplar + top trader oranı. 5m/15m/1h/4h/1d filtreleri. BTC gauge göstergesi.',
    'desc_volume-monitor':      'Anormal hacim spikelarını anında yakala. Tüm coinlerde 24h hacim karşılaştırması.',
    'desc_big-transfers':       '$200K+ büyük işlem akışı. Canlı Bloomberg tarzı feed.',
    'desc_token-unlock':        '2026 vesting takvimi. Geri sayım saatleri, arz etkisi ve kategoriler.',
    'desc_custom-alerts':       'Fiyat hedefi belirle, alarm kur. Ses + bildirim ile anında uyar.',
    'desc_portfolio':           'Pozisyonlarını, PnL, win rate ve işlem geçmişini takip et. Gerçek zamanlı bakiye.',
    'desc_smart-money':         'HyperLiquid top traderları takip et. Canlı pozisyon izleme ve copy trade sinyalleri.',
    'desc_global-metrics':      'Toplam piyasa değeri, BTC dominansı, Fear & Greed endeksi.',
    'desc_economic-calendar':   'Makroekonomik takvim. Fed, NFP, CPI — piyasayı hareket ettirecek olaylar.',
    'desc_spot-markets':        'Canlı fiyat listesi. Tüm coinleri tek ekranda takip et.',
    'desc_terminal':            'Komut bazlı emir iletimi. SL/TP, market/limit, paper & live mod.',

    // Tool labels
    'label_liquidations-stream': 'Liquidation Stream',
    'label_funding-rate':        'Funding Rate',
    'label_long-short-ratio':    'Long/Short Ratio',
    'label_volume-monitor':      'Volume Monitor',
    'label_big-transfers':       'Whale Transfers',
    'label_token-unlock':        'Token Unlock',
    'label_custom-alerts':       'Özel Alarmlar',
    'label_portfolio':           'Portföy',
    'label_smart-money':         'Smart Money',
    'label_global-metrics':      'Global Metrikler',
    'label_economic-calendar':   'Ekonomik Takvim',
    'label_spot-markets':        'Spot Piyasalar',
    'label_terminal':            'Trade Terminal',

    // ── Pricing ───────────────────────────────────────────────
    pricing_eyebrow:    'FİYATLANDIRMA',
    pricing_title:      'Basit ve şeffaf fiyatlandırma',
    pricing_sub:        "Ücretsiz başla. Hazır olunca Pro'ya geç.",
    billing_monthly:    'Aylık',
    billing_yearly:     'Yıllık',
    billing_save:       '%20 tasarruf',
    billed_yearly:      'Yıllık $468 olarak faturalanır',
    free_tier:          'ÜCRETSİZ',
    free_period:        '/ sonsuza kadar',
    free_desc:          'Platformu keşfetmek için',
    pro_desc:           'Profesyonel ve aktif traderlar için',
    most_popular:       'EN POPÜLER',
    current_plan:       'MEVCUT PLAN',
    open_dashboard:     'Dashboard Aç →',
    upgrade_cta:        "Pro'ya Geç →",
    cancel_note:        'İstediğin zaman iptal · Gizli ücret yok',
    btn_start_free:     'Ücretsiz Başla',
    btn_open_terminal:  'Terminali Aç',

    free_feat_0: 'Dashboard & istatistikler',
    free_feat_1: 'Spot piyasa listesi',
    free_feat_2: 'Global metrikler',
    free_feat_3: 'Ekonomik takvim',
    free_feat_4: 'Sistem bildirimleri',
    free_feat_5: 'Paper trading modu',

    pro_feat_0:  'Tüm araçlara sınırsız erişim',
    pro_feat_1:  'Liquidation Stream (4 borsa)',
    pro_feat_2:  'Funding Rate tracker',
    pro_feat_3:  'Long/Short Ratio gauge',
    pro_feat_4:  'Whale Transfer feed ($200K+)',
    pro_feat_5:  'Token Unlock takvimi',
    pro_feat_6:  'Custom fiyat alarmları (ses + bildirim)',
    pro_feat_7:  'Volume spike radar',
    pro_feat_8:  'Canlı emir iletimi (API key)',
    pro_feat_9:  'Öncelikli haber akışı',
    pro_feat_10: 'Tam risk motoru (10 katman)',

    // ── Footer ────────────────────────────────────────────────
    footer_tools:     'Araçlar',
    footer_pricing:   'Fiyatlar',
    footer_signin:    'Giriş Yap',
    footer_register:  'Kayıt Ol',
    footer_copy:      '© 2026 Trading Tools. Profesyonel kripto terminali.',

    // ── Sidebar ───────────────────────────────────────────────
    tools_menu:       'Tools Menu',
    logout:           'Çıkış Yap',
    upgrade_to_pro:   "Pro'a Geç",

    // ── ProGate ───────────────────────────────────────────────
    pro_only_title:   'Bu özellik Pro plana özel',
    pro_only_desc:    "Tüm araçlara sınırsız erişim için Pro'ya geç.",
    pro_list_live_order:  'Canlı emir iletimi (API key)',
    pro_list_watchlist:   'Sınırsız watchlist',
    go_pro:           "Pro'ya Geç →",
    redirecting:      'Yönlendiriliyor...',
    secure_payment:   'Stripe ile güvenli ödeme · İstediğin zaman iptal',
    click_to_access:  'Erişmek için tıkla',
    preview_upgrade_text: 'Sınırlı önizleme görüntülüyorsunuz. Tam erişim için PRO\'ya geçin.',

    // ── App ───────────────────────────────────────────────────
    welcome_pro:      "Pro'ya hoş geldin! Tüm özellikler aktif.",
    coming_soon_label: 'yakında',

    // ── Login ─────────────────────────────────────────────────
    forgot_password:  'Şifremi Unuttum',
    no_account:       'Hesabın yok mu?',
    free_register:    'Ücretsiz Kayıt',

    // ── ForgotPassword ────────────────────────────────────────
    reset_title:        'Şifreni Sıfırla',
    reset_done_title:   'Sıfırlama bağlantısı oluşturuldu.',
    reset_done_sub:     'Şimdilik bağlantı sunucu logunda görünür.\nE-posta entegrasyonu yakında eklenecek.',
    reset_back_login:   'Giriş sayfasına dön',
    reset_email_label:  'E-posta',
    reset_email_ph:     'ornek@email.com',
    reset_send_btn:     'Sıfırlama Bağlantısı Gönder',
    reset_invalid_link: 'Geçersiz sıfırlama bağlantısı.',
    reset_request_new:  'Yeni bağlantı iste',

    // ── ResetPassword ─────────────────────────────────────────
    newpw_title:      'Yeni Şifre Belirle',
    newpw_done:       'Şifren güncellendi. Giriş sayfasına yönlendiriliyorsun...',
    newpw_label:      'Yeni Şifre',
    newpw_ph:         'En az 8 karakter',
    newpw_confirm:    'Şifre Tekrar',
    newpw_confirm_ph: 'Şifreyi tekrar gir',
    newpw_btn:        'Şifreyi Güncelle',
    err_mismatch:     'Şifreler eşleşmiyor',
    err_min_chars:    'En az 8 karakter gerekli',
    err_generic:      'Hata oluştu',
    err_connection:   'Bağlantı hatası',
  },
}
