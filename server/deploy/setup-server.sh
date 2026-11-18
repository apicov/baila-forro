#!/bin/bash
# One-time root setup of the Pico Forró group server on the Linode (run with sudo, after the code is in
# ~tsp/code/pico-forro-server with its .venv, and forro.apicov.xyz points at this server):
#   the group code (made once, printed), the systemd service, the Apache vhosts and the certificate.
# Running it again keeps the code and the data.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DOMAIN=forro.apicov.xyz
DATA=/home/tsp/pico-forro-data

[ "$(id -u)" = 0 ] || { echo "Run with sudo" >&2; exit 1; }

install -d -m 750 -o tsp -g tsp "$DATA"
install -d -m 750 -o root -g tsp /etc/pico-forro
if [ ! -f /etc/pico-forro/server.env ]; then
  CODE="forro-$(python3 -c 'import secrets; print(secrets.token_hex(4))')"
  printf 'FORRO_GROUP_CODE=%s\nFORRO_DB=%s/forro.db\n' "$CODE" "$DATA" > /etc/pico-forro/server.env
  chmod 640 /etc/pico-forro/server.env; chown root:tsp /etc/pico-forro/server.env
fi

# SELinux: systemd only starts programs labelled bin_t, and a home folder isn't (as pico-reader's venv)
VENV_BIN=/home/tsp/code/pico-forro-server/.venv/bin
semanage fcontext -a -t bin_t "$VENV_BIN(/.*)?" 2>/dev/null || semanage fcontext -m -t bin_t "$VENV_BIN(/.*)?"
restorecon -R "$VENV_BIN"

install -m 644 "$HERE/pico-forro.service" /etc/systemd/system/pico-forro.service
systemctl daemon-reload
systemctl enable --now pico-forro
systemctl restart pico-forro

install -m 644 "$HERE/forro-http.conf" /etc/httpd/conf.d/forro-http.conf
apachectl configtest && systemctl reload httpd
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  certbot certonly --webroot -w /var/www/acme -d "$DOMAIN" --non-interactive --agree-tos --keep-until-expiring
fi
install -m 644 "$HERE/forro-https.conf" /etc/httpd/conf.d/forro-https.conf
apachectl configtest && systemctl reload httpd

sleep 1
curl -fsS "https://$DOMAIN/api/health" && echo
echo "Group code: $(sed -n 's/^FORRO_GROUP_CODE=//p' /etc/pico-forro/server.env)"
echo "Server:     https://$DOMAIN/ (the app: Library ⋮ → Sharing)"
