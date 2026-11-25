-- Rollback for 20261125100000_sales_call_instructions.sql (drops the owner's call instructions).
alter table public.sales_calls drop constraint if exists sales_calls_instructions_len;
alter table public.sales_calls drop column if exists requested_by_profile_id;
alter table public.sales_calls drop column if exists instructions;
