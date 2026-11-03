-- Run ONCE in the Supabase SQL Editor, right before you switch Bridge from a
-- sandbox key (sk-test...) to a live key.
--
-- Why: identity checks and bank accounts made in the Bridge sandbox exist only
-- there. A live key cannot see them, so every saved record would fail. This
-- removes the saved sandbox records, and each user starts again with a real
-- identity check on the live site.
--
-- Do NOT run this once real customers have bank accounts. It would disconnect
-- them from their accounts.

delete from public.bank_accounts;
delete from public.bank_customers;
