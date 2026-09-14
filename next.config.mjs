/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Identifica el deploy. El service worker se registra con ?v=<esto>, así que
    // cada deploy estrena caché y purga los anteriores. En Vercel es el commit.
    NEXT_PUBLIC_BUILD_ID:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || `local-${Date.now()}`,
  },
};

export default nextConfig;
