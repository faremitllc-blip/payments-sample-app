// Stands in for "@circle-fin/app-kit" while that package is not in package.json,
// so the site still builds. Buying USDC stays switched off until the package is
// added (see WALLET_APP_SETUP.md, "Buy USDC with fiat").
const MESSAGE =
  'The Arc App Kit package is not installed yet, so buying USDC is switched off.'

export class AppKit {
  constructor() {
    throw new Error(MESSAGE)
  }
}

export class KitError extends Error {}

export function createAppServerKit(): never {
  throw new Error(MESSAGE)
}
