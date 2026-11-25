-- Owner instructions on AI calls (docs/sales-calls.md → "Calls with your instructions").
-- The owner tells the AI what to do on a call to a lead ("ask if they still want the spring
-- cleanup, mention we have Tuesday open, offer the 10% repeat-customer discount") from the app
-- or by text. Stored on the call so retries carry them and the result text can answer them.
-- Additive only; rollback: supabase/rollback/20261125100000_sales_call_instructions.down.sql.

alter table public.sales_calls
  add column if not exists instructions text,
  add column if not exists requested_by_profile_id uuid references public.profiles (id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_calls_instructions_len') then
    alter table public.sales_calls
      add constraint sales_calls_instructions_len check (instructions is null or char_length(instructions) between 1 and 1000);
  end if;
end $$;

comment on column public.sales_calls.instructions is
  'What the owner told the AI to do on this call (owner_request only), up to 1000 characters. Trusted owner text; the call prompt still applies every compliance rule.';
comment on column public.sales_calls.requested_by_profile_id is
  'The signed-in user who asked for the call in the app (null for text requests and lead calls).';
