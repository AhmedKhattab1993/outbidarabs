import type { Metadata } from "next";
import { getStats } from "@/lib/store";
import { AboutClient } from "./about-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "عن المنصة — outbidarabs.lol",
  description:
    "لوحة ترتيب عربية مدعومة بمبلغ — أعلى عرض = المركز الأول. مستوحاة من outbid.lol ومركزة على حسابات التواصل الاجتماعي.",
};

export default async function AboutPage() {
  const stats = await getStats();
  return <AboutClient stats={stats} />;
}
