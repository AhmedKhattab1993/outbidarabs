import type { Metadata } from "next";
import { RulesClient } from "./rules-client";

export const metadata: Metadata = {
  title: "القواعد — outbidarabs.lol",
  description:
    "كيف يعمل الترتيب على outbidarabs: دولار كامل، حد أدنى $5، المركز الأول يكلف +$5 من أعلى مزايدة. Rank is the bid.",
};

export default function RulesPage() {
  return <RulesClient />;
}
