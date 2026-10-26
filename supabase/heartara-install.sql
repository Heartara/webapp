-- Heartara CRM: one-time installation on the supplied Supabase project.
-- Run in Supabase SQL Editor only after reviewing. Do not run the test bootstrap.
-- This creates CRM tables; it does not create a password or enable outgoing mail.

begin;
create extension if not exists pgcrypto;
create extension if not exists btree_gist;
create schema if not exists crm_private;
revoke all on schema crm_private from public;

create table public.staff_users (
 id uuid primary key references auth.users(id), display_name text not null check(length(display_name) between 1 and 120),
 role text not null check(role in ('owner','practitioner','assistant')), active boolean not null default true,
 require_mfa boolean not null default false, created_at timestamptz not null default now()
);
create function crm_private.staff_role() returns text language sql stable security definer set search_path='' as $$
 select role from public.staff_users where id=auth.uid() and active and (not require_mfa or auth.jwt()->>'aal'='aal2')
$$;
create function crm_private.is_owner() returns boolean language sql stable security definer set search_path='' as $$ select coalesce(crm_private.staff_role()='owner',false) $$;
grant usage on schema crm_private to authenticated;
grant execute on function crm_private.staff_role(), crm_private.is_owner() to authenticated;

create table public.business_settings (
 id boolean primary key default true check(id), timezone text not null default 'Australia/Brisbane' check(timezone='Australia/Brisbane'),
 notification_email text, notification_enabled boolean not null default false, private_address text,
 retention_policy text not null default 'Review retention categories with the business owner before launch.',
 updated_at timestamptz not null default now()
);
insert into public.business_settings(id) values(true);
create table public.services (
 id uuid primary key default gen_random_uuid(), key text not null unique, name text not null, category text not null,
 reiki_level text check(reiki_level in ('1','2','3a','Master')), description text not null default '',
 duration_minutes integer check(duration_minutes between 1 and 1440), buffer_before integer not null default 0 check(buffer_before between 0 and 120),
 buffer_after integer not null default 0 check(buffer_after between 0 and 120), price_minor integer check(price_minor>=0), currency text not null default 'AUD' check(currency='AUD'),
 status text not null default 'draft' check(status in ('draft','active','inactive')), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.services(key,name,category,duration_minutes,price_minor,description,reiki_level) values
 ('reiki-60','Reiki · 60 minutes','session',60,10000,'Draft catalogue: in-person Reiki.',null),
 ('reiki-90','Reiki · 90 minutes','session',90,12000,'Oracle reading and tuning forks included.',null),
 ('distance-60','Distance Reiki · 60 minutes','session',60,10000,'Phone/video check-ins included within the hour.',null),
 ('package-60','Three 60-minute Reiki sessions','package',60,28000,'Three session entitlements, manually arranged.',null),
 ('package-90','Three 90-minute Reiki sessions','package',90,34000,'Three session entitlements, manually arranged.',null),
 ('package-distance','Three distance Reiki sessions','package',60,28000,'Three distance session entitlements.',null),
 ('munay-individual','Individual nine Munay Ki rites','journey',null,45000,'Nine rites, individually paced. Price per person.',null),
 ('munay-group','Small-group nine Munay Ki rites','journey',null,30000,'Three gatherings, three rites each; maximum three people. Price per person.',null),
 ('attunement-1','Reiki 1 attunement','attunement',null,null,'Individual or group of up to three. Booklet, certificate and continued support. Price on enquiry.','1'),
 ('attunement-2','Reiki 2 attunement','attunement',null,null,'Individual or group of up to three. Booklet, certificate and continued support. Price on enquiry.','2'),
 ('attunement-3a','Reiki 3a attunement','attunement',null,null,'Individual or group of up to three. Booklet, certificate and continued support. Price on enquiry.','3a'),
 ('attunement-master','Reiki Master attunement','attunement',null,null,'Individual or group of up to three. Booklet, certificate and continued support. Price on enquiry.','Master');
create table public.contacts (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120), email_original text,
 email_normalised text generated always as (lower(btrim(email_original))) stored,
 phone text check(length(phone)<=40), preference text not null default 'email' check(preference in ('email','phone','either')),
 source text not null default 'manual', assigned_to uuid references public.staff_users(id), archived_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index contacts_email on public.contacts(email_normalised);
create index contacts_assigned on public.contacts(assigned_to);
create function crm_private.contact_access(cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select crm_private.is_owner() or (crm_private.staff_role() in ('assistant','practitioner') and exists(select 1 from public.contacts where id=cid and assigned_to=auth.uid()))
$$;
grant execute on function crm_private.contact_access(uuid) to authenticated;
create table public.form_submissions (
 id uuid primary key default gen_random_uuid(), idempotency_key uuid not null unique, payload_hash text not null,
 form_key text not null, source_page text not null, original_payload jsonb not null, received_at timestamptz not null default now()
);
create table public.enquiries (
 id uuid primary key default gen_random_uuid(), submission_id uuid unique references public.form_submissions(id), contact_id uuid references public.contacts(id),
 status text not null default 'new' check(status in ('new','in_progress','awaiting_customer','converted','closed','spam')),
 topic text not null, service_id uuid references public.services(id), owner_id uuid references public.staff_users(id),
 original_message text not null check(length(original_message)<=4000), source_page text not null, details jsonb not null default '{}',
 closed_reason text, received_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(status<>'closed' or length(btrim(closed_reason))>0), check(status<>'converted' or contact_id is not null)
);
create index enquiries_status on public.enquiries(status,received_at desc);
create index enquiries_owner on public.enquiries(owner_id);
create table public.feedback (
 id uuid primary key default gen_random_uuid(), submission_id uuid unique references public.form_submissions(id),
 display_name text not null check(length(display_name) between 0 and 120), original_text text not null check(length(original_text) between 1 and 4000),
 public_text text not null check(length(public_text) between 1 and 4000), private_email text,
 permission boolean not null default false, notice_version text not null, permission_provenance text not null default 'website checkbox',
 status text not null default 'pending_review' check(status in ('pending_review','approved','published','rejected','withdrawn')),
 display_order integer not null default 0, display_year text check(display_year ~ '^[0-9]{4}$'), approved_by uuid references public.staff_users(id), approved_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(status not in ('approved','published') or (permission and approved_by is not null and approved_at is not null))
);
create table public.consent_events (
 id uuid primary key default gen_random_uuid(), contact_id uuid references public.contacts(id), submission_id uuid references public.form_submissions(id), feedback_id uuid references public.feedback(id),
 purpose text not null check(purpose in ('respond','marketing','release_update','publish_feedback','booking_request')),
 granted boolean not null, notice_version text not null, notice_text text not null, source text not null,
 actor_id uuid references public.staff_users(id), created_at timestamptz not null default now(), check(contact_id is not null or submission_id is not null or feedback_id is not null)
);
create table public.client_packages (
 id uuid primary key default gen_random_uuid(), contact_id uuid not null references public.contacts(id), service_id uuid not null references public.services(id),
 entitlement integer not null default 3 check(entitlement=3), terms_snapshot jsonb not null, payment_state text not null default 'unrecorded' check(payment_state in ('unrecorded','unpaid','paid','partial','refunded')),
 accepted_by uuid not null default auth.uid() references public.staff_users(id), created_at timestamptz not null default now()
);
create table public.client_journeys (
 id uuid primary key default gen_random_uuid(), name text not null, mode text not null check(mode in ('individual','group')),
 practitioner_id uuid not null references public.staff_users(id), status text not null default 'active' check(status in ('active','completed','cancelled')),
 created_at timestamptz not null default now()
);
create table public.journey_participants (
 id uuid primary key default gen_random_uuid(), journey_id uuid not null references public.client_journeys(id), contact_id uuid not null references public.contacts(id),
 terms_snapshot jsonb not null default '{}', joined_at timestamptz not null default now(), unique(journey_id,contact_id)
);
create table public.practitioner_blocks (
 id uuid primary key default gen_random_uuid(), practitioner_id uuid not null references public.staff_users(id), starts_at timestamptz not null,
 ends_at timestamptz not null, reason text not null, check(ends_at>starts_at)
);
create table public.appointments (
 id uuid primary key default gen_random_uuid(), contact_id uuid references public.contacts(id), service_id uuid not null references public.services(id),
 practitioner_id uuid not null references public.staff_users(id), journey_id uuid references public.client_journeys(id), package_id uuid references public.client_packages(id),
 starts_at timestamptz not null, ends_at timestamptz not null, busy_starts_at timestamptz not null, busy_ends_at timestamptz not null,
 timezone text not null default 'Australia/Brisbane' check(timezone='Australia/Brisbane'),
 status text not null default 'requested' check(status in ('requested','tentative','confirmed','completed','cancelled','no_show')),
 mode text not null default 'in_person' check(mode in ('in_person','distance','group')), location_private text, change_reason text,
 service_snapshot jsonb not null, payment_state text not null default 'unrecorded' check(payment_state in ('unrecorded','unpaid','paid','partial','refunded')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(ends_at>starts_at),
 check(contact_id is not null or journey_id is not null), check(package_id is null or journey_id is null),
 exclude using gist (practitioner_id with =, tstzrange(busy_starts_at,busy_ends_at,'[)') with &&) where (status in ('tentative','confirmed'))
);
create index appointments_time on public.appointments(starts_at);
create table public.appointment_changes (
 id uuid primary key default gen_random_uuid(), appointment_id uuid not null references public.appointments(id), prior_state jsonb,
 new_state jsonb not null, actor_id uuid references public.staff_users(id), reason text, changed_at timestamptz not null default now()
);
create table public.package_session_movements (
 id uuid primary key default gen_random_uuid(), package_id uuid not null references public.client_packages(id), appointment_id uuid not null unique references public.appointments(id),
 units integer not null check(units in (-1,0)), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.package_movement_history (
 id uuid primary key default gen_random_uuid(), package_id uuid not null references public.client_packages(id), appointment_id uuid not null references public.appointments(id),
 prior_units integer, new_units integer not null, actor_id uuid references public.staff_users(id), changed_at timestamptz not null default now()
);
create table public.journey_meetings (
 id uuid primary key default gen_random_uuid(), journey_id uuid not null references public.client_journeys(id), appointment_id uuid not null unique references public.appointments(id),
 sequence integer not null check(sequence between 1 and 99), unique(journey_id,sequence)
);
create table public.rite_completion_events (
 id uuid primary key default gen_random_uuid(), participant_id uuid not null references public.journey_participants(id), rite integer not null check(rite between 1 and 9),
 meeting_id uuid references public.journey_meetings(id), recorded_by uuid not null default auth.uid() references public.staff_users(id), received_at date not null,
 created_at timestamptz not null default now(), unique(participant_id,rite)
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 1 and 200), owner_id uuid not null references public.staff_users(id),
 contact_id uuid references public.contacts(id), enquiry_id uuid references public.enquiries(id), appointment_id uuid references public.appointments(id),
 due_at timestamptz not null, status text not null default 'open' check(status in ('open','completed','cancelled')), completed_at timestamptz, completed_by uuid references public.staff_users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index tasks_due on public.tasks(status,due_at);
create table public.internal_notes (
 id uuid primary key default gen_random_uuid(), contact_id uuid not null references public.contacts(id), author_id uuid not null default auth.uid() references public.staff_users(id),
 note_text text not null check(length(note_text) between 1 and 4000), created_at timestamptz not null default now()
);
create table public.activity_events (
 id uuid primary key default gen_random_uuid(), entity text not null, record_id uuid, action text not null,
 actor_id uuid references public.staff_users(id), metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.notification_outbox (
 id uuid primary key default gen_random_uuid(), submission_id uuid references public.form_submissions(id), deduplication_key text not null unique,
 template text not null default 'owner_new_submission', status text not null default 'queued' check(status in ('queued','processing','provider_accepted','delivered','bounced','failed','sandboxed')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(), lease_until timestamptz, lease_token uuid,
 provider_id text, safe_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.notification_callbacks (provider_event_id text primary key, outbox_id uuid not null references public.notification_outbox(id), received_at timestamptz not null default now());
create table public.deletion_ledger (id uuid primary key default gen_random_uuid(), contact_id uuid not null, erased_by uuid references public.staff_users(id), erased_at timestamptz not null default now());
create table crm_private.rate_buckets (bucket_key text primary key, count integer not null, expires_at timestamptz not null);

create function crm_private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.activity_events(entity,record_id,action,actor_id,metadata) values(TG_TABLE_NAME,case when TG_TABLE_NAME='business_settings' then null else (to_jsonb(new)->>'id')::uuid end,TG_OP,auth.uid(),case when TG_TABLE_NAME='enquiries' then jsonb_build_object('status',to_jsonb(new)->>'status') else '{}' end);
 return new;
end $$;
create function crm_private.touch() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
create function crm_private.immutable_submission() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_TABLE_NAME='enquiries' then if (new.original_message<>old.original_message or new.submission_id is distinct from old.submission_id or new.details<>old.details or new.source_page<>old.source_page or new.received_at<>old.received_at) then raise exception 'Original submission is immutable'; end if; end if;
 if TG_TABLE_NAME='feedback' then if (new.original_text<>old.original_text or new.submission_id is distinct from old.submission_id or new.permission is distinct from old.permission) then raise exception 'Original feedback is immutable'; end if; end if;
 return new;
end $$;
create trigger immutable_enquiry before update on public.enquiries for each row execute function crm_private.immutable_submission();
create trigger immutable_feedback before update on public.feedback for each row execute function crm_private.immutable_submission();
create function crm_private.feedback_approval() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status in ('approved','published') and (TG_OP='INSERT' or old.status is distinct from new.status or old.public_text is distinct from new.public_text) then
  if not crm_private.is_owner() then raise exception 'Owner approval required'; end if;
  if not new.permission then raise exception 'Publication permission required'; end if;
  new.approved_by=auth.uid();new.approved_at=now();
 end if; return new;
end $$;
create trigger feedback_approval before insert or update on public.feedback for each row execute function crm_private.feedback_approval();
create function crm_private.task_completion() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='completed' and (TG_OP='INSERT' or old.status<>'completed') then new.completed_at=now();new.completed_by=auth.uid();
 elsif new.status<>'completed' then new.completed_at=null;new.completed_by=null; end if; return new;
end $$;
create trigger task_completion before insert or update on public.tasks for each row execute function crm_private.task_completion();
create function crm_private.journey_capacity() returns trigger language plpgsql security definer set search_path='' as $$
declare m text; capacity integer;
begin
 select mode into m from public.client_journeys where id=new.journey_id for update;
 capacity=case when m='group' then 3 else 1 end;
 if (select count(*) from public.journey_participants where journey_id=new.journey_id and id<>new.id)>=capacity then raise exception 'Journey is at capacity'; end if;
 return new;
end $$;
create trigger journey_capacity before insert or update on public.journey_participants for each row execute function crm_private.journey_capacity();
create function crm_private.validate_rite() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.meeting_id is not null and not exists(select 1 from public.journey_participants p join public.journey_meetings m on m.journey_id=p.journey_id where p.id=new.participant_id and m.id=new.meeting_id) then raise exception 'Meeting belongs to another journey'; end if;
 return new;
end $$;
create trigger validate_rite before insert on public.rite_completion_events for each row execute function crm_private.validate_rite();
create function crm_private.validate_appointment() returns trigger language plpgsql security definer set search_path='' as $$
declare svc public.services; pkg public.client_packages; j public.client_journeys;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.practitioner_id::text,0));
 select * into strict svc from public.services where id=new.service_id;
 if TG_OP='INSERT' then new.service_snapshot=jsonb_build_object('key',svc.key,'name',svc.name,'price_minor',svc.price_minor,'currency',svc.currency,'duration_minutes',svc.duration_minutes,'buffer_before',svc.buffer_before,'buffer_after',svc.buffer_after);
 elsif new.service_id<>old.service_id or new.service_snapshot<>old.service_snapshot or new.package_id is distinct from old.package_id or new.journey_id is distinct from old.journey_id then raise exception 'Booking terms and relationships are immutable; create a replacement booking'; end if;
 if TG_OP='UPDATE' and new.contact_id is distinct from old.contact_id and not (crm_private.is_owner() and exists(select 1 from public.contacts where id=old.contact_id and archived_at is not null)) then raise exception 'Contact reassignment requires reviewed merge';end if;
 new.busy_starts_at=new.starts_at-make_interval(mins => coalesce((new.service_snapshot->>'buffer_before')::integer,0));
 new.busy_ends_at=new.ends_at+make_interval(mins => coalesce((new.service_snapshot->>'buffer_after')::integer,0));
 if new.package_id is not null then
  select * into strict pkg from public.client_packages where id=new.package_id for update;
  if pkg.contact_id<>new.contact_id or pkg.service_id<>new.service_id then raise exception 'Package does not match contact/service'; end if;
 end if;
 if new.journey_id is not null then
  select * into strict j from public.client_journeys where id=new.journey_id;
  if j.practitioner_id<>new.practitioner_id then raise exception 'Wrong journey practitioner';end if;
 end if;
 if new.status in ('tentative','confirmed') and exists(select 1 from public.practitioner_blocks where practitioner_id=new.practitioner_id and tstzrange(starts_at,ends_at,'[)') && tstzrange(new.busy_starts_at,new.busy_ends_at,'[)')) then raise exception 'Practitioner is unavailable';end if;
 if TG_OP='UPDATE' and (new.starts_at<>old.starts_at or new.ends_at<>old.ends_at or new.status<>old.status) and coalesce(length(btrim(new.change_reason)),0)=0 then raise exception 'Record a reason for appointment changes';end if;
 return new;
end $$;
create trigger validate_appointment before insert or update on public.appointments for each row execute function crm_private.validate_appointment();
create function crm_private.appointment_history() returns trigger language plpgsql security definer set search_path='' as $$
declare prior integer; next_units integer; balance integer;
begin
 if TG_OP='INSERT' or old.starts_at<>new.starts_at or old.ends_at<>new.ends_at or old.status<>new.status then
 insert into public.appointment_changes(appointment_id,prior_state,new_state,actor_id,reason) values(new.id,case when TG_OP='UPDATE' then jsonb_build_object('start',old.starts_at,'end',old.ends_at,'status',old.status) end,jsonb_build_object('start',new.starts_at,'end',new.ends_at,'status',new.status),auth.uid(),new.change_reason);
 end if;
 if new.package_id is not null then
  perform 1 from public.client_packages where id=new.package_id for update;
  next_units=case when new.status='completed' then -1 else 0 end;
  select units into prior from public.package_session_movements where appointment_id=new.id;
  if prior is distinct from next_units then
   select 3+coalesce(sum(units),0) into balance from public.package_session_movements where package_id=new.package_id and appointment_id<>new.id;
   if balance+next_units<0 then raise exception 'No package sessions remaining'; end if;
   insert into public.package_session_movements(package_id,appointment_id,units) values(new.package_id,new.id,next_units) on conflict(appointment_id) do update set units=excluded.units,updated_at=now();
   insert into public.package_movement_history(package_id,appointment_id,prior_units,new_units,actor_id) values(new.package_id,new.id,prior,next_units,auth.uid());
  end if;
 end if; return new;
end $$;
create trigger appointment_history after insert or update on public.appointments for each row execute function crm_private.appointment_history();
create function crm_private.validate_block() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.practitioner_id::text,0));
 if exists(select 1 from public.appointments where practitioner_id=new.practitioner_id and status in ('tentative','confirmed') and tstzrange(busy_starts_at,busy_ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')) then raise exception 'Block conflicts with an existing appointment';end if;return new;
end $$;
create trigger validate_block before insert or update on public.practitioner_blocks for each row execute function crm_private.validate_block();
create function crm_private.validate_meeting() returns trigger language plpgsql security definer set search_path='' as $$
declare m text;
begin
 select mode into m from public.client_journeys where id=new.journey_id for update;
 if not exists(select 1 from public.appointments where id=new.appointment_id and journey_id=new.journey_id) then raise exception 'Meeting appointment mismatch';end if;
 if m='group' and new.sequence>3 then raise exception 'Group journey has three planned gatherings';end if;return new;
end $$;
create trigger validate_meeting before insert or update on public.journey_meetings for each row execute function crm_private.validate_meeting();
create function crm_private.package_terms() returns trigger language plpgsql security definer set search_path='' as $$
declare svc public.services;
begin select * into strict svc from public.services where id=new.service_id and category='package';new.terms_snapshot=to_jsonb(svc);return new;end $$;
create trigger package_terms before insert on public.client_packages for each row execute function crm_private.package_terms();

do $$ declare t text; begin
 foreach t in array array['contacts','enquiries','services','appointments','tasks','feedback','business_settings'] loop
 execute format('create trigger touch before update on public.%I for each row execute function crm_private.touch()',t);
 end loop;
 foreach t in array array['contacts','enquiries','services','appointments','tasks','feedback','client_packages','client_journeys','journey_participants','rite_completion_events','internal_notes','business_settings','staff_users','practitioner_blocks'] loop
 execute format('create trigger audit after insert or update on public.%I for each row execute function crm_private.audit_change()',t);
 end loop;
end $$;
-- No anonymous table reads or writes, including feedback; public reads use a filtered RPC.
do $$ declare t text; begin
 foreach t in array array['staff_users','business_settings','services','contacts','form_submissions','enquiries','feedback','consent_events','client_packages','client_journeys','journey_participants','practitioner_blocks','appointments','appointment_changes','package_session_movements','package_movement_history','journey_meetings','rite_completion_events','tasks','internal_notes','activity_events','notification_outbox','notification_callbacks','deletion_ledger'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy owner_read on public.%I for select to authenticated using (crm_private.is_owner())',t);
 end loop;
end $$;
-- Owner-only operational writes. There is deliberately no direct DELETE permission.
do $$ declare t text; begin
 foreach t in array array['contacts','enquiries','services','appointments','tasks','feedback','client_packages','client_journeys','journey_participants','journey_meetings','rite_completion_events','internal_notes','practitioner_blocks'] loop
 execute format('grant insert,update on public.%I to authenticated',t);
 execute format('create policy owner_insert on public.%I for insert to authenticated with check (crm_private.is_owner())',t);
 execute format('create policy owner_update on public.%I for update to authenticated using (crm_private.is_owner()) with check (crm_private.is_owner())',t);
 end loop;
end $$;
grant update on public.business_settings to authenticated;
create policy settings_update on public.business_settings for update to authenticated using(crm_private.is_owner()) with check(crm_private.is_owner());
-- Staff cannot promote themselves. User administration uses the trusted server owner route.
create policy staff_self on public.staff_users for select to authenticated using(id=auth.uid() and active);
create policy assigned_contacts on public.contacts for select to authenticated using(crm_private.contact_access(id));
create policy assigned_enquiries on public.enquiries for select to authenticated using(crm_private.staff_role()='assistant' and owner_id=auth.uid() and topic not in ('privacy','review_removal','service_concern'));
create policy assigned_appointments on public.appointments for select to authenticated using(crm_private.staff_role() in ('assistant','practitioner') and practitioner_id=auth.uid() and crm_private.contact_access(contact_id));
create policy assigned_tasks on public.tasks for select to authenticated using(crm_private.staff_role() in ('assistant','practitioner') and owner_id=auth.uid());
create policy catalogue_staff on public.services for select to authenticated using(crm_private.staff_role() is not null);
-- Scoped staff may update ordinary assigned contact fields and task completion only (column grants).
-- Mutation endpoints for assistants/practitioners remain read-only in this first release.
create function public.published_feedback() returns table(id uuid,display_name text,public_text text,display_year text,display_order integer) language sql stable security definer set search_path='' as $$
 select id,display_name,public_text,display_year,display_order from public.feedback where status='published' and permission order by display_order,created_at
$$;
revoke all on function public.published_feedback() from public;
grant execute on function public.published_feedback() to anon,authenticated,service_role;

create function public.submit_heartara(p_key uuid,p_hash text,p_kind text,p_payload jsonb,p_bucket text) returns jsonb language plpgsql security definer set search_path='' as $$
declare old public.form_submissions; sid uuid; eid uuid; fid uuid; svc uuid; n integer;topic text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,1));
 select * into old from public.form_submissions where idempotency_key=p_key;
 if found then
  if old.payload_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return jsonb_build_object('received',true,'reference',old.id,'replayed',true);
 end if;
 if p_kind not in ('general_enquiry','booking_request','feedback_submission') or length(p_payload::text)>14000 then raise exception 'Invalid submission';end if;
 insert into crm_private.rate_buckets(bucket_key,count,expires_at) values(p_bucket,1,now()+interval '15 minutes') on conflict(bucket_key) do update set count=crm_private.rate_buckets.count+1 returning count into n;
 if n>10 then raise exception 'RATE_LIMIT';end if;
 delete from crm_private.rate_buckets where expires_at<now();
 if p_payload->>'service_key' is not null then
  select id into svc from public.services where key=p_payload->>'service_key' and status<>'inactive';
  if svc is null then raise exception 'Unknown service';end if;
 end if;
 insert into public.form_submissions(idempotency_key,payload_hash,form_key,source_page,original_payload) values(p_key,p_hash,p_kind,p_payload->>'source_page',p_payload) returning id into sid;
 if p_kind='feedback_submission' then
  if not coalesce((p_payload->>'permission')::boolean,false) then raise exception 'Permission is required';end if;
  insert into public.feedback(submission_id,display_name,original_text,public_text,private_email,permission,notice_version) values(sid,p_payload->>'name',p_payload->>'message',p_payload->>'message',nullif(p_payload->>'email',''),true,'feedback-v1') returning id into fid;
  insert into public.consent_events(submission_id,feedback_id,purpose,granted,notice_version,notice_text,source) values(sid,fid,'publish_feedback',true,'feedback-v1','Penny may publish my feedback and display name on the Heartara website.',p_payload->>'source_page');
 else
  topic=p_payload->>'topic';
  insert into public.enquiries(submission_id,topic,service_id,original_message,source_page,details) values(sid,topic,svc,p_payload->>'message',p_payload->>'source_page',p_payload) returning id into eid;
  insert into public.consent_events(submission_id,purpose,granted,notice_version,notice_text,source) values(sid,'respond',true,'enquiry-v1','Heartara may store this request and contact me about it.',p_payload->>'source_page');
  insert into public.consent_events(submission_id,purpose,granted,notice_version,notice_text,source) values(sid,'marketing',false,'enquiry-v1','This request is not a newsletter subscription.',p_payload->>'source_page');
  if coalesce((p_payload->>'release_update')::boolean,false) then insert into public.consent_events(submission_id,purpose,granted,notice_version,notice_text,source) values(sid,'release_update',true,'enquiry-v1','Please contact me with release news about Return to Your Heart.',p_payload->>'source_page');end if;
  if p_kind='booking_request' then insert into public.consent_events(submission_id,purpose,granted,notice_version,notice_text,source) values(sid,'booking_request',true,'booking-v1','I understand this is a preferred-time request, not a confirmed booking.',p_payload->>'source_page');end if;
 end if;
 insert into public.notification_outbox(submission_id,deduplication_key) values(sid,'submission:'||sid);
 return jsonb_build_object('received',true,'reference',sid,'replayed',false);
end $$;
revoke all on function public.submit_heartara(uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.submit_heartara(uuid,text,text,jsonb,text) to service_role;

create function public.convert_enquiry(p_enquiry uuid,p_contact uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.enquiries;c uuid;
begin
 if not crm_private.is_owner() then raise exception 'Owner only';end if;
 select * into strict e from public.enquiries where id=p_enquiry for update;
 if e.contact_id is not null then return e.contact_id;end if;
 c=p_contact;
 if c is null then insert into public.contacts(name,email_original,phone,preference,source) values(e.details->>'name',e.details->>'email',e.details->>'phone',coalesce(e.details->>'preference','email'),e.source_page) returning id into c;
 else perform 1 from public.contacts where id=c and archived_at is null;if not found then raise exception 'Contact unavailable';end if;end if;
 update public.enquiries set contact_id=c,status='converted' where id=e.id;
 insert into public.consent_events(contact_id,submission_id,purpose,granted,notice_version,notice_text,source,actor_id) select c,submission_id,purpose,granted,notice_version,notice_text,source,auth.uid() from public.consent_events where submission_id=e.submission_id and contact_id is null;
 return c;
end $$;
revoke all on function public.convert_enquiry(uuid,uuid) from public;
grant execute on function public.convert_enquiry(uuid,uuid) to authenticated;
create function public.record_consent(p_contact uuid,p_purpose text,p_granted boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not crm_private.is_owner() then raise exception 'Owner only';end if;
 insert into public.consent_events(contact_id,purpose,granted,notice_version,notice_text,source,actor_id) values(p_contact,p_purpose,p_granted,'owner-recorded-v1','Permission change manually recorded by Penny.','crm',auth.uid());
end $$;
revoke all on function public.record_consent(uuid,text,boolean) from public;
grant execute on function public.record_consent(uuid,text,boolean) to authenticated;
create function public.merge_contacts(p_keep uuid,p_remove uuid,p_name text,p_email text,p_phone text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not crm_private.is_owner() or p_keep=p_remove then raise exception 'Owner review required';end if;
 perform 1 from public.contacts where id in(p_keep,p_remove) order by id for update;
 if (select count(*) from public.contacts where id in(p_keep,p_remove) and archived_at is null)<>2 then raise exception 'Select two active contacts';end if;
 if exists(select 1 from public.journey_participants where contact_id=p_keep and journey_id in(select journey_id from public.journey_participants where contact_id=p_remove)) then raise exception 'Reconcile duplicate journey participants before merging';end if;
 update public.contacts set name=p_name,email_original=p_email,phone=p_phone where id=p_keep;
 update public.enquiries set contact_id=p_keep where contact_id=p_remove;
 update public.contacts set archived_at=now() where id=p_remove;
 update public.client_packages set contact_id=p_keep where contact_id=p_remove;
 update public.appointments set contact_id=p_keep where contact_id=p_remove;
 update public.journey_participants set contact_id=p_keep where contact_id=p_remove;
 update public.tasks set contact_id=p_keep where contact_id=p_remove;
 update public.internal_notes set contact_id=p_keep where contact_id=p_remove;
 -- Consent is append-only; record carried permissions explicitly rather than rewriting historical events.
 insert into public.consent_events(contact_id,purpose,granted,notice_version,notice_text,source,actor_id) select p_keep,purpose,granted,'merge-v1','Permission history carried by owner-reviewed merge.','crm',auth.uid() from (select distinct on(purpose) purpose,granted from public.consent_events where contact_id=p_remove order by purpose,created_at desc) x;
 update public.contacts set archived_at=now() where id=p_remove;
 insert into public.activity_events(entity,record_id,action,actor_id,metadata) values('contacts',p_keep,'merge',auth.uid(),jsonb_build_object('archived_contact',p_remove));
end $$;
revoke all on function public.merge_contacts(uuid,uuid,text,text,text) from public;
grant execute on function public.merge_contacts(uuid,uuid,text,text,text) to authenticated;
-- Outbox leases prevent concurrent workers from claiming the same logical notification.
create function public.claim_notifications(p_limit integer default 10) returns setof public.notification_outbox language plpgsql security definer set search_path='' as $$
begin
 return query update public.notification_outbox set status='processing',attempts=attempts+1,lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid(),updated_at=now()
 where id in(select id from public.notification_outbox where (status='queued' or (status='processing' and lease_until<now())) and next_attempt_at<=now() and attempts<6 order by created_at for update skip locked limit least(p_limit,25)) returning *;
 update public.notification_outbox set status='failed',safe_error='Worker lease expired after retry limit' where status='processing' and lease_until<now() and attempts>=6;
end $$;
create function public.finish_notification(p_id uuid,p_lease uuid,p_status text,p_provider text default null,p_error text default null) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_status not in ('queued','provider_accepted','failed','sandboxed') then raise exception 'Invalid worker result';end if;
 update public.notification_outbox set status=case when p_status='queued' and attempts>=6 then 'failed' else p_status end,provider_id=p_provider,safe_error=p_error,next_attempt_at=now()+make_interval(secs => least(3600,power(2,attempts)::integer*30)),lease_until=null,lease_token=null,updated_at=now() where id=p_id and lease_token=p_lease and status='processing';return found;
end $$;
revoke all on function public.claim_notifications(integer),public.finish_notification(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_notifications(integer),public.finish_notification(uuid,uuid,text,text,text) to service_role;
create function public.retry_notification(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not crm_private.is_owner() then raise exception 'Owner only';end if;
 update public.notification_outbox set status='queued',attempts=0,next_attempt_at=now(),safe_error=null where id=p_id and status in ('failed','bounced');
end $$;
revoke all on function public.retry_notification(uuid) from public;
grant execute on function public.retry_notification(uuid) to authenticated;

-- Prevent indirect functions in the private schema from being called as public RPCs.
revoke execute on all functions in schema crm_private from public,anon;
commit;


begin;
-- Add explicitly reviewed erasure and accurate, unpaginated package balances.
create or replace function crm_private.immutable_submission() returns trigger language plpgsql set search_path='' as $$
begin
 if current_setting('heartara.reviewed_erasure',true)='yes' and crm_private.is_owner() then return new;end if;
 if TG_TABLE_NAME='enquiries' then
  if new.original_message<>old.original_message or new.submission_id is distinct from old.submission_id or new.details<>old.details or new.source_page<>old.source_page or new.received_at<>old.received_at then raise exception 'Original submission is immutable';end if;
 elsif TG_TABLE_NAME='feedback' then
  if new.original_text<>old.original_text or new.submission_id is distinct from old.submission_id or new.permission is distinct from old.permission then raise exception 'Original feedback is immutable';end if;
 end if;return new;
end $$;
create function public.package_balances() returns table(package_id uuid,remaining integer) language sql stable security definer set search_path='' as $$
 select p.id,(p.entitlement+coalesce(sum(m.units),0))::integer from public.client_packages p left join public.package_session_movements m on m.package_id=p.id where crm_private.is_owner() group by p.id
$$;
revoke all on function public.package_balances() from public;
grant execute on function public.package_balances() to authenticated;
create function public.erase_contact(p_contact uuid,p_confirmation text) returns void language plpgsql security definer set search_path='' as $$
declare c public.contacts; sid uuid;
begin
 if not crm_private.is_owner() or p_confirmation<>'ERASE '||p_contact::text then raise exception 'Reviewed owner confirmation required';end if;
 select * into strict c from public.contacts where id=p_contact for update;
 -- Retain the stable ID for referential history; no clinical records belong in this CRM.
 -- Reject merged profiles: the owner must review both surviving and archived identities first.
 if exists(select 1 from public.activity_events where action='merge' and (record_id=p_contact or metadata->>'archived_contact'=p_contact::text)) then raise exception 'Merged contact requires a reviewed multi-record erasure plan';end if;
 perform set_config('heartara.reviewed_erasure','yes',true);
 for sid in select submission_id from public.enquiries where contact_id=p_contact and submission_id is not null loop
  update public.form_submissions set original_payload=jsonb_build_object('erased',true) where id=sid;
 end loop;
 update public.enquiries set original_message='[Removed at owner request]',details='{}',closed_reason=case when status='closed' then 'Removed at owner request' else null end where contact_id=p_contact;
 update public.internal_notes set note_text='[Removed at owner request]' where contact_id=p_contact;
 update public.tasks set title='[Removed contact follow-up]' where contact_id=p_contact;
 update public.appointments set location_private=null where contact_id=p_contact;
 update public.contacts set name='[Removed]',email_original=null,phone=null,archived_at=now() where id=p_contact;
 insert into public.deletion_ledger(contact_id,erased_by) values(p_contact,auth.uid());
 insert into public.activity_events(entity,record_id,action,actor_id) values('contacts',p_contact,'reviewed_erasure',auth.uid());
 perform set_config('heartara.reviewed_erasure','no',true);
end $$;
revoke all on function public.erase_contact(uuid,text) from public;
grant execute on function public.erase_contact(uuid,text) to authenticated;
create function public.record_notification_callback(p_event text,p_provider_id text,p_status text) returns boolean language plpgsql security definer set search_path='' as $$
declare oid uuid;
begin
 if p_status not in ('delivered','bounced','failed') then raise exception 'Invalid delivery event';end if;
 select id into oid from public.notification_outbox where provider_id=p_provider_id for update;
 if oid is null then return false;end if;
 insert into public.notification_callbacks(provider_event_id,outbox_id) values(p_event,oid) on conflict do nothing;
 if not found then return true;end if;
 -- Do not regress a final delivery state because an older callback arrived late.
 update public.notification_outbox set status=p_status,updated_at=now() where id=oid and status='provider_accepted';
 return true;
end $$;
revoke all on function public.record_notification_callback(text,text,text) from public,anon,authenticated;
grant execute on function public.record_notification_callback(text,text,text) to service_role;
commit;


begin;
create function crm_private.participant_terms() returns trigger language plpgsql security definer set search_path='' as $$
declare journey_mode text;svc public.services;
begin
 select mode into strict journey_mode from public.client_journeys where id=new.journey_id;
 select * into strict svc from public.services where key=case when journey_mode='group' then 'munay-group' else 'munay-individual' end;
 new.terms_snapshot=to_jsonb(svc);return new;
end $$;
create trigger participant_terms before insert on public.journey_participants for each row execute function crm_private.participant_terms();
revoke execute on function crm_private.participant_terms() from public,anon;
commit;

-- Email confirmation upgrade (included for NEW installations only).
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

-- Client email upgrade (included for NEW installations only).
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
