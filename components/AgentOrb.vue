<template>
  <span class="mo-orb" :class="`is-${size}`" :data-busy="busy ? 'true' : 'false'" aria-hidden="true">
    <span class="mo-orb-glow"></span>
    <span class="mo-orb-body"></span>
    <span class="mo-orb-shine"></span>
  </span>
</template>

<script setup lang="ts">
defineProps({
  size: { type: String, default: 'lg' },
  busy: { type: Boolean, default: false },
})
</script>
