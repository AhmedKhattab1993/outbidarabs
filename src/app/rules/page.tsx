import type { Metadata } from "next";
import { RulesClient } from "./rules-client";

export const metadata: Metadata = {
  title: "القواعد — outbidarabs.lol",
  description:
    "الترتيب على outbidarabs يتحدد بإجمالي مبلغ المزايدة فقط. قوائم جديدة من $1، والرفع بدفع الفرق فقط. إنستجرام وتيك توك أولاً.",
};

export default function RulesPage() {
  return <RulesClient />;
}
