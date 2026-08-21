-- outbidsarabs.lol — seed data (Arab-world listings, prices in whole USD)
-- Safe to run repeatedly: rows are inserted only when the url is absent.

insert into listings (url, display_name, description, bid_amount, clicks, created_at, last_bid_at) values
  ('https://joni.ai', 'joni.ai',
   'JONI is your personal AI computer. Chat once and a team of AI agents and skills gets to work, with the right model picked for every job.',
   14013, 853, now() - interval '33 minutes', now() - interval '33 minutes'),
  ('https://outrank.so', 'outrank.so',
   'Get traffic and outrank competitors with backlinks & SEO-optimized content while you sleep.',
   13005, 6327, now() - interval '39 minutes', now() - interval '39 minutes'),
  ('https://orynth.dev', 'orynth.dev',
   'Discover early-stage products, support their creators, and invest in their coins.',
   12716, 10401, now() - interval '1 hour', now() - interval '1 hour'),
  ('https://crowdreply.io', 'crowdreply.io',
   'Get your brand added to the pages ChatGPT, Gemini, and Perplexity already cite.',
   12711, 3714, now() - interval '1 hour', now() - interval '1 hour'),
  ('https://trycomp.ai', 'trycomp.ai',
   'Automate SOC 2, ISO 27001, HIPAA, and GDPR. Audit-ready in days.',
   10000, 11225, now() - interval '23 hours', now() - interval '23 hours'),
  ('https://lathire.com', 'lathire.com',
   'LatHire is Latin America''s largest talent marketplace. Hire vetted professionals in 24 hours.',
   3124, 2533, now() - interval '14 minutes', now() - interval '14 minutes'),
  ('https://contentstudio.io', 'contentstudio.io',
   'All-in-one social media management tool backed by AI.',
   3123, 442, now() - interval '55 minutes', now() - interval '55 minutes'),
  ('https://x.com/PumpFunCoin', 'PumpFunCoin on X',
   'PumpFunCoin',
   3121, 1917, now() - interval '4 hours', now() - interval '4 hours'),
  ('https://mytb.ai', 'mytb.ai',
   'Automated, accurate, actionable bookkeeping software for modern accounting firms.',
   2999, 1130, now() - interval '20 hours', now() - interval '20 hours'),
  ('https://namerockstar.com', 'namerockstar.com',
   'Find original domains for your company and products.',
   2001, 31, now() - interval '19 minutes', now() - interval '19 minutes'),
  ('https://joinklover.com', 'joinklover.com',
   'Need cash fast? Cash advance of up to $750 in minutes.',
   2000, 2135, now() - interval '23 hours', now() - interval '23 hours'),
  ('https://affiliateo.com', 'affiliateo.com',
   'Affiliate marketing platform for businesses and creators.',
   1302, 50, now() - interval '41 minutes', now() - interval '41 minutes'),
  ('https://myworkoutlogs.com', 'myworkoutlogs.com',
   'A fast, private workout tracker. Completely free forever.',
   1301, 809, now() - interval '58 minutes', now() - interval '58 minutes'),
  ('https://reactbits.dev', 'reactbits.dev',
   '134 animated React components, 238 page blocks, 300 app UI blocks.',
   1300, 648, now() - interval '2 hours', now() - interval '2 hours'),
  ('https://peptiprices.com', 'peptiprices.com',
   'Compare research peptide prices across verified suppliers.',
   1280, 810, now() - interval '4 hours', now() - interval '4 hours'),
  ('https://maxbid.lol', 'maxbid.lol', 'Bid to the top.', 999, 5474, now() - interval '2 hours', now() - interval '2 hours'),
  ('https://thehumanizeai.pro', 'thehumanizeai.pro', 'Make your AI text sound human.', 998, 4497, now() - interval '3 hours', now() - interval '3 hours'),
  ('https://top3.lol', 'top3.lol', 'Only three spots.', 997, 669, now() - interval '5 hours', now() - interval '5 hours'),
  ('https://laun.ch', 'laun.ch', 'Launch pages in minutes.', 30, 120, now() - interval '3 minutes', now() - interval '3 minutes'),
  ('https://timebid.lol', 'timebid.lol', 'Time-based bidding experiment.', 6, 12, now() - interval '1 minute', now() - interval '1 minute'),
  ('https://askai.free', 'askai.free', 'Ask AI anything, free.', 5, 8, now() - interval '1 minute', now() - interval '1 minute'),
  ('https://tryslapback.com', 'tryslapback.com', 'Slapback your inbox.', 9, 45, now() - interval '3 minutes', now() - interval '3 minutes'),
  ('https://folio.fyi', 'folio.fyi', 'Beautiful portfolio pages.', 7, 21, now() - interval '4 minutes', now() - interval '4 minutes')
on conflict (url) do nothing;

-- Rebuild activity feed from the seed listings (top 15 by recency)
insert into activity (listing_id, display_name, amount, rank, created_at)
select l.id, l.display_name, l.bid_amount,
       (select count(*) + 1 from listings x where x.is_active and (x.bid_amount, x.last_bid_at) > (l.bid_amount, l.last_bid_at)),
       l.last_bid_at
from listings l
order by l.last_bid_at desc
limit 15;

update site_stats set value = 0 where key = 'visitors';
update site_stats set value = (select coalesce(sum(bid_amount),0) from listings) where key = 'total_revenue';
