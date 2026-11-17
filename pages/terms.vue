<template>
  <div class="fm-wrap fm-app-main mo-legal">
    <h1 class="fm-page-title">Terms of Service</h1>
    <p class="mo-muted">Last updated: 17 November 2026</p>

    <h2>1. About Mondo</h2>
    <p>
      Mondo ("we", "us") provides money transfer (remittance) services using open banking, and virtual bank accounts
      provided through our banking partner, Bridge. By creating an account or using Mondo you agree to these terms. If
      you do not agree, please do not use the service.
    </p>

    <h2>2. Your account</h2>
    <p>
      You must be at least 18 years old and able to enter a binding agreement. You must give accurate information and
      keep your login details safe. You are responsible for everything done through your account. Tell us straight away
      if you think someone else has accessed it.
    </p>

    <h2>3. Identity checks</h2>
    <p>
      We and our partners must verify your identity before you can use some features, including virtual bank accounts.
      We may limit or refuse a service where the law requires it or where we cannot verify you.
    </p>

    <h2>4. How the service works</h2>
    <p>
      Payments are made from your own bank account through an open banking provider, which asks you to approve each
      payment with your bank. Virtual bank accounts and the related account services are provided by Bridge and its
      partner institutions, and are subject to their terms as well as these. Fees, exchange rates, limits and expected
      delivery times are shown before you confirm a payment.
    </p>

    <h2>5. Payments cannot always be undone</h2>
    <p>
      Check the recipient's details and the amount carefully before you confirm. Once a transfer has been sent we may not
      be able to cancel or recover it, for example if the details you entered were wrong.
    </p>

    <h2>6. Things you must not do</h2>
    <p>
      You must not use Mondo for anything illegal, for fraud, money laundering or sanctions evasion, to harm others, or
      to interfere with the service. We may suspend or close accounts that break these rules or that we reasonably
      believe are being misused, and we may report suspicious activity as the law requires.
    </p>

    <h2>7. Our responsibility</h2>
    <p>
      We provide the service with reasonable care but cannot promise it will always be available or error free. To the
      extent the law allows, we are not responsible for losses caused by banks, payment and account partners, incorrect
      details you enter, or events outside our control. Nothing in these terms limits liability that cannot be limited by
      law. Nothing in Mondo is financial, legal or tax advice.
    </p>

    <h2>8. Changes and ending</h2>
    <p>
      We may update these terms and will tell you about important changes. If you keep using Mondo after a change you
      accept it. You can stop using Mondo at any time, and withdraw any balance you hold before closing your account.
    </p>

    <h2>9. Contact</h2>
    <p>
      Questions about these terms: <a href="mailto:support@getmondoapp.com">support@getmondoapp.com</a>. See also our
      <NuxtLink to="/privacy">Privacy Policy</NuxtLink>.
    </p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'app' })
useHead({ title: 'Terms of Service' })
</script>

<style scoped>
.mo-legal { max-width: 760px; padding-bottom: 48px; }
.mo-legal h2 { font-size: 1.1rem; margin: 28px 0 8px; }
.mo-legal p { line-height: 1.6; margin: 0 0 8px; }
</style>
