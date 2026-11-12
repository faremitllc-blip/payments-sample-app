<template>
  <div class="fm-wrap fm-app-main">
    <section class="mo-card mo-ret" role="status">
      <h2>Thanks, we have your payment</h2>
      <p class="my-3">
        Your bank is finishing the transfer. The USDC arrives in your Mondo wallet once it lands, usually within minutes.
        You can close this tab or carry on in Mondo.
      </p>
      <v-btn to="/activity" color="primary" variant="flat">See activity</v-btn>
      <v-btn to="/currencies" variant="text" class="ml-2">Back to currencies</v-btn>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dash', middleware: 'auth' })
useHead({ title: 'Payment received' })
</script>

<style scoped>
.mo-ret { max-width: 560px; padding: 24px; }
</style>
