FROM node:20-bookworm-slim AS assets
WORKDIR /assets
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY scripts/vendor-ocr.mjs scripts/vendor-ocr.mjs
RUN node scripts/vendor-ocr.mjs

FROM php:8.2-fpm-bookworm AS app
RUN apt-get update && apt-get install -y --no-install-recommends \
    git unzip libzip-dev libonig-dev libxml2-dev libsqlite3-dev libicu-dev \
    && docker-php-ext-install pdo_mysql pdo_sqlite mbstring zip intl dom xml xmlwriter opcache \
    && rm -rf /var/lib/apt/lists/*
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /var/www/html
COPY . .
ARG INSTALL_DEV=true
RUN if [ "$INSTALL_DEV" = "true" ]; then composer install --no-interaction --prefer-dist --optimize-autoloader; \
    else composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader; fi \
    && mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache
COPY --from=assets /assets/public/vendor/ocr public/vendor/ocr
COPY docker/entrypoint.sh /usr/local/bin/scanner-entrypoint
RUN chmod +x /usr/local/bin/scanner-entrypoint
ENTRYPOINT ["scanner-entrypoint"]
CMD ["php-fpm"]

FROM nginx:stable-alpine AS web
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY public /var/www/html/public
COPY --from=assets /assets/public/vendor/ocr /var/www/html/public/vendor/ocr
