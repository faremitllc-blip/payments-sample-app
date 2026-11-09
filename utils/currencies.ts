/**
 * The currencies shown on the Currencies page. Edit this list to add, remove or
 * reorder them. `code` must be a currency that Frankfurter covers (one it does not cover shows "Rate not available").
 */
export interface CurrencyInfo {
  code: string
  name: string
  region: 'africa' | 'world'
  /** Digits after the decimal point when showing an amount. */
  decimals: number
}

export const CURRENCIES: CurrencyInfo[] = [
  // Africa
  { code: 'KES', name: 'Kenyan shilling', region: 'africa', decimals: 2 },
  { code: 'SOS', name: 'Somali shilling', region: 'africa', decimals: 0 },
  { code: 'ETB', name: 'Ethiopian birr', region: 'africa', decimals: 2 },
  { code: 'UGX', name: 'Ugandan shilling', region: 'africa', decimals: 0 },
  { code: 'TZS', name: 'Tanzanian shilling', region: 'africa', decimals: 0 },
  { code: 'NGN', name: 'Nigerian naira', region: 'africa', decimals: 2 },
  { code: 'GHS', name: 'Ghanaian cedi', region: 'africa', decimals: 2 },
  { code: 'ZAR', name: 'South African rand', region: 'africa', decimals: 2 },
  // International
  { code: 'USD', name: 'US dollar', region: 'world', decimals: 2 },
  { code: 'EUR', name: 'Euro', region: 'world', decimals: 2 },
  { code: 'GBP', name: 'British pound', region: 'world', decimals: 2 },
  { code: 'COP', name: 'Colombian peso', region: 'world', decimals: 0 },
  { code: 'CAD', name: 'Canadian dollar', region: 'world', decimals: 2 },
  { code: 'AUD', name: 'Australian dollar', region: 'world', decimals: 2 },
  { code: 'AED', name: 'UAE dirham', region: 'world', decimals: 2 },
  { code: 'INR', name: 'Indian rupee', region: 'world', decimals: 2 },
  { code: 'TRY', name: 'Turkish lira', region: 'world', decimals: 2 },
]
