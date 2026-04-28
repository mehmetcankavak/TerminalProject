/**
 * DataState — Ortak loading / error / empty / stale state wrapper
 *
 * Kullanım:
 *   <DataState loading={loading} error={error} empty={!data.length} onRetry={load}>
 *     <YourComponent data={data} />
 *   </DataState>
 */
export default function DataState({ loading, error, empty, emptyText, onRetry, children, minHeight = 120 }) {
    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight, gap: 8, color: 'var(--text-3)', fontSize: 13 }}>
                <span className="ds-spinner" />
                Yükleniyor…
            </div>
        )
    }

    if (error) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight, gap: 8 }}>
                <div style={{ color: 'var(--danger)', fontSize: 13 }}>⚠ {typeof error === 'string' ? error : 'Veri alınamadı'}</div>
                {onRetry && (
                    <button
                        onClick={onRetry}
                        style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: '1px solid var(--accent)', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' }}
                    >
                        Yeniden Dene
                    </button>
                )}
            </div>
        )
    }

    if (empty) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight, color: 'var(--text-3)', fontSize: 13 }}>
                {emptyText || 'Veri bulunamadı'}
            </div>
        )
    }

    return children
}
