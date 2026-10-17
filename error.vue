<template>
  <v-app class="fm" theme="wallet">
    <v-main>
      <div class="fm-wrap" style="padding-top: 96px; padding-bottom: 96px">
        <NuxtLink to="/" class="fm-logo" aria-label="Home">
          <span class="fm-logo-mark" aria-hidden="true"></span>
          Mondo
        </NuxtLink>
        <h1 class="fm-page-title" style="margin-top: 32px">
          {{ is404 ? 'We could not find that page' : 'Something went wrong' }}
        </h1>
        <p class="fm-lede">
          {{
            is404
              ? 'The link may be old or mistyped.'
              : 'Please try again in a moment.'
          }}
        </p>
        <v-btn class="mt-6" color="primary" variant="flat" size="large" @click="goHome">
          Back to Mondo
        </v-btn>
      </div>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
const props = defineProps({ error: { type: Object, default: () => ({}) } })
const is404 = computed(() => (props.error as any)?.statusCode === 404)
useHead({ title: 'Mondo' })
const goHome = () => clearError({ redirect: '/' })
</script>
