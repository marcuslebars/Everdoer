-- Privilege + shape tests for 20261030100000_agent_blueprints.sql.
--   • agent_blueprints / agent_blueprint_applications: RLS on, no client access at all;
--   • companies.agent_persona defaults to {};
--   • (name, version) unique; one default blueprint per pack; a default needs a pack;
--   • content must be a schema-1 object; junk names / modes refused;
--   • an application's company must be the same org's; a used blueprint can't be deleted.
\set ON_ERROR_STOP on
set client_min_messages = notice;
reset role;

do $$
declare
  t text;
  r text;
  p text;
begin
  raise notice '== agent blueprints: RLS on, no client access';
  foreach t in array array['public.agent_blueprints','public.agent_blueprint_applications'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then raise exception 'FAIL % has RLS off', t; end if;
    foreach r in array array['anon','authenticated'] loop
      foreach p in array array['SELECT','INSERT','UPDATE','DELETE'] loop
        if has_table_privilege(r, t, p) then raise exception 'FAIL % has % on %', r, p, t; end if;
      end loop;
    end loop;
  end loop;
  raise notice 'ok   both tables: RLS on, no anon/authenticated privileges';
end $$;

insert into public.organizations (id, name, slug) values
  ('0c200000-0000-4000-8000-000000000001', 'Blueprint Test', 'blueprint-test'),
  ('0c200000-0000-4000-8000-000000000002', 'Blueprint Other', 'blueprint-other')
on conflict do nothing;
insert into public.companies (id, organization_id, name, slug) values
  ('0c300000-0000-4000-8000-000000000001', '0c200000-0000-4000-8000-000000000001', 'Northshore', 'northshore-bp'),
  ('0c300000-0000-4000-8000-000000000002', '0c200000-0000-4000-8000-000000000002', 'Elsewhere', 'elsewhere-bp')
on conflict do nothing;

do $$
begin
  raise notice '== persona default';
  if (select agent_persona from public.companies where id = '0c300000-0000-4000-8000-000000000001') <> '{}'::jsonb then
    raise exception 'FAIL agent_persona should default to {}';
  end if;
  raise notice 'ok   companies.agent_persona defaults to {}';
end $$;

insert into public.agent_blueprints (id, name, version, pack_id, default_for_pack, content, created_by) values
  ('0c500000-0000-4000-8000-000000000001', 'Snow pro', 1, 'property-maintenance-snow', true, '{"schema":1}', 'operator'),
  ('0c500000-0000-4000-8000-000000000002', 'Snow pro', 2, 'property-maintenance-snow', false, '{"schema":1}', 'operator');

do $$
begin
  raise notice '== constraints';
  begin
    insert into public.agent_blueprints (name, version, content, created_by) values ('Snow pro', 1, '{"schema":1}', 'operator');
    raise exception 'FAIL a duplicate name + version was accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.agent_blueprints (name, version, pack_id, default_for_pack, content, created_by) values ('Snow pro', 3, 'property-maintenance-snow', true, '{"schema":1}', 'operator');
    raise exception 'FAIL a second default for the same pack was accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.agent_blueprints (name, version, default_for_pack, content, created_by) values ('No pack', 1, true, '{"schema":1}', 'operator');
    raise exception 'FAIL a default without a pack was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.agent_blueprints (name, version, content, created_by) values ('Bad content', 1, '{"schema":2}', 'operator');
    raise exception 'FAIL a non-schema-1 content was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.agent_blueprints (name, version, content, created_by) values ('<script>', 1, '{"schema":1}', 'operator');
    raise exception 'FAIL a junk name was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.agent_blueprint_applications (blueprint_id, organization_id, company_id, mode, applied_by, previous) values
      ('0c500000-0000-4000-8000-000000000001', '0c200000-0000-4000-8000-000000000001', '0c300000-0000-4000-8000-000000000002', 'full', 'operator', '{}');
    raise exception 'FAIL an application to another org''s company was accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.agent_blueprint_applications (blueprint_id, organization_id, company_id, mode, applied_by, previous) values
      ('0c500000-0000-4000-8000-000000000001', '0c200000-0000-4000-8000-000000000001', '0c300000-0000-4000-8000-000000000001', 'everything', 'operator', '{}');
    raise exception 'FAIL a junk mode was accepted';
  exception when check_violation then null;
  end;
  insert into public.agent_blueprint_applications (blueprint_id, organization_id, company_id, mode, applied_by, previous) values
    ('0c500000-0000-4000-8000-000000000001', '0c200000-0000-4000-8000-000000000001', '0c300000-0000-4000-8000-000000000001', 'tuning', 'operator', '{}');
  begin
    delete from public.agent_blueprints where id = '0c500000-0000-4000-8000-000000000001';
    raise exception 'FAIL a blueprint with applications was deleted';
  exception when foreign_key_violation then null;
  end;
  raise notice 'ok   unique name+version, one default per pack, schema-1 content, same-org targets, used blueprints kept';
end $$;
