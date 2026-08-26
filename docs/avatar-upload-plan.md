# Plan: User avatar upload & display

Goal: a logged-in user can upload / replace / remove a profile photo from
`/profile`. It renders in the site header, the private profile page, the public
`/u/[id]` page, and supporters lists.

## Current state (what exists)

- `profiles.avatar_url` (text, nullable) exists in schema + migrations — always
  `null` today.
- `Supporter.avatarUrl` already flows through `rankGroups` / `supporters_view`,
  stripped for private profiles (`is_public` gate) — but never rendered.
- `UserAvatar` renders deterministic gradient + initial only; its comment says
  "avatar_url (future) would override".
- `AuthUser.profile.avatar_url` already reaches the client (`/api/auth/me`).
- All profile writes go through service-role server routes (profiles table is
  locked down: RLS, no policies, revoked grants).
- Dual-store pattern: `MOCK_MODE` in-memory twin for keyless dev.

## Approach

Server-mediated upload into Supabase Storage (service role), public-but-
unlisted objects, URL stored in `profiles.avatar_url`. No arbitrary URL
injection — `avatar_url` is only writable by the avatar route, never by the
generic profile PATCH.

### Phase 1 — Storage + API

1. **Migration** `supabase/migrations/2026xxxx_avatars_bucket.sql`
   - Public bucket `avatars`, `file_size_limit = 2MB`,
     `allowed_mime_types = ['image/png','image/jpeg','image/webp']`
     (no SVG — script injection risk).
   - No storage policies needed: writes happen via service role (bypasses
     RLS); public bucket reads are open by design. Avatars are public content
     anyway; unguessable paths (`{public_id}/{uuid}.{ext}`) keep objects
     unlisted, and `public_id` (not the auth uuid) is already the site's
     opaque public identifier.

2. **`accounts.ts`**: extend `updateProfile` patch with `avatar_url:
   string | null` (server-internal; mock store handles it too).

3. **New route** `src/app/api/profile/avatar/route.ts`
   - `POST` — session-gated; `await req.formData()`; one file field.
     Validates: ≤ 2MB, magic-byte sniff (PNG/JPEG/WEBP signatures — never
     trust the declared content-type), uploads via `supabaseAdmin().storage`,
     deletes the previous object (best-effort), updates `avatar_url`,
     returns the fresh profile.
   - `DELETE` — clears `avatar_url` + removes the object.
   - Mock mode: hold the upload as a `data:` URL in the mock store so
     dev/demo parity works end-to-end.

### Phase 2 — Component

4. **`UserAvatar`**: add optional `src` prop → `<img>` with
   `onError` fallback to the existing gradient initial (mirrors the listing
   `Avatar` component's fallback chain). Sizes/styling unchanged.

### Phase 3 — Profile UI

5. **`profile-client.tsx`**: avatar becomes editable —
   - tap avatar → hidden file input (accept png/jpeg/webp);
   - client-side canvas: center-crop to square, resize to 256×256, re-encode
     (keeps payload tiny, consistent squares);
   - upload immediately (not tied to the name/save button), show
     spinner/error, then `refresh()` + `load()` so header and lists update;
   - small "remove" button when an avatar exists.

6. **i18n** (`ar` + `en`): changePhoto, removePhoto, avatarTooLarge,
   avatarUnsupportedType, avatarUploadFailed.

### Phase 4 — Wire-up

7. `site-header.tsx` → `user.profile?.avatar_url`
8. `u/[id]/page.tsx` → `profile.avatar_url`
9. `supporters-panel.tsx` → `s.avatarUrl`

## Security / privacy notes

- Magic-byte validation + bucket-level mime/size limits (defense in depth).
- No SVG. No arbitrary remote URLs (blocks tracking pixels / SSRF-style abuse).
- Private profiles: `avatar_url` already stripped in supporters surfaces and
  `/u/[id]` 404s — unchanged.
- Replace = new uuid path (cache-busting for free) + old object deleted.

## Testing

- `npm run build` (typecheck via tsc) passes.
- Mock mode: upload → header + profile + supporters drawer show it; remove
  → falls back to initial; refresh persists within the dev session.
- Real mode: migration applied to hosted project, upload/replace/remove.
- Fallback: broken URL renders gradient initial (onError chain).

## Files

| File | Change |
| --- | --- |
| `supabase/migrations/20250826000001_avatars_bucket.sql` | new — bucket (also mirrored in `schema.sql`) |
| `src/app/api/profile/avatar/route.ts` | new — POST/DELETE |
| `src/lib/accounts.ts` | `updateProfile` accepts `avatar_url`; mock twin |
| `src/components/user-avatar.tsx` | `src` prop + img fallback |
| `src/app/profile/profile-client.tsx` | picker, crop/resize, remove |
| `src/lib/i18n.ts` | ~5 keys × 2 langs |
| `site-header.tsx`, `u/[id]/page.tsx`, `supporters-panel.tsx` | pass `src` |

No DB column changes needed — `avatar_url` already exists.
