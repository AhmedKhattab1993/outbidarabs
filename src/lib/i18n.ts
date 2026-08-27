import { platformLabel, type Platform } from "@/lib/platforms";

export type Lang = "ar" | "en";

const usd = (n: number) => "$" + n.toLocaleString("en-US");

export const dict = {
  ar: {
    siteName: "outbidarabs",
    navLeaderboard: "لوحة الصدارة",
    navAbout: "عن المنصة",
    navRules: "القواعد",
    onlineNow: "متصل الآن",
    visitorsSinceLaunch: "زائر منذ الإطلاق",
    seeStats: "شاهد الإحصائيات ←",
    // ── Homepage hero ──
    headline: "تصدّر اللوحة بحسابك على إنستجرام أو تيك توك",
    headlineTagline: "أعلى مزايدة = المركز الأول 🥇",
    supporting:
      "يمكن لأي شخص إضافة حسابه أو دعم صانعه المفضل للمنافسة على المركز الأول. إنستجرام وتيك توك أولاً، مع دعم كامل لإكس، ولينكدإن، والمواقع، والتطبيقات.",
    inputPlaceholder: {
      instagram: "@username أو instagram.com/username",
      tiktok: "@username أو tiktok.com/@username",
      x: "@handle أو x.com/handle",
      linkedin: "linkedin.com/in/username",
      website: "example.com",
      app: "رابط App Store أو Google Play",
    },
    startsFrom: "تبدأ المزايدة من",
    outbid: "زايد الآن",
    reserveSpot: "أضف إلى اللوحة",
    amountDollars: "المبلغ بالدولار",
    decreaseBid: "طرح دولار",
    increaseBid: "إضافة دولار",
    takesRank: (n: number) => `يصل للمركز #${n}`,
    moreForRank: (amount: number, n: number) => `+${usd(amount)} للوصول للمركز #${n}`,
    firstOnBoard: "ستكون في المركز #1 — أول حساب على اللوحة 🥇",
    raiseAboveCurrent: (bid: number) =>
      `هذا الحساب مدرج بمبلغ ${usd(bid)} — أضف مبلغاً أعلى لرفعه (تدفع فارق المزايدة فقط)`,
    takeRankFor: (n: number, price: number) => `احصل على المركز #${n} بـ ${usd(price)}`,
    payMore: (n: number) => `ارفع الترتيب بـ ${usd(n)}`,
    alreadyOnBoardAt: (bid: number, diff: number) =>
      `الحساب مدرج بمبلغ ${usd(bid)} — ادفع الفارق (${usd(diff)}) فقط لرفعه، وسيظهر اسمك في قائمة الداعمين.`,
    onBoardNoDiff: (bid: number) => `الحساب مدرج بمبلغ ${usd(bid)} — أدخل المبلغ الإضافي لرفعه في الترتيب`,
    alreadyOnList:
      "تريد رفع ترتيب حساب موجود؟ الصق الرابط نفسه — تدفع فارق المزايدة فقط وينضم اسمك لقائمة الداعمين.",
    // ── Platform filter ──
    filterAll: "الكل",
    boardEmpty: "لوحة الصدارة بانتظار البطل الأول.",
    boardEmptyCta: "كن أول من يضيف حسابه ويحجز المركز #1.",
    platformEmpty: (p: Platform) => `لا توجد حسابات ${platformLabel(p, "ar")} بعد — كن أول من يتصدر.`,
    // ── Preview card ──
    platformAutoFromLink: "يتم تحديد المنصة تلقائياً من الرابط",
    handleMismatch: (p: Platform) =>
      `اسم المستخدم غير مطابق لـ ${platformLabel(p, "ar")} — تأكد منه أو الصق الرابط كاملاً`,
    needsUrl: (p: Platform) => `إضافة حسابات ${platformLabel(p, "ar")} تتطلب الرابط الكامل`,
    previewSourceNote: "البيانات مسترجعة من المنصة أو من أرشيفها العام للمعاينة.",
    fetchFailedNote: "تعذر جلب تفاصيل الحساب حالياً — سيتم عرض اسم المستخدم الأساسي، وقد تصل البيانات تلقائياً بعد لحظات إذا بقي الرابط كما هو.",
    displayNameLabel: "الاسم المعروض على البطاقة",
    displayNameHint: "إذا لم تظهر تفاصيل الحساب، اكتب الاسم الذي تريد ظهوره — أو اتركه فارغاً لاستخدام اسم المستخدم.",
    // ── Board rows ──
    trending: "الأكثر رواجاً الآن",
    clicksPerHour: "نقرة/س",
    latestActivity: "آخر نشاط",
    at: "في المركز",
    minutesAgo: (n: number) =>
      n === 1 ? "منذ دقيقة" : n === 2 ? "منذ دقيقتين" : n <= 10 ? `منذ ${n} دقائق` : `منذ ${n} دقيقة`,
    hoursAgo: (n: number) =>
      n === 1 ? "منذ ساعة" : n === 2 ? "منذ ساعتين" : n <= 10 ? `منذ ${n} ساعات` : `منذ ${n} ساعة`,
    daysAgo: (n: number) =>
      n === 1 ? "منذ يوم" : n === 2 ? "منذ يومين" : n <= 10 ? `منذ ${n} أيام` : `منذ ${n} يوم`,
    justNow: "الآن",
    clicks: (n: string) => `${n} نقرة`,
    claimRankFor: "ارفع الترتيب ↑ بـ",
    claimShort: "ارفع الترتيب بـ",
    top: "أفضل",
    ofCount: (from: number, to: number, total: number) =>
      `${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} من ${total.toLocaleString("en-US")}`,
    refresh: "تحديث",
    // ── Earnings card ──
    earningsPrefix: "إجمالي المزايدات على",
    earningsHighlight: "لوحة الصدارة العربية",
    earningsSuffix: "وصل إلى",
    sinceFromLaunch: (d: string) => `خلال ${d} منذ الانطلاق`,
    launchedOnDate: "21 أغسطس 2026",
    launchedOnSentence: (d: string) => `انطلقت المنصة في ${d}.`,
    crazyThings: "أرقام وإحصائيات مباشرة منذ الانطلاق:",
    highestBidSoFar: "أعلى مزايدة حتى الآن",
    listingsOnBoard: (n: number) => `${n.toLocaleString("en-US")} حساب على اللوحة`,
    totalPaidSoFar: (s: string) => `إجمالي المزايدات ${s}`,
    // ── Rules page ──
    rulesTitle: "قواعد اللوحة",
    rulesIntro:
      "OutbidArabs لوحة ترتيب علنية ومباشرة في العالم العربي. الترتيب هو المزايدة نفسها — بشفافية تامة، بدون مفاتيح API وبدون اقتطاع أرباح.",
    rulesRankingTitle: "كيف يعمل الترتيب",
    rulesRanking1:
      "يتحدد الترتيب بإجمالي مبلغ المزايدة فقط — صاحب أعلى مزايدة يحجز المركز الأول (#1). تبدأ المزايدات الجديدة من",
    rulesRankingTime: "وفي حال تساوي مبالغ المزايدة، يحتفظ العرض الأسبق زمنياً بالمركز الأعلى.",
    rulesRanking2:
      "يمكن لأي شخص رفع ترتيب أي حساب موجود على اللوحة؛ ما عليك سوى إدخال الحساب أو الرابط نفسه والمزايدة بمبلغ أعلى من المبلغ الحالي: تدفع الفارق فقط، وينضم اسمك لقائمة الداعمين.",
    rulesPlatformsTitle: "المنصات المدعومة",
    rulesPlatformsBody:
      "إنستجرام وتيك توك في المقدمة — حسابات التواصل الاجتماعي هي جوهر اللوحة. ندعم أيضاً: إكس، ولينكدإن، والمواقع الإلكترونية، والتطبيقات (App Store / Google Play). يحمل كل حساب أيقونة منصته بوضوح.",
    rulesCanTitle: "المحتوى غير المسموح",
    rulesCan1:
      "روابط المجموعات والدعوات ممنوعة (واتساب، تيليجرام، ديسكورد، ماسنجر، سيجنال وغيرها). اللوحة مخصصة للحسابات والمنتجات المستقلة.",
    rulesCan2:
      "المحتوى الإباحي والأنشطة غير القانونية ممنوعة منعاً باتاً (مواد إباحية، مخدرات، قمار ومراهنات، أسلحة، تزوير، احتيال، أو حسابات مسروقة).",
    rulesCan3:
      "الروابط المختصرة غير مسموحة، وتُحذف معاملات التتبع تلقائياً لضمان توجيه الزائر للحساب الأصلي مباشرة.",
    rulesAfterTitle: "بعد إتمام الدفع",
    rulesAfter1:
      "يظهر حسابك على اللوحة فوراً، وتتجه كافة النقرات مباشرة إلى رابط حسابك أو منتجك الأصلي.",
    rulesAfter2: "تأكيد الدفع هو ما يضمن حجز المركز وتحديث الترتيب مباشرة.",
    rulesOriginNote:
      "الفكرة مستوحاة من outbid.lol، وهذه النسخة مصممة ومخصصة للعالم العربي وصناع المحتوى ورواد الأعمال فيه.",
    // ── About ──
    aboutTitle: "عن المنصة",
    footerRules: "القواعد",
    footerTerms: "الشروط وسياسة الاسترداد",
    footerLiveStats: "إحصائيات مباشرة",
    inspiredBy: "مستوحاة من outbid.lol",
    backCreatorCta: "ادعم حسابك المفضل وتصدر المشهد ←",
    // ── Accounts / auth ──
    navProfile: "حسابي",
    login: "تسجيل الدخول",
    loginTitle: "تسجيل الدخول بالبريد الإلكتروني",
    loginIntro: "سنرسل رمز تحقق مكوّناً من 6 أرقام إلى بريدك الإلكتروني — دون الحاجة لكلمة مرور.",
    emailLabel: "البريد الإلكتروني",
    sendCode: "إرسال الرمز",
    codeSentTo: (email: string) => `أرسلنا رمز التحقق إلى ${email}`,
    codeLabel: "رمز التحقق",
    verify: "تأكيد ومتابعة",
    resendIn: (s: number) => `إعادة الإرسال بعد ${s} ثانية`,
    resend: "إعادة إرسال الرمز",
    back: "رجوع",
    invalidEmail: "البريد الإلكتروني غير صالح",
    invalidCode: "الرمز غير صحيح أو انتهت صلاحيته",
    tooManyCodes: "تجاوزت الحد المسموح من المحاولات — يرجى المحاولة بعد ساعة",
    cooldownSoon: (s: number) => `يرجى الانتظار ${s} ثانية قبل إعادة الإرسال`,
    sendCodeFailed: "تعذر إرسال الرمز — يرجى المحاولة مجدداً",
    verifyFailed: "تعذر التحقق من الرمز — يرجى المحاولة مجدداً",
    mockCodeNote: (code: string) => `وضع التجربة — الرمز: ${code}`,
    loginSuccess: "تم تسجيل الدخول بنجاح! 🎉",
    close: "إغلاق",
    // ── Pay-time login gate ──
    gateTitle: "خطوة أخيرة لتأكيد بريدك الإلكتروني",
    gateBody:
      "لربط المزايدة بملفك الشخصي وظهور اسمك في قائمة الداعمين، أدخل بريدك لاستلام رمز سريع من 6 أرقام. ستكتمل عملية الدفع تلقائياً فور التأكيد.",
    gateResuming: "جارٍ نقلك إلى صفحة الدفع الآمن…",
    // ── Card drawer (supporters) ──
    supporters: "الداعمون",
    supportersCount: (n: number) =>
      n === 1
        ? "داعم واحد"
        : n === 2
          ? "داعمان"
          : n <= 10
            ? `${n.toLocaleString("en-US")} داعمين`
            : `${n.toLocaleString("en-US")} داعماً`,
    noSupporters: "لا يوجد داعمون لهذا الحساب حتى الآن. كن أول الداعمين!",
    anonymous: "مجهول",
    youLabel: "أنت",
    save: "حفظ",
    saved: "تم الحفظ ✓",
    // ── Profile ──
    profileNameLabel: "الاسم المعروض",
    profileEmailLabel: "البريد الإلكتروني",
    changePhoto: "تغيير الصورة",
    removePhoto: "إزالة الصورة",
    avatarTooLarge: "حجم الصورة يجب أن يكون أقل من 2 ميغابايت",
    avatarUnsupportedType: "صيغة الصورة يجب أن تكون PNG أو JPG أو WebP",
    avatarUploadFailed: "تعذر رفع الصورة — يرجى المحاولة مجدداً",
    publicProfileToggle: "ملف شخصي عام",
    publicProfileHint:
      "الحساب العام: يظهر اسمك وصورتك في قوائم الداعمين وملفك العلني. الحساب الخاص: تظهر دائماً باسم «مجهول» مع بقاء قيمة الدعم ظاهرة.",
    myPayments: "سجل الدعم والمزايدات",
    rankOnCard: (n: number) => `الداعم #${n} في هذا الحساب`,
    timesPaid: (n: number) =>
      n === 1
        ? "عملية دفع واحدة"
        : n === 2
          ? "عمليتا دفع"
          : n <= 10
            ? `${n.toLocaleString("en-US")} عمليات دفع`
            : `${n.toLocaleString("en-US")} عملية دفع`,
    noPayments: "لا توجد مدفوعات أو مزايدات مرتبطة بحسابك بعد.",
    noSupportedCards: "لم تقم بدعم أي حسابات حتى الآن.",
    signOut: "تسجيل الخروج",
    loginToSeeProfile: "سجّل دخولك للوصول إلى ملفك الشخصي وإدارة حسابك.",
    joinedAt: (d: string) => `عضو منذ ${d}`,
    supportedCardsTitle: "الحسابات التي دعمتها",
  },
  en: {
    siteName: "outbidarabs",
    navLeaderboard: "Leaderboard",
    navAbout: "About",
    navRules: "Rules",
    onlineNow: "online",
    visitorsSinceLaunch: "visitors since launch",
    seeStats: "see stats →",
    // ── Homepage hero ──
    headline: "Rank your Instagram, TikTok, or brand at the top",
    headlineTagline: "Highest bid = #1 spot 🥇",
    supporting:
      "Add your profile or back a creator you love to push them higher. Instagram & TikTok first — X, LinkedIn, websites, and apps supported too.",
    inputPlaceholder: {
      instagram: "@username or instagram.com/username",
      tiktok: "@username or tiktok.com/@username",
      x: "@handle or x.com/handle",
      linkedin: "linkedin.com/in/username",
      website: "example.com",
      app: "App Store or Google Play link",
    },
    startsFrom: "Bidding starts at",
    outbid: "Claim Rank",
    reserveSpot: "Add to board",
    amountDollars: "Amount in dollars",
    decreaseBid: "Decrease bid by one dollar",
    increaseBid: "Increase bid by one dollar",
    takesRank: (n: number) => `Claims #${n}`,
    moreForRank: (amount: number, n: number) => `+${usd(amount)} to claim #${n}`,
    firstOnBoard: "You'll be #1 — the first profile on the board 🥇",
    raiseAboveCurrent: (bid: number) =>
      `This profile is on the board at ${usd(bid)} — enter a higher amount to boost it (you only pay the difference)`,
    takeRankFor: (n: number, price: number) => `Take #${n} for ${usd(price)}`,
    payMore: (n: number) => `Boost rank for ${usd(n)}`,
    alreadyOnBoardAt: (bid: number, diff: number) =>
      `This profile is on the board at ${usd(bid)} — pay just the ${usd(diff)} difference to boost it and join its supporters.`,
    onBoardNoDiff: (bid: number) =>
      `On the board at ${usd(bid)} — enter the amount to add and boost its rank`,
    alreadyOnList:
      "Want to boost an existing profile? Paste the same account or link — pay only the difference and join the supporters.",
    // ── Platform filter ──
    filterAll: "All",
    boardEmpty: "The leaderboard is waiting for its first contender.",
    boardEmptyCta: "Be the first to claim the #1 spot.",
    platformEmpty: (p: Platform) => `No ${platformLabel(p, "en")} listings yet — be the first to take the lead.`,
    // ── Preview card ──
    platformAutoFromLink: "Platform is auto-detected from the link",
    handleMismatch: (p: Platform) =>
      `That handle doesn't fit ${platformLabel(p, "en")} — check it or paste the full link`,
    needsUrl: (p: Platform) => `Paste the full link for ${platformLabel(p, "en")}`,
    previewSourceNote: "Information fetched from the platform (or its latest public archive copy) for preview.",
    fetchFailedNote: "Couldn't fetch account data right now — showing the username. Details often arrive automatically after a few moments if you keep the link in place.",
    displayNameLabel: "Name shown on your card",
    displayNameHint: "If account details didn't load, type the name to display — or leave empty to use the handle.",
    // ── Board rows ──
    trending: "Trending right now",
    clicksPerHour: "clicks/h",
    latestActivity: "Latest activity",
    at: "at",
    minutesAgo: (n: number) => (n === 1 ? "1 minute ago" : `${n} minutes ago`),
    hoursAgo: (n: number) => (n === 1 ? "1 hour ago" : `${n} hours ago`),
    daysAgo: (n: number) => (n === 1 ? "1 day ago" : `${n} days ago`),
    justNow: "just now",
    clicks: (n: string) => `${n} clicks`,
    claimRankFor: "Boost Rank ↑ for",
    claimShort: "Boost for",
    top: "Top",
    ofCount: (from: number, to: number, total: number) =>
      `${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`,
    refresh: "Refresh",
    // ── Earnings card ──
    earningsPrefix: "Total bids on the",
    earningsHighlight: "Arab Leaderboard",
    earningsSuffix: "have reached",
    sinceFromLaunch: (d: string) => `${d} since launch`,
    launchedOnDate: "August 21st, 2026",
    launchedOnSentence: (d: string) => `The site launched on ${d}.`,
    crazyThings: "Live milestones since launch:",
    highestBidSoFar: "Highest bid (so far)",
    listingsOnBoard: (n: number) => `${n.toLocaleString("en-US")} listings on the board`,
    totalPaidSoFar: (s: string) => `${s} total bids to date`,
    // ── Rules page ──
    rulesTitle: "Rules",
    rulesIntro:
      "OutbidArabs is a public, real-time leaderboard for the Arab world. Rank is the bid — nothing else. No API keys, no revenue share.",
    rulesRankingTitle: "How ranking works",
    rulesRanking1:
      "Ranking is determined solely by total bid amount — the highest total bid takes the #1 spot. New listings start at",
    rulesRankingTime: "Equal bids: the earlier bid retains the higher rank.",
    rulesRanking2:
      "Anyone can raise an existing listing — not just the account owner. Enter the same account or link and bid above the current total: you pay only the difference, and you join the supporters list.",
    rulesPlatformsTitle: "Supported platforms",
    rulesPlatformsBody:
      "Instagram and TikTok first — social profiles are the heart of the board. Also supported: X, LinkedIn, websites, and mobile apps (App Store / Google Play). Every listing displays its platform badge.",
    rulesCanTitle: "Not allowed",
    rulesCan1:
      "Chat and invite links are not allowed — WhatsApp, Telegram, Discord, Messenger, Signal, and similar. The board is for profiles and products, not group chats.",
    rulesCan2:
      "Adult and illegal content is strictly forbidden — porn, drugs, gambling and betting, weapons, fraud, counterfeit, or stolen accounts.",
    rulesCan3:
      "Link shorteners are not allowed, and tracking parameters are stripped automatically to ensure direct, clean routing.",
    rulesAfterTitle: "After payment",
    rulesAfter1:
      "Your listing goes live instantly. All clicks route directly to your original profile or product URL.",
    rulesAfter2: "A completed payment secures the rank in real time.",
    rulesOriginNote:
      "Inspired by outbid.lol. This edition is built for the Arab world and focused on creators and digital brands.",
    // ── About ──
    aboutTitle: "About",
    footerRules: "Rules",
    footerTerms: "Terms & Refunds",
    footerLiveStats: "Live stats",
    inspiredBy: "Inspired by outbid.lol",
    backCreatorCta: "Back a creator to #1 →",
    // ── Accounts / auth ──
    navProfile: "Profile",
    login: "Log in",
    loginTitle: "Sign in with email",
    loginIntro: "We'll email you a 6-digit verification code — no passwords needed.",
    emailLabel: "Email",
    sendCode: "Send code",
    codeSentTo: (email: string) => `We sent a verification code to ${email}`,
    codeLabel: "Verification code",
    verify: "Verify",
    resendIn: (s: number) => `Resend in ${s}s`,
    resend: "Resend",
    back: "Back",
    invalidEmail: "Please enter a valid email",
    invalidCode: "Incorrect or expired code",
    tooManyCodes: "Too many attempts — please try again in an hour",
    cooldownSoon: (s: number) => `Please wait ${s}s before resending`,
    sendCodeFailed: "Couldn't send the code — please try again",
    verifyFailed: "Couldn't verify the code — please try again",
    mockCodeNote: (code: string) => `Mock mode — code: ${code}`,
    loginSuccess: "Welcome aboard! 🎉",
    close: "Close",
    // ── Pay-time login gate ──
    gateTitle: "One quick step to confirm your email",
    gateBody:
      "To link your payment to your profile and appear in the supporters list, enter your email for a 6-digit code. Checkout resumes automatically upon verification.",
    gateResuming: "Redirecting to secure checkout…",
    // ── Card drawer (supporters) ──
    supporters: "Supporters",
    supportersCount: (n: number) => `${n.toLocaleString("en-US")} supporter${n === 1 ? "" : "s"}`,
    noSupporters: "No supporters for this profile yet. Be the first to back it!",
    anonymous: "Anonymous",
    youLabel: "You",
    save: "Save",
    saved: "Saved ✓",
    // ── Profile ──
    profileNameLabel: "Display Name",
    profileEmailLabel: "Email",
    changePhoto: "Change photo",
    removePhoto: "Remove photo",
    avatarTooLarge: "Image must be under 2MB",
    avatarUnsupportedType: "Image must be PNG, JPG, or WebP",
    avatarUploadFailed: "Couldn't upload image — please try again",
    publicProfileToggle: "Public profile",
    publicProfileHint:
      "Public: your name & avatar appear on supporter lists and your public profile. Private: you always appear as Anonymous.",
    myPayments: "My Payments & Bids",
    rankOnCard: (n: number) => `#${n} supporter on this profile`,
    timesPaid: (n: number) => `${n.toLocaleString("en-US")} payment${n === 1 ? "" : "s"}`,
    noPayments: "No payments linked to your account yet.",
    noSupportedCards: "No supported profiles yet.",
    signOut: "Sign out",
    loginToSeeProfile: "Sign in to access your profile and track your rankings.",
    joinedAt: (d: string) => `Member since ${d}`,
    supportedCardsTitle: "Supported Profiles",
  },
} as const;

export type Dict = (typeof dict)["en"];

export function getDict(lang: Lang): Dict {
  return dict[lang] as Dict;
}

export const MIN_BID = 1;
export const MAX_BID = 999999;
export const PER_PAGE = 50; // rows per leaderboard page (matches reference)

// Public launch timestamp (overridable via env). Used by the earnings card
// and the About page.
export const LAUNCH_ISO =
  process.env.NEXT_PUBLIC_LAUNCH_DATE || "2026-08-21T20:00:00.000Z";
