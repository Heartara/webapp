-- SYNTHETIC DATA ONLY. Never run against Penny's production project.
-- Run in an isolated Supabase development project after the schema migrations.
insert into public.contacts(name,email_original,source)
values('DEMO — Alex Example','alex@example.invalid','synthetic-demo');
-- No appointments, reviews, payments or real customers are invented by the seed.
