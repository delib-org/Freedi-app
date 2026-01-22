import { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/react';
import { cookies, headers } from 'next/headers';
import {
  getTranslations,
  detectLanguage,
  NextTranslationProvider,
} from '@freedi/shared-i18n/next';
import { COOKIE_KEY } from '@freedi/shared-i18n';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { StoreProvider } from '@/lib/store';
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics';
import ConnectionLostHandler from '@/components/shared/ConnectionLostHandler';
import './globals.css';

export const metadata: Metadata = {
  title: 'WizCol: Mass Consensus',
  description: 'Fast crowdsourced solution platform',
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/logo-192px.png',
    other: [
      { rel: 'icon', type: 'image/png', sizes: '48x48', url: '/icons/logo-48px.png' },
      { rel: 'icon', type: 'image/png', sizes: '72x72', url: '/icons/logo-72px.png' },
      { rel: 'icon', type: 'image/png', sizes: '96x96', url: '/icons/logo-96px.png' },
      { rel: 'icon', type: 'image/png', sizes: '128x128', url: '/icons/logo-128px.png' },
      { rel: 'icon', type: 'image/png', sizes: '192x192', url: '/icons/logo-192px.png' },
      { rel: 'icon', type: 'image/png', sizes: '512x512', url: '/icons/logo-512px.png' },
    ],
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
          <AuthProvider>
            <StoreProvider>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {children as any}
            </StoreProvider>
          </AuthProvider>
          <ConnectionLostHandler />
        </NextTranslationProvider>
        <GoogleAnalytics />
        <Analytics />
      </body>
    </html>
  );
}
