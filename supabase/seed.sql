-- outbidarabs.lol — seed data (platform-focused Arab board, whole USD)
-- Safe to run repeatedly: rows are inserted only when the url is absent.

insert into listings (url, platform, display_name, description, bid_amount, clicks, created_at, last_bid_at) values
  ('https://instagram.com/noor.cooks', 'instagram', '@noor.cooks',
   'وصفات بيتية مصرية سهلة كل يوم', 8201, 853, now() - interval '33 minutes', now() - interval '33 minutes'),
  ('https://instagram.com/omar.fits', 'instagram', '@omar.fits',
   'تمارين بيتية بدون أجهزة — برنامجك في 20 دقيقة', 6104, 6327, now() - interval '39 minutes', now() - interval '39 minutes'),
  ('https://tiktok.com/@mona.makes', 'tiktok', '@mona.makes',
   'شغلات يدوية وديكور بيديك', 5888, 10401, now() - interval '1 hour', now() - interval '1 hour'),
  ('https://instagram.com/layan.art', 'instagram', '@layan.art',
   'رسم ديجيتال وكاليجرافي عربي', 4321, 3714, now() - interval '1 hour', now() - interval '1 hour'),
  ('https://tiktok.com/@yahya.dubs', 'tiktok', '@yahya.dubs',
   'دبلجة كوميدية للمشاهد المشهورة', 3999, 11225, now() - interval '23 hours', now() - interval '23 hours'),
  ('https://tiktok.com/@sara.skincare', 'tiktok', '@sara.skincare',
   'روتين عناية بالبشرة للبشرة العربية', 3100, 2533, now() - interval '14 minutes', now() - interval '14 minutes'),
  ('https://x.com/arabdevnotes', 'x', '@arabdevnotes',
   'أدوات وأخبار تقنية للمطورين العرب', 2800, 442, now() - interval '55 minutes', now() - interval '55 minutes'),
  ('https://instagram.com/khaled.travelz', 'instagram', '@khaled.travelz',
   'رحلات موفرة في الخليج ومصر', 2417, 1917, now() - interval '4 hours', now() - interval '4 hours'),
  ('https://tiktok.com/@fofo.comedy', 'tiktok', '@fofo.comedy',
   'سكتشات كوميدية عن الحياة اليومية', 1999, 1130, now() - interval '20 hours', now() - interval '20 hours'),
  ('https://x.com/startupgcc', 'x', '@startupgcc',
   'شركات ناشئة واستثمار في الخليج', 1500, 50, now() - interval '19 minutes', now() - interval '19 minutes'),
  ('https://linkedin.com/in/layla-hassan', 'linkedin', 'Layla Hassan',
   'Product Manager | الرياض', 1200, 809, now() - interval '41 minutes', now() - interval '41 minutes'),
  ('https://chefsouq.com', 'website', 'chefsouq.com',
   'كل حاجة للمطبخ بتوصيل لنفس اليوم', 999, 648, now() - interval '2 hours', now() - interval '2 hours'),
  ('https://instagram.com/bassam.builds', 'instagram', '@bassam.builds',
   'مشاريع DIY بالعربي للأطفال والكبار', 888, 810, now() - interval '4 hours', now() - interval '4 hours'),
  ('https://launcharabia.com', 'website', 'launcharabia.com',
   'دليل إطلاق منتجك الأول بالعربي', 777, 5474, now() - interval '2 hours', now() - interval '2 hours'),
  ('https://x.com/tamergad', 'x', '@tamergad',
   'تقييمات أجهزة وتقنية بالعربي', 666, 4497, now() - interval '3 hours', now() - interval '3 hours'),
  ('https://tiktok.com/@hind.recipes', 'tiktok', '@hind.recipes',
   'وصفات سريعة في دقيقتين', 555, 669, now() - interval '5 hours', now() - interval '5 hours'),
  ('https://apps.apple.com/ar/app/wasfati/id1494567890', 'app', 'وصفاتي',
   'وصفات عربية خطوة بخطوة', 444, 120, now() - interval '3 minutes', now() - interval '3 minutes'),
  ('https://3laam.com', 'website', '3laam.com',
   'محتوى ومقالات عربية مبسطة', 333, 12, now() - interval '1 minute', now() - interval '1 minute'),
  ('https://play.google.com/store/apps/details?id=com.hogag.app', 'app', 'حجز ملاعب',
   'احجز ملعبك مع أصحابك في دقيقة', 222, 8, now() - interval '1 minute', now() - interval '1 minute'),
  ('https://instagram.com/dina.decor', 'instagram', '@dina.decor',
   'ديكور الدار بأقل تكلفة', 111, 45, now() - interval '3 minutes', now() - interval '3 minutes'),
  ('https://tiktok.com/@ziad.guitar', 'tiktok', '@ziad.guitar',
   'تعلم الجيتار من الصفر بالعربي', 55, 21, now() - interval '4 minutes', now() - interval '4 minutes')
on conflict (url) do nothing;

-- Clicks spread over the last hour (trending data)
insert into clicks (listing_id, created_at)
select id, now() - (random() * interval '1 hour')
from listings
where not exists (select 1 from clicks c where c.listing_id = listings.id)
  and clicks > 0
limit 40;

-- Rebuild the activity feed from the board (top rows by rank)
delete from activity;
insert into activity (listing_id, display_name, amount, rank, created_at)
select l.id, l.display_name, l.bid_amount,
       row_number() over (order by l.bid_amount desc, l.last_bid_at asc) as rank,
       now() - (row_number() over (order by l.bid_amount desc) * interval '9 minutes')
from listings l
order by l.bid_amount desc
limit 15;

-- Earnings card baseline: sum of all bids
insert into site_stats (key, value)
values ('total_revenue', (select coalesce(sum(bid_amount), 0) from listings))
on conflict (key) do update set value = (select coalesce(sum(bid_amount), 0) from listings);
