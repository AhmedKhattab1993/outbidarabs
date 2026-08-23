"use client";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { useLang } from "@/lib/lang-context";

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 leading-relaxed text-muted-foreground text-pretty">{children}</p>;
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 text-xl font-bold tracking-[-0.02em]">{children}</h2>;
}

/** Bilingual inline strings (same pattern as the success page). */
export function LegalClient() {
  const { t, lang } = useLang();
  const ar = lang === "ar";

  const content = ar ? (
    <>
      <H2>١. وصف الخدمة</H2>
      <P>
        outbidarabs.lol موقع إلكتروني يعرض لوحة ترتيب علنية. مقابل الدفعة الواحدة، يظهر
        إدراجك (حساب تواصل اجتماعي، موقع، أو تطبيق) على اللوحة فوراً. الترتيب يتحدد
        بإجمالي المبلغ المدفوع فقط، وأي مزايدة أعلى من مستخدم آخر تنقل المركز إليه.
        لا اشتراكات ولا تجديد تلقائي ولا رسوم متكررة.
      </P>
      <H2>٢. التزامات المشتري</H2>
      <P>
        بإتمام الدفع، تقرّ أنك مالك الحساب أو الرابط المدرَج أو مفوَّض بالإعلان عنه، وأن
        المحتوى لا يخالف قواعد اللوحة المنشورة في{" "}
        <a className="text-primary hover:underline" href="/rules">
          صفحة القواعد
        </a>{" "}
        (لا محتوى غير قانوني أو إباحي، ولا روابط مجموعات ودعوات، ولا روابط تقصير).
      </P>
      <H2>٣. سياسة الاسترداد</H2>
      <P>
        • إذا لم يُطبَّق إدراجك بعد خصم المبلغ (خطأ تقني أو ازدواج)، يُسترد كامل المبلغ
        تلقائياً.
        <br />• المنفعة تُستهلك فور النشر: القائمة تظهر علنيةً في لحظة تأكيد الدفع، لذا لا
        يوجد استرداد بعد النشر بسبب تغيّر الرتبة أو تجاوز مزايدة أعلى — هذه طبيعة اللوحة
        العلنية المعلنة قبل الدفع.
        <br />• الإدراجات المخالفة للقواعد تُزال دون استرداد.
        <br />• للحالات الاستثنائية راسلنا وسنراجع الطلب بشكل فردي.
      </P>
      <H2>٤. مدة العرض</H2>
      <P>
        يبقى الإدراج على اللوحة حتى يتجاوزه عرض أعلى. لا نضمن مدة بقاء مركز معين — العرض
        علني والمنافسة مفتوحة، وهذا معلن بوضوح قبل الدفع.
      </P>
      <H2>٥. إشراف المحتوى</H2>
      <P>
        تُفحص كل الطلبات تلقائياً (محتوى غير قانوني/إباحي، روابط دردشة ودعوات، اختصارات
        روابط، معاملات تتبع) ويحق للإدارة إزالة أي إدراج مخالف.
      </P>
      <H2>٦. التعديلات</H2>
      <P>نحتفظ بحق تحديث هذه الشروط، ويسري التحديث من نشره على هذه الصفحة.</P>
    </>
  ) : (
    <>
      <H2>1. The service</H2>
      <P>
        outbidarabs.lol operates a public leaderboard. In exchange for a one-time payment,
        your listing (a social account, website, or app) appears on the board instantly.
        Rank is determined solely by the total amount paid; any higher bid from another
        user takes the position. No subscriptions, auto-renewals, or recurring fees.
      </P>
      <H2>2. Buyer obligations</H2>
      <P>
        By completing payment you confirm you own (or are authorized to promote) the listed
        account or URL, and that the content complies with the published{" "}
        <a className="text-primary hover:underline" href="/rules">
          rules
        </a>{" "}
        (no illegal or adult content, no chat/invite links, no link shorteners).
      </P>
      <H2>3. Refund policy</H2>
      <P>
        • If your listing fails to apply after payment was captured (technical failure or
        duplicate charge), the full amount is refunded automatically.
        <br />• Fulfillment is instant and consumed on publication: the listing goes public
        the moment payment is confirmed. Because of that, rank changes or being outbid are
        not refundable — this is the publicly stated nature of the board, disclosed before
        payment.
        <br />• Listings that violate the rules are removed without refund.
        <br />• Exceptional cases are reviewed individually — contact us.
      </P>
      <H2>4. Display duration</H2>
      <P>
        A listing stays on the board until a higher bid takes its position. We do not
        guarantee any minimum time at any rank — the board is public and open, and this is
        clearly disclosed before payment.
      </P>
      <H2>5. Content moderation</H2>
      <P>
        Every submission is automatically screened (illegal/adult content, chat and invite
        links, URL shorteners, tracking parameters), and the operator may remove any
        violating listing.
      </P>
      <H2>6. Changes</H2>
      <P>
        We may update these terms; changes apply from publication on this page.
      </P>
    </>
  );

  return (
    <>
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pt-4 pb-16">
        <div className="mx-auto w-full max-w-xl">
          <h1 className="text-3xl font-bold tracking-[-0.03em]">
            {ar ? "الشروط وسياسة الاسترداد" : "Terms & Refund Policy"}
          </h1>
          <P>
            {ar
              ? "آخر تحديث: أغسطس ٢٠٢٦ · تُطبَّق على كل عملية دفع على outbidarabs.lol"
              : "Last updated: August 2026 · Applies to every payment on outbidarabs.lol"}
          </P>
          {content}
        </div>
        <SiteFooter />
      </div>
    </>
  );
}
