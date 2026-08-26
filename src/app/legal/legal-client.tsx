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

// Visible support address (legal page promises a contact channel for
// refunds/deletion — this is it).
const CONTACT_EMAIL = "hello@outbidarabs.lol";

function ContactLink() {
  return (
    <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`} dir="ltr">
      {CONTACT_EMAIL}
    </a>
  );
}

export function LegalClient() {
  const { lang } = useLang();
  const ar = lang === "ar";

  const content = ar ? (
    <>
      <H2>١. وصف الخدمة</H2>
      <P>
        outbidarabs.lol منصة إلكترونية تعرض لوحة صدارة علنية ومباشرة. مقابل دفعة واحدة، يظهر
        حسابك أو مشروعك (حساب تواصل اجتماعي، موقع إلكتروني، أو تطبيق) على اللوحة فوراً. يتحدد الترتيب
        بإجمالي المبلغ المدفوع فقط، وأي مزايدة أعلى من مستخدم آخر تنقل المركز إليه.
        لا اشتراكات، ولا تجديد تلقائي، ولا رسوم متكررة خفية.
      </P>
      <H2>٢. التزامات المشتري</H2>
      <P>
        بإتمام الدفع، تقرّ بأنك مالك الحساب أو الرابط المدرَج أو مفوَّض بالإعلان عنه، وأن
        المحتوى لا يخالف قواعد اللوحة المنشورة في{" "}
        <a className="text-primary hover:underline" href="/rules">
          صفحة القواعد
        </a>{" "}
        (لا محتوى غير قانوني أو إباحي، ولا روابط مجموعات ودعوات، ولا روابط تقصير).
      </P>
      <H2>٣. سياسة الاسترداد</H2>
      <P>
        • إذا لم يظهر حسابك على اللوحة بعد خصم المبلغ بسبب خلل تقني أو تكرار بالخطأ، يُسترد كامل المبلغ فوراً —
        راسلنا على <ContactLink /> وسنعيده إليك بدون تأخير.
        <br />• المنفعة متحققة وفورية: يظهر الحساب علنياً في لحظة تأكيد الدفع مباشرة. لذا لا
        يوجد استرداد بعد النشر بسبب تغيّر الترتيب أو تجاوزه بمزايدة أعلى — فهذه طبيعة المنافسة المفتوحة المعلنة قبل الدفع.
        <br />• الإدراجات المخالفة للقواعد والآداب العامة تُزال دون استرداد.
        <br />• للحالات الاستثنائية، يرجى مراسلتنا على <ContactLink /> وسنراجع الطلب بعناية.
      </P>
      <H2>٤. مدة العرض</H2>
      <P>
        يبقى الحساب معروضاً على اللوحة طالما بقي ضمن المراتب النشطة، حتى يتجاوزه عرض أعلى. لا نضمن بقاء مركز معين لمدة محددة؛ فالمنافسة مفتوحة ومباشرة للجميع.
      </P>
      <H2>٥. إشراف المحتوى</H2>
      <P>
        تُفحص جميع الروابط تلقائياً (ضد المحتوى الإباحي، غير القانوني، روابط الدعوات، واختصارات
        الروابط)، ويحق لإدارة المنصة إزالة أي إدراج مخالف دون إشعار مسبق.
      </P>
      <H2>٦. الحسابات والخصوصية</H2>
      <P>
        • لإتمام الدفع يلزم تسجيل دخول سريع بالبريد: حسابك هو بريدك ورمز تحقق من ستة
        أرقام يُرسل إليه — لا كلمات مرور ولا بيانات معقدة. التصفح متاح للجميع دون حساب.
        <br />• نخزّن بريد الدافع لغرض واحد فقط: ربط المزايدات بملفك الشخصي وظهور اسمك
        في قوائم الداعمين.
        <br />• تعرض قوائم الداعمين الاسم المعروض والمبالغ المدفوعة؛ يمكنك تفعيل الوضع الخاص
        من ملفك الشخصي لتظهر دائماً باسم «مجهول» مع بقاء المبلغ ظاهراً.
        <br />• تعرض الملفات الشخصية العامة الحسابات التي دعمتها فقط.
        <br />• لطلب حذف البيانات والحساب: راسلنا على <ContactLink /> وسيتم حذف الحساب وارتباط البريد نهائياً.
      </P>
      <H2>٧. التعديلات</H2>
      <P>نحتفظ بحق تحديث هذه الشروط، وتسري التحديثات فور نشرها على هذه الصفحة.</P>
    </>
  ) : (
    <>
      <H2>1. The service</H2>
      <P>
        outbidarabs.lol operates a public, real-time leaderboard. In exchange for a one-time payment,
        your profile or link (social account, website, or app) appears on the board instantly.
        Rank is determined solely by the total amount paid; any higher bid takes the lead.
        No subscriptions, auto-renewals, or hidden recurring fees.
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
        • If your listing fails to apply after payment was captured (technical glitch or
        duplicate charge), the full amount is refunded — contact us at <ContactLink /> and
        we will return it promptly.
        <br />• Fulfillment is instant and consumed on publication: the listing goes live
        the moment payment is confirmed. Because of that, rank changes or being outbid are
        non-refundable — this is the transparent, real-time nature of the open leaderboard.
        <br />• Listings that violate our rules are removed without refund.
        <br />• Exceptional cases are reviewed individually — contact us at
        {" "}<ContactLink />.
      </P>
      <H2>4. Display duration</H2>
      <P>
        A listing stays on the board until a higher bid takes its position. We do not
        guarantee any minimum time at any specific rank — the board is public, dynamic, and open.
      </P>
      <H2>5. Content moderation</H2>
      <P>
        Every submission is automatically screened (illegal/adult content, chat and invite
        links, URL shorteners, tracking parameters), and the operator may remove any
        violating listing.
      </P>
      <H2>6. Accounts & privacy</H2>
      <P>
        • Completing a payment requires an email-code login: your account is
        your email plus a 6-digit verification code sent to it — no passwords. Browsing stays account-free.
        <br />• We store the payer email for one purpose: attributing your
        payments to your account so they appear in your profile and in
        supporters lists.
        <br />• Supporters lists show display names and the amounts paid; you can
        switch to private in your profile to appear as "Anonymous" — the amount
        stays visible.
        <br />• Public profiles show only the accounts you supported.
        <br />• Deletion: contact us at {" "}<ContactLink /> and your account and
        the link between your email and payments will be permanently removed.
      </P>
      <H2>7. Changes</H2>
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
