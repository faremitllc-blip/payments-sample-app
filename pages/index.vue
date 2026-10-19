<template>
  <div>
    <section class="fm-wrap fm-hero">
      <div>
        <h1>Bank accounts and digital dollars, together.</h1>
        <p class="fm-lede">
          Get US, euro and pound bank details, plus a USDC wallet. Money paid
          into your bank details lands in your wallet, and you can send it on to
          anyone with a wallet address.
        </p>

        <div class="fm-cta-row">
          <template v-if="session">
            <v-btn size="x-large" to="/wallet" color="primary" variant="flat">
              Open my wallet
            </v-btn>
            <v-btn size="x-large" to="/bank" variant="outlined" color="secondary">
              Bank accounts
            </v-btn>
          </template>
          <template v-else>
            <v-btn size="x-large" to="/signup" color="primary" variant="flat">
              Sign up free
            </v-btn>
            <v-btn
              size="x-large"
              to="/login"
              variant="outlined"
              color="secondary"
            >
              Log in
            </v-btn>
          </template>
        </div>

        <p v-if="mode.loaded" class="fm-notice">
          {{
            mode.live
              ? 'Live mode: transfers move real money and cannot be undone.'
              : 'Test mode: this app uses a test network, so no real money moves.'
          }}
        </p>
      </div>

      <!-- The rotating Earth shows on this landing page only. -->
      <div class="mo-globe-slot">
        <LazyGlobeHero />
      </div>
    </section>

    <section class="fm-wrap fm-actions" aria-label="What you can do">
      <NuxtLink :to="bankLink" class="fm-tile fm-tile-bank">
        <div>
          <h3>Bank accounts</h3>
          <p>
            Get your own bank details to be paid by bank transfer. What arrives
            is turned into USDC in your wallet.
          </p>
          <ul class="fm-chips" aria-label="Currencies">
            <li>USD · ACH and wire</li>
            <li>EUR · SEPA</li>
            <li>GBP · Faster Payments</li>
          </ul>
          <p class="fm-tile-fine">
            Needs a quick identity check. Available currencies can depend on it.
          </p>
        </div>
        <v-icon size="28" aria-hidden="true">mdi-bank-outline</v-icon>
      </NuxtLink>

      <NuxtLink :to="walletLink" class="fm-tile fm-tile-wallet">
        <div>
          <h3>Create wallet</h3>
          <p>Get your own USDC wallet and address in one step.</p>
        </div>
        <v-icon size="28" aria-hidden="true">mdi-wallet-outline</v-icon>
      </NuxtLink>

      <NuxtLink to="/send" class="fm-tile fm-tile-send">
        <div>
          <h3>Send USDC</h3>
          <p>Pay anyone with a wallet address. Review before it goes.</p>
        </div>
        <v-icon size="28" aria-hidden="true">mdi-arrow-top-right</v-icon>
      </NuxtLink>

      <NuxtLink to="/receive" class="fm-tile fm-tile-receive">
        <div>
          <h3>Receive</h3>
          <p>Share your wallet address, or your bank details, to get paid.</p>
        </div>
        <v-icon size="28" aria-hidden="true">mdi-arrow-bottom-left</v-icon>
      </NuxtLink>

      <NuxtLink to="/activity" class="fm-tile fm-tile-activity">
        <div>
          <h3>Activity</h3>
          <p>See everything you sent and received, with its status.</p>
        </div>
        <v-icon size="28" aria-hidden="true">mdi-receipt-text-outline</v-icon>
      </NuxtLink>
    </section>

    <section class="fm-band">
      <div class="fm-wrap">
        <h2>Three steps from sign up to sent.</h2>
        <ol class="fm-steps">
          <li>
            <span class="fm-step-number" aria-hidden="true">1</span>
            <h3>Sign up</h3>
            <p>Use your email and a password. It takes under a minute.</p>
          </li>
          <li>
            <span class="fm-step-number" aria-hidden="true">2</span>
            <h3>Create your wallet</h3>
            <p>
              One tap gives you an address that is yours to share. Verify your
              identity to add bank details.
            </p>
          </li>
          <li>
            <span class="fm-step-number" aria-hidden="true">3</span>
            <h3>Get paid and send</h3>
            <p>
              Receive by bank transfer or USDC, then send USDC to any wallet
              address.
            </p>
          </li>
        </ol>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'app' })
useHead({ title: 'Bank accounts and USDC' })

const { session, load } = useAuth()
const { mode, loadMode } = useAppMode()
load()
loadMode()

const walletLink = computed(() => (session.value ? '/wallet' : '/signup'))
const bankLink = computed(() => (session.value ? '/bank' : '/signup'))
</script>
