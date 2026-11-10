import { AR, AR_PATTERNS } from "./i18n-ar";

/**
 * Minimal English / Urdu (Pakistan site) / Arabic (UAE site) translation. Strings are keyed by their English text, so anything
 * without an Urdu entry simply stays in English. Listing titles, descriptions and other
 * user-written content are never translated.
 */
export type Lang = "en" | "ur" | "ar";
export const LANG_COOKIE = "px_lang";
export const LANGS: Lang[] = ["en", "ur", "ar"];

const CITIES: Record<string, string> = {
  Lahore: "لاہور",
  Islamabad: "اسلام آباد",
  Karachi: "کراچی",
  Rawalpindi: "راولپنڈی",
  Multan: "ملتان",
  Faisalabad: "فیصل آباد",
  Gujranwala: "گوجرانوالہ",
  Peshawar: "پشاور",
  Sahiwal: "ساہیوال",
  Burewala: "بورے والا",
  Vehari: "وہاڑی",
  "Mian Channu": "میاں چنوں",
  Chichawatni: "چیچہ وطنی",
};

const UR: Record<string, string> = {
  ...CITIES,
  // header & navigation
  Buy: "خریدیں",
  Rent: "کرایہ",
  Sell: "فروخت",
  Projects: "پراجیکٹس",
  Plots: "پلاٹ",
  Commercial: "کمرشل",
  Agents: "ایجنٹس",
  Invest: "سرمایہ کاری",
  Areas: "علاقے",
  Map: "نقشہ",
  Tools: "ٹولز",
  More: "مزید",
  Saved: "محفوظ",
  Messages: "پیغامات",
  Notifications: "اطلاعات",
  "Post Property": "پراپرٹی پوسٹ کریں",
  "Login / Register": "لاگ ان / رجسٹر",
  Login: "لاگ ان",
  "Open menu": "مینو کھولیں",
  "Close menu": "مینو بند کریں",
  "Ask the AI assistant": "اے آئی اسسٹنٹ سے پوچھیں",
  "Loading…": "لوڈ ہو رہا ہے…",
  "You're all caught up.": "کوئی نئی اطلاع نہیں۔",
  "Mark all read": "سب کو پڑھا ہوا کریں",
  "Notification settings": "اطلاعات کی ترتیبات",
  Dashboard: "ڈیش بورڈ",
  Account: "اکاؤنٹ",
  "Sign out": "سائن آؤٹ",
  "Admin panel": "ایڈمن پینل",
  Home: "ہوم",
  Search: "تلاش",
  "Skip to content": "مواد پر جائیں",
  // nav menus
  Homes: "گھر",
  Houses: "مکانات",
  "Flats & Apartments": "فلیٹس اور اپارٹمنٹس",
  Villas: "ولاز",
  Penthouses: "پینٹ ہاؤسز",
  Farmhouses: "فارم ہاؤسز",
  "Upper / Lower Portions": "اپر / لوئر پورشن",
  "By city": "شہر کے لحاظ سے",
  Rentals: "کرایے",
  "Houses for rent": "کرایے کے مکانات",
  "Flats for rent": "کرایے کے فلیٹس",
  Portions: "پورشن",
  Rooms: "کمرے",
  Offices: "دفاتر",
  Shops: "دکانیں",
  "New projects": "نئے پراجیکٹس",
  "All projects": "تمام پراجیکٹس",
  Developers: "ڈویلپرز",
  "Residential plots": "رہائشی پلاٹ",
  "Commercial plots": "کمرشل پلاٹ",
  "Plot files": "پلاٹ فائلز",
  "Agricultural land": "زرعی زمین",
  Warehouses: "گودام",
  Factories: "فیکٹریاں",
  Buildings: "عمارتیں",
  "Commercial for rent": "کرایے کی کمرشل پراپرٹی",
  "Find professionals": "ماہرین تلاش کریں",
  "Property agents": "پراپرٹی ایجنٹس",
  Agencies: "ایجنسیاں",
  Investing: "سرمایہ کاری",
  "Investment opportunities": "سرمایہ کاری کے مواقع",
  "AI investment advisor": "اے آئی سرمایہ کاری مشیر",
  "Price index": "قیمتوں کا انڈیکس",
  "Installment projects": "قسطوں والے پراجیکٹس",
  "Area guides": "علاقوں کی رہنمائی",
  "All areas": "تمام علاقے",
  Calculators: "کیلکولیٹرز",
  "AI property assistant": "اے آئی پراپرٹی اسسٹنٹ",
  "What's my property worth?": "میری پراپرٹی کی قیمت کیا ہے؟",
  "Investment advisor": "سرمایہ کاری مشیر",
  "Home loan / Islamic finance": "ہوم لون / اسلامی فنانس",
  "Installment calculator": "قسط کیلکولیٹر",
  "Construction cost": "تعمیراتی لاگت",
  "Compare properties": "پراپرٹیز کا موازنہ",
  Learn: "معلومات",
  "Guides & news": "رہنمائی اور خبریں",
  "Community forum": "کمیونٹی فورم",
  // footer
  "AI Property Assistant": "اے آئی پراپرٹی اسسٹنٹ",
  "Property Valuation": "پراپرٹی کی قیمت",
  "Investment Advisor": "سرمایہ کاری مشیر",
  "Home Finance": "ہوم فنانس",
  "Construction Cost": "تعمیراتی لاگت",
  "Price Index": "قیمتوں کا انڈیکس",
  "Post a property": "پراپرٹی پوسٹ کریں",
  Pricing: "قیمتیں",
  "Guides & News": "رہنمائی اور خبریں",
  Community: "کمیونٹی",
  "Help & Support": "مدد اور سپورٹ",
  "Safety tips": "حفاظتی تجاویز",
  Terms: "شرائط",
  Privacy: "پرائیویسی",
  "Pakistan's intelligent property marketplace — verified listings, transparent pricing data and AI that explains every match.":
    "پاکستان کی سمارٹ پراپرٹی مارکیٹ — تصدیق شدہ لسٹنگز، شفاف قیمتیں اور اے آئی جو ہر انتخاب کی وجہ بتاتی ہے۔",
  "Demo environment — listings, agents, agencies, developers and projects shown here are sample data generated for demonstration and do not represent real offers.":
    "ڈیمو ماحول — یہاں دکھائی گئی لسٹنگز، ایجنٹس، ایجنسیاں، ڈویلپرز اور پراجیکٹس نمونے کا ڈیٹا ہیں، حقیقی پیشکش نہیں۔",
  "All rights reserved.": "جملہ حقوق محفوظ ہیں۔",
  "Prices and estimates are indicative. Always verify ownership documents before paying.": "قیمتیں اور تخمینے اندازاً ہیں۔ ادائیگی سے پہلے ملکیت کے کاغذات کی تصدیق ضرور کریں۔",
  // home page
  "Find a Place You'll Love to Call Home.": "ایسا گھر تلاش کریں جسے آپ اپنا کہنا پسند کریں۔",
  "Search verified homes, plots and commercial property across Pakistan — with AI that explains every match.":
    "پورے پاکستان میں تصدیق شدہ گھر، پلاٹ اور کمرشل پراپرٹی تلاش کریں — اے آئی کے ساتھ جو ہر انتخاب کی وجہ بتاتی ہے۔",
  Flats: "فلیٹس",
  "New Projects": "نئے پراجیکٹس",
  "Five-level verification on listings and agents": "لسٹنگز اور ایجنٹس کی پانچ درجاتی تصدیق",
  "AI search that explains why each property matches": "اے آئی تلاش جو بتاتی ہے کہ ہر پراپرٹی کیوں موزوں ہے",
  "Fraud checks on prices, photos and phone numbers": "قیمتوں، تصاویر اور فون نمبرز پر فراڈ کی جانچ",
  "Explore more on Bismillah": "بسم اللہ پر مزید دیکھیں",
  "The best investment opportunities": "سرمایہ کاری کے بہترین مواقع",
  "Construction Cost Calculator": "تعمیراتی لاگت کیلکولیٹر",
  "Get construction cost estimate": "تعمیر کی لاگت کا تخمینہ لگائیں",
  "Home Loan Calculator": "ہوم لون کیلکولیٹر",
  "Find affordable loan packages": "مناسب لون پیکجز تلاش کریں",
  "Area Guides": "علاقوں کی رہنمائی",
  "Explore housing societies in Pakistan": "پاکستان کی ہاؤسنگ سوسائٹیز دیکھیں",
  "Plot Finder": "پلاٹ فائنڈر",
  "Find plots in any housing society": "کسی بھی ہاؤسنگ سوسائٹی میں پلاٹ تلاش کریں",
  "Property Index": "پراپرٹی انڈیکس",
  "Track changes in real estate prices": "پراپرٹی کی قیمتوں میں تبدیلی دیکھیں",
  "Area Unit Converter": "رقبہ یونٹ کنورٹر",
  "Convert any area unit instantly": "کوئی بھی رقبہ یونٹ فوراً تبدیل کریں",
  "Property Trends": "پراپرٹی رجحانات",
  "Find popular areas to buy property": "پراپرٹی خریدنے کے مقبول علاقے",
  "Featured properties": "نمایاں پراپرٹیز",
  "Hand-picked and promoted listings across Pakistan": "پورے پاکستان سے منتخب اور نمایاں لسٹنگز",
  "View all": "سب دیکھیں",
  "Tell us what you need. We'll find it and explain why.": "بتائیں آپ کو کیا چاہیے۔ ہم تلاش کریں گے اور وجہ بھی بتائیں گے۔",
  "Searches live listings only — it never invents properties or prices. Refine in plain words: “show cheaper options”, “only corner houses”, “with possession”.":
    "صرف موجودہ لسٹنگز میں تلاش کرتا ہے — کبھی فرضی پراپرٹی یا قیمت نہیں بناتا۔ سادہ الفاظ میں بہتر کریں: ”سستے آپشن دکھائیں“، ”صرف کارنر گھر“، ”قبضے کے ساتھ“۔",
  "Recommended for you": "آپ کے لیے تجاویز",
  "Based on what you've viewed and saved": "آپ کی دیکھی اور محفوظ کی گئی پراپرٹیز کی بنیاد پر",
  Sponsored: "سپانسرڈ",
  "Learn more": "مزید جانیں",
  "Explore by city": "شہر کے لحاظ سے دیکھیں",
  "Live listing counts from Bismillah": "بسم اللہ پر موجود لسٹنگز کی تعداد",
  "All cities": "تمام شہر",
  "{n} properties": "{n} پراپرٹیز",
  "Apartments, villas and plots with payment plans": "ادائیگی کے منصوبوں کے ساتھ اپارٹمنٹس، ولاز اور پلاٹ",
  From: "سے شروع",
  "On request": "رابطہ کریں",
  "Latest rentals": "تازہ ترین کرایے",
  "Freshly listed homes for rent": "کرایے کے لیے نئے گھر",
  "Smarter decisions": "بہتر فیصلے",
  "Free calculators built for Pakistani property": "پاکستانی پراپرٹی کے لیے مفت کیلکولیٹرز",
  "What's My Property Worth?": "میری پراپرٹی کی قیمت کیا ہے؟",
  "Describe what you need in plain words.": "سادہ الفاظ میں بتائیں آپ کو کیا چاہیے۔",
  "Indicative value from comparable listings.": "ملتی جلتی لسٹنگز سے اندازاً قیمت۔",
  "Yield, ROI, cash flow and a clear score.": "منافع، آر او آئی، کیش فلو اور واضح سکور۔",
  "Conventional and Islamic financing.": "روایتی اور اسلامی فنانسنگ۔",
  "Installment Planner": "قسطوں کا منصوبہ",
  "Full schedule for any payment plan.": "کسی بھی ادائیگی منصوبے کا مکمل شیڈول۔",
  "Grey structure to finishing, itemised.": "گرے سٹرکچر سے فنشنگ تک، تفصیل کے ساتھ۔",
  "Verified agents": "تصدیق شدہ ایجنٹس",
  "Identity-checked professionals": "شناخت شدہ ماہرین",
  "Guides & insights": "رہنمائی اور معلومات",
  // hero search
  City: "شہر",
  "Area / Society": "علاقہ / سوسائٹی",
  "e.g. DHA Phase 6, Bahria Town, F-11": "مثلاً ڈی ایچ اے فیز 6، بحریہ ٹاؤن، ایف-11",
  "Property type": "پراپرٹی کی قسم",
  "All homes": "تمام گھر",
  "All plots": "تمام پلاٹ",
  "All commercial": "تمام کمرشل",
  "Min price": "کم از کم قیمت",
  "Max price": "زیادہ سے زیادہ قیمت",
  Beds: "بیڈز",
  Baths: "باتھ",
  Any: "کوئی بھی",
  Studio: "سٹوڈیو",
  "Search Properties": "پراپرٹی تلاش کریں",
  "Search Projects": "پراجیکٹس تلاش کریں",
  "Search on Map": "نقشے پر تلاش",
  // property cards
  "No photo": "تصویر نہیں",
  Bedrooms: "بیڈرومز",
  Bathrooms: "باتھ رومز",
  Area: "رقبہ",
  Compare: "موازنہ",
  "Demo listing": "ڈیمو لسٹنگ",
  Featured: "نمایاں",
  "Price reduced": "قیمت کم ہوئی",
  // floating AI assistant
  "Ask AI": "اے آئی سے پوچھیں",
  Close: "بند کریں",
  "Searches live listings only": "صرف موجودہ لسٹنگز میں تلاش",
  "Start over": "دوبارہ شروع کریں",
  "Open full assistant": "مکمل اسسٹنٹ کھولیں",
  "Close assistant": "اسسٹنٹ بند کریں",
  "Assalam o Alaikum! Tell me what you're looking for — budget in lakh or crore, size in marla, city or area — and I'll find matching listings.":
    "السلام علیکم! بتائیں آپ کیا تلاش کر رہے ہیں — بجٹ لاکھ یا کروڑ میں، رقبہ مرلہ میں، شہر یا علاقہ — اور میں موزوں لسٹنگز تلاش کروں گا۔",
  "10 marla house in Lahore under 5 crore": "لاہور میں 10 مرلہ گھر 5 کروڑ تک",
  "2 bed flat for rent in Islamabad": "اسلام آباد میں 2 بیڈ فلیٹ کرایے پر",
  "Plots on installments in Multan": "ملتان میں قسطوں پر پلاٹ",
  "Searching listings…": "لسٹنگز تلاش ہو رہی ہیں…",
  "e.g. Show cheaper options": "مثلاً سستے آپشن دکھائیں",
  "Message the assistant": "اسسٹنٹ کو پیغام لکھیں",
  Send: "بھیجیں",
  "See all {n} results →": "تمام {n} نتائج دیکھیں ←",
  "{n}% match": "{n}% موزوں",
  "Open AI assistant": "اے آئی اسسٹنٹ کھولیں",
  "Close AI assistant": "اے آئی اسسٹنٹ بند کریں",
  "Premium Verified": "پریمیم تصدیق شدہ",
  "Verified Property": "تصدیق شدہ پراپرٹی",
  "Docs Submitted": "کاغذات جمع",
  "ID Verified": "شناخت تصدیق شدہ",
  "Phone Verified": "فون تصدیق شدہ",
  "Price Reduced": "قیمت کم ہوئی",
  "Verified Agent": "تصدیق شدہ ایجنٹ",
  Verified: "تصدیق شدہ",
  Premium: "پریمیم",
  // property types
  House: "مکان",
  Flat: "فلیٹ",
  Apartment: "اپارٹمنٹ",
  "Upper Portion": "اپر پورشن",
  "Lower Portion": "لوئر پورشن",
  Room: "کمرہ",
  Farmhouse: "فارم ہاؤس",
  Villa: "ولا",
  Penthouse: "پینٹ ہاؤس",
  "Residential Plot": "رہائشی پلاٹ",
  "Commercial Plot": "کمرشل پلاٹ",
  "Plot File": "پلاٹ فائل",
  "Agricultural Land": "زرعی زمین",
  Office: "دفتر",
  Shop: "دکان",
  Warehouse: "گودام",
  Factory: "فیکٹری",
  Building: "عمارت",
  Other: "دیگر",
  // PropertyX vs Zameen Trust Pillars & Market Intelligence
  "Verified Title Deeds (Zero Ghost Ads)": "تصدیق شدہ ملکیتی دستاویزات (جعلی اشتہارات سے پاک)",
  "Digital Bayana (100% Escrow Refund Guarantee)": "ڈیجیٹل بیعانہ (۱۰۰٪ رقم واپسی کی گارنٹی)",
  "Hedonic AVM (Transparent Price CI Ranges)": "خودکار تخمینہ قیمت (شفاف مارکیٹ ریٹ)",
  "WhatsApp-Native (Direct Verified Chat)": "واٹس ایپ رابطہ (براہ راست تصدیق شدہ بات چیت)",
  "Market Pulse:": "مارکیٹ کی صورتحال:",
  "Reserve Property (Escrow Token)": "پراپرٹی محفوظ کریں (ایسکرو ٹوکن)",
  "Instant 1-Click WhatsApp Direct": "ایک کلک پر واٹس ایپ رابطہ",
  "View Details →": "تفصیلات دیکھیں ←",

  // language switch
  "اردو میں دیکھیں": "اردو میں دیکھیں",
  "View in English": "View in English",
};

