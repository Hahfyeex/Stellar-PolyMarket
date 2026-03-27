/** @type {import('next').NextConfig} */

// Bundle analyzer — run with: ANALYZE=true npm run build:webpack
// Note: @next/bundle-analyzer requires webpack mode (--webpack flag)
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
  },

  // Turbopack config (Next.js 16 default bundler)
  // Vendor chunk splitting is handled automatically by Turbopack.
  // For manual analysis, use: npm run build:webpack
  turbopack: {},

  // Webpack config — used only when building with --webpack flag
  // (e.g. npm run build:webpack or ANALYZE=true npm run build:webpack)
  webpack(config, { isServer }) {
    if (!isServer) {
      // Split heavy third-party libs into separate cached chunks so they are
      // not re-downloaded when app code changes.
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          // recharts + d3 deps into one chunk — only loaded on chart pages
          recharts: {
            test: /[\\/]node_modules[\\/](recharts|d3-.*|victory-.*)[\\/]/,
            name: "vendor-recharts",
            chunks: "all",
            priority: 30,
          },
          // Stellar SDK — large, rarely changes
          stellar: {
            test: /[\\/]node_modules[\\/](@stellar|stellar-base)[\\/]/,
            name: "vendor-stellar",
            chunks: "all",
            priority: 20,
          },
          // Firebase — large, rarely changes
          firebase: {
            test: /[\\/]node_modules[\\/](firebase|@firebase)[\\/]/,
            name: "vendor-firebase",
            chunks: "all",
            priority: 20,
          },
          // Everything else in node_modules
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

module.exports = withBundleAnalyzer(nextConfig);
