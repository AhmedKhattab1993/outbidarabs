import { platformLabel, type Platform } from "@/lib/platforms";

export type Lang = "ar" | "en";

const usd = (n: number) => "$" + n.toLocaleString("en-US");

export const dict = {
  ar: {
    siteName: "outbidarabs",
    navLeaderboard: "المتصدرين",
    navAbout: "عن المنصة",
    navRules: "القواعد",
    onlineNow: "متصل الآن",
    visitorsSinceLaunch: "زائر منذ الإطلاق",
    seeStats: "شاهد الإحصائيات ←",
    // ── Homepage hero ──
    headline: "رتب حسابك على إنستجرام أو تيك توك",
    headlineTagline: "أعلى عرض = المركز الأول",
    supporting:
      "ادفع عشان حسابك يبقى في الصدارة. إنستجرام وتيك توك أولاً — المواقع والتطبيقات مدعومة كمان.",
    inputPlaceholder: {
      instagram: "@username أو instagram.com/username",
      tiktok: "@username أو tiktok.com/@username",
      x: "@handle أو x.com/handle",
      linkedin: "linkedin.com/in/username",
      website: "example.com",
      app: "رابط App Store أو Google Play",
    },
    startsFrom: "البدايات من",
    outbid: "زايد",
    reserveSpot: "احجز مركزك",
    amountDollars: "المبلغ بالدولار",
    decreaseBid: "أنقص دولاراً",
    increaseBid: "زد دولاراً",
    takesRank: (n: number) => `ياخد المركز #${n}`,
    moreForRank: (amount: number, n: number) => `+${usd(amount)} للمركز #${n}`,
    firstOnBoard: "هتبقى المركز #1 — أول قائمة على اللوحة 🥇",
    raiseAboveCurrent: (bid: number) => `سعرك الحالي ${usd(bid)} — ارفع دولاراً على الأقل`,
    takeRankFor: (n: number, price: number) => `خد المركز #${n} مقابل ${usd(price)}`,
    payMore: (n: number) => `ادفع ${usd(n)} أكثر`,
    alreadyOnBoardAt: (bid: number, diff: number) =>
      `موجود على اللوحة بسعر ${usd(bid)}. الدفع يحتسب فرق ${usd(diff)} فقط.`,
    alreadyOnList: "موجود على اللوحة بالفعل؟ أدخل نفس الحساب أو الرابط وارفع سعرك.",
    // ── Platform filter ──
    filterAll: "الكل",
    boardEmpty: "اللوحة لسه فاضية.",
    boardEmptyCta: "كن أول واحد يرتب حساب إنستجرام أو تيك توك.",
    platformEmpty: (p: Platform) => `مفيش قوائم ${platformLabel(p, "ar")} لسه — كن أول واحد.`,
    // ── Preview card ──
    platformAutoFromLink: "المنصة تتحدد تلقائياً من الرابط",
    handleMismatch: (p: Platform) =>
      `المعرّف ده لا يناسب ${platformLabel(p, "ar")} — تأكد منه أو الصق الرابط الكامل`,
    needsUrl: (p: Platform) => `عشان ${platformLabel(p, "ar")} الصق الرابط الكامل`,
    previewSourceNote: "البيانات تُجلب تلقائيًا من المنصة نفسها — للعرض فقط.",
    fetchFailedNote: "ما قدرناش نجيب بيانات الحساب الآن — هنعرض المعرّف الأساسي.",
    // ── Board rows ──
    trending: "الأكثر رواجاً الآن",
    clicksPerHour: "نقرة/س",
    latestActivity: "آخر النشاطات",
    at: "في",
    minutesAgo: (n: number) =>
      n === 1 ? "منذ دقيقة" : n === 2 ? "منذ دقيقتين" : n <= 10 ? `منذ ${n} دقائق` : `منذ ${n} دقيقة`,
    hoursAgo: (n: number) =>
      n === 1 ? "منذ ساعة" : n === 2 ? "منذ ساعتين" : n <= 10 ? `منذ ${n} ساعات` : `منذ ${n} ساعة`,
    daysAgo: (n: number) => (n === 1 ? "منذ يوم" : n === 2 ? "منذ يومين" : `منذ ${n} أيام`),
    justNow: "الآن",
    clicks: (n: string) => `${n} نقرة`,
    claimRankFor: "احصل على هذا المركز مقابل",
    claimShort: "احصل عليه بـ",
    top: "الأفضل",
    ofCount: (from: number, to: number, total: number) =>
      `${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} من ${total.toLocaleString("en-US")}`,
    refresh: "تحديث",
    // ── Earnings card ──
    earningsPrefix: "لوحة",
    earningsHighlight: "العرب للـ Outbid",
    earningsSuffix: "جنّت",
    sinceItsLaunch: "منذ إطلاقه",
    launchedOnDate: "21 أغسطس 2026",
    launchedOnSentence: (d: string) => `أُطلق الموقع في ${d}.`,
    crazyThings: "أبرز الأرقام منذ الإطلاق:",
    highestBidSoFar: "أعلى مزايدة (حتى الآن)",
    listingsOnBoard: (n: number) => `${n.toLocaleString("en-US")} قائمة على اللوحة`,
    totalPaidSoFar: (s: string) => `إجمالي المدفوعات ${s}`,
    // ── Rules page ──
    rulesTitle: "القواعد",
    rulesIntro:
      "OutbidArabs لوحة ترتيب علنية للعرب. الترتيب هو السعر — لا شيء غير ذلك. لا مفاتيح API ولا مشاركة أرباح.",
    rulesRankingTitle: "كيف يعمل الترتيب",
    rulesRanking1:
      "الترتيب يتحدد بإجمالي مبلغ المزايدة فقط — أعلى مزايدة إجمالية تأخذ المركز الأول. القوائم الجديدة تبدأ من",
    rulesRankingMin: "الحد الأدنى",
    rulesRankingMax: "الحد الأقصى",
    rulesRankingTime: "بالمزايدة المتساوية، العرض الأقدم يحتفظ بالمركز الأعلى.",
    rulesRanking2:
      "تقدر ترفع قائمة موجودة بدفع الفرق فقط: أدخل نفس الحساب أو الرابط وزايد بأي مبلغ أعلى من سعرك الحالي — بتدفع الفرق بس، مش السعر كله.",
    rulesPlatformsTitle: "المنصات المدعومة",
    rulesPlatformsBody:
      "إنستجرام وتيك توك أولاً — حسابات التواصل الاجتماعي هي محور اللوحة. كمان مدعوم: إكس، لينكدإن، المواقع، والتطبيقات (App Store / Google Play). كل قائمة تحمل أيقونة منصتها على اللوحة.",
    rulesCanTitle: "الممنوعات",
    rulesCan1:
      "روابط الدعوات والمجموعات ممنوعة — واتساب، تيليجرام، ديسكورد، ماسنجر، سيجنال وما شابه. اللوحة للحسابات والمنتجات، مش مجموعات الدردشة.",
    rulesCan2:
      "المحتوى الإباحي وغير القانوني ممنوع — مخدرات، قمار ومراهنات، أسلحة، تزوير، احتيال أو حسابات مسروقة: لا مكان لها على اللوحة.",
    rulesCan3:
      "روابط التقصير ممنوعة، ومعاملات التتبع تُحذف من الروابط تلقائياً — روابط الإحالة والتتبع مش هتشتغل.",
    rulesAfterTitle: "بعد الدفع",
    rulesAfter1:
      "قائمتك تظهر علنية فوراً. النقرات تذهب إلى الرابط الأصلي لحسابك أو منتجك.",
    rulesAfter2: "الدفع المكتمل هو الذي يحجز المركز.",
    rulesOriginNote:
      "الفكرة مستوحاة من outbid.lol. النسخة دي مخصصة للعرب ومركزة على حسابات التواصل الاجتماعي.",
    // ── About ──
    aboutTitle: "عن المنصة",
    footerRules: "القواعد",
    footerTerms: "الشروط",
    footerLiveStats: "إحصائيات مباشرة",
    inspiredBy: "مستوحاة من outbid.lol",
    // ── Accounts / auth ──
    navProfile: "ملفي",
    login: "دخول",
    loginTitle: "الدخول بالبريد",
    loginIntro: "هنرسل رمز من 6 أرقام على بريدك — بدون كلمة سر.",
    emailLabel: "البريد الإلكتروني",
    sendCode: "أرسل الرمز",
    codeSentTo: (email: string) => `أرسلنا رمزاً إلى ${email}`,
    codeLabel: "رمز التحقق",
    verify: "تأكيد",
    resendIn: (s: number) => `إعادة الإرسال بعد ${s}ث`,
    resend: "إعادة الإرسال",
    back: "رجوع",
    invalidEmail: "بريد غير صالح",
    invalidCode: "الرمز غير صحيح أو منتهي",
    tooManyCodes: "رسائل كتيرة — جرّب بعد ساعة",
    cooldownSoon: (s: number) => `استنى ${s} ثانية قبل إعادة الإرسال`,
    sendCodeFailed: "تعذّر إرسال الرمز — جرّب تاني",
    verifyFailed: "تعذّر التحقق من الرمز — جرّب تاني",
    mockCodeNote: (code: string) => `وضع التجربة — الرمز: ${code}`,
    loginSuccess: "أهلاً بك!",
    close: "إغلاق",
    // ── Pay-time login gate ──
    gateTitle: "أكمل الدخول لإتمام الدفع",
    gateBody: "الدفع يحتاج تسجيل دخول سريع بالبريد — رمز من 6 أرقام بدون كلمة سر، ومدفوعتك تكمل لوحدها بعد التأكيد.",
    gateResuming: "جارٍ متابعة الدفع…",
    // ── Card drawer (supporters) ──
    supporters: "الداعمون",
    supportersCount: (n: number) => `${n.toLocaleString("en-US")} داعم`,
    noSupporters: "لسه مفيش داعمين لهذه البطاقة.",
    anonymous: "مجهول",
    youLabel: "أنت",
    save: "حفظ",
    saved: "تم الحفظ ✓",
    // ── Profile ──
    profileNameLabel: "الاسم",
    profileEmailLabel: "البريد",
    publicProfileToggle: "حساب عام",
    publicProfileHint:
      "الحساب العام: اسمك يظهر في قوائم الداعمين وملفك عام. الحساب الخاص: تظهر كمجهول دائماً.",
    myPayments: "مدفوعاتي",
    rankOnCard: (n: number) => `#${n} على البطاقة`,
    timesPaid: (n: number) => `${n.toLocaleString("en-US")} دفعة`,
    noPayments: "مفيش مدفوعات مربوطة بحسابك لسه.",
    noSupportedCards: "لا توجد بطاقات مدعومة بعد.",
    signOut: "خروج",
    loginToSeeProfile: "سجّل الدخول لعرض ملفك.",
    joinedAt: (d: string) => `انضم ${d}`,
    supportedCardsTitle: "البطاقات المدعومة",
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
    headline: "Rank your Instagram or TikTok",
    headlineTagline: "Highest bid = #1",
    supporting:
      "Pay to put your account at the top. Instagram & TikTok first — websites and apps are supported too.",
    inputPlaceholder: {
      instagram: "@username or instagram.com/username",
      tiktok: "@username or tiktok.com/@username",
      x: "@handle or x.com/handle",
      linkedin: "linkedin.com/in/username",
      website: "example.com",
      app: "App Store or Google Play link",
    },
    startsFrom: "Starting from",
    outbid: "Outbid",
    reserveSpot: "Take your spot",
    amountDollars: "Amount in dollars",
    decreaseBid: "Decrease bid by one dollar",
    increaseBid: "Increase bid by one dollar",
    takesRank: (n: number) => `Takes #${n}`,
    moreForRank: (amount: number, n: number) => `+${usd(amount)} takes #${n}`,
    firstOnBoard: "You'll be #1 — the board's first listing 🥇",
    raiseAboveCurrent: (bid: number) => `Your current bid is ${usd(bid)} — raise it by at least $1`,
    takeRankFor: (n: number, price: number) => `Take #${n} for ${usd(price)}`,
    payMore: (n: number) => `Pay ${usd(n)} more`,
    alreadyOnBoardAt: (bid: number, diff: number) =>
      `Already on the board at ${usd(bid)}. Checkout only charges the ${usd(diff)} difference.`,
    alreadyOnList: "Already on the list? Enter the same account or URL and up your bid.",
    // ── Platform filter ──
    filterAll: "All",
    boardEmpty: "The board is still empty.",
    boardEmptyCta: "Be the first to rank an Instagram or TikTok account.",
    platformEmpty: (p: Platform) => `No ${platformLabel(p, "en")} listings yet — be the first.`,
    // ── Preview card ──
    platformAutoFromLink: "Platform is auto-detected from the link",
    handleMismatch: (p: Platform) =>
      `That handle doesn't fit ${platformLabel(p, "en")} — check it or paste the full link`,
    needsUrl: (p: Platform) => `Paste the full link for ${platformLabel(p, "en")}`,
    previewSourceNote: "Pulled straight from the platform — view only.",
    fetchFailedNote: "Couldn't fetch account data right now — showing the basic handle.",
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
    claimRankFor: "take this rank for",
    claimShort: "take it for",
    top: "Top",
    ofCount: (from: number, to: number, total: number) =>
      `${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`,
    refresh: "Refresh",
    // ── Earnings card ──
    earningsPrefix: "The",
    earningsHighlight: "Arab outbid board",
    earningsSuffix: "has made",
    sinceItsLaunch: "since its launch",
    launchedOnDate: "August 21st, 2026",
    launchedOnSentence: (d: string) => `The site launched on ${d}.`,
    crazyThings: "By the numbers since launch:",
    highestBidSoFar: "highest bid (so far)",
    listingsOnBoard: (n: number) => `${n.toLocaleString("en-US")} listings on the board`,
    totalPaidSoFar: (s: string) => `${s} paid to date`,
    // ── Rules page ──
    rulesTitle: "Rules",
    rulesIntro:
      "OutbidArabs is a public leaderboard for the Arab world. Rank is the bid — nothing else. No API keys, no revenue share.",
    rulesRankingTitle: "How ranking works",
    rulesRanking1:
      "Ranking is determined only by total bid amount — the highest total bid takes #1. New listings start at",
    rulesRankingMin: "minimum",
    rulesRankingMax: "$999,999 maximum.",
    rulesRankingTime: "Equal bids: the older bid keeps the higher rank.",
    rulesRanking2:
      "You can raise an existing listing by paying only the difference: enter the same account or URL and bid anything above your current bid — you pay just the difference, not the full amount.",
    rulesPlatformsTitle: "Supported platforms",
    rulesPlatformsBody:
      "Instagram and TikTok first — social accounts are the heart of the board. Also supported: X, LinkedIn, websites, and mobile apps (App Store / Google Play). Every listing carries its platform icon on the board.",
    rulesCanTitle: "Not allowed",
    rulesCan1:
      "Chat and invite links are not allowed — Telegram, WhatsApp, Discord, Messenger, Signal and similar. The board is for accounts and products, not group chats.",
    rulesCan2:
      "Sexual and illegal content is not allowed — porn, drugs, gambling and betting, weapons, counterfeit, fraud, or stolen accounts do not belong on the board.",
    rulesCan3:
      "Link shorteners are not allowed, and tracking parameters are stripped automatically — affiliate and tracking links will not work.",
    rulesAfterTitle: "After you pay",
    rulesAfter1:
      "Your listing goes public instantly. Clicks go to the original account or product URL.",
    rulesAfter2: "A completed payment is what secures the rank.",
    rulesOriginNote:
      "The idea is inspired by outbid.lol. This edition is built for the Arab world and focused on social media accounts.",
    // ── About ──
    aboutTitle: "About",
    footerRules: "Rules",
    footerTerms: "Terms",
    footerLiveStats: "Live stats",
    inspiredBy: "Inspired by outbid.lol",
    // ── Accounts / auth ──
    navProfile: "Profile",
    login: "Log in",
    loginTitle: "Sign in with email",
    loginIntro: "We'll email you a 6-digit code — no password.",
    emailLabel: "Email",
    sendCode: "Send code",
    codeSentTo: (email: string) => `We sent a code to ${email}`,
    codeLabel: "Verification code",
    verify: "Verify",
    resendIn: (s: number) => `Resend in ${s}s`,
    resend: "Resend",
    back: "Back",
    invalidEmail: "Invalid email",
    invalidCode: "Wrong or expired code",
    tooManyCodes: "Too many codes — try again in an hour",
    cooldownSoon: (s: number) => `Wait ${s}s before resending`,
    sendCodeFailed: "Couldn't send the code — try again",
    verifyFailed: "Couldn't verify the code — try again",
    mockCodeNote: (code: string) => `Mock mode — code: ${code}`,
    loginSuccess: "You're in!",
    close: "Close",
    // ── Pay-time login gate ──
    gateTitle: "Log in to complete your payment",
    gateBody:
      "Paying takes a quick email login — a 6-digit code, no password. Your payment continues automatically once verified.",
    gateResuming: "Resuming your payment…",
    // ── Card drawer (supporters) ──
    supporters: "Supporters",
    supportersCount: (n: number) => `${n.toLocaleString("en-US")} supporter${n === 1 ? "" : "s"}`,
    noSupporters: "No supporters for this card yet.",
    anonymous: "Anonymous",
    youLabel: "You",
    save: "Save",
    saved: "Saved ✓",
    // ── Profile ──
    profileNameLabel: "Name",
    profileEmailLabel: "Email",
    publicProfileToggle: "Public profile",
    publicProfileHint:
      "Public: your name shows on supporters lists and your profile page is visible. Private: you always appear as Anonymous.",
    myPayments: "My payments",
    rankOnCard: (n: number) => `#${n} on this card`,
    timesPaid: (n: number) => `${n.toLocaleString("en-US")} payment${n === 1 ? "" : "s"}`,
    noPayments: "No payments linked to your account yet.",
    noSupportedCards: "No supported cards yet.",
    signOut: "Sign out",
    loginToSeeProfile: "Log in to see your profile.",
    joinedAt: (d: string) => `Joined ${d}`,
    supportedCardsTitle: "Supported cards",
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
