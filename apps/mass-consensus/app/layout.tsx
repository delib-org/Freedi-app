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
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics';
import ConnectionLostHandler from '@/components/shared/ConnectionLostHandler';
import { ReduxProvider } from '@/components/providers/ReduxProvider';
import { ToastProvider } from '@/components/shared/Toast';
import AccessibilityButton from '@/components/accessibility/AccessibilityButton';
import { ACCESSIBILITY } from '@/constants/common';
import { a11yHtmlAttributes, parseA11yCookie } from '@/lib/accessibility/a11yPrefs';
import './globals.css';
import '@/styles/atoms/_index.scss';
import '@/styles/molecules/_index.scss';
import '@/styles/organisms/_index.scss';
import '@/styles/_themes.scss';

export const metadata: Metadata = {
  title: 'WizCol: Mass Consensus',
  description: 'Fast crowdsourced solution platform',
  openGraph: {
    title: 'WizCol: Mass Consensus',
    description: 'A new way to make decisions together',
    type: 'website',
    images: [{ url: '/og-wizcol.png', width: 1200, height: 630, alt: 'WizCol' }],
  },
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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#5f88e5' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
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

  // Participant accessibility settings, rendered onto <html> so there is no flash
  const a11yPrefs = parseA11yCookie(cookieStore.get(ACCESSIBILITY.COOKIE)?.value);
  const { fontSize, ...a11yAttributes } = a11yHtmlAttributes(a11yPrefs);

  return (
    <html
      lang={language}
      dir={dir}
      {...a11yAttributes}
      style={fontSize ? { fontSize } : undefined}
    >
      <head>
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" />
      </head>
      <body suppressHydrationWarning>
        <NextTranslationProvider
          initialLanguage={language}
          initialDictionary={dictionary}
        >
          <ReduxProvider>
            <AuthProvider>
              <ToastProvider>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {children as any}
              </ToastProvider>
            </AuthProvider>
            <ConnectionLostHandler />
            <AccessibilityButton initialPrefs={a11yPrefs} />
          </ReduxProvider>
        </NextTranslationProvider>
        <GoogleAnalytics />
        <Analytics />
      </body>
    </html>
  );
}
