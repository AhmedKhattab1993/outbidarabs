import type { Metadata } from "next";
import { LegalClient } from "./legal-client";

export const metadata: Metadata = {
  title: "الشروط وسياسة الاسترداد — outbidarabs.lol",
  description:
    "شروط استخدام outbidarabs وسياسة الاسترداد: دفعة واحدة، نشر فوري، استرداد تلقائي عند فشل التطبيق. Terms and refund policy.",
};

export default function LegalPage() {
  return <LegalClient />;
}
