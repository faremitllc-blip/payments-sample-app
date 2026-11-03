<template>
  <div class="mo-card mo-ring">
    <div class="mo-ring-head">
      <span class="mo-ring-icon" :class="tone" aria-hidden="true">
        <v-icon size="20">{{ icon }}</v-icon>
      </span>
      <h2>{{ label }}</h2>
    </div>

    <svg
      class="mo-ring-svg"
      viewBox="0 0 100 100"
      role="img"
      :aria-label="`${label} this month compared with your best month of the last six`"
    >
      <circle cx="50" cy="50" :r="R" class="mo-ring-track" />
      <circle
        v-if="fill > 0"
        cx="50"
        cy="50"
        :r="R"
        class="mo-ring-arc"
        :class="tone"
        :stroke-dasharray="`${dash} ${C}`"
        transform="rotate(-90 50 50)"
      />
    </svg>

    <p class="mo-ring-amount">${{ amount }}</p>
    <p class="mo-ring-note" :class="changeClass">
      <v-icon v-if="change !== null" size="16" aria-hidden="true">
        {{ change >= 0 ? 'mdi-menu-up' : 'mdi-menu-down' }}
      </v-icon>
      {{ note }}
    </p>
  </div>
</template>

<script setup lang="ts">
const props = defineProps({
  label: { type: String, required: true },
  icon: { type: String, required: true },
  tone: { type: String, default: 'in' },
  amount: { type: String, required: true },
  fill: { type: Number, default: 0 },
  change: { type: Number, default: null },
})

const R = 38
const C = 2 * Math.PI * R
const dash = computed(() => C * Math.min(1, Math.max(0, props.fill)))

const note = computed(() => {
  if (props.change === null) {
    return 'This month, USDC'
  }
  return `${Math.abs(props.change)}% vs last month`
})

const changeClass = computed(() =>
  props.change === null ? '' : props.change >= 0 ? 'is-up' : 'is-down',
)
</script>
