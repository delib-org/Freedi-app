import { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { cookies, headers } from 'next/headers';
import {
  getTranslations,
  detectLanguage,
  NextTranslationProvider,
} from '@freedi/shared-i18n/next';
import { COOKIE_KEY } from '@freedi/shared-i18n';
import './globals.scss';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

export const metadata: Metadata = {
  title: 'Freedi Sign',
  description: 'Document signing and deliberation platform',
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1B2650',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Detect language from cookie or Accept-Language header
  const cookieStore = await cookies();
  const headersList = await headers();

  const cookieValue = cookieStore.get(COOKIE_KEY)?.value;
  const acceptLanguage = headersList.get('accept-language');

  const language = await detectLanguage(cookieValue, acceptLanguage);
  const { dir, dictionary } = getTranslations(language);

  return (
    <html lang={language} dir={dir}>
      <head>
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" />
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');
              `}
            </Script>
          </>
        )}
      </head>
      <body suppressHydrationWarning>
        <NextTranslationProvider
          initialLanguage={language}
          initialDictionary={dictionary}
        >
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {children as any}
        </NextTranslationProvider>
      </body>
    </html>
  );
}
