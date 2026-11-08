const { withSentryConfig } = require("@sentry/nextjs");

// Report-only: browsers log violations to the console but block nothing.
// Keep in sync with the Content-Security-Policy-Report-Only value in firebase.json.
const CSP_REPORT_ONLY = "default-src 'self'; script-src 'self' 'unsafe-inline' https://apis.google.com https://www.google.com/recaptcha/ https://www.gstatic.com https://www.googletagmanager.com https://www.youtube.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.cloudfunctions.net https://*.run.app https://*.wizcol.com https://*.web.app https://*.firebaseapp.com https://*.sentry.io https://www.google.com https://www.gstatic.com https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com; frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://www.google.com/recaptcha/ https://recaptcha.google.com https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://*.wizcol.com https://*.web.app; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com";
const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep local dev cleanup away from standalone builds and their traced symlinks.
  distDir: process.env.SIGN_DIST_DIR || '.next',
  poweredByHeader: false,

  // Standalone output for Docker/Cloud Run deployment
  output: process.env.SIGN_STANDALONE === 'false' ? undefined : 'standalone',

  // Transpile shared packages
  transpilePackages: ['@freedi/shared-i18n', '@freedi/shared-utils'],

  // Optimize for production
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn', 'info']
    } : false,
  },

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  // Headers for security and caching
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=60, stale-while-revalidate' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
          { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
        ],
      },
    ];
  },

  // Experimental features
  experimental: {
    optimizePackageImports: ['delib-npm'],
  },
};

module.exports = withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "freedi",
  project: "wizcol-sign",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Hides source maps from generated client bundles
  hideSourceMaps: true,
});
