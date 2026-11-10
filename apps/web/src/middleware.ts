import { NextResponse, type NextRequest } from "next/server";

// Lightweight sliding-window IP rate limiter for edge/middleware protection
const ipRequests = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string, limit = 120, windowMs = 60_000): boolean {
  const now = Date.now();
  const record = ipRequests.get(ip);

  if (!record || now > record.resetAt) {
    ipRequests.set(ip, { count: 1, resetAt: now + windowMs });
    return false;
  }

  record.count++;
  if (record.count > limit) {
    return true;
  }
  return false;
}

// Cleanup stale IP entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRequests.entries()) {
    if (now > record.resetAt) {
      ipRequests.delete(ip);
    }
  }
}, 300_000);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // 1. Client IP detection
  const ip =
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "127.0.0.1";

  // 2. Rate limiting on API routes
  if (pathname.startsWith("/api/")) {
    const isAuthRoute = pathname.startsWith("/api/v1/auth");
    const limit = isAuthRoute ? 25 : 120; // 25 req/min on auth, 120 req/min general

    if (isRateLimited(ip, limit, 60_000)) {
      return new NextResponse(
        JSON.stringify({ error: "Too many requests. Please slow down.", code: "RATE_LIMITED" }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "60",
          },
        }
      );
    }
  }

  // 3. CSRF Verification for State-Modifying Methods (POST, PUT, PATCH, DELETE)
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  const isWebhook = pathname.startsWith("/api/v1/payments/callback") || pathname.includes("/events");

  if (isMutation && !isWebhook) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return new NextResponse(
            JSON.stringify({ error: "Cross-Site Request Forgery (CSRF) check failed", code: "CSRF_FORBIDDEN" }),
            { status: 403, headers: { "content-type": "application/json" } }
          );
        }
      } catch {
        return new NextResponse(
          JSON.stringify({ error: "Invalid Origin header", code: "INVALID_ORIGIN" }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
    }
  }

  // 4. Attach Security Headers
  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
