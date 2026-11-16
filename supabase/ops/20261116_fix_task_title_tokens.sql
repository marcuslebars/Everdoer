-- One-off data fix (16 Nov 2026): workflow tasks were created with the literal token
-- "{{contact.first_name}}" in the title (e.g. "Follow up with {{contact.first_name}} — no activity
-- in 3 days"), because task titles only filled bare tokens. Fill it with the contact's first name,
-- or "this lead" when there's none. New tasks render it (renderTaskText).
-- Old titles are kept in decommission.ops_backup_task_titles; the .down.sql restores them.
begin;

-- Backups go in the private decommission schema (not exposed by the API), like the 14 Oct one.
create schema if not exists decommission;
revoke all on schema decommission from public;

create table if not exists decommission.ops_backup_task_titles (
  id uuid primary key,
  old_title text not null
);

insert into decommission.ops_backup_task_titles (id, old_title)
select t.id, t.title from public.tasks t where t.title like '%{{contact.first_name}}%'
on conflict do nothing;

update public.tasks t
set title = replace(
  replace(t.title, 'with {{contact.first_name}} —', 'with ' || coalesce(nullif(trim(c.first_name), ''), 'this lead') || ' —'),
  '{{contact.first_name}}', coalesce(nullif(trim(c.first_name), ''), 'this lead')
)
from public.tasks t2
left join public.contacts c on c.id = t2.contact_id
where t.id = t2.id and t.title like '%{{contact.first_name}}%';

select count(*) as titles_left_with_token from public.tasks where title like '%{{%';  -- expect 0

commit;
