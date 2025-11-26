import { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import {
  getTranslations,
  detectLanguage,
  NextTranslationProvider,
} from '@freedi/shared-i18n/next';
import { COOKIE_KEY } from '@freedi/shared-i18n';
import './globals.css';

export const metadata: Metadata = {
  title: 'Freedi Discussion',
  description: 'Fast crowdsourced solution platform',
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#5f88e5',
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
