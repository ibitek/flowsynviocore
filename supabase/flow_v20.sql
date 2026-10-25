-- Run once in the shared Supabase project before deploying V20.
alter table public.flow_bots add column if not exists deleted_at timestamptz;
create or replace function public.flow_delete_bot(p_bot uuid,p_org uuid,p_revision integer) returns boolean
language plpgsql security definer set search_path=public as $$
declare b public.flow_bots;
begin
 select * into b from public.flow_bots where id=p_bot and organization_id=p_org for update;
 if not found or b.deleted_at is not null then raise exception 'Assistant unavailable';end if;
 if b.revision<>p_revision then raise exception 'Refresh before deleting';end if;
 if exists(select 1 from public.flow_conversations where bot_id=p_bot and (pending_key is not null or state in ('waiting','human'))) then raise exception 'Resolve human chats and pending replies before deleting';end if;
 update public.flow_bots set deleted_at=now(),published=false,connected=false,revision=revision+1 where id=p_bot;
 update public.flow_keys set revoked_at=now() where bot_id=p_bot and revoked_at is null;
 return true;
end $$;
revoke all on function public.flow_delete_bot(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.flow_delete_bot(uuid,uuid,integer) to service_role;
