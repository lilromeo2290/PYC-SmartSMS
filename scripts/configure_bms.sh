#!/bin/bash
# Configure BMS Africa as the SMS provider via the system's own settings API.
set -e
BASE=http://localhost:3000
JAR=/tmp/pyc-admin.jar
KEY="${BMS_API_KEY:?Export BMS_API_KEY (mNotify key) first}"
PASS="${PYC_ADMIN_PASS:?Export PYC_ADMIN_PASS first}"
SENDER="${PYC_SENDER_ID:-PYC CLUB-HO}"

echo "=== Login as admin ==="
curl -s -w '\nHTTP %{http_code}\n' -c "$JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"$PASS\"}"

echo "=== PATCH provider config (BMS Africa) ==="
curl -s -w '\nHTTP %{http_code}\n' -b "$JAR" -X PATCH "$BASE/api/settings/provider" \
  -H 'Content-Type: application/json' \
  -d "{\"providerType\":\"bms\",\"name\":\"BMS Africa (mNotify)\",\"senderId\":\"$SENDER\",\"apiKey\":\"$KEY\"}"

echo "=== GET provider summary (secrets must be masked) ==="
curl -s -b "$JAR" "$BASE/api/settings/provider"
echo
rm -f "$JAR"
