# Security Policy

## Reporting A Vulnerability

Please report security issues through GitHub Security Advisories for this repository when available, or open an issue with minimal public detail and ask for a private follow-up.

Do not publicly post exploitable details for proxy bypasses, cross-site scripting, or notification abuse until there is a fix.

## Scope

Security-sensitive areas include:

- `api/proxy.js`
- `server.js`
- notification and service worker code in `public/app.js` and `public/sw.js`

The proxy is intentionally allowlisted. Reports that expand the proxy into a generic open proxy will not be accepted.
