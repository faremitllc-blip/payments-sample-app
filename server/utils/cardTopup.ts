import { isUuid, sendUsdc, uuidFromSeed } from './circle'
import { claimTopup, getTopupById, getWalletRow, updateTopupRow } from './db'
import { getRates } from './fx'
import { cleanCredential } from './clean'
import type { WalletRow } from './db'

/** The Mondo wallet that pays out USDC for card top-ups. Set in the environment. */
function treasury(): WalletRow {
  const config = useRuntimeConfig()
  const id = cleanCredential(config.treasuryWalletId)
  const address = cleanCredential(config.treasuryWalletAddress)
  if (!isUuid(id) || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error('The Mondo treasury wallet is not set up')
  }
  return {
    user_id: 'treasury',
    circle_wallet_id: id,
    address,
    blockchain: cleanCredential(config.treasuryBlockchain).toUpperCase() || 'MATIC',
  }
}

/** USDC for a euro amount at today's rate, after the card fee. Rounded down. */
export async function usdcForEuro(euro: number): Promise<string> {
  const rates = await getRates()
  const eur = rates.rates.EUR
  if (!eur || !(eur > 0)) throw new Error('No euro rate available')
  const fee = Number(useRuntimeConfig().cardFeePercent)
  const keep = Number.isFinite(fee) && fee > 0 && fee < 50 ? 1 - fee / 100 : 1
  const micro = Math.floor((euro / eur) * keep * 1e6)
  return (micro / 1e6).toFixed(6)
}

/**
 * Sends the USDC for a card top-up that getMondo has confirmed as paid. Safe to call
 * more than once: only one caller can move it from "paid" to "delivering", and the
 * transfer itself carries a fixed idempotency key.
 */
export async function deliverCardTopup(topupId: string): Promise<void> {
  const row = await getTopupById(topupId)
  if (!row || row.status !== 'paid') return
  if (!(await claimTopup(topupId, 'paid', 'delivering'))) return

  try {
    const wallet = await getWalletRow(row.user_id)
    if (!wallet) throw new Error('The customer has no wallet')
    const from = treasury()
    if (wallet.blockchain !== from.blockchain) {
      throw new Error('The customer wallet is on a different network than the treasury wallet')
    }
    const usdc = await usdcForEuro(Number(row.amount))
    if (!(Number(usdc) > 0)) throw new Error('The USDC amount is zero')
    const sent = await sendUsdc(from, wallet.address, usdc, uuidFromSeed(`card-topup:${topupId}`))
    await updateTopupRow(topupId, { status: 'credited', usdc_amount: Number(usdc), usdc_tx: sent.id, error: null })
  } catch (err: any) {
    // The customer has paid. Keep the reason so the USDC can be sent by hand.
    const reason = String(err?.statusMessage || err?.message || 'USDC could not be sent').slice(0, 240)
    console.error('Card top-up delivery failed', topupId, reason)
    await updateTopupRow(topupId, { status: 'delivery_failed', error: reason })
  }
}
