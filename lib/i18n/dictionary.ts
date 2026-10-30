/**
 * Interface languages shipped with the app.
 *
 * Only languages that actually have a complete string set for the shared shell,
 * homepage and products experience are listed. Adding a language means adding a
 * full dictionary below, not just an entry in this list.
 */
export const LANGUAGES = [
  { code: "en", label: "English", native: "English", dir: "ltr" },
  { code: "sw", label: "Swahili", native: "Kiswahili", dir: "ltr" },
  { code: "ar", label: "Arabic", native: "العربية", dir: "rtl" }
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

const en = {
  "nav.home": "Home",
  "nav.products": "Products",
  "nav.shop": "Shop",
  "nav.sell": "Sell",
  "nav.cart": "Cart",
  "nav.orders": "Orders",
  "nav.account": "Account",
  "nav.search": "Search",

  "common.signIn": "Sign in",
  "common.signOut": "Sign out",
  "common.open": "Open",
  "common.allProducts": "All products",
  "common.backHome": "Back to home",
  "common.language": "Language",
  "common.country": "Country",
  "common.city": "City",
  "common.currency": "Currency",
  "common.chargedIn": "Prices are charged in {currency}",
  "common.deliveryYes": "Delivery available",
  "common.deliveryNo": "Delivery not configured for this country",
  "common.signedIn": "Signed in",
  "common.welcome": "Welcome",
  "common.signInPrompt": "Sign in to buy and sell",
  "common.signInLink": "Sign in or create an account",
  "common.sellOn": "Sell on NaijaDeals",
  "common.menu": "Menu",
  "common.skip": "Skip to content",
  "common.footer": "Prices in {currency} · Payments verified server-side · Delivery by NaijaSend",
  "common.close": "Close",

  "home.title": "One app for the way Africa moves, shops and pays.",
  "home.body":
    "NaijaDeals brings verified shopping, delivery, rides, stays, services and a wallet into one account — built for the phone in your hand.",
  "home.searchPlaceholder": "What do you need today?",
  "home.searchLabel": "Search NaijaDeals",
  "home.explore": "Explore products",
  "home.sellPartner": "Sell or partner",
  "home.quickActions": "Quick actions",
  "home.productsEyebrow": "Products",
  "home.productsTitle": "Everything in the ecosystem",
  "home.productsBody":
    "Tap a service to use it. Cards marked “Setup required” open an honest status page until the provider or operational data needed to run the service is connected.",
  "home.trustTitle": "Built to be trusted, not just to look busy",
  "home.trustBody":
    "Every operational claim on NaijaDeals is backed by a server-side record. Nothing is simulated to look live.",
  "home.partnerEyebrow": "Grow with NaijaDeals",
  "home.partnerTitle": "Sell, deliver or host on the same platform.",
  "home.partnerBody":
    "Apply as a seller, courier, driver, host or creator. Applications go through document review in the Control Center before an account can trade.",
  "home.startSelling": "Start selling",
  "home.partnerOnboarding": "Partner onboarding",
  "home.mobileNote": "Designed mobile-first. This is a responsive web app, not a native mobile application.",

  "quick.shop": "Shop deals",
  "quick.send": "Send a parcel",
  "quick.pay": "Pay & transfer",
  "quick.track": "Track an order",

  "trust.escrow": "Escrow-protected",
  "trust.escrowBody": "Money is verified server-side and only released when the order or service is confirmed.",
  "trust.wallet": "One wallet",
  "trust.walletBody": "Pay, hold, refund and get paid from a ledger-backed NaijaPay balance.",
  "trust.delivery": "Tracked delivery",
  "trust.deliveryBody": "Pickup, transit and delivery events are recorded, not invented.",
  "trust.partners": "Verified partners",
  "trust.partnersBody": "Sellers, couriers and providers pass onboarding before they can take work.",

  "status.live": "Live",
  "status.setup": "Setup required",

  "products.title": "The NaijaDeals ecosystem",
  "products.intro":
    "{count} services share one account, one wallet and one delivery network. {live} are connected to live backend data in this environment; the rest open a status page that names exactly what is missing.",
  "products.honestTitle": "Nothing faked",
  "products.legendLive": "Connected to real database records and server APIs.",
  "products.legendSetup": "The route opens and states the missing provider, approval or operational data.",
  "products.legendHonest": "No invented tracking, reviews, stock, revenue or confirmations anywhere.",
  "products.walletTitle": "One wallet across every service",
  "products.walletBody":
    "NaijaPay is the shared money layer. When a service is connected, payments are verified on the server, recorded in the ledger and protected by escrow where the workflow requires it.",
  "products.openWallet": "Open NaijaPay",
  "products.group1": "Shop and everyday needs",
  "products.group1Body": "Physical goods, food and groceries delivered to your address.",
  "products.group2": "Move, stay and work",
  "products.group2Body": "Rides, shared journeys, vehicle hire and places to stay.",
  "products.group3": "Money, media and help",
  "products.group3Body": "Payments, creator content and the Aura assistant.",

  "module.shop.desc": "Phones, fashion and home finds with escrow checkout.",
  "module.eats.desc": "Restaurant and buka meals delivered hot to your door.",
  "module.fresh.desc": "Fresh produce and staples picked for you.",
  "module.drive.desc": "Cars, shared seats, bikes and company rides.",
  "module.send.desc": "Parcels across town with tracked delivery events.",
  "module.gigs.desc": "Verified pros for repairs, solar and design.",
  "module.stay.desc": "Shortlets and hotels scored for power and safety.",
  "module.stream.desc": "African charts, creator rooms and licensed audio.",
  "module.wallet.desc": "One balance for payments, escrow and payouts.",
  "module.aura.desc": "Help across the ecosystem, only when configured."
} as const;

export type DictionaryKey = keyof typeof en;

const sw: Record<DictionaryKey, string> = {
  "nav.home": "Nyumbani",
  "nav.products": "Bidhaa",
  "nav.shop": "Duka",
  "nav.sell": "Uza",
  "nav.cart": "Kikapu",
  "nav.orders": "Maagizo",
  "nav.account": "Akaunti",
  "nav.search": "Tafuta",

  "common.signIn": "Ingia",
  "common.signOut": "Toka",
  "common.open": "Fungua",
  "common.allProducts": "Bidhaa zote",
  "common.backHome": "Rudi nyumbani",
  "common.language": "Lugha",
  "common.country": "Nchi",
  "common.city": "Jiji",
  "common.currency": "Sarafu",
  "common.chargedIn": "Bei zinalipwa kwa {currency}",
  "common.deliveryYes": "Usafirishaji unapatikana",
  "common.deliveryNo": "Usafirishaji haujasanidiwa kwa nchi hii",
  "common.signedIn": "Umeingia",
  "common.welcome": "Karibu",
  "common.signInPrompt": "Ingia ili kununua na kuuza",
  "common.signInLink": "Ingia au fungua akaunti",
  "common.sellOn": "Uza kwenye NaijaDeals",
  "common.menu": "Menyu",
  "common.skip": "Nenda kwenye maudhui",
  "common.footer": "Bei kwa {currency} · Malipo yanathibitishwa upande wa seva · Usafirishaji na NaijaSend",
  "common.close": "Funga",

  "home.title": "Programu moja kwa jinsi Afrika inavyosafiri, kununua na kulipa.",
  "home.body":
    "NaijaDeals inaleta ununuzi uliothibitishwa, usafirishaji, safari, malazi, huduma na pochi katika akaunti moja — imeundwa kwa simu mkononi mwako.",
  "home.searchPlaceholder": "Unahitaji nini leo?",
  "home.searchLabel": "Tafuta NaijaDeals",
  "home.explore": "Gundua bidhaa",
  "home.sellPartner": "Uza au shirikiana",
  "home.quickActions": "Vitendo vya haraka",
  "home.productsEyebrow": "Bidhaa",
  "home.productsTitle": "Kila kitu katika mfumo",
  "home.productsBody":
    "Gusa huduma kuitumia. Kadi zilizoandikwa “Usanidi unahitajika” hufungua ukurasa wa hali unaoeleza ni mtoa huduma au data gani inakosekana.",
  "home.trustTitle": "Imejengwa kwa uaminifu, si kuonekana tu",
  "home.trustBody":
    "Kila dai la uendeshaji kwenye NaijaDeals linathibitishwa na rekodi ya seva. Hakuna kinachoigwa ili kuonekana hai.",
  "home.partnerEyebrow": "Kua na NaijaDeals",
  "home.partnerTitle": "Uza, safirisha au karibisha kwenye jukwaa moja.",
  "home.partnerBody":
    "Omba kama muuzaji, msafirishaji, dereva, mwenyeji au mtengenezaji. Maombi hupitia ukaguzi wa nyaraka katika Kituo cha Udhibiti kabla akaunti kufanya biashara.",
  "home.startSelling": "Anza kuuza",
  "home.partnerOnboarding": "Usajili wa mshirika",
  "home.mobileNote": "Imeundwa kwa simu kwanza. Hii ni programu ya wavuti inayobadilika, si programu ya simu asilia.",

  "quick.shop": "Nunua ofa",
  "quick.send": "Tuma kifurushi",
  "quick.pay": "Lipa na uhamishe",
  "quick.track": "Fuatilia agizo",

  "trust.escrow": "Inalindwa na escrow",
  "trust.escrowBody": "Pesa inathibitishwa upande wa seva na hutolewa tu agizo au huduma inapothibitishwa.",
  "trust.wallet": "Pochi moja",
  "trust.walletBody": "Lipa, weka, rejesha na upokee malipo kutoka salio la NaijaPay linalohifadhiwa kwenye leja.",
  "trust.delivery": "Usafirishaji unaofuatiliwa",
  "trust.deliveryBody": "Matukio ya kuchukua, safarini na kufikisha hurekodiwa, hayabuniwi.",
  "trust.partners": "Washirika waliothibitishwa",
  "trust.partnersBody": "Wauzaji, wasafirishaji na watoa huduma hupitia usajili kabla ya kufanya kazi.",

  "status.live": "Hai",
  "status.setup": "Usanidi unahitajika",

  "products.title": "Mfumo wa NaijaDeals",
  "products.intro":
    "Huduma {count} zinashiriki akaunti moja, pochi moja na mtandao mmoja wa usafirishaji. {live} zimeunganishwa na data halisi ya seva katika mazingira haya; zilizobaki hufungua ukurasa wa hali unaoeleza hasa kinachokosekana.",
  "products.honestTitle": "Hakuna kinachoghushiwa",
  "products.legendLive": "Imeunganishwa na rekodi halisi za hifadhidata na API za seva.",
  "products.legendSetup": "Ukurasa hufunguka na kueleza mtoa huduma, idhini au data inayokosekana.",
  "products.legendHonest": "Hakuna ufuatiliaji, maoni, hisa, mapato au uthibitisho wa kubuniwa.",
  "products.walletTitle": "Pochi moja kwa kila huduma",
  "products.walletBody":
    "NaijaPay ni tabaka la pesa linaloshirikiwa. Huduma inapounganishwa, malipo huthibitishwa kwenye seva, hurekodiwa kwenye leja na kulindwa na escrow pale mtiririko unapohitaji.",
  "products.openWallet": "Fungua NaijaPay",
  "products.group1": "Ununuzi na mahitaji ya kila siku",
  "products.group1Body": "Bidhaa, chakula na mboga zinazofikishwa mahali ulipo.",
  "products.group2": "Safiri, lala na fanya kazi",
  "products.group2Body": "Safari, safari za pamoja, kukodisha gari na mahali pa kulala.",
  "products.group3": "Pesa, media na msaada",
  "products.group3Body": "Malipo, maudhui ya wabunifu na msaidizi wa Aura.",

  "module.shop.desc": "Simu, mitindo na vitu vya nyumbani kwa malipo ya escrow.",
  "module.eats.desc": "Milo za mikahawa na buka zikifikishwa moto mlangoni pako.",
  "module.fresh.desc": "Mboga mbichi na bidhaa za msingi zilizochaguliwa kwa ajili yako.",
  "module.drive.desc": "Magari, viti vya pamoja, pikipiki na safari za kampuni.",
  "module.send.desc": "Vifurushi mjini kwa matukio ya usafirishaji yanayofuatiliwa.",
  "module.gigs.desc": "Wataalamu waliothibitishwa wa ukarabati, sola na ubunifu.",
  "module.stay.desc": "Nyumba za muda na hoteli zilizopimwa kwa umeme na usalama.",
  "module.stream.desc": "Chati za Afrika, vyumba vya wabunifu na sauti zilizoidhinishwa.",
  "module.wallet.desc": "Salio moja kwa malipo, escrow na malipo ya wauzaji.",
  "module.aura.desc": "Msaada katika mfumo wote, ukiwa umesanidiwa tu."
};

const ar: Record<DictionaryKey, string> = {
  "nav.home": "الرئيسية",
  "nav.products": "المنتجات",
  "nav.shop": "المتجر",
  "nav.sell": "بيع",
  "nav.cart": "السلة",
  "nav.orders": "الطلبات",
  "nav.account": "الحساب",
  "nav.search": "بحث",

  "common.signIn": "تسجيل الدخول",
  "common.signOut": "تسجيل الخروج",
  "common.open": "فتح",
  "common.allProducts": "جميع المنتجات",
  "common.backHome": "العودة إلى الرئيسية",
  "common.language": "اللغة",
  "common.country": "الدولة",
  "common.city": "المدينة",
  "common.currency": "العملة",
  "common.chargedIn": "تُحصَّل الأسعار بعملة {currency}",
  "common.deliveryYes": "التوصيل متاح",
  "common.deliveryNo": "التوصيل غير مُهيأ لهذه الدولة",
  "common.signedIn": "تم تسجيل الدخول",
  "common.welcome": "مرحبًا",
  "common.signInPrompt": "سجّل الدخول للشراء والبيع",
  "common.signInLink": "سجّل الدخول أو أنشئ حسابًا",
  "common.sellOn": "بِع على NaijaDeals",
  "common.menu": "القائمة",
  "common.skip": "انتقل إلى المحتوى",
  "common.footer": "الأسعار بعملة {currency} · المدفوعات تُتحقق على الخادم · التوصيل عبر NaijaSend",
  "common.close": "إغلاق",

  "home.title": "تطبيق واحد لطريقة تنقّل إفريقيا وشرائها ودفعها.",
  "home.body":
    "يجمع NaijaDeals التسوّق الموثّق والتوصيل والرحلات والإقامة والخدمات والمحفظة في حساب واحد — مصمّم للهاتف في يدك.",
  "home.searchPlaceholder": "ماذا تحتاج اليوم؟",
  "home.searchLabel": "ابحث في NaijaDeals",
  "home.explore": "استكشف المنتجات",
  "home.sellPartner": "بِع أو شارك",
  "home.quickActions": "إجراءات سريعة",
  "home.productsEyebrow": "المنتجات",
  "home.productsTitle": "كل شيء في المنظومة",
  "home.productsBody":
    "اضغط على خدمة لاستخدامها. البطاقات التي تحمل «الإعداد مطلوب» تفتح صفحة حالة توضّح المزوّد أو البيانات التشغيلية المطلوبة.",
  "home.trustTitle": "مبني على الثقة، لا على المظهر فقط",
  "home.trustBody": "كل ادعاء تشغيلي في NaijaDeals مدعوم بسجل على الخادم. لا شيء يُحاكى ليبدو حيًّا.",
  "home.partnerEyebrow": "انمُ مع NaijaDeals",
  "home.partnerTitle": "بِع أو وصّل أو استضف على المنصة نفسها.",
  "home.partnerBody":
    "تقدّم كبائع أو مندوب توصيل أو سائق أو مضيف أو منشئ محتوى. تمر الطلبات بمراجعة المستندات في مركز التحكم قبل أن يتمكن الحساب من العمل.",
  "home.startSelling": "ابدأ البيع",
  "home.partnerOnboarding": "تسجيل الشريك",
  "home.mobileNote": "مصمّم للهاتف أولًا. هذا تطبيق ويب متجاوب، وليس تطبيقًا أصليًا للهاتف.",

  "quick.shop": "تسوّق العروض",
  "quick.send": "أرسل طردًا",
  "quick.pay": "ادفع وحوّل",
  "quick.track": "تتبّع طلبًا",

  "trust.escrow": "محمي بالضمان",
  "trust.escrowBody": "تُتحقق الأموال على الخادم ولا تُحرَّر إلا عند تأكيد الطلب أو الخدمة.",
  "trust.wallet": "محفظة واحدة",
  "trust.walletBody": "ادفع واحتفظ واسترد واستلم المدفوعات من رصيد NaijaPay المدعوم بدفتر أستاذ.",
  "trust.delivery": "توصيل متتبَّع",
  "trust.deliveryBody": "تُسجَّل أحداث الاستلام والعبور والتسليم، ولا تُختلق.",
  "trust.partners": "شركاء موثّقون",
  "trust.partnersBody": "يمر البائعون والمندوبون والمزوّدون بالتسجيل قبل قبول العمل.",

  "status.live": "مباشر",
  "status.setup": "الإعداد مطلوب",

  "products.title": "منظومة NaijaDeals",
  "products.intro":
    "تشترك {count} خدمات في حساب واحد ومحفظة واحدة وشبكة توصيل واحدة. {live} منها متصلة ببيانات خادم حقيقية في هذه البيئة؛ والباقي يفتح صفحة حالة توضّح ما ينقص بالضبط.",
  "products.honestTitle": "لا شيء مزيف",
  "products.legendLive": "متصل بسجلات قاعدة بيانات حقيقية وواجهات الخادم.",
  "products.legendSetup": "يفتح المسار ويذكر المزوّد أو الموافقة أو البيانات التشغيلية الناقصة.",
  "products.legendHonest": "لا تتبّع أو تقييمات أو مخزون أو إيرادات أو تأكيدات مختلقة.",
  "products.walletTitle": "محفظة واحدة عبر كل خدمة",
  "products.walletBody":
    "NaijaPay هي طبقة المال المشتركة. عند ربط خدمة، تُتحقق المدفوعات على الخادم وتُسجَّل في دفتر الأستاذ وتُحمى بالضمان حيث يتطلب سير العمل.",
  "products.openWallet": "افتح NaijaPay",
  "products.group1": "التسوّق والاحتياجات اليومية",
  "products.group1Body": "سلع ومأكولات وبقالة تُوصَّل إلى عنوانك.",
  "products.group2": "التنقّل والإقامة والعمل",
  "products.group2Body": "رحلات ومشاركة رحلات واستئجار مركبات وأماكن للإقامة.",
  "products.group3": "المال والوسائط والمساعدة",
  "products.group3Body": "مدفوعات ومحتوى المبدعين ومساعد Aura.",

  "module.shop.desc": "هواتف وأزياء ومستلزمات منزلية مع دفع بالضمان.",
  "module.eats.desc": "وجبات المطاعم والبوفات تُوصَّل ساخنة إلى بابك.",
  "module.fresh.desc": "منتجات طازجة وأساسيات تُنتقى لك.",
  "module.drive.desc": "سيارات ومقاعد مشتركة ودراجات ورحلات للشركات.",
  "module.send.desc": "طرود داخل المدينة مع أحداث توصيل متتبَّعة.",
  "module.gigs.desc": "محترفون موثّقون للإصلاح والطاقة الشمسية والتصميم.",
  "module.stay.desc": "شقق قصيرة الإقامة وفنادق مُقيَّمة للطاقة والأمان.",
  "module.stream.desc": "قوائم إفريقية وغرف مبدعين وصوت مرخّص.",
  "module.wallet.desc": "رصيد واحد للمدفوعات والضمان ومدفوعات البائعين.",
  "module.aura.desc": "مساعدة عبر المنظومة، فقط عند تهيئتها."
};

export const DICTIONARIES: Record<LanguageCode, Record<DictionaryKey, string>> = { en, sw, ar };

export function isLanguageCode(value: string | null | undefined): value is LanguageCode {
  return value === "en" || value === "sw" || value === "ar";
}

export function isRtl(language: LanguageCode) {
  return LANGUAGES.find((item) => item.code === language)?.dir === "rtl";
}

/** Translate a key and interpolate `{name}` placeholders. Unknown keys fall back to English. */
export function translate(
  language: LanguageCode,
  key: DictionaryKey,
  vars?: Record<string, string | number>
): string {
  const template = DICTIONARIES[language]?.[key] ?? DICTIONARIES.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}
