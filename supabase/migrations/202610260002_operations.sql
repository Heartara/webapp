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
