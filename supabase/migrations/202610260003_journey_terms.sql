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
