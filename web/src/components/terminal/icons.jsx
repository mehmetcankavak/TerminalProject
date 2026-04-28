// Terminal sayfasının inline ikonları — TerminalPage.jsx'ten ayrıştırıldı.
// Davranış / görsel değişmedi, sadece dosya organizasyonu.
export const NTIcon = ({ children }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
    </svg>
)

export const IconBell = () => (
    <NTIcon>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </NTIcon>
)

export const IconBellOff = () => (
    <NTIcon>
        <path d="M18 8a6 6 0 0 0-9.33-5" />
        <path d="M6.26 6.26A6 6 0 0 0 6 8c0 7-3 9-3 9h14" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        <line x1="1" y1="1" x2="23" y2="23" />
    </NTIcon>
)

export const IconMonitor = () => (
    <NTIcon>
        <rect x="3" y="4" width="18" height="12" rx="2" ry="2" />
        <line x1="8" y1="20" x2="16" y2="20" />
        <line x1="12" y1="16" x2="12" y2="20" />
    </NTIcon>
)
