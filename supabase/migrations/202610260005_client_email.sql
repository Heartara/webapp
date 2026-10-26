-- Incremental upgrade: store owner/client email conversations in the CRM.
begin;
create table public.client_email_threads(
 id uuid primary key default gen_random_uuid(), enquiry_id uuid unique references public.enquiries(id),
 contact_id uuid references public.contacts(id), recipient_email text not null, subject text not null check(length(subject) between 1 and 240),
 reply_token_hash text, revoked boolean not null default false, created_at timestamptz not null default now(),
 check(enquiry_id is not null or contact_id is not null)
);
create index contact_email_threads on public.client_email_threads(contact_id);
create table public.client_email_messages(
 id uuid primary key default gen_random_uuid(), thread_id uuid not null references public.client_email_threads(id),
 request_key uuid unique, direction text not null check(direction in ('inbound','outbound')),
 subject text not null, body text not null check(length(body)<=12000),
 status text not null check(status in ('queued','provider_accepted','delivered','bounced','failed','received','cancelled')),
 provider_id text unique, rfc_message_id text, attachment_count integer not null default 0,
 created_at timestamptz not null default now(), actor_id uuid references auth.users(id)
);
create index client_message_history on public.client_email_messages(thread_id,created_at);
alter table public.client_email_threads enable row level security;
alter table public.client_email_messages enable row level security;
revoke all on public.client_email_threads,public.client_email_messages from public,anon,authenticated;
grant select on public.client_email_threads,public.client_email_messages to authenticated;
grant all on public.client_email_threads,public.client_email_messages to service_role;
create policy owner_email_threads on public.client_email_threads for select to authenticated using(crm_private.is_owner());
create policy owner_email_messages on public.client_email_messages for select to authenticated using(crm_private.is_owner());

create function public.queue_client_email(p_key uuid,p_subject text,p_body text,p_enquiry uuid default null,p_contact uuid default null,p_thread uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.client_email_threads; previous public.client_email_messages; e public.enquiries; recipient text; mid uuid; cid uuid;
begin
 if not crm_private.is_owner() then raise exception 'Owner only';end if;
 if length(btrim(p_subject)) not between 1 and 240 or length(btrim(p_body)) not between 1 and 12000 then raise exception 'Subject and message are required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,775));
 select * into previous from public.client_email_messages where request_key=p_key;
 if found then
  select * into t from public.client_email_threads where id=previous.thread_id;
  if previous.subject<>btrim(p_subject) or previous.body<>p_body or (p_enquiry is not null and t.enquiry_id is distinct from p_enquiry) or (p_contact is not null and t.contact_id is distinct from p_contact) or (p_thread is not null and p_thread<>t.id) then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return previous.id;
 end if;
 if (select count(*) from public.client_email_messages where direction='outbound' and created_at>now()-interval '24 hours')>=100 then raise exception 'Daily sending limit reached';end if;
 if p_enquiry is null and p_contact is null then raise exception 'Choose an enquiry or contact';end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(p_enquiry,p_contact)::text,776));
 if p_enquiry is not null then
  select * into strict e from public.enquiries where id=p_enquiry;
  if p_contact is not null and p_contact is distinct from e.contact_id then raise exception 'Contact does not match enquiry';end if;
  if e.status='spam' or e.details='{}'::jsonb then raise exception 'This enquiry is unavailable for email';end if;
  recipient=btrim(e.details->>'email');cid=e.contact_id;
 else
  select email_original into recipient from public.contacts where id=p_contact and archived_at is null;cid=p_contact;
 end if;
 if recipient is null or recipient !~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$' then raise exception 'A valid client email is required';end if;
 if cid is not null and not exists(select 1 from public.contacts where id=cid and archived_at is null) then raise exception 'Contact unavailable';end if;
 if p_thread is not null then
  select * into strict t from public.client_email_threads where id=p_thread and not revoked;
  if (p_enquiry is not null and t.enquiry_id is distinct from p_enquiry) or (p_enquiry is null and t.contact_id is distinct from p_contact) then raise exception 'Conversation does not match this record';end if;
 else
  select * into t from public.client_email_threads where not revoked and ((p_enquiry is not null and enquiry_id=p_enquiry) or (p_enquiry is null and enquiry_id is null and contact_id=p_contact)) order by created_at desc limit 1;
  if not found then insert into public.client_email_threads(enquiry_id,contact_id,recipient_email,subject) values(p_enquiry,cid,recipient,btrim(p_subject)) returning * into t;end if;
 end if;
 if lower(btrim(t.recipient_email))<>lower(btrim(recipient)) then raise exception 'Client email changed; review conversation before sending';end if;
 insert into public.client_email_messages(thread_id,request_key,direction,subject,body,status,actor_id) values(t.id,p_key,'outbound',btrim(p_subject),p_body,'queued',auth.uid()) returning id into mid;
 insert into public.notification_outbox(deduplication_key,template) values('client-email:'||mid,'client_reply');
 -- Follow-up is updated when the provider accepts the email, not when a draft is queued.
 insert into public.activity_events(entity,record_id,action,actor_id) values('client_email_messages',mid,'email_queued',auth.uid());
 return mid;
end $$;
revoke all on function public.queue_client_email(uuid,text,text,uuid,uuid,uuid) from public,anon;
grant execute on function public.queue_client_email(uuid,text,text,uuid,uuid,uuid) to authenticated;

