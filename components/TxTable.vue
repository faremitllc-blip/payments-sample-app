<template>
  <div class="mo-table" role="table" aria-label="Recent transactions">
    <div class="mo-tr mo-th" role="row">
      <span role="columnheader">Transfer</span>
      <span role="columnheader">Date</span>
      <span role="columnheader">Status</span>
      <span role="columnheader" class="mo-td-amount">Amount</span>
    </div>

    <div v-if="items.length === 0" class="mo-table-empty">
      <h3>No activity yet</h3>
      <p>Money you send or receive will show up here.</p>
    </div>

    <div v-for="item in items" :key="item.id" class="mo-tr" role="row">
      <span class="mo-td-who" role="cell">
        <span class="mo-tx-icon" :class="item.direction" aria-hidden="true">
          <v-icon size="20">
            {{
              item.direction === 'sent'
                ? 'mdi-arrow-top-right'
                : 'mdi-arrow-bottom-left'
            }}
          </v-icon>
        </span>
        <span class="mo-td-name">
          <strong>
            {{ item.direction === 'sent' ? 'Sent to' : 'Received from' }}
          </strong>
          <small>
            {{ item.counterparty ? shortAddress(item.counterparty) : 'a wallet' }}
          </small>
        </span>
      </span>
      <span class="mo-td-date" role="cell">{{ formatDate(item.date) }}</span>
      <span role="cell">
        <span class="mo-status" :class="`is-${statusKind(item.state)}`">
          {{ stateLabel(item.state) }}
        </span>
      </span>
      <span
        class="mo-td-amount"
        :class="item.direction === 'received' ? 'fm-amount-in' : ''"
        role="cell"
      >
        {{ item.direction === 'sent' ? '−' : '+' }}{{ formatUsdc(item.amount) }}
        USDC
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  formatDate,
  formatUsdc,
  shortAddress,
  stateLabel,
} from '~/composables/useWallet'
import type { ActivityItem } from '~/composables/useWallet'
import { statusKind } from '~/utils/activityStats'

defineProps({
  items: { type: Array as () => ActivityItem[], required: true },
})
</script>
