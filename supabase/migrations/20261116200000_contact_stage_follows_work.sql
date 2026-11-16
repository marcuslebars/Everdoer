-- Customers moves people along the pipeline by itself (16 Nov 2026).
-- Nothing moved a contact's stage except the owner dragging it: 7 A1 contacts with invoices were
-- still "lead", so "new leads to look at" on Today counted paying customers.
--
-- Forward-only rules (never moves anyone backwards, never touches a stage the owner set higher):
--   quote sent / viewed                                  → lead becomes qualified
--   quote approved / deposit paid / completed            → active
--   invoice sent / viewed / partly paid / paid           → active
--   booking requested (pending)                          → lead becomes qualified
--   booking confirmed / completed                        → active
-- "active" also reopens a closed contact: new work means they're a customer again.
-- Drafts, void, cancelled, expired and no-shows never move anyone.
-- Runs as a trigger, so it covers every path (app, AI, owner texts, intake, imports). It does not
-- emit contact.stage_changed workflow events (those come from the app's own stage changes).

create or replace function public.contact_stage_advance(p_contact_id uuid, p_target text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_contact_id is null then
    return;
  end if;
  if p_target = 'active' then
    update public.contacts
       set stage = 'active'
     where id = p_contact_id
       and stage in ('lead', 'qualified', 'closed');
  elsif p_target = 'qualified' then
    update public.contacts
       set stage = 'qualified'
     where id = p_contact_id
       and stage = 'lead';
  end if;
end;
$$;

revoke all on function public.contact_stage_advance(uuid, text) from public, anon, authenticated;

create or replace function public.trg_contact_stage_from_quote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status and new.contact_id is not distinct from old.contact_id then
    return new;
  end if;
  if new.status in ('approved', 'deposit_paid', 'completed') then
    perform public.contact_stage_advance(new.contact_id, 'active');
  elsif new.status in ('sent', 'viewed') then
    perform public.contact_stage_advance(new.contact_id, 'qualified');
  end if;
  return new;
end;
$$;

create or replace function public.trg_contact_stage_from_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status and new.contact_id is not distinct from old.contact_id then
    return new;
  end if;
  if new.status in ('sent', 'viewed', 'partially_paid', 'paid') then
    perform public.contact_stage_advance(new.contact_id, 'active');
  end if;
  return new;
end;
$$;

create or replace function public.trg_contact_stage_from_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status and new.contact_id is not distinct from old.contact_id then
    return new;
  end if;
  if new.status::text in ('confirmed', 'completed') then
    perform public.contact_stage_advance(new.contact_id, 'active');
  elsif new.status::text = 'pending' then
    perform public.contact_stage_advance(new.contact_id, 'qualified');
  end if;
  return new;
end;
$$;

revoke all on function public.trg_contact_stage_from_quote() from public, anon, authenticated;
revoke all on function public.trg_contact_stage_from_invoice() from public, anon, authenticated;
revoke all on function public.trg_contact_stage_from_booking() from public, anon, authenticated;

drop trigger if exists contact_stage_from_quote on public.quotes;
create trigger contact_stage_from_quote
  after insert or update of status, contact_id on public.quotes
  for each row execute function public.trg_contact_stage_from_quote();

drop trigger if exists contact_stage_from_invoice on public.invoices;
create trigger contact_stage_from_invoice
  after insert or update of status, contact_id on public.invoices
  for each row execute function public.trg_contact_stage_from_invoice();

drop trigger if exists contact_stage_from_booking on public.bookings;
create trigger contact_stage_from_booking
  after insert or update of status, contact_id on public.bookings
  for each row execute function public.trg_contact_stage_from_booking();

-- Backfill, forward-only from lead/qualified (a contact the owner closed stays closed here:
-- old work shouldn't reopen it; only new work does, through the triggers).
update public.contacts c set stage = 'active'
 where c.stage in ('lead', 'qualified')
   and (
     exists (select 1 from public.invoices i where i.contact_id = c.id and i.status in ('sent', 'viewed', 'partially_paid', 'paid'))
     or exists (select 1 from public.quotes q where q.contact_id = c.id and q.status in ('approved', 'deposit_paid', 'completed'))
     or exists (select 1 from public.bookings b where b.contact_id = c.id and b.status::text in ('confirmed', 'completed'))
   );

update public.contacts c set stage = 'qualified'
 where c.stage = 'lead'
   and (
     exists (select 1 from public.quotes q where q.contact_id = c.id and q.status in ('sent', 'viewed'))
     or exists (select 1 from public.bookings b where b.contact_id = c.id and b.status::text = 'pending')
   );
