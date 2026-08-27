import { NextRequest, NextResponse } from "next/server";
import { getProfile, getSessionUser, updateProfile } from "@/lib/accounts";
import { MOCK_MODE, supabaseAdmin } from "@/lib/store";
import { MIME_BY_EXT, sniffImage } from "@/lib/image-sniff";

export const dynamic = "force-dynamic";

// Avatar upload/remove (docs/avatar-upload-plan.md). The ONLY writer of
// profiles.avatar_url — the generic profile PATCH never accepts it, so a
// client can't point a profile at an arbitrary remote URL. Uploads land in
// the public `avatars` storage bucket via the service role (bypasses RLS)
// at an unguessable path; the served URL is stored on the profile.

const AVATARS_BUCKET = "avatars";
const MAX_BYTES = 2 * 1024 * 1024; // 2MB — mirrors the bucket's file_size_limit

/** Extract the storage object path from a public URL — only for URLs inside
 *  our own bucket, so a remove never deletes a foreign object. */
function objectPathFromUrl(url: string): string | null {
  const marker = `/object/public/${AVATARS_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  let path: string;
  try {
    path = decodeURIComponent(url.slice(i + marker.length));
  } catch {
    return null;
  }
  return path && !path.includes("..") ? path : null;
}

/** Best-effort object cleanup after replace/remove — a failure is logged and
 *  swallowed; orphaned objects are harmless (unguessable paths). */
async function removeObject(path: string): Promise<void> {
  const { error } = await supabaseAdmin().storage.from(AVATARS_BUCKET).remove([path]);
  if (error) console.error("avatar object remove failed", path, error.message);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });

  // Reject oversized bodies before buffering formData into memory.
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const entry = form.get("file");
    if (!entry || typeof entry === "string") {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    file = entry;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = sniffImage(bytes);
  if (!ext) return NextResponse.json({ error: "unsupported_type" }, { status: 415 });

  const profile = await getProfile(user.id);
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 500 });

  // Mock mode: hold the upload as a data URL in the in-memory store so the
  // whole flow (upload → display → remove) is demoable keyless.
  if (MOCK_MODE) {
    const dataUrl = `data:${MIME_BY_EXT[ext]};base64,${Buffer.from(bytes).toString("base64")}`;
    const updated = await updateProfile(user.id, { avatar_url: dataUrl });
    if (!updated) return NextResponse.json({ error: "update_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, profile: updated });
  }

  // Unguessable path keyed by the OPAQUE public id (never the auth uuid).
  const path = `${profile.public_id}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabaseAdmin()
    .storage
    .from(AVATARS_BUCKET)
    .upload(path, bytes, { contentType: MIME_BY_EXT[ext], upsert: false, cacheControl: "31536000" });
  if (uploadError) {
    console.error("avatar upload failed", user.id, uploadError.message);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }

  const publicUrl = supabaseAdmin().storage.from(AVATARS_BUCKET).getPublicUrl(path).data.publicUrl;
  const updated = await updateProfile(user.id, { avatar_url: publicUrl });
  if (!updated) {
    await removeObject(path); // profile write failed → don't orphan the object
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  // Replace = new uuid path (free cache-busting) + delete the old object.
  if (profile.avatar_url) {
    const oldPath = objectPathFromUrl(profile.avatar_url);
    if (oldPath && oldPath !== path) await removeObject(oldPath);
  }
  return NextResponse.json({ ok: true, profile: updated });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });

  const profile = await getProfile(user.id);
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 500 });

  const updated = await updateProfile(user.id, { avatar_url: null });
  if (!updated) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  if (!MOCK_MODE && profile.avatar_url) {
    const oldPath = objectPathFromUrl(profile.avatar_url);
    if (oldPath) await removeObject(oldPath);
  }
  return NextResponse.json({ ok: true, profile: updated });
}
