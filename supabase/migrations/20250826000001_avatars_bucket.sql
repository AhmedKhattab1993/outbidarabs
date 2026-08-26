-- Avatars bucket (docs/avatar-upload-plan.md): profile photos uploaded via
-- the service-role avatar route, served publicly.
-- Public-by-design bucket: avatars only ever appear on public surfaces
-- (supporters lists, /u/[id]) and the URL lives in profiles.avatar_url.
-- No storage policies needed — writes go through the service role (bypasses
-- RLS) and public-bucket reads are open by design. Object paths are
-- unguessable ({public_id}/{uuid}.{ext}), and public_id (not the auth uuid)
-- is already the site's opaque public identifier.
-- No SVG (script injection); enforced here AND by magic-byte sniffing in the
-- upload route (never trust the declared content-type).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152, -- 2MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
