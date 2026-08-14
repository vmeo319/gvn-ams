-- Vincent Meo gets the new admin-only backend page — promoting his existing coach login
-- to role='admin'. is_coach() already treats 'coach' and 'admin' identically everywhere
-- else in the app, so this is additive: he keeps every coach permission and gains access
-- to the new /admin route, which is gated to role='admin' specifically.
update public.profiles set role = 'admin' where id = '05373f56-4d5f-4f54-8402-4cfa81ee783f';
