// Stands in for "@circle-fin/app-kit" and "@circle-fin/adapter-circle-wallets"
// while they are not in package.json, so the site still builds. Bridging stays
// switched off until they are added (see WALLET_APP_SETUP.md, "Bridge USDC").
const MESSAGE =
  'The Circle App Kit packages are not installed yet, so bridging is switched off.'

export class AppKit {
  constructor() {
    throw new Error(MESSAGE)
  }
}

export function createCircleWalletsAdapter(): never {
  throw new Error(MESSAGE)
}
