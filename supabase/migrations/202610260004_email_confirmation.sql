-- Incremental upgrade for an existing Heartara CRM. Do not rerun the full installer.
begin;
alter table public.business_settings add column email_confirmation_enabled boolean not null default false;
create table public.email_verifications (
 id uuid primary key default gen_random_uuid(), enquiry_id uuid not null references public.enquiries(id),
 submission_id uuid not null references public.form_submissions(id), email_original text not null,
 email_normalised text generated always as (lower(btrim(email_original))) stored,
 status text not null default 'pending' check(status in ('pending','confirmed','expired','superseded','rate_limited','revoked')),
 token_hash text, requested_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days',
 confirmed_at timestamptz, provider_email_id text unique,
 check(token_hash is null or token_hash ~ '^[a-f0-9]{64}$'),
 check(status<>'confirmed' or (confirmed_at is not null and provider_email_id is not null))
);
create unique index one_pending_email_verification on public.email_verifications(enquiry_id) where status='pending';
create index email_verification_recipient_rate on public.email_verifications(email_normalised,requested_at);
alter table public.email_verifications enable row level security;
revoke all on public.email_verifications from public,anon,authenticated;
grant select on public.email_verifications to authenticated;
grant all on public.email_verifications to service_role;
create policy verification_owner_read on public.email_verifications for select to authenticated using(crm_private.is_owner());
create table public.email_confirmation_events (
 provider_event_id text primary key, provider_email_id text not null unique,
 verification_id uuid not null references public.email_verifications(id),
 outcome text not null check(outcome in ('confirmed','expired','already_confirmed','inactive')),
 received_at timestamptz not null default now()
);
alter table public.email_confirmation_events enable row level security;
revoke all on public.email_confirmation_events from public,anon,authenticated;
grant select on public.email_confirmation_events to authenticated;
grant all on public.email_confirmation_events to service_role;
create policy confirmation_events_owner on public.email_confirmation_events for select to authenticated using(crm_private.is_owner());

create function crm_private.queue_email_confirmation(p_enquiry uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.enquiries; v public.email_verifications; vid uuid; email text; blocked boolean;
begin
 select * into strict e from public.enquiries where id=p_enquiry for update;
 if not exists(select 1 from public.business_settings where id=true and email_confirmation_enabled) then return null;end if;
 if e.submission_id is null then return null;end if;
 email=btrim(e.details->>'email');
 if email is null or email='' or e.status in ('spam','closed') then return null;end if;
 select * into v from public.email_verifications where enquiry_id=e.id order by requested_at desc limit 1;
 if found and v.status='confirmed' then return v.id;end if;
 if v.status='pending' and v.expires_at>now() and v.requested_at>now()-interval '15 minutes' then return v.id;end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(email),773));
 update public.email_verifications set status='superseded' where enquiry_id=e.id and status='pending';
 blocked=(select count(*)>=3 from public.email_verifications where email_normalised=lower(email) and requested_at>now()-interval '24 hours' and status<>'rate_limited');
 insert into public.email_verifications(enquiry_id,submission_id,email_original,status) values(e.id,e.submission_id,email,case when blocked then 'rate_limited' else 'pending' end) returning id into vid;
 if not blocked then insert into public.notification_outbox(submission_id,deduplication_key,template) values(e.submission_id,'email-confirmation:'||vid,'customer_email_confirmation');end if;
 insert into public.activity_events(entity,record_id,action,actor_id,metadata) values('enquiries',e.id,'email_confirmation_requested',auth.uid(),jsonb_build_object('queued',not blocked));
 return vid;
end $$;
revoke all on function crm_private.queue_email_confirmation(uuid) from public,anon,authenticated;
create function crm_private.queue_submission_confirmation() returns trigger language plpgsql security definer set search_path='' as $$
begin perform crm_private.queue_email_confirmation(new.id);return new;end $$;
revoke all on function crm_private.queue_submission_confirmation() from public,anon,authenticated;
create trigger queue_submission_confirmation after insert on public.enquiries for each row execute function crm_private.queue_submission_confirmation();
create function public.request_email_confirmation(p_enquiry uuid) returns uuid language plpgsql security definer set search_path='' as $$
begin if not crm_private.is_owner() then raise exception 'Owner only';end if;return crm_private.queue_email_confirmation(p_enquiry);end $$;
revoke all on function public.request_email_confirmation(uuid) from public,anon;
grant execute on function public.request_email_confirmation(uuid) to authenticated;

