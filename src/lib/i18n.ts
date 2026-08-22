export type Lang = "ar" | "en";

const usd = (n: number) => "$" + n.toLocaleString("en-US");

export const dict = {
  ar: {
    siteName: "outbidarabs",
    tld: ".lol",
    navLeaderboard: "المتصدرين",
    navAbout: "عن المنصة",
    navRules: "القواعد",
    onlineNow: "متصل الآن",
    visitorsSinceLaunch: "زائر منذ الإطلاق",
    seeStats: "شاهد الإحصائيات ←",
    claim1For: "احصل على المركز الأول مقابل",
    raiseTo1For: "ارفع إلى المركز الأول مقابل",
    amountDollars: "المبلغ بالدولار",
    decreaseBid: "أنقص دولاراً",
    increaseBid: "زد دولاراً",
    newSpotsStart: "المواقع الجديدة تبدأ من",
    payingLess:
      "الدفع بأقل من سعر المركز الأول يضعك على اللوحة في المركز الذي يستطيع هذا المبلغ الوصول إليه.",
    placeholder: "رابط موقعك أو @معرّفك",
    outbid: "زايد",
    payMore: (n: number) => `ادفع ${usd(n)} أكثر`,
    alreadyOnBoardAt: (bid: number, diff: number) =>
      `موجود على اللوحة بسعر ${usd(bid)}. الدفع يحتسب فرق ${usd(diff)} فقط.`,
    toTake1: (price: number) => `لتأخذ المركز الأول، زايد بما لا يقل عن ${usd(price)}.`,
    alreadyOnList: "موجود على اللائمة بالفعل؟ أدخل نفس الرابط أو @المعرّف وارفع سعرك.",
    trending: "الأكثر رواجاً الآن",
    clicksPerHour: "نقرة/س",
    latestActivity: "آخر النشاطات",
    showMore: "المزيد",
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
    earningsPrefix: "هذا",
    earningsHighlight: "المشروع الجانبي البسيط",
    earningsSuffix: "جنى",
    sinceItsLaunch: "منذ إطلاقه",
    launchedOnDate: "21 أغسطس 2025",
    launchedOnSentence: (d: string) => `أُطلق الموقع في ${d}.`,
    crazyThings: "بعض الأشياء المجنونة التي حدثت منذ ذلك الحين:",
    highestBidSoFar: "أعلى مزايدة (حتى الآن)",
    listingsOnBoard: (n: number) => `${n.toLocaleString("en-US")} موقعًا على اللوحة`,
    totalPaidSoFar: (s: string) => `إجمالي المدفوعات ${s}`,
    // rules page
    rulesTitle: "القواعد",
    rulesIntro:
      "OutbidArabs لوحة تصدر علنية. لا إعلانات، لا مفاتيح API، ولا مشاركة أرباح. تدفع لكي تقف فوق الجميع. الترتيب هو السعر — لا شيء غير ذلك.",
    rulesRankingTitle: "كيف يعمل الترتيب",
    rulesRanking1: "القوائم الجديدة بعملات دولارات كاملة،",
    rulesRankingMin: "الحد الأدنى",
    rulesRankingMax: "الحد الأقصى",
    rulesRankingTime: "في كل مرة. القوائم الموجودة على اللوحة تحتفظ بسعرها حتى ترفع سعركا أو يتجاوزها أحد.",
    rulesRanking2:
      "الحصول على المركز الأول يكلف على الأقل 5 دولارات أكثر من أعلى سعر حالي. الدفع بأقل من ذلك يضعك على اللوحة في أي مركز يستطيع ذلك السعر الوصول إليه. الأسعار المتساوية تبقى بترتيب وضعها — السعر الأقدم يحتفظ بالمركز الأعلى.",
    rulesRanking3:
      "أدخل نفس الموقع أو @المعرّف مرة أخرى لرفع القائمة إلى أي مركز. يجب أن يكون السعر الجديد أعلى من سعرك الحالي بدولار واحد على الأقل؛ تدفع الفرق فقط. لا يمكن لأحد آخر أخذ مركزك بدفع ذلك الفرق.",
    rulesRanking4:
      "روابط App Store وPlay Store وGitHub وما شابهها تُميز بمسارها، فلا تتشارك التطبيقات المختلفة سعراً واحداً. سلاسل الاستعلام للتتبع تُتجاهل.",
    rulesCanTitle: "ما يمكنك إدراجه",
    rulesCan1: "موقع منتج، أو معرّف X @handle.",
    rulesCan2:
      "روابط الدعوة والمجموعات ممنوعة — تيليجرام، واتساب، ديسكورد، ماسنجر، سيجنال وما شابه. اللوحة للمنتجات والملفات الشخصية، وليس لمجموعات الدردشة.",
    rulesCan3:
      "الروابط لمحتوى جنسي ممنوعة. إذا كان إباحياً أو محتوى للبالغين فلا مكان له على اللوحة.",
    rulesCan4:
      "تُحذف معاملات الاستعلام من الروابط. روابط الإحالة والتتبع لن تعمل.",
    rulesCan5:
      "روابط تقصير الروابط ممنوعة. إذا أرسلت واحداً، سيُستبدل بالرابط الذي يحوّل إليه.",
    rulesAfterTitle: "بعد الدفع",
    rulesAfter1: "قائمتك تصبح علنية. النقرات تذهب إلى الرابط أو الملف الذي أرسلته، دون معاملات استعلام.",
    rulesAfter2: "الدفع المكتمل هو ما يحجز المركز.",
    // about
    aboutTitle: "عن المنصة",
    footerBuiltBy: "بناه",
    footerBroughtBy: "بتقديم من",
    footerRules: "القواعد",
    footerLiveStats: "إحصائيات مباشرة",
    inspiredBy: "مستوحاة من outbid.lol",
  },
  en: {
    siteName: "outbidarabs",
    tld: ".lol",
    navLeaderboard: "Leaderboard",
    navAbout: "About",
    navRules: "Rules",
    onlineNow: "online",
    visitorsSinceLaunch: "visitors since launch",
    seeStats: "see stats →",
    claim1For: "Claim #1 for",
    raiseTo1For: "Raise to #1 for",
    amountDollars: "Amount in dollars",
    decreaseBid: "Decrease bid by one dollar",
    increaseBid: "Increase bid by one dollar",
    newSpotsStart: "New spots start at",
    payingLess:
      "Paying less than the #1 price still puts you on the board at whatever place that bid can take.",
    placeholder: "Your product URL or @handle",
    outbid: "Outbid",
    payMore: (n: number) => `Pay ${usd(n)} more`,
    alreadyOnBoardAt: (bid: number, diff: number) =>
      `Already on the board at ${usd(bid)}. Checkout only charges the ${usd(diff)} difference.`,
    toTake1: (price: number) => `To take #1, bid at least ${usd(price)}.`,
    alreadyOnList: "Already on the list? Enter the same URL or @handle and up your bid.",
    trending: "Trending right now",
    clicksPerHour: "clicks/h",
    latestActivity: "Latest activity",
    showMore: "Show more",
    at: "at",
    minutesAgo: (n: number) => (n === 1 ? "1 minute ago" : `${n} minutes ago`),
    hoursAgo: (n: number) => (n === 1 ? "1 hour ago" : `${n} hours ago`),
    daysAgo: (n: number) => (n === 1 ? "1 day ago" : `${n} days ago`),
    justNow: "just now",
    clicks: (n: string) => `${n} clicks`,
    claimRankFor: "claim this rank for",
    claimShort: "claim for",
    top: "Top",
    ofCount: (from: number, to: number, total: number) =>
      `${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`,
    refresh: "Refresh",
    earningsPrefix: "This",
    earningsHighlight: "simple side project",
    earningsSuffix: "made",
    sinceItsLaunch: "since its launch",
    launchedOnDate: "August 21st, 2025",
    launchedOnSentence: (d: string) => `The site launched on ${d}.`,
    crazyThings: "A few crazy things that happened since then:",
    highestBidSoFar: "highest bid (so far)",
    listingsOnBoard: (n: number) => `${n.toLocaleString("en-US")} listings on the board`,
    totalPaidSoFar: (s: string) => `${s} paid to date`,
    // rules page
    rulesTitle: "Rules",
    rulesIntro:
      "OutbidArabs is a public leaderboard. There are no ads, no API keys, and no revenue share. You pay to stand above everyone else. Rank is the bid — nothing else.",
    rulesRankingTitle: "How ranking works",
    rulesRanking1: "New listings are whole US dollars,",
    rulesRankingMin: "minimum",
    rulesRankingMax: "$999,999 maximum",
    rulesRankingTime: "at a time. Bids already on the board keep their amount until they raise or get outranked.",
    rulesRanking2:
      "Taking #1 costs at least $5 more than the current top bid. Paying less still puts you on the board at whatever rank that bid can take. Equal bids stay in the order they were placed — the older bid keeps the higher rank.",
    rulesRanking3:
      "Enter the same website or @handle again to raise that listing to any rank. The new bid must be at least $1 above your current bid; you only pay the difference. Someone else cannot take your rank by paying that difference.",
    rulesRanking4:
      "App Store, Play Store, GitHub, and similar platform links are keyed by their path, so different apps don't share a bid. Tracking query strings are ignored.",
    rulesCanTitle: "What you can list",
    rulesCan1: "A product website, or an X @handle.",
    rulesCan2:
      "Chat and invite links are not allowed — Telegram, WhatsApp, Discord, Messenger, Signal, and similar. The board is for products and profiles, not group chats.",
    rulesCan3:
      "Links to sexual content are not allowed. If it is porn, NSFW, or an adult platform, it does not belong on the board.",
    rulesCan4: "Query parameters are stripped from listing links. Affiliate, referral, and tracking URLs will not work.",
    rulesCan5: "Link shortener URLs are not allowed. If you submit one, it is replaced by the URL it redirects to.",
    rulesAfterTitle: "After you pay",
    rulesAfter1: "Your listing is public. Clicks go to the URL or profile you submitted, without query parameters.",
    rulesAfter2: "A completed payment is what claims the rank.",
    // about
    aboutTitle: "About",
    footerBuiltBy: "Built by",
    footerBroughtBy: "Brought to you by",
    footerRules: "Rules",
    footerLiveStats: "Live stats",
    inspiredBy: "Inspired by outbid.lol",
  },
} as const;

export type Dict = (typeof dict)["en"];

export function getDict(lang: Lang): Dict {
  return dict[lang] as Dict;
}

export const MIN_BID = 1;
export const MAX_BID = 999999;
export const TOP1_STEP = 5; // taking #1 costs top bid + $5 (empty board starts at MIN_BID)
export const PER_PAGE = 50; // rows per leaderboard page (matches reference)

// Public launch timestamp (overridable via env). Used by the earnings card
// and the About page.
export const LAUNCH_ISO =
  process.env.NEXT_PUBLIC_LAUNCH_DATE || "2025-08-21T20:00:00.000Z";
