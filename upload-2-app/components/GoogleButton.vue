<template>
  <div v-if="enabled" class="mo-google">
    <p class="mo-google-or"><span>or</span></p>
    <v-btn
      :href="href"
      block
      size="x-large"
      variant="outlined"
      color="secondary"
      prepend-icon="mdi-google"
    >
      Continue with Google
    </v-btn>
    <v-btn
      :href="appleHref"
      block
      size="x-large"
      variant="outlined"
      color="secondary"
      prepend-icon="mdi-apple"
      class="mt-3"
    >
      Continue with Apple
    </v-btn>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ next?: string }>()
const config = useRuntimeConfig()
const enabled = computed(() => Boolean(config.public.googleLogin))
const href = computed(
  () => `/api/auth/auth0/login?next=${encodeURIComponent(props.next || '/wallet')}`,
)
const appleHref = computed(() => `${href.value}&provider=apple`)
</script>

<style scoped>
.mo-google {
  margin-top: 20px;
}
.mo-google-or {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 16px;
  font-size: 0.85rem;
  opacity: 0.7;
}
.mo-google-or::before,
.mo-google-or::after {
  content: '';
  flex: 1;
  height: 1px;
  background: currentColor;
  opacity: 0.3;
}
</style>
