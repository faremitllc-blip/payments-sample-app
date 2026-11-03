import { requireUser } from '../../utils/auth'
import { circleSettings } from '../../utils/circle'
import { listProperties } from '../../utils/db'
import { isAdminEmail, microToUsdc } from '../../utils/propertiesRules'
import { poolSettings, readSummary } from '../../utils/properties'

// The property list with live funding progress from the smart contract.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const config = useRuntimeConfig()
  const admin = isAdminEmail(config.adminEmails, user.email)

  let pool
  try {
    pool = poolSettings()
  } catch (err: any) {
    return { enabled: false, reason: err?.statusMessage || 'Not available', admin, properties: [] }
  }

  const rows = await listProperties()
  const properties = await Promise.all(
    rows.map(async (p) => {
      let chain = null
      try {
        const s = await readSummary(pool, p.onchain_id)
        chain = {
          status: s.status,
          target: microToUsdc(s.target),
          raised: microToUsdc(s.raised),
          deadline: s.deadline,
          released: s.released,
          distributed: microToUsdc(s.distributed),
        }
      } catch {
        chain = null
      }
      return {
        id: p.id,
        title: p.title,
        location: p.location,
        description: p.description,
        imageUrl: p.image_url,
        expectedReturn: p.expected_return,
        minInvestUsdc: Number(p.min_invest_usdc),
        chain,
      }
    }),
  )
  return {
    enabled: true,
    admin,
    poolChain: pool.chain,
    poolChainLabel: pool.chainLabel,
    maxInvestUsdc: pool.maxInvestUsdc,
    live: circleSettings().live,
    properties,
  }
})
