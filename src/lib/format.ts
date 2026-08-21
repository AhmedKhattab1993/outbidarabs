import type { Dict } from "@/lib/i18n";

export function formatUsd(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

export function avatarInitial(name: string): string {
  const stripped = name.replace(/^@/, "").replace(/ on X$/, "");
  const words = stripped.split(/[\s./-]+/).filter(Boolean);
  if (words.length >= 2 && words[0].length + words[1].length <= 3) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return (stripped[0] ?? "?").toUpperCase();
}

export function timeAgo(iso: string, t: Dict): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return t.justNow;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t.minutesAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t.hoursAgo(hours);
  return t.daysAgo(Math.floor(hours / 24));
}
