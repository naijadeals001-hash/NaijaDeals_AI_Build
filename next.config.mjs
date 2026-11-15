/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow a separate build directory so a local dev server and a production
  // preview can run side by side without overwriting each other's artifacts.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Staging builds set NEXT_OUTPUT_MODE= (empty) because the standalone
  // bundling step cannot write a node_modules symlink when dependencies are
  // shared by junction; the default remains standalone.
  output: process.env.NEXT_OUTPUT_MODE !== undefined ? (process.env.NEXT_OUTPUT_MODE || undefined) : "standalone",
  async redirects() {
    // "/drive" was reaching the generic [slug] placeholder; the ride experience
    // lives at /naijadrive, so send visitors to the real service.
    return [
      { source: "/drive", destination: "/naijadrive", permanent: false },
      // The NaijaShop membership was renamed Prime -> Plus. Old public URLs keep
      // working (and keep any query string) rather than 404-ing bookmarks.
      { source: "/naijashop/prime", destination: "/naijashop/plus", permanent: true }
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" }
        ]
      }
    ];
  }
};

export default nextConfig;