create or replace function public.claim_notifications(p_limit integer default 10) returns setof public.notification_outbox language plpgsql security definer set search_path='' as $$
begin
 return query update public.notification_outbox set status='processing',attempts=attempts+1,lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid(),updated_at=now()
 where id in(select id from public.notification_outbox where template not in ('customer_email_confirmation','client_reply') and (status='queued' or(status='processing' and lease_until<now())) and next_attempt_at<=now() and attempts<6 order by created_at for update skip locked limit least(p_limit,25)) returning *;
 update public.notification_outbox set status='failed',safe_error='Worker lease expired after retry limit' where status='processing' and lease_until<now() and attempts>=6;
end $$;
create function public.claim_client_emails(p_limit integer default 10) returns setof public.notification_outbox language plpgsql security definer set search_path='' as $$
begin
 return query update public.notification_outbox set status='processing',attempts=attempts+1,lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid(),updated_at=now()
 where id in(select id from public.notification_outbox where template='client_reply' and(status='queued' or(status='processing' and lease_until<now())) and next_attempt_at<=now() and attempts<6 order by created_at for update skip locked limit least(p_limit,25)) returning *;
end $$;
revoke all on function public.claim_client_emails(integer) from public,anon,authenticated;
grant execute on function public.claim_client_emails(integer) to service_role;

create function crm_private.track_client_email_status() returns trigger language plpgsql security definer set search_path='' as $$
declare m public.client_email_messages; t public.client_email_threads;
begin
 if new.template<>'client_reply' then return new;end if;
 select * into m from public.client_email_messages where id::text=replace(new.deduplication_key,'client-email:','');
 if not found then return new;end if;
 if new.status in ('queued','provider_accepted','delivered','bounced','failed') then
  update public.client_email_messages set status=new.status,provider_id=coalesce(new.provider_id,provider_id) where id=m.id and status<>'cancelled';
 end if;
 if new.status='provider_accepted' and old.status<>'provider_accepted' then
  select * into t from public.client_email_threads where id=m.thread_id and not revoked;
  if found and t.enquiry_id is not null then update public.enquiries set status='awaiting_customer',closed_reason=null where id=t.enquiry_id and status not in ('closed','spam');end if;
 end if;
 return new;
end $$;
revoke all on function crm_private.track_client_email_status() from public,anon,authenticated;
create trigger track_client_email_status after update on public.notification_outbox for each row execute function crm_private.track_client_email_status();

create function public.record_client_email_reply(p_thread uuid,p_hash text,p_provider text,p_sender text,p_subject text,p_body text,p_rfc_id text default null,p_attachments integer default 0) returns boolean language plpgsql security definer set search_path='' as $$
declare t public.client_email_threads; mid uuid;
begin
 select * into t from public.client_email_threads where id=p_thread for update;
 if not found or t.revoked or t.reply_token_hash is null or t.reply_token_hash<>p_hash or lower(btrim(t.recipient_email))<>lower(btrim(p_sender)) then return false;end if;
 if exists(select 1 from public.client_email_messages where provider_id=p_provider) then return false;end if;
 insert into public.client_email_messages(thread_id,direction,subject,body,status,provider_id,rfc_message_id,attachment_count) values(t.id,'inbound',left(p_subject,240),left(p_body,12000),'received',p_provider,left(p_rfc_id,998),greatest(0,least(p_attachments,100))) returning id into mid;
 if t.enquiry_id is not null then update public.enquiries set status='in_progress' where id=t.enquiry_id and status not in ('closed','spam');end if;
 insert into public.notification_outbox(deduplication_key,template) values('client-reply-alert:'||mid,'owner_client_reply');
 insert into public.activity_events(entity,record_id,action) values('client_email_messages',mid,'client_reply_received');
 return true;
end $$;
revoke all on function public.record_client_email_reply(uuid,text,text,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.record_client_email_reply(uuid,text,text,text,text,text,text,integer) to service_role;

create function crm_private.sync_client_email_record() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='enquiries' then
  update public.client_email_threads set contact_id=new.contact_id where enquiry_id=new.id;
 end if;
 if current_setting('heartara.reviewed_erasure',true)='yes' then
  update public.client_email_threads set revoked=true,recipient_email='[removed]',subject='[removed]',reply_token_hash=null where (tg_table_name='contacts' and contact_id=new.id) or(tg_table_name='enquiries' and enquiry_id=new.id);
  update public.client_email_messages set body='[removed]',subject='[removed]',rfc_message_id=null,status='cancelled' where thread_id in(select id from public.client_email_threads where revoked);
  update public.notification_outbox set status='failed',safe_error='Client email cancelled after erasure',lease_token=null,lease_until=null where template='client_reply' and status in ('queued','processing') and replace(deduplication_key,'client-email:','') in(select m.id::text from public.client_email_messages m join public.client_email_threads t on t.id=m.thread_id where t.revoked);
 end if;
 return new;
end $$;
revoke all on function crm_private.sync_client_email_record() from public,anon,authenticated;
create trigger sync_enquiry_client_email after update on public.enquiries for each row execute function crm_private.sync_client_email_record();
create trigger erase_contact_client_email after update on public.contacts for each row execute function crm_private.sync_client_email_record();
create function crm_private.merge_client_email_history() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.entity='contacts' and new.action='merge' and new.metadata ? 'archived_contact' then
  update public.client_email_threads set contact_id=new.record_id where contact_id=(new.metadata->>'archived_contact')::uuid;
 end if;return new;
end $$;
revoke all on function crm_private.merge_client_email_history() from public,anon,authenticated;
create trigger merge_client_email_history after insert on public.activity_events for each row execute function crm_private.merge_client_email_history();
commit;
