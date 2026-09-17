#!/bin/bash
# PYC SmartSMS — poll BMS sender ID approval; fire trial when approved.
# The two failed trial messages are retried via /api/sms/retry so their
# message IDs and audit chain stay intact.

KEY="${BMS_API_KEY:?Export BMS_API_KEY (mNotify key) first}"
PASS="${PYC_ADMIN_PASS:?Export PYC_ADMIN_PASS first}"
BASE=http://localhost:3000
JAR=/tmp/pyc-admin.jar

# login (fresh cookie)
curl -s -m 10 -c "$JAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"$PASS\"}" > /dev/null

for i in $(seq 1 10); do
  RESP=$(curl -s -m 15 "https://api.mnotify.com/api/senderid?key=$KEY")
  STATUS=$(echo "$RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log((j.summary||[]).map(s=>s.status).join(','))}catch(e){console.log('parse-err')}})")
  echo "[$(date +%H:%M:%S)] check #$i → sender status: $STATUS"
  if echo "$STATUS" | grep -qi "approved\|active"; then
    echo "=== APPROVED — firing retries ==="
    for MID in cmu5efoyt07proee9834bxpd0 cmu5efplw07rroee9v1cklhgd; do
      echo "--- retry $MID ---"
      curl -s -m 25 -b "$JAR" -X POST "$BASE/api/sms/retry" \
        -H "Content-Type: application/json" -d "{\"messageId\":\"$MID\"}"
      echo
    done
    echo "=== BALANCE ==="
    curl -s -m 15 "https://api.mnotify.com/api/balance/sms?key=$KEY"
    echo
    exit 0
  fi
  sleep 30
done
echo "=== Still pending after ~5 min. Will need manual re-fire once approved. ==="
