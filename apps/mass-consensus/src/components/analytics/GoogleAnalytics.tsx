'use client';

import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

declare global {
  interface Window {
    gtag?: (
      command: 'config' | 'event' | 'js' | 'set',
      targetId: string | Date,
      config?: Record<string, unknown>
    ) => void;
    dataLayer: unknown[];
  }
}

function GoogleAnalyticsTracking(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!GA_MEASUREMENT_ID || !window.gtag) return;

    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');

    window.gtag('config', GA_MEASUREMENT_ID, {
      page_path: url,
    });
  }, [pathname, searchParams]);

  return null;
}

export function GoogleAnalytics(): React.ReactElement | null {
  if (!GA_MEASUREMENT_ID) {
    return null;
  }

  return (
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
      <Suspense fallback={null}>
        <GoogleAnalyticsTracking />
      </Suspense>
    </>
  );
}

// Helper function to track custom events
export function trackEvent(
  action: string,
  category: string,
  label?: string,
  value?: number
): void {
  if (!GA_MEASUREMENT_ID || typeof window === 'undefined' || !window.gtag) {
    return;
  }

  window.gtag('event', action, {
    event_category: category,
    event_label: label,
    value: value,
  });
}

export default GoogleAnalytics;
