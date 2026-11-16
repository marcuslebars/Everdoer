-- Rollback for 20261116_fix_task_title_tokens.sql.
begin;
update public.tasks t set title = b.old_title from decommission.ops_backup_task_titles b where b.id = t.id;
drop table if exists decommission.ops_backup_task_titles;
commit;
