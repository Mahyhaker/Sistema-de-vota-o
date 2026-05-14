#!/bin/sh
set -eu

if [ -n "${DATABASE_HOST:-}" ]; then
  python scripts/wait_for_db.py
fi

python manage.py migrate --noinput
python manage.py collectstatic --noinput

if [ -n "${ADMIN_PASSWORD:-}" ]; then
  python manage.py seed_admin
fi

exec "$@"
