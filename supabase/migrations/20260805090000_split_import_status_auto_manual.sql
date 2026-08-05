-- import_status previously had one row per source, so a manual upload would overwrite
-- (and hide) when the automatic sync last actually ran, and vice versa. Track auto and
-- manual separately per source so the coach dashboard can show both.
alter table public.import_status drop constraint import_status_pkey;
alter table public.import_status add primary key (source, triggered_by);
