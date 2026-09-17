#!/bin/bash
# PYC SmartSMS — BMS Africa live trial
# Fires test SMS through the system pipeline (POST /api/sms/send).
# Usage: ./bms_trial.sh [numbers...]  (default: 0249783736 0242115299)
# NOTE: sender identity is always PYC CLUB-HO (approved sender ID). Message text
# must never lead with an app/test prefix — the club name is the only identity.

BASE=http://localhost:3000
JAR=/tmp/pyc-admin.jar
KEY="${BMS_API_KEY:?Export BMS_API_KEY (mNotify key) first}"
PASS="${PYC_ADMIN_PASS:?Export PYC_ADMIN_PASS first}"
NUMBERS=("$@")
[ ${#NUMBERS[@]} -eq 0 ] && NUMBERS=(0249783736 0242115299)

MSG='Hello from Progressive Youth Club, Ho! Our new SMS system is now live. This message confirms delivery to your line. We stand for support!'

# 1. Login
curl -s -m 10 -c "$JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"$PASS\"}" | head -c 200
echo; echo "=== SEND TRIAL ==="

# 2. Fire trial SMS (single-recipient pipeline, one call each)
for NUM in "${NUMBERS[@]}"; do
  echo "--- to $NUM ---"
  curl -s -m 25 -b "$JAR" -X POST "$BASE/api/sms/send" \
    -H "Content-Type: application/json" \
    -d "{\"phone\":\"$NUM\",\"message\":\"$MSG\"}"
  echo
done

echo "=== BALANCE AFTER ==="
curl -s -m 15 "https://api.mnotify.com/api/balance/sms?key=$KEY"
echo
