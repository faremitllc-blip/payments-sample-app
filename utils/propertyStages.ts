/** The steps a property goes through, in order. Shared by the server (to check input) and the pages. */
export const PROPERTY_STAGES = [
  'Land acquired',
  'Land surveyed',
  'Permits approved',
  'Construction started',
  'Structure complete',
  'Finishing works',
  'Completed',
  'Rented or sold',
] as const

export type PropertyStage = (typeof PROPERTY_STAGES)[number]

export function isStage(value: unknown): value is PropertyStage {
  return typeof value === 'string' && (PROPERTY_STAGES as readonly string[]).includes(value)
}

export interface StageLogEntry {
  stage: string
  at: string
  note: string
}
