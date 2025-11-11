import { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Freedi Discussion',
  description: 'Fast crowdsourced solution platform',
  viewport: 'width=device-width, initial-scale=1',
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
      <body>
        {children}
      </body>
    </html>
  );
}
