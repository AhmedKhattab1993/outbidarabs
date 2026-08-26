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
      "أي حد يقدر يضيف قائمة — سواء صاحبها أو من جمهورها، وأي حد يقدر يدفع عشان يرفعها أعلى. إنستجرام وتيك توك أولاً، والمواقع والتطبيقات مدعومة كمان.",
    inputPlaceholder: {
      instagram: "@username أو instagram.com/username",
      tiktok: "@username أو tiktok.com/@username",
      x: "@handle أو x.com/handle",
      linkedin: "linkedin.com/in/username",
      website: "example.com",
      app: "رابط App Store أو Google Play",
    },
    startsFrom: "يبدأ من",
    outbid: "زايد",
    reserveSpot: "ضيفها للوحة",
    amountDollars: "المبلغ بالدولار",
    decreaseBid: "اطرح دولارًا",
    increaseBid: "زد دولارًا",
    takesRank: (n: number) => `ياخد المركز #${n}`,
    moreForRank: (amount: number, n: number) => `+${usd(amount)} للمركز #${n}`,
    firstOnBoard: "هتبقى المركز #1 — أول قائمة على اللوحة 🥇",
    raiseAboveCurrent: (bid: number) =>
      `القائمة دي موجودة عند ${usd(bid)} — اكتب مبلغ أعلى عشان ترفعها (بتدفع الفرق بس)`,
    takeRankFor: (n: number, price: number) => `خد المركز #${n} مقابل ${usd(price)}`,
    payMore: (n: number) => `ارفعها بـ ${usd(n)}`,
    alreadyOnBoardAt: (bid: number, diff: number) =>
      `القائمة على اللوحة عند ${usd(bid)} — ادفع فرق ${usd(diff)} بس وارفعها، وهيظهر اسمك ضمن الداعمين.`,
    onBoardNoDiff: (bid: number) => `القائمة على اللوحة عند ${usd(bid)} — اكتب المبلغ اللي هتضيفه وارفعها`,
    alreadyOnList:
      "عايز ترفع قائمة موجودة؟ الصق نفس الحساب أو الرابط — بتدفع الفرق بس واسمك هيظهر ضمن الداعمين.",
    // ── Platform filter ──
    filterAll: "الكل",
    boardEmpty: "اللوحة لسه فاضية.",
    boardEmptyCta: "كن أول واحد يضيف حساب إنستجرام أو تيك توك.",
    platformEmpty: (p: Platform) => `لسه مفيش قوائم ${platformLabel(p, "ar")} — خليك إنت الأول.`,
    // ── Preview card ──
    platformAutoFromLink: "بنحدد المنصة أوتوماتيك من الرابط",
    handleMismatch: (p: Platform) =>
      `المعرّف ده مش مناسب لـ ${platformLabel(p, "ar")} — اتأكد منه أو الصق الرابط الكامل`,
    needsUrl: (p: Platform) => `إضافة قوائم ${platformLabel(p, "ar")} لازم تكون بالرابط الكامل`,
    previewSourceNote: "البيانات دي جاية من المنصة نفسها — للعرض بس.",
    fetchFailedNote: "ما قدرناش نجيب بيانات الحساب دلوقتي — هنعرض المعرّف بس.",
    // ── Board rows ──
    trending: "الأكثر رواجاً الآن",
    clicksPerHour: "نقرة/س",
    latestActivity: "آخر نشاط",
    at: "في",
    minutesAgo: (n: number) =>
      n === 1 ? "منذ دقيقة" : n === 2 ? "منذ دقيقتين" : n <= 10 ? `منذ ${n} دقائق` : `منذ ${n} دقيقة`,
    hoursAgo: (n: number) =>
      n === 1 ? "منذ ساعة" : n === 2 ? "منذ ساعتين" : n <= 10 ? `منذ ${n} ساعات` : `منذ ${n} ساعة`,
    daysAgo: (n: number) =>
      n === 1 ? "منذ يوم" : n === 2 ? "منذ يومين" : n <= 10 ? `منذ ${n} أيام` : `منذ ${n} يوم`,
    justNow: "الآن",
    clicks: (n: string) => `${n} نقرة`,
    claimRankFor: "ارفعها ↑ مقابل",
    claimShort: "ارفعها بـ",
    top: "الأفضل",
    ofCount: (from: number, to: number, total: number) =>
      `${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} من ${total.toLocaleString("en-US")}`,
    refresh: "تحديث",
    // ── Earnings card ──
    earningsPrefix: "لوحة",
    earningsHighlight: "العرب",
    earningsSuffix: "حققت",
    sinceFromLaunch: (d: string) => `منذ ${d} من إطلاقه`,
    launchedOnDate: "21 أغسطس 2026",
    launchedOnSentence: (d: string) => `انطلق الموقع في ${d}.`,
    crazyThings: "أبرز الأرقام منذ الانطلاق:",
    highestBidSoFar: "أعلى مزايدة حتى الآن",
    listingsOnBoard: (n: number) => `${n.toLocaleString("en-US")} قائمة على اللوحة`,
    totalPaidSoFar: (s: string) => `إجمالي المدفوعات ${s}`,
    // ── Rules page ──
    rulesTitle: "القواعد",
    rulesIntro:
      "OutbidArabs لوحة ترتيب علنية موجهة للعالم العربي. الترتيب هو المزايدة نفسها — ولا شيء غير ذلك. لا مفاتيح API ولا مشاركة في الأرباح.",
    rulesRankingTitle: "كيف يعمل الترتيب",
    rulesRanking1:
      "الترتيب يتحدد بإجمالي مبلغ المزايدة فقط — أعلى مزايدة تأخذ المركز الأول. القوائم الجديدة تبدأ من",
    rulesRankingTime: "وعند تساوي المبالغ، تحتفظ المزايدة الأقدم بالمركز الأعلى.",
    rulesRanking2:
      "يمكن لأي شخص رفع أي قائمة حالية — وليس مالكها وحده. أدخل الحساب أو الرابط نفسه وزايد بأي مبلغ يتجاوز المبلغ الحالي: تدفع الفرق فقط لا المبلغ كاملاً، ويظهر اسمك ضمن داعمي القائمة.",
    rulesPlatformsTitle: "المنصات المدعومة",
    rulesPlatformsBody:
      "إنستجرام وتيك توك أولاً — حسابات التواصل الاجتماعي هي جوهر اللوحة. ندعم أيضاً: إكس، ولينكدإن، والمواقع، والتطبيقات (App Store / Google Play). كل قائمة تحمل أيقونة منصتها على اللوحة.",
    rulesCanTitle: "الممنوعات",
    rulesCan1:
      "روابط الدعوات ومجموعات الدردشة ممنوعة — واتساب، وتيليجرام، وديسكورد، وماسنجر، وسيجنال وما شابه. اللوحة للحسابات والمنتجات، لا لمجموعات الدردشة.",
    rulesCan2:
      "المحتوى الإباحي وغير القانوني ممنوع — إباحية، ومخدرات، وقمار ومراهنات، وأسلحة، وتزوير، واحتيال، أو حسابات مسروقة: ليس لها مكان على اللوحة.",
    rulesCan3:
      "الروابط المختصرة ممنوعة، وتُحذف معاملات التتبع من الروابط تلقائياً — روابط الإحالة والتتبع لن تعمل.",
    rulesAfterTitle: "بعد الدفع",
    rulesAfter1:
      "تظهر قائمتك للعامة فوراً، وتذهب النقرات إلى الرابط الأصلي لحسابك أو منتجك.",
    rulesAfter2: "الدفع المكتمل هو ما يحجز المركز.",
    rulesOriginNote:
      "الفكرة مستوحاة من outbid.lol، وهذه النسخة مخصصة للعالم العربي ومركزة على حسابات التواصل الاجتماعي.",
    // ── About ──
    aboutTitle: "عن المنصة",
    footerRules: "القواعد",
    footerTerms: "الشروط",
    footerLiveStats: "إحصائيات مباشرة",
    inspiredBy: "مستوحاة من outbid.lol",
    // ── Accounts / auth ──
    navProfile: "ملفي",
    login: "دخول",
    loginTitle: "سجّل دخولك بالإيميل",
    loginIntro: "هنرسلك رمز من 6 أرقام على إيميلك — من غير كلمة سر.",
    emailLabel: "البريد الإلكتروني",
    sendCode: "أرسل الرمز",
    codeSentTo: (email: string) => `بعتنا رمز التحقق على ${email}`,
    codeLabel: "رمز التحقق",
    verify: "تأكيد",
    resendIn: (s: number) => `إعادة الإرسال بعد ${s} ثانية`,
    resend: "إعادة الإرسال",
    back: "رجوع",
    invalidEmail: "الإيميل مش صحيح",
    invalidCode: "الرمز غلط أو انتهت صلاحيته",
    tooManyCodes: "محاولات كتيرة — جرّب تاني بعد ساعة",
    cooldownSoon: (s: number) => `استنى ${s} ثانية قبل ما تبعت تاني`,
    sendCodeFailed: "ما قدرناش نبعت الرمز — جرّب تاني",
    verifyFailed: "الرمز مش صح — جرّب تاني",
    mockCodeNote: (code: string) => `وضع التجربة — الرمز: ${code}`,
    loginSuccess: "أهلاً بيك!",
    close: "إغلاق",
    // ── Pay-time login gate ──
    gateTitle: "سجّل الدخول عشان تكمل الدفع",
    gateBody: "الدفع محتاج دخول سريع بالإيميل — رمز من 6 أرقام ومن غير كلمة سر. أول ما تأكّد، عملية الدفع هتكمل لوحدها.",
    gateResuming: "بنكمّل عملية الدفع…",
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
    noSupporters: "لسه مفيش داعمين للقائمة دي.",
    anonymous: "مجهول",
    youLabel: "أنت",
    save: "حفظ",
    saved: "تم الحفظ ✓",
    // ── Profile ──
    profileNameLabel: "الاسم",
    profileEmailLabel: "البريد",
    changePhoto: "تغيير الصورة",
    removePhoto: "إزالة الصورة",
    avatarTooLarge: "الصورة أكبر من 2 ميجابايت",
    avatarUnsupportedType: "الصورة لازم PNG أو JPG أو WebP",
    avatarUploadFailed: "ما قدرناش نرفع الصورة — جرّب تاني",
    publicProfileToggle: "حساب عام",
    publicProfileHint:
      "لو خليت حسابك عام: اسمك هيظهر في قوائم الداعمين وملفك يبقى متاح للكل. لو خاص: هتظهر باسم مجهول دايماً.",
    myPayments: "مدفوعاتي",
    rankOnCard: (n: number) => `#${n} على القائمة`,
    timesPaid: (n: number) =>
      n === 1
        ? "دفعة واحدة"
        : n === 2
          ? "دفعتان"
          : n <= 10
            ? `${n.toLocaleString("en-US")} دفعات`
            : `${n.toLocaleString("en-US")} دفعة`,
    noPayments: "مفيش مدفوعات مربوطة بحسابك لسه.",
    noSupportedCards: "لسه مفيش قوائم دعمتها.",
    signOut: "خروج",
    loginToSeeProfile: "سجّل دخولك عشان تشوف ملفك.",
    joinedAt: (d: string) => `عضو منذ ${d}`,
    supportedCardsTitle: "القوائم اللي دعمتها",
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
      "Anyone can add a card — its owner or a fan. And anyone can pay to push it higher. Instagram & TikTok first — websites and apps are supported too.",
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
    reserveSpot: "Add to board",
    amountDollars: "Amount in dollars",
    decreaseBid: "Decrease bid by one dollar",
    increaseBid: "Increase bid by one dollar",
    takesRank: (n: number) => `Takes #${n}`,
    moreForRank: (amount: number, n: number) => `+${usd(amount)} takes #${n}`,
    firstOnBoard: "You'll be #1 — the board's first listing 🥇",
    raiseAboveCurrent: (bid: number) =>
      `This card sits at ${usd(bid)} — enter a higher amount to boost it (you only pay the difference)`,
    takeRankFor: (n: number, price: number) => `Take #${n} for ${usd(price)}`,
    payMore: (n: number) => `Boost it for ${usd(n)}`,
    alreadyOnBoardAt: (bid: number, diff: number) =>
      `This card is on the board at ${usd(bid)} — pay just the ${usd(diff)} difference to boost it and join its supporters.`,
    onBoardNoDiff: (bid: number) =>
      `On the board at ${usd(bid)} — enter the amount to add and boost it`,
    alreadyOnList:
      "Want to push an existing card higher? Paste the same account or URL — pay only the difference and join its supporters.",
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
    claimRankFor: "boost it ↑ for",
    claimShort: "boost it for",
    top: "Top",
    ofCount: (from: number, to: number, total: number) =>
      `${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`,
    refresh: "Refresh",
    // ── Earnings card ──
    earningsPrefix: "The",
    earningsHighlight: "Arab outbid board",
    earningsSuffix: "has made",
    sinceFromLaunch: (d: string) => `${d} since its launch`,
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
    rulesRankingTime: "Equal bids: the older bid keeps the higher rank.",
    rulesRanking2:
      "Anyone can raise an existing listing — not just whoever added it. Enter the same account or URL and bid anything above the current total: you pay only the difference, not the full amount, and you appear among the card's supporters.",
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
    changePhoto: "Change photo",
    removePhoto: "Remove photo",
    avatarTooLarge: "Image must be under 2MB",
    avatarUnsupportedType: "Image must be PNG, JPG, or WebP",
    avatarUploadFailed: "Couldn't upload the image — try again",
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
