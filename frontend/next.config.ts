import type { NextConfig } from "next";

// Read when the site is built (`npm run build`), not when it starts: rebuild after changing it.
const backend = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // Lets a second build (for example a demo) live beside the normal one.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // The browser only talks to this site; /api/v1 is passed through to FastAPI.
  // Same origin means the httpOnly refresh cookie works without CORS.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${backend}/api/v1/:path*` }];
  },
};

export default nextConfig;
