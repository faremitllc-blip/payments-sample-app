# Design references

- `agent-reference.png` – UI/UX reference for the Mondo AI assistant (iridescent
  orb, "How can I help you today?" greeting, suggestion cards, "Ask anything"
  pill input, frosted-glass cards on a pastel gradient). The web assistant
  (`pages/assistant.vue`) follows it. Keep it: the same design will be used for
  the mobile apps.

## Assistant rules to keep on mobile

- The assistant can read freely (balance, activity, bank status).
- Anything that moves money or changes the account is only *proposed*. The app
  shows an approval card with the exact details and runs the action through the
  normal API only after the user taps Approve.
- The server never executes an action itself. It never sees the user's keys.
