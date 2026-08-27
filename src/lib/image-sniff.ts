// Magic-byte image sniffing — the declared content-type (form field, upload
// option, bucket setting) is never trusted. Shared by the avatar upload
// route and the meta-enrichment job (platform avatars → listing-meta
// bucket). SVG deliberately unsupported everywhere.

/** Returns the sniffed type, or null for anything that isn't a real image. */
export function sniffImage(bytes: Uint8Array): "png" | "jpeg" | "webp" | null {
  if (bytes.length < 12) return null;
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  // RIFF<4 bytes len>WEBP
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export const MIME_BY_EXT = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;
