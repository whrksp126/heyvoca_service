#!/bin/bash
set -e

if [ -d "/app/migrations" ]; then
    echo ">>> flask db upgrade..."
    flask db upgrade
    echo ">>> Migration complete."
else
    echo ">>> No migrations folder found, skipping flask db upgrade."
fi

echo ">>> Starting gunicorn..."
exec "$@"
