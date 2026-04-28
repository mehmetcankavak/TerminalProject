// HL Spot ↔ Perp transfer — MetaMask popup ile main wallet imzası.
// Kullanıcının web UI'a gitmeden tek tıkla transfer yapmasını sağlar.
import { useState } from 'react'
import { API_BASE } from '../../config'
import { getAuthHeaders } from '../../utils/format'

export default function TransferButton({ token, hlTestnet, spotBalance, onDone, addLog }) {
    const [busy, setBusy] = useState(false)
    if (!spotBalance || spotBalance < 1) return null

    const doTransfer = async () => {
        if (busy) return
        const eth = window.ethereum
        if (!eth?.request) {
            addLog?.('[error] MetaMask/OKX wallet bulunamadı', 'error')
            return
        }
        const amountStr = window.prompt(
            `Spot → Perp transfer (max $${spotBalance.toFixed(2)})`,
            String(spotBalance.toFixed(2)),
        )
        const amount = parseFloat(amountStr || '')
        if (!amount || amount <= 0) return
        if (amount > spotBalance + 0.01) {
            addLog?.('[error] Bakiyenden fazla', 'error')
            return
        }
        setBusy(true)
        try {
            const accounts = await eth.request({ method: 'eth_requestAccounts' })
            const main = Array.isArray(accounts) ? accounts[0] : null
            if (!main) throw new Error('Wallet hesap döndürmedi')

            // 1) Backend typed_data hazırlasın
            const prepRes = await fetch(`${API_BASE}/api/hl-transfer/prepare`, {
                method: 'POST', headers: getAuthHeaders(token),
                body: JSON.stringify({ main_wallet_address: main, testnet: hlTestnet, amount, to_perp: true }),
            })
            const prep = await prepRes.json()
            if (!prep.ok) throw new Error(prep.error || 'prepare reddedildi')

            // 2) MetaMask ile imzala
            const signature = await eth.request({
                method: 'eth_signTypedData_v4',
                params: [main, JSON.stringify(prep.typed_data)],
            })

            // 3) Backend HL'ye yollasın
            const submitRes = await fetch(`${API_BASE}/api/hl-transfer/submit`, {
                method: 'POST', headers: getAuthHeaders(token),
                body: JSON.stringify({
                    main_wallet_address: main,
                    testnet: hlTestnet,
                    action: prep.action,
                    nonce: prep.nonce,
                    signature,
                }),
            })
            const submit = await submitRes.json()
            if (!submit.ok) throw new Error(submit.error || 'submit reddedildi')
            addLog?.(`[ok] $${amount} spot → perp`, 'success')
            onDone?.()
        } catch (e) {
            const msg = String(e?.message || e)
            if (/reject|denied/i.test(msg)) addLog?.('[info] İmza reddedildi', 'warning')
            else addLog?.(`[error] Transfer başarısız: ${msg}`, 'error')
        } finally {
            setBusy(false)
        }
    }

    return (
        <button
            onClick={doTransfer}
            disabled={busy}
            title={`Spot bakiye: $${spotBalance.toFixed(2)} — perp'e taşı (MetaMask main wallet imzası gerek)`}
            style={{
                background: '#f5a62318', color: '#f5a623',
                border: '1px solid #f5a62355',
                borderRadius: 4, padding: '2px 8px',
                fontSize: 10, fontWeight: 700, letterSpacing: '.05em',
                cursor: busy ? 'wait' : 'pointer',
            }}
        >
            {busy ? '...' : `SPOT $${spotBalance >= 1000 ? (spotBalance / 1000).toFixed(1) + 'K' : spotBalance.toFixed(0)} → PERP`}
        </button>
    )
}
