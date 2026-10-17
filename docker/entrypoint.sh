#!/bin/sh
set -eu
mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs
chown -R www-data:www-data storage bootstrap/cache
attempt=0
until php -r 'try { new PDO("mysql:host=".getenv("DB_HOST").";port=".getenv("DB_PORT").";dbname=".getenv("DB_DATABASE"), getenv("DB_USERNAME"), getenv("DB_PASSWORD"), [PDO::ATTR_TIMEOUT => 3]); } catch (Throwable $error) { exit(1); }'; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 30 ]; then echo 'Database belum siap setelah 30 percobaan.' >&2; exit 1; fi
    sleep 2
done
php artisan migrate --force
php artisan scanner:bootstrap-admin
exec docker-php-entrypoint "$@"