-- Owner notifications stay immediate. Confirmation jobs have a separate claim path.
create or replace function public.claim_notifications(p_limit integer default 10) returns setof public.notification_outbox language plpgsql security definer set search_path='' as $$
begin
 return query update public.notification_outbox set status='processing',attempts=attempts+1,lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid(),updated_at=now()
 where id in(select id from public.notification_outbox where template<>'customer_email_confirmation' and (status='queued' or (status='processing' and lease_until<now())) and next_attempt_at<=now() and attempts<6 order by created_at for update skip locked limit least(p_limit,25)) returning *;
 update public.notification_outbox set status='failed',safe_error='Worker lease expired after retry limit' where status='processing' and lease_until<now() and attempts>=6;
end $$;
create function public.claim_confirmation_notifications(p_limit integer default 10) returns setof public.notification_outbox language plpgsql security definer set search_path='' as $$
begin
 return query update public.notification_outbox set status='processing',attempts=attempts+1,lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid(),updated_at=now()
 where id in(select id from public.notification_outbox where template='customer_email_confirmation' and (status='queued' or (status='processing' and lease_until<now())) and next_attempt_at<=now() and attempts<6 order by created_at for update skip locked limit least(p_limit,25)) returning *;
end $$;
revoke all on function public.claim_confirmation_notifications(integer) from public,anon,authenticated;
grant execute on function public.claim_confirmation_notifications(integer) to service_role;

create function public.confirm_email_reply(p_event text,p_email_id text,p_verification uuid,p_hash text,p_sender text) returns boolean language plpgsql security definer set search_path='' as $$
declare v public.email_verifications;
begin
 if exists(select 1 from public.email_confirmation_events where provider_event_id=p_event or provider_email_id=p_email_id) then return false;end if;
 select * into v from public.email_verifications where id=p_verification for update;
 if not found or v.token_hash is null or v.token_hash<>p_hash or v.email_normalised<>lower(btrim(p_sender)) then return false;end if;
 if exists(select 1 from public.email_confirmation_events where provider_event_id=p_event or provider_email_id=p_email_id) then return false;end if;
 if v.status<>'pending' then return false;end if;
 if v.expires_at<=now() then
  update public.email_verifications set status='expired' where id=v.id;
  insert into public.email_confirmation_events(provider_event_id,provider_email_id,verification_id,outcome) values(p_event,p_email_id,v.id,'expired') on conflict do nothing;
  return false;
 end if;
 update public.email_verifications set status='confirmed',confirmed_at=now(),provider_email_id=p_email_id where id=v.id;
 insert into public.email_confirmation_events(provider_event_id,provider_email_id,verification_id,outcome) values(p_event,p_email_id,v.id,'confirmed');
 insert into public.activity_events(entity,record_id,action,metadata) values('enquiries',v.enquiry_id,'email_confirmed_by_reply','{}');
 -- Do not change enquiry follow-up, create a contact, or grant marketing permission.
 return true;
end $$;
revoke all on function public.confirm_email_reply(text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.confirm_email_reply(text,text,uuid,text,text) to service_role;

-- An erased enquiry must not retain a deliverable challenge or recipient copy.
create function crm_private.revoke_erased_confirmations() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if current_setting('heartara.reviewed_erasure',true)='yes' then
  update public.email_verifications set status='revoked',email_original='[removed]',token_hash=null where enquiry_id=new.id;
  update public.notification_outbox set status='failed',safe_error='Confirmation cancelled after erasure',lease_token=null,lease_until=null where submission_id=new.submission_id and template='customer_email_confirmation' and status in ('queued','processing');
 end if;return new;
end $$;
revoke all on function crm_private.revoke_erased_confirmations() from public,anon,authenticated;
create trigger revoke_erased_confirmations after update on public.enquiries for each row execute function crm_private.revoke_erased_confirmations();
commit;
