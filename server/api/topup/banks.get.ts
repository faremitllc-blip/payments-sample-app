import { rateLimit, requireUser } from '../../utils/auth'
import { activeProvider } from '../../utils/openbanking'
import { listSaltEdgeBanks } from '../../utils/saltedge'

// The banks a customer can pay from. The country comes from the visitor's address, unless
// they pick another one, and the best-known banks of that country are marked so the page
// can show them first.
const TOP: Record<string, string[]> = {
  SE: ['swedbank', 'nordea', 'seb', 'danske', 'handelsbanken', 'länsförsäkringar', 'icabanken', 'skandia'],
  DK: ['danske', 'nordea', 'jyske', 'sydbank', 'nykredit'],
  FI: ['nordea', 'op ', 'danske', 'handelsbanken', 's-pankki', 'aktia'],
  NO: ['dnb', 'nordea', 'sparebank', 'handelsbanken'],
  DE: ['deutsche bank', 'commerzbank', 'sparkasse', 'volksbank', 'postbank', 'ing', 'n26', 'dkb'],
  FR: ['bnp', 'crédit agricole', 'société générale', 'lcl', 'caisse d', 'crédit mutuel', 'la banque postale'],
  NL: ['ing', 'abn amro', 'rabobank', 'bunq', 'sns', 'asn'],
  BE: ['kbc', 'belfius', 'ing', 'bnp', 'argenta'],
  ES: ['santander', 'bbva', 'caixabank', 'sabadell', 'bankinter', 'ing'],
  IT: ['intesa', 'unicredit', 'poste', 'mps', 'banco bpm', 'fineco'],
  PT: ['caixa geral', 'millennium', 'santander', 'novo banco', 'bpi'],
  IE: ['aib', 'bank of ireland', 'permanent tsb', 'revolut', 'n26'],
  AT: ['erste', 'raiffeisen', 'bank austria', 'bawag', 'n26'],
  PL: ['pko', 'pekao', 'mbank', 'ing', 'santander', 'millennium'],
}

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  rateLimit(user.id, 'topup-banks', 20, 60_000)

  const asked = String(getQuery(event).country || '').toUpperCase()
  const fromIp = String(getHeader(event, 'x-vercel-ip-country') || getHeader(event, 'cf-ipcountry') || '').toUpperCase()
  const country = /^[A-Z]{2}$/.test(asked) ? asked : /^[A-Z]{2}$/.test(fromIp) ? fromIp : ''

  // Only Salt Edge can list banks. With another provider the customer chooses at the bank page.
  if (activeProvider() !== 'saltedge' || !country) {
    return { country, detected: fromIp, top: [], banks: [] }
  }

  let banks
  try {
    banks = await listSaltEdgeBanks(country)
  } catch (err: any) {
    // The list is a convenience: without it the bank page still lets the customer choose.
    console.error('Bank list failed', country, err?.statusMessage)
    return { country, detected: fromIp, top: [], banks: [] }
  }

  const wanted = TOP[country] || []
  const rank = (name: string) => {
    const n = name.toLowerCase()
    const i = wanted.findIndex((w) => n.includes(w))
    return i
  }
  const top = banks
    .map((b) => ({ b, r: rank(b.name) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.b.name.localeCompare(b.b.name))
    .slice(0, 8)
    .map((x) => x.b)
  return { country, detected: fromIp, top, banks }
})
