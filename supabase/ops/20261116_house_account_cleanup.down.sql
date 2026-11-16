-- Rollback for 20261116_house_account_cleanup.sql: put stages and task statuses back.
begin;
update public.contacts c set stage = b.old_value::public.contact_stage
from decommission.ops_backup_house_cleanup_20261116 b where b.kind = 'contact_stage' and b.id = c.id;
update public.tasks t set status = b.old_value::public.task_status
from decommission.ops_backup_house_cleanup_20261116 b where b.kind = 'task_status' and b.id = t.id;
drop table if exists decommission.ops_backup_house_cleanup_20261116;
commit;