/** Patterns for generated labels such as "Houses in Lahore". `$1` is translated too (city names). */
const PATTERNS: [RegExp, string][] = [
  [/^Houses in (.+)$/, "$1 میں مکانات"],
  [/^Rent in (.+)$/, "$1 میں کرایہ"],
  [/^Property in (.+)$/, "$1 میں پراپرٹی"],
  [/^Projects in (.+)$/, "$1 میں پراجیکٹس"],
  [/^Plots in (.+)$/, "$1 میں پلاٹ"],
];

export type TFunc = (text: string, vars?: Record<string, string | number>) => string;

const TABLES: Partial<Record<Lang, { dict: Record<string, string>; patterns: [RegExp, string][] }>> = {
  ur: { dict: UR, patterns: PATTERNS },
  ar: { dict: AR, patterns: AR_PATTERNS },
};

export function makeT(lang: Lang): TFunc {
  const table = TABLES[lang];
  return (text, vars) => {
    let out = text;
    if (table) {
      const hit = table.dict[text];
      if (hit) out = hit;
      else
        for (const [re, tpl] of table.patterns) {
          const m = text.match(re);
          if (m) {
            out = tpl.replace("$1", table.dict[m[1]] ?? m[1]);
            break;
          }
        }
    }
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
    return out;
  };
}

export const isLang = (v: unknown): v is Lang => v === "en" || v === "ur" || v === "ar";
export const dirFor = (lang: Lang) => (lang === "en" ? "ltr" : "rtl");
/** value for <html lang>; the CSS keys the script-specific fonts off it */
export const htmlLang = (lang: Lang, fallback: string) => (lang === "ur" ? "ur-PK" : lang === "ar" ? "ar-AE" : fallback);
