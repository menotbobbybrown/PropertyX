import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Noto_Nastaliq_Urdu, Noto_Sans_Arabic } from "next/font/google";
import { Toaster } from "@/components/toast";
import { WhatsAppWidget } from "@/components/whatsapp-widget";
import { publicAppUrl, COUNTRY } from "@propertyx/shared";
import { LangProvider } from "@/components/i18n";
import { getLang } from "@/lib/i18n-server";
import { dirFor, htmlLang } from "@/lib/i18n";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
// Nastaliq is the script Urdu readers expect; only downloaded when Urdu text is on the page
const urdu = Noto_Nastaliq_Urdu({ subsets: ["arabic"], weight: ["400", "700"], variable: "--font-urdu", display: "swap", preload: false });
// Arabic (UAE site): a clean modern naskh-style sans that pairs with the Latin font
const arabic = Noto_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "600", "700", "800"], variable: "--font-arabic", display: "swap", preload: false });

const APP_URL = publicAppUrl();

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: `${COUNTRY.brand} — Homes, Plots & Commercial Property`, template: `%s | ${COUNTRY.brand}` },
  description: `Search verified houses, flats, plots and commercial property for sale and rent across ${COUNTRY.inName}. AI-powered search, price index, valuation and investment tools.`,
  applicationName: `${COUNTRY.brand}`,
  openGraph: { type: "website", siteName: `${COUNTRY.brand}`, locale: COUNTRY.ogLocale },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#047857", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={htmlLang(lang, COUNTRY.locale)} dir={dirFor(lang)} className={`${jakarta.variable} ${urdu.variable} ${arabic.variable}`}>
      <body className="min-h-dvh">
        <LangProvider lang={lang}>
          {children}
          <WhatsAppWidget />
          <Toaster />
        </LangProvider>
      </body>
    </html>
  );
}
