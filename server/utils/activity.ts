import type { CircleTransaction } from './circle'

/** The shape the screens use for one sent or received transfer. */
export function toActivityItems(items: CircleTransaction[]) {
  return items.map((t) => {
    const sent = t.transactionType === 'OUTBOUND'
    return {
      id: t.id,
      direction: sent ? 'sent' : 'received',
      state: t.state,
      amount: t.amounts && t.amounts.length > 0 ? t.amounts[0] : '',
      counterparty: sent ? t.destinationAddress || '' : t.sourceAddress || '',
      date: t.createDate || '',
      txHash: t.txHash || '',
    }
  })
}
