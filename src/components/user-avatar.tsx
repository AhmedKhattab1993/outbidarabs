"use client";

import { useEffect, useState } from "react";

// User avatar: uploaded photo (profiles.avatar_url) with a generated
// initial + gradient fallback. Deterministic per user id. Private profiles
// never carry an avatar URL here (stripped in accounts.ts supporters paths).

const GRADIENTS = [
  "from-rose-400 to-orange-400",
  "from-sky-400 to-indigo-500",
  "from-emerald-400 to-teal-500",
  "from-fuchsia-400 to-purple-500",
  "from-amber-400 to-rose-500",
  "from-cyan-400 to-blue-500",
];

function gradientFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}

export function UserAvatar({
  userId,
  name,
  src,
  className = "",
}: {
  userId: string;
  name: string | null;
  src?: string | null;
  className?: string;
}) {
  // Fallback: broken/missing photo → gradient initial (same chain idea as
  // the listing Avatar component).
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  const initial = (name?.replace(/^@/, "") ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className={
        "flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-gradient-to-br font-bold text-white " +
        gradientFor(userId) +
        " " +
        className
      }
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initial
      )}
    </span>
  );
}
