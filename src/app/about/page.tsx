import type { Metadata } from "next";
import { getStats } from "@/lib/store";
import { AboutClient } from "./about-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "عن المنصة — outbidarabs.lol",
  description: "أول منصة عربية للـ Outbid — مستوحاة من outbid.lol. الترتيب هو السعر.",
};

export default async function AboutPage() {
  const stats = await getStats();
  return <AboutClient stats={stats} />;
}
