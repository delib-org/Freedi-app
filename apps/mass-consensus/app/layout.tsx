import { Metadata, Viewport } from 'next';
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" />
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
