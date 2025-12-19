const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Transpile shared packages
  transpilePackages: ['@freedi/shared-i18n', '@freedi/shared-styles'],

  // SCSS options for shared styles
  sassOptions: {
    includePaths: [path.join(__dirname, '../../packages/shared-styles/scss')],
  },

  // Optimize for production
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn', 'info']
    } : false,
  },

  // Image optimization
  images: {
    domains: ['firebasestorage.googleapis.com'],
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
        ],
      },
    ];
  },

  // Experimental features
  experimental: {
    optimizePackageImports: ['delib-npm'],
  },
};

module.exports = nextConfig;
// Build trigger: 1765803738
