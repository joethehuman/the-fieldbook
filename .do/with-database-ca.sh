#!/bin/sh
# App Platform supplies certificate values, not mounted files. Connection URLs
# use sslmode=verify-full and this exact sslrootcert path. Never enable tracing.
set -eu
umask 077
: "${DATABASE_CA_CERT:?Set the managed database CA certificate}"
case "$DATABASE_CA_CERT" in
  *"-----BEGIN CERTIFICATE-----"*"-----END CERTIFICATE-----"*) ;;
  *) echo 'A PEM database CA certificate is required.' >&2; exit 1 ;;
esac
if [ -x /fieldbook-busybox ]; then /fieldbook-busybox mkdir -p /tmp; fi
printf '%s\n' "$DATABASE_CA_CERT" > /tmp/fieldbook-db-ca.crt
exec "$@"
