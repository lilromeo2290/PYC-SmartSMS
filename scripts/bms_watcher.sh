#!/bin/bash
# PYC SmartSMS — background watcher: auto-fire trial SMS once BMS approves PYCCLUB sender.
# Polls every 5 min for up to 24h. On approval: retries the two failed trial
# messages via the system pipeline and logs everything. Safe to run detached.

KEY="${BMS_API_KEY:?Export BMS_API_KEY (mNotify key) first}"
PASS="${PYC_ADMIN_PASS:?Export PYC_ADMIN_PASS first}"
BASE=http://localhost:3000
JAR=/tmp/pyc-admin.jar
LOG="${LOG:-/tmp/bms_watcher.log}"
M1=cmu5efoyt07proee9834bxpd0
M2=cmu5efplw07rroee9v1cklhgd

echo "[$(date '+%F %T')] watcher started (pid $$)" >> "$LOG"

for i in $(seq 1 288); do
  RESP=$(curl -s -m 15 "https://api.mnotify.com/api/senderid?key=$KEY")
  STATUS=$(echo "$RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log((j.summary||[]).map(s=>s.status).join(','))}catch(e){console.log('parse-err')}})")
  echo "[$(date '+%F %T')] check #$i → $STATUS" >> "$LOG"
  if echo "$STATUS" | grep -qi "approved\|active"; then
    echo "[$(date '+%F %T')] SENDER APPROVED — firing trial" >> "$LOG"
    curl -s -m 10 -c "$JAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
      -d "{\"username\":\"admin\",\"password\":\"$PASS\"}" > /dev/null
    for MID in $M1 $M2; do
      R=$(curl -s -m 25 -b "$JAR" -X POST "$BASE/api/sms/retry" \
        -H "Content-Type: application/json" -d "{\"messageId\":\"$MID\"}")
      echo "[$(date '+%F %T')] retry $MID → $R" >> "$LOG"
    done
    B=$(curl -s -m 15 "https://api.mnotify.com/api/balance/sms?key=$KEY")
    echo "[$(date '+%F %T')] balance after → $B" >> "$LOG"
    echo "[$(date '+%F %T')] watcher done" >> "$LOG"
    exit 0
  fi
  sleep 300
done
echo "[$(date '+%F %T')] gave up after 24h" >> "$LOG"
