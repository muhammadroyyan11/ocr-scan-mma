# Verification - 2026-10-16 (Asia/Jakarta)

Verified on the local Docker deployment at http://localhost:8092.

| Check | Result |
| --- | --- |
| Docker Compose build/start | Passed: PHP 8.2-FPM, Nginx, MariaDB 10.11; database not published |
| Migration | All five migrations applied; repeated migrate --force reports nothing to migrate |
| Laravel feature suite | 24 passed, 126 assertions; guarded SQLite in-memory, separate view cache |
| JavaScript unit suite | 33 passed: label dictionary, sample labels, date ambiguity/calendar, OCR corrections, crop geometry |
| Playwright Chromium | 4 passed: local WASM OCR, two independent crop records, confirmation/save/edit/CSV, fake camera/permission error/track cleanup, mobile touch crop/no overflow, admin user form and real read-only viewer login |
| Worker / external requests | One worker reused across full-image OCR and two crops; no external asset/network requests during OCR test |
| PHP formatting | Laravel Pint --test: 65 PHP files passed |
| JavaScript syntax | node --check passed for application modules, scripts, and tests |
| Persistence | Session and item survived restart of db/app/web; probe removed afterward |
| HTTP smoke | GET /login 200, GET /api/health 200 with connected DB, unauthenticated protected API 401 |
| npm production audit | No vulnerabilities reported at verification time |
| Composer audit | Four explicitly ignored Laravel advisory entries for one package; see SECURITY.md. This is NOT a clean security audit |

Generated E2E sessions/items/viewer account were removed after verification. No real
receiving data was loaded. The initial administrator remains; its random password
is in the local .env, not in this report. Docker services remain running on port 8092.

## Limitations

- Camera tests use Chromium's fake device. Android physical cameras, torch/switch
  capabilities, and a remotely trusted HTTPS certificate require device/infrastructure testing.
- OCR tests use clean synthetic labels rendered by Canvas, not an accuracy benchmark
  on real packaging. Human confirmation remains mandatory.
- Laravel 10 is outside security support; documented advisory exceptions are risk
  acceptance for the requested version, not upstream fixes or production approval.
- Reproduce commands and operational/security guidance are in README.md and SECURITY.md.
