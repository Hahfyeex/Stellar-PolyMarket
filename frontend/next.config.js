/** @type {import('next').NextConfig} */

// Bundle analyzer — run with: ANALYZE=true npm run build:webpack
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  // Network-first for API calls (5s timeout → fallback to cache)
  runtimeCaching: [
    {
      urlPattern: ({ url }) =>
        url.origin === (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"),
      handler: "NetworkFirst",
      options: {
        cacheName: "api-cache",
        networkTimeoutSeconds: 5,
        expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      // Cache last-fetched markets list
      urlPattern: /\/api\/markets/,
      handler: "NetworkFirst",
      options: {
        cacheName: "markets-cache",
        networkTimeoutSeconds: 5,
        expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      // Cache-first for static assets
      urlPattern: /\.(?:js|css|woff2?|png|jpg|jpeg|svg|ico|webp)$/i,
      handler: "CacheFirst",
      options: {
        cacheName: "static-assets",
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      // Cache Next.js pages (network-first)
      urlPattern: /^\/_next\//,
      handler: "CacheFirst",
      options: {
        cacheName: "next-static",
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
});

const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
  },

  // Turbopack config (Next.js 16 default bundler)
  turbopack: {},

  // Webpack config — used only when building with --webpack flag
  webpack(config, { isServer }) {
    if (!isServer) {
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          recharts: {
            test: /[\\/]node_modules[\\/](recharts|d3-.*|victory-.*)[\\/]/,
            name: "vendor-recharts",
            chunks: "all",
            priority: 30,
          },
          stellar: {
            test: /[\\/]node_modules[\\/](@stellar|stellar-base)[\\/]/,
            name: "vendor-stellar",
            chunks: "all",
            priority: 20,
          },
          firebase: {
            test: /[\\/]node_modules[\\/](firebase|@firebase)[\\/]/,
            name: "vendor-firebase",
            chunks: "all",
            priority: 20,
          },
          vendors: {
            test: /[\\/]node_modules[\\/]/,
            name: "vendors",
            chunks: "all",
            priority: 10,
          },
        },
      };
    }
    return config;
  },
};

module.exports = withBundleAnalyzer(withPWA(nextConfig));
