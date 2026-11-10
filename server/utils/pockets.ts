import { listPocketRows } from './db'

/** Works in millionths of a USDC so sums never drift. */
export const toMicro = (v: number | string) => Math.round(Number(v) * 1e6)
export const fromMicro = (m: number) => m / 1e6

/** USDC set aside per currency, and the total. Returns nothing set aside if the table is not set up yet. */
export async function getPockets(userId: string): Promise<{ byCurrency: Record<string, number>; total: number }> {
  let rows: Awaited<ReturnType<typeof listPocketRows>> = []
  try {
    rows = await listPocketRows(userId)
  } catch (err: any) {
    // Before add-currency-pockets.sql has been run there is nothing set aside. Do not block sending.
    console.error('Pockets unavailable', err?.statusMessage)
  }
  const byCurrency: Record<string, number> = {}
  let totalMicro = 0
  for (const r of rows) {
    const m = toMicro(r.usdc)
    byCurrency[r.currency] = fromMicro(m)
    totalMicro += m
  }
  return { byCurrency, total: fromMicro(totalMicro) }
}

/** Stops spending USDC that is set aside in a currency wallet. `totalUsdc` is the user's whole USDC balance. */
export async function assertSpendable(userId: string, amount: number, totalUsdc: number): Promise<void> {
  const { total } = await getPockets(userId)
  if (total <= 0) return
  const available = Math.max(0, fromMicro(toMicro(totalUsdc) - toMicro(total)))
  if (toMicro(amount) > toMicro(available)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${total} USDC is set aside in your currency wallets. You can use up to ${available} USDC. Move some back to spend more.`,
    })
  }
}
