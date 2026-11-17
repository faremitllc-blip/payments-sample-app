// Salt Edge calls this address when a payment changes. Nothing is trusted or changed from the
// call itself: payments are always read back from Salt Edge when the customer returns, so this
// only has to answer "received".
export default defineEventHandler(() => ({ received: true }))
