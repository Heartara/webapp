-- Run only after creating Penny's identity in Supabase Authentication.
-- Replace OWNER_AUTH_UUID with the verified auth.users UUID; do not put passwords here.
-- Owner membership is explicitly granted; there is no public staff signup.
insert into public.staff_users(id,display_name,role)
values ('OWNER_AUTH_UUID'::uuid,'Penny Kinman','owner');
-- Notifications are deliberately disabled until delivery setup is verified.
update public.business_settings set notification_email='heartarahealing@gmail.com', notification_enabled=false where id=true;
