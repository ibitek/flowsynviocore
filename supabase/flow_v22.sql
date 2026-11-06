alter table public.flow_conversations add column if not exists tree_node text;
create or replace function public.flow_begin(p_conversation uuid,p_key text,p_text text,p_page text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.flow_conversations%rowtype; b public.flow_bots%rowtype; j public.flow_jobs%rowtype; cfg jsonb; h jsonb;
begin
 select * into c from public.flow_conversations where id=p_conversation for update;
 if not found or c.expires_at<now() or c.state='resolved' then raise exception 'Conversation expired or resolved'; end if;
 select * into j from public.flow_jobs where conversation_id=c.id and request_key=p_key;
 if found then
  if j.user_text<>p_text then raise exception 'Request ID reused for different text';end if;
  return to_jsonb(j);
 end if;
 if c.pending_key is not null then raise exception 'Previous request pending. Retry its request ID.';end if;
 if (select count(*) from public.flow_messages where conversation_id=c.id)>=400 then raise exception 'Conversation limit reached. Start a new chat.';end if;
 select * into b from public.flow_bots where id=c.bot_id;
 cfg=case when c.preview then b.draft else b.live end;
 cfg=jsonb_set(cfg,'{treeNode}',to_jsonb(coalesce(c.tree_node,'')));
 cfg=jsonb_set(cfg,'{pageContext}',to_jsonb(left(p_page,2000)));
 if c.state in ('waiting','human') and cfg->>'mode'<>'ai' then cfg=jsonb_set(cfg,'{mode}','"human"');end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]') into h from
 (select role,content,created_at from public.flow_messages where conversation_id=c.id order by created_at desc,id desc limit 8) x;
 insert into public.flow_jobs values(c.id,p_key,p_text,cfg,h,null) returning * into j;
 insert into public.flow_messages(conversation_id,role,content,request_key) values(c.id,'user',p_text,p_key);
 update public.flow_conversations set pending_key=p_key where id=c.id;
 return to_jsonb(j);
end $$;

create or replace function public.flow_finish(p_conversation uuid,p_key text,p_result jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.flow_jobs%rowtype;
begin
 perform 1 from public.flow_conversations where id=p_conversation for update;
 select * into j from public.flow_jobs where conversation_id=p_conversation and request_key=p_key for update;
 if not found then raise exception 'Request missing';end if;
 if j.result is not null then return j.result;end if;
 if coalesce(p_result->>'reply','')<>'' then
 insert into public.flow_messages(conversation_id,role,content,request_key) values(p_conversation,'assistant',p_result->>'reply',p_key) on conflict do nothing;
 end if;
 update public.flow_jobs set result=p_result where conversation_id=p_conversation and request_key=p_key;
 update public.flow_conversations set tree_node=p_result->>'treeNode',pending_key=null where id=p_conversation and pending_key=p_key;
 return p_result;
end $$;

