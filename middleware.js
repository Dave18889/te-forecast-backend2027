// Password-protects the entire site (pages + API routes) using HTTP Basic
// Auth — the browser shows its own built-in login popup, no custom login
// page needed. Same approach as the other GPJ dashboards.
//
// Requires two environment variables set in Vercel (Settings → Environment
// Variables): SITE_USER and SITE_PASSWORD.
import { next } from '@vercel/edge';

export const config = {
  matcher: '/:path*',
};

export default function middleware(request) {
  // If no password has been configured yet, don't prompt for one — the
  // site should work normally until SITE_USER/SITE_PASSWORD are both set.
  if (!process.env.SITE_USER || !process.env.SITE_PASSWORD) {
    return next();
  }

  const auth = request.headers.get('authorization');

  if (auth && auth.startsWith('Basic ')) {
    const decoded = atob(auth.slice(6));
    const separatorIndex = decoded.indexOf(':');
    const user = decoded.slice(0, separatorIndex);
    const pass = decoded.slice(separatorIndex + 1);

    if (user === process.env.SITE_USER && pass === process.env.SITE_PASSWORD) {
      return next();
    }
  }

  return new Response('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="2027 T&E Forecast"' },
  });
}
