<template>
  <div class="fm-wrap fm-app-main mo-legal">
    <h1 class="fm-page-title">Privacy Policy</h1>
    <p class="mo-muted">Last updated: 17 November 2026</p>

    <h2>1. What we collect</h2>
    <p>
      Account details (name, email, login method), identity verification information where required, the bank and payment
      details you give us to send or receive money, your transaction history, and basic technical data such as device,
      browser and IP address used to keep the service secure.
    </p>

    <h2>2. How we use it</h2>
    <p>
      To create and run your account, process payments and transfers, set up your virtual bank account, verify your
      identity, prevent fraud and misuse, meet legal obligations, give you support, and improve Mondo. We do not sell your
      personal data.
    </p>

    <h2>3. Who we share it with</h2>
    <p>
      Only with providers that help us run the service: our open banking provider, our banking partner Bridge and its
      partner institutions (who also carry out identity checks), and our hosting and database providers. They may use
      your data only to provide their service to us, and they have their own privacy policies. We also share information
      when the law requires it, for example with regulators or law enforcement.
    </p>

    <h2>4. Bank access</h2>
    <p>
      When you pay by open banking you approve the payment on your own bank's page. We never see or store your online
      banking password.
    </p>

    <h2>5. How long we keep it</h2>
    <p>
      We keep your data while your account is open and for as long as the law requires afterwards, for example for
      financial record keeping and fraud prevention.
    </p>

    <h2>6. Security</h2>
    <p>
      We protect data with access controls and encryption in transit. No system is perfectly secure, so please use a
      strong password and keep your login private.
    </p>

    <h2>7. Your rights</h2>
    <p>
      Depending on where you live, you may ask to see, correct, export or delete your data, or object to some uses.
      Write to us at the address below. We may need to keep some information to meet legal duties.
    </p>

    <h2>8. Changes</h2>
    <p>We may update this policy and will tell you about important changes.</p>

    <h2>9. Contact</h2>
    <p>
      <a href="mailto:support@getmondoapp.com">support@getmondoapp.com</a>. See also our
      <NuxtLink to="/terms">Terms of Service</NuxtLink>.
    </p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'app' })
useHead({ title: 'Privacy Policy' })
</script>

<style scoped>
.mo-legal { max-width: 760px; padding-bottom: 48px; }
.mo-legal h2 { font-size: 1.1rem; margin: 28px 0 8px; }
.mo-legal p { line-height: 1.6; margin: 0 0 8px; }
</style>
