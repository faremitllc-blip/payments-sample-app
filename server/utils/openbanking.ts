import type { H3Event } from 'h3'
import { cleanCredential } from './clean'
import { checkEuroPayment, openBankingMode, startEuroPayment, webformLink } from './finapi'
import {
  checkTrueLayerPayment,
  isTrueLayerRef,
  startTrueLayerPayment,
  trueLayerConfigured,
  trueLayerLink,
} from './truelayer'

/**
 * One front for the open banking providers. TrueLayer is used when its keys are set,
 * unless OPENBANKING_PROVIDER=finapi. A payment remembers its own provider, so an
 * older finAPI top-up still works after switching.
 */
export function activeProvider(): 'truelayer' | 'finapi' {
  const choice = cleanCredential(useRuntimeConfig().openbankingProvider).toLowerCase()
  if (choice === 'finapi') return 'finapi'
  if (choice === 'truelayer') return 'truelayer'
  return trueLayerConfigured() ? 'truelayer' : 'finapi'
}

export function openBankingConfigured(): boolean {
  return activeProvider() === 'truelayer' ? trueLayerConfigured() : openBankingMode().configured
}

/** The site address as the visitor sees it, e.g. https://getmondoapp.com. */
export function siteOrigin(event: H3Event): string {
  const host = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host') || ''
  const first = host.split(',')[0].trim()
  const local = /^(localhost|127\.)/.test(first)
  return `${local ? 'http' : 'https'}://${first}`
}

export interface StartInput {
  amount: number
  recipientName: string
  iban: string
  bic?: string
  purpose: string
  payerName: string
  payerEmail: string
  origin: string
}

export async function startPayment(topupId: string, p: StartInput) {
  if (activeProvider() === 'truelayer') {
    return await startTrueLayerPayment(topupId, {
      amount: p.amount,
      recipientName: p.recipientName,
      iban: p.iban,
      // Short and plain: the bank statement text. A longer Bridge message is not cut, it is replaced.
      reference: p.purpose.length > 0 && p.purpose.length <= 18 ? p.purpose : 'Mondo top-up',
      payerName: p.payerName,
      payerEmail: p.payerEmail,
      returnUri: `${p.origin}/topup/return`,
    })
  }
  return await startEuroPayment(topupId, {
    amount: p.amount,
    recipientName: p.recipientName,
    iban: p.iban,
    bic: p.bic,
    purpose: p.purpose,
  })
}

export async function checkPayment(topupId: string, stored: string) {
  if (isTrueLayerRef(stored)) return await checkTrueLayerPayment(stored)
  return await checkEuroPayment(topupId, stored)
}

/** How long the bank page link works, in minutes. */
export function linkMinutes(stored: string | null | undefined): number {
  return isTrueLayerRef(stored) ? 15 : 20
}

export function paymentLink(stored: string, origin: string): string {
  if (isTrueLayerRef(stored)) return trueLayerLink(stored, `${origin}/topup/return`)
  return webformLink(stored)
}
