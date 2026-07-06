/** @type {import('next').NextConfig} */

// Security headers applied to every response Next serves.
// CSP allowlist mirrors the external hosts the delivery map actually uses
// (nominatim/OSRM for geocoding+routing, cartocdn tiles, cdnjs for Leaflet's
// CSS + marker images). Widen these lists here if the map ever changes source.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // Next.js injects inline hydration/runtime scripts without a nonce, so 'unsafe-inline' is required.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
  "img-src 'self' data: blob: https://cdnjs.cloudflare.com https://*.basemaps.cartocdn.com",
  "font-src 'self' data:",
  "connect-src 'self' https://nominatim.openstreetmap.org https://router.project-osrm.org",
  // Invoice PDF preview renders the generated PDF as a blob: URL in an <iframe>.
  "frame-src 'self' blob:",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
];

const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
