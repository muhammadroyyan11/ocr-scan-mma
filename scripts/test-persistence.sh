#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
marker="PERSIST-$(date +%s)-$(openssl rand -hex 4)"
docker compose exec -T -e PROBE_MARKER="$marker" app php artisan tinker --execute='\App\Models\ReceivingSession::create(["session_number" => env("PROBE_MARKER"), "reference_number" => env("PROBE_MARKER"), "status" => "open"])->items()->create(["lot_number" => env("PROBE_MARKER"), "verification_status" => "verified"]);'
docker compose restart db app web
for attempt in $(seq 1 60); do
    if curl --fail -s http://localhost:8092/api/health >/dev/null; then break; fi
    sleep 2
done
docker compose exec -T -e PROBE_MARKER="$marker" app php artisan tinker --execute='$session = \App\Models\ReceivingSession::where("session_number", env("PROBE_MARKER"))->firstOrFail(); if ($session->items()->where("lot_number", env("PROBE_MARKER"))->count() !== 1) { throw new \RuntimeException("Persistence failed"); } $session->delete(); echo "PASS: session + item survived database/app/web restart. Probe removed.\n";'
