# Security / deployment notes

## Framework constraint

This project intentionally uses Laravel **10.50.3** with PHP 8.2 to match the requested
stack. Laravel 10 is outside its upstream security support window. Do not describe
this application as safe for unrestricted public production solely because its tests pass.

Dependency resolution on 2026-10-16 required four **explicit advisory exceptions** for
Laravel 10 in `composer.json`. Global security blocking remains enabled; older Laravel
patches affected by other advisories are not exempted. `composer.lock` is committed.

| Advisory | Exposure reduction in this application (not a framework fix) |
| --- | --- |
| PKSA-d5tc-s1qs-h781 / GHSA-jh5r-qr3c-85q8 | Debug-page XSS: APP_DEBUG=false by default; never enable debug on exposed deployments. |
| PKSA-m5cs-t1y6-qpcs / GHSA-crmm-hgp2-wgrp | Temporary signed URL path confusion: no signed URL features/routes are used. |
| PKSA-3r5d-mb8f-1qw9 / GHSA-5vg9-5847-vvmq | Email-rule CRLF injection: no outgoing email or email password reset feature. |
| PKSA-mdq4-51ck-6kdq / GHSA-5vg9-5847-vvmq | Duplicate upstream email advisory entry. Same limitation. |

Review the upstream Laravel advisories and `composer audit` before deployment. Exceptions
are documented risk acceptance under a version constraint, not remediation. A supported
framework migration needs explicit project approval; the app does not silently upgrade.
Use a restricted network and supported reverse proxy/runtime, and plan that migration.
Future advisories, changed features, or changed exploit preconditions require re-evaluation.

## Implemented controls

- Real session authentication, session ID/token regeneration on login/logout, HttpOnly
  SameSite=Lax cookies, optional Secure cookies, active-account checks on every request.
- `auth.session` rejects sessions whose stored password hash no longer matches.
- Server-side role policies and owner scoping for all session/item reads/writes/export.
- CSRF on every mutation including JSON API, login throttling, per-user API throttling.
- Server validation, whitelisted mass assignment, bounded payloads/crop metadata,
  transactions and session row locks around related item changes/status transitions.
- Blade escaping / DOM textContent for user/OCR content. CSV cells prefixed against formulas.
- No uploads, permanent image storage, base64 database images, public DB port, default
  shared password, public registration, or production secrets embedded in image/source.
- No user deletion endpoint; deactivation preserves attribution. Admin self-demotion
  and self-deactivation are prohibited; last active administrator is protected.

## Deployment checklist

1. Keep APP_DEBUG=false. Never deploy PHPUnit/dev tooling publicly as application routes.
   Build with INSTALL_DEV=false after tests; no PHP development server is used.
2. Use trusted HTTPS for remote camera access, secure session cookies, correct APP_URL,
   restricted firewall/VPN, and explicit trusted proxies if behind an edge proxy.
3. Rotate the bootstrap admin password; remove INITIAL_ADMIN_PASSWORD from running
   container environment after setup. Protect .env, database backups, and Docker access.
4. Review who receives supervisor/viewer access: these roles can read all receiving data.
5. Keep database/storage volumes and image backups. Define business data retention.
6. Re-run tests and audit after dependency/image updates. Never treat successful OCR as
   proof that a product is authentic, unexpired, or safe for use.

Report suspected issues privately to the deployment owner. Do not put real label data,
passwords, or database dumps into public bug reports.
