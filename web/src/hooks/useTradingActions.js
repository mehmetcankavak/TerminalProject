// Komut göndericiler + autocomplete + klavye handler.
// TerminalPage.jsx'ten ayrıştırıldı; davranış aynen korundu.
import { useEffect, useCallback } from 'react'
import { API_BASE } from '../config'
import { getAuthHeaders } from '../utils/format'
import { AUTOCOMPLETE_COMMANDS, SYMBOL_CMDS } from '../constants/terminal'

export function useTradingActions({
    token,
    cmdLoading,
    setCmdLoading,
    addLog,
    positions,
    tradingMode,
    bracketRef,
    bracketMode,
    bracketTP,
    bracketSL,
    input,
    setInput,
    history,
    setHistory,
    histIdx,
    setHistIdx,
    setShowShortcuts,
    setBalance,
    setUnrealizedTotal,
    setRealizedToday,
    setFreeMargin,
    setMarginUsed,
    setPositions,
    allSymbols,
    tickers,
}) {
    // bracketRef'i güncel tut — sendOrder/handleSubmit closure'larında okunuyor
    useEffect(() => {
        bracketRef.current = { enabled: bracketMode, tp: bracketTP, sl: bracketSL }
    }, [bracketMode, bracketTP, bracketSL, bracketRef])

    const applyStateUpdate = useCallback((state) => {
        if (!state) return
        if (state.balance != null) setBalance(state.balance)
        if (state.unrealized_total != null) setUnrealizedTotal(state.unrealized_total)
        if (state.realized_today != null) setRealizedToday(state.realized_today)
        if (state.free_margin !== undefined) setFreeMargin(state.free_margin)
        if (state.margin_used !== undefined) setMarginUsed(Number(state.margin_used) || 0)
        if (state.positions != null) setPositions(state.positions)
    }, [setBalance, setUnrealizedTotal, setRealizedToday, setFreeMargin, setMarginUsed, setPositions])

    const executeCommand = useCallback(async (cmd) => {
        const trimmed = String(cmd || '').trim()
        if (!trimmed || cmdLoading) return
        // Panic guard — kazara basıp tüm pozisyonları kapatmak trader'ın kabusu
        if (/^panic\b/i.test(trimmed)) {
            const liveMode = tradingMode && tradingMode !== 'PAPER'
            const openCount = Object.keys(positions).length
            const warn =
                '⚠ PANIC CLOSE\n\n' +
                `Mod: ${tradingMode || 'PAPER'}\n` +
                `Açık pozisyon sayısı: ${openCount}\n\n` +
                (liveMode ? 'GERÇEK PARAYLA tüm pozisyonlar MARKET fiyattan kapatılacak.\n\n' : 'Paper moddaki tüm pozisyonlar kapatılacak.\n\n') +
                'Emin misin? (Bu işlem geri alınamaz.)'
            if (!window.confirm(warn)) {
                addLog('[info] panic iptal edildi', 'warning')
                return
            }
        }
        addLog(`$ ${trimmed}`, 'info')
        setCmdLoading(true)
        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 15000)
            const res = await fetch(`${API_BASE}/api/command`, {
                method: 'POST', headers: getAuthHeaders(token),
                body: JSON.stringify({ command: trimmed }),
                signal: controller.signal,
            })
            clearTimeout(timeoutId)
            const data = await res.json()
            data.results?.forEach(r => addLog(r.text, r.style || 'info'))
            applyStateUpdate(data.state)
        } catch (e) {
            if (e.name === 'AbortError') addLog('[error] Komut zaman aşımına uğradı (15s)', 'error')
            else addLog(`[error] ${e.message}`, 'error')
        } finally {
            setCmdLoading(false)
        }
    }, [cmdLoading, tradingMode, positions, addLog, token, setCmdLoading, applyStateUpdate])

    const sendOrder = useCallback((symbol, side, collateral, leverage) => {
        const dir = side === 'buy' ? 'long' : 'short'
        const { enabled, tp, sl } = bracketRef.current
        const tpNum = parseFloat(tp), slNum = parseFloat(sl)
        const hasTp = Number.isFinite(tpNum) && tpNum > 0
        const hasSl = Number.isFinite(slNum) && slNum > 0
        if (enabled && !hasTp && !hasSl) {
            addLog('[risk] Bracket açık ama TP ve SL boş — emir gönderilmedi. En az birini doldur ya da Bracket\'i kapat.', 'risk')
            return
        }
        const suffix = enabled
            ? [hasTp ? `tp=${tpNum}` : '', hasSl ? `sl=${slNum}` : ''].filter(Boolean).join(' ')
            : ''
        return executeCommand(`${dir} ${symbol} ${collateral} ${leverage}${suffix ? ' ' + suffix : ''}`)
    }, [bracketRef, addLog, executeCommand])

    const handleSubmit = useCallback(async (e) => {
        e.preventDefault()
        let cmd = input.trim()
        if (!cmd || cmdLoading) return
        const { enabled, tp, sl } = bracketRef.current
        if (enabled && /^(long|short)\s/i.test(cmd) && !/\b(tp|sl)=/i.test(cmd)) {
            const tpNum = parseFloat(tp), slNum = parseFloat(sl)
            const hasTp = Number.isFinite(tpNum) && tpNum > 0
            const hasSl = Number.isFinite(slNum) && slNum > 0
            if (!hasTp && !hasSl) {
                addLog('[risk] Bracket açık ama TP ve SL boş — emir gönderilmedi. En az birini doldur ya da Bracket\'i kapat.', 'risk')
                return
            }
            const suffix = [hasTp ? `tp=${tpNum}` : '', hasSl ? `sl=${slNum}` : ''].filter(Boolean).join(' ')
            if (suffix) cmd = `${cmd} ${suffix}`
        }
        setInput('')
        setHistory(h => [cmd, ...h.slice(0, 49)])
        setHistIdx(-1)
        await executeCommand(cmd)
    }, [input, cmdLoading, bracketRef, addLog, setInput, setHistory, setHistIdx, executeCommand])

    // ─── Autocomplete derived
    const filteredCmds = input.trim().length > 0 && !input.includes(' ')
        ? AUTOCOMPLETE_COMMANDS.filter(c => c.cmd.startsWith(input.toLowerCase().trim()))
        : []
    const inputParts = input.trim().split(/\s+/)
    const symbolPool = allSymbols.length > 0 ? allSymbols : Object.keys(tickers)
    const symbolMatches = (
        inputParts.length === 2 &&
        SYMBOL_CMDS.has(inputParts[0].toLowerCase()) &&
        inputParts[1].length >= 1 &&
        filteredCmds.length === 0
    ) ? symbolPool.filter(k => k.startsWith(inputParts[1].toUpperCase())).slice(0, 8) : []

    const onKeyDown = useCallback((e) => {
        if (e.key === 'ArrowUp') { e.preventDefault(); const i = Math.min(histIdx + 1, history.length - 1); setHistIdx(i); setInput(history[i] || '') }
        else if (e.key === 'ArrowDown') { e.preventDefault(); const i = Math.max(histIdx - 1, -1); setHistIdx(i); setInput(i === -1 ? '' : history[i]) }
        else if (e.key === 'Tab') { e.preventDefault(); if (filteredCmds.length > 0) setInput(filteredCmds[0].cmd + ' '); else if (symbolMatches.length > 0) setInput(inputParts[0] + ' ' + symbolMatches[0] + ' ') }
        else if (e.key === '?' && input === '') { e.preventDefault(); setShowShortcuts(s => !s) }
        else if (e.key === 'Escape') { setShowShortcuts(false) }
    }, [histIdx, history, setHistIdx, setInput, filteredCmds, symbolMatches, inputParts, input, setShowShortcuts])

    return {
        executeCommand,
        sendOrder,
        handleSubmit,
        onKeyDown,
        filteredCmds,
        symbolMatches,
        inputParts,
    }
}
