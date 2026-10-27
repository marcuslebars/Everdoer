-- Rollback of 20261027100000_voice_overage_charges.sql (voice overage billing).
-- Invoice items already added in Stripe stay there (delete pending ones in the Stripe dashboard
-- if needed); nothing else references this table.
drop table if exists public.voice_overage_charges;
