-- The coach dashboard's location filter has only ever worked via a client-side name-list
-- heuristic (NORTH_SHORE_ROSTER in app/coach/page.tsx) that fabricates a "location" label
-- for display — it was never backed by the real profiles.location_id column, which is
-- null for nearly every athlete. The new Leaderboards page filters on the real column, so
-- it correctly found nothing. This backfills location_id from that same roster list so
-- both pages agree, using the real field as the source of truth going forward.

with north_shore_names(full_name) as (
  values
    ('robby drazner'), ('emily brown'), ('lyndie lobdell'), ('brooke hobson'), ('max itigaki'),
    ('will winemaster'), ('lachlan getz'), ('dom rivelli'), ('mike deangelo'), ('jack silich'),
    ('grayden daul'), ('mikey burchill'), ('david deputy'), ('ben motew'), ('tyler carpenter'),
    ('hugh mcging'), ('nick nardella'), ('jack devine'), ('dean andrews'), ('josh lachapelle'),
    ('connor bewick'), ('nolan shorter'), ('nick kempf'), ('trevor shorter'), ('eero butella'),
    ('charlie spencer'), ('evan stasny'), ('charlie campbell'), ('audrey hetman'), ('arissa vettraino'),
    ('abby sandler'), ('grant dillard'), ('jack hextall'), ('ryan drury'), ('kristian epperson'),
    ('drew daley'), ('shea henriksen'), ('mason minsky'), ('maclean cooney'), ('malone cooney'),
    ('nate jastrzebski'), ('ryker lee'), ('chase jette'), ('nathan hauad'), ('cole mckinney'),
    ('oliver mckinney'), ('nick knutson'), ('sam kapotas'), ('jimmy rieber'), ('andrew horn'),
    ('thaddeus mcmahon'), ('talen aling'), ('emery ipsen'), ('travis lefere'), ('ryan hecker'),
    ('parker cha'), ('harry byers'), ('luke assi'), ('abe barnett'), ('josh zitzman'),
    ('anton gesink'), ('jackson romanoff'), ('ronan freeman'), ('levi freeman'), ('luca kummetz'),
    ('aj haas'), ('will johnston'), ('alex milojevic'), ('tyler cooper'), ('conner cooper'),
    ('alex felts'), ('lukie lincoln'), ('tyler costescu'), ('david blasiak'), ('george golden'),
    ('dillon gesink'), ('emma pape'), ('jameson downs'), ('louis-phillippe delcourt'), ('john rappel'),
    ('zach ayyad'), ('conrad siavelis'), ('bowen domaleski'), ('joseph krausfeldt'), ('jayden finke'),
    ('cash cieslak'), ('matthew cudio'), ('gavin gu'), ('kenneth kim'), ('ari drivas'),
    ('rylan axe')
)
update public.profiles p
set location_id = '0122400d-539b-4060-83ee-7d33fb25ae41'
where p.role = 'athlete'
  and p.location_id is null
  and trim(lower(p.first_name || ' ' || p.last_name)) in (select full_name from north_shore_names);

-- Everyone else defaults to Chicago, matching the old heuristic's else-branch.
update public.profiles
set location_id = '11111111-1111-1111-1111-111111111111'
where role = 'athlete' and location_id is null;
