#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# FeastFlow Load Test Script
# Runs 20 concurrent POST /api/order requests and records results.
# Usage: ORDER_URL=http://localhost bash scripts/load-test.sh
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

ORDER_URL="${ORDER_URL:-http://localhost}"
STUDENT_ID="user123"
PASSWORD="password"
CONCURRENCY=20
RESULTS_FILE="load-test-results.json"
TMP_DIR=$(mktemp -d)

echo "🌙 FeastFlow Load Test"
echo "   Target: $ORDER_URL"
echo "   Concurrency: $CONCURRENCY"
echo ""

# ── Step 1: Login and get JWT token ─────────────────────────────────────────
echo "🔑 Authenticating..."
AUTH_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ORDER_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"studentId\": \"$STUDENT_ID\", \"password\": \"$PASSWORD\"}")

HTTP_CODE=$(echo "$AUTH_RESPONSE" | tail -n1)
AUTH_BODY=$(echo "$AUTH_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Login failed with HTTP $HTTP_CODE: $AUTH_BODY"
  exit 1
fi

TOKEN=$(echo "$AUTH_BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
  echo "❌ Could not extract token from: $AUTH_BODY"
  exit 1
fi

echo "✅ Authenticated. Token obtained."
echo ""

# ── Step 2: Fire concurrent order requests ───────────────────────────────────
echo "🚀 Sending $CONCURRENCY concurrent order requests..."

request_order() {
  local idx=$1
  local tmp_file="$TMP_DIR/result_$idx"
  local idempotency_key=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || echo "key-$idx-$RANDOM")

  local start_ms=$(node -e 'console.log(Date.now())')
  local http_code
  http_code=$(curl -s -o "$tmp_file.body" -w "%{http_code}" \
    -X POST "$ORDER_URL/api/order/" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"itemId\": \"iftar_box\", \"quantity\": 1, \"idempotencyKey\": \"$idempotency_key\"}" \
    --max-time 10 \
    2>/dev/null || echo "000")
  local end_ms=$(node -e 'console.log(Date.now())')
  local duration=$((end_ms - start_ms))

  echo "$http_code $duration" > "$tmp_file.meta"
}

# Fork all requests in parallel
pids=()
for i in $(seq 1 $CONCURRENCY); do
  request_order "$i" &
  pids+=($!)
done

# Wait for all
for pid in "${pids[@]}"; do
  wait "$pid" || true
done

echo "✅ All requests completed."
echo ""

# ── Step 3: Aggregate results ────────────────────────────────────────────────
total=0
success=0
failed=0
slow=0
total_time=0
max_time=0

for i in $(seq 1 $CONCURRENCY); do
  meta_file="$TMP_DIR/result_$i.meta"
  if [ -f "$meta_file" ]; then
    read -r http_code duration < "$meta_file"
    total=$((total + 1))
    total_time=$((total_time + duration))
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
      success=$((success + 1))
    else
      failed=$((failed + 1))
    fi

    if [ "$duration" -gt 1000 ]; then
      slow=$((slow + 1))
    fi

    if [ "$duration" -gt "$max_time" ]; then
      max_time=$duration
    fi
  fi
done

avg_time=0
if [ "$total" -gt 0 ]; then
  avg_time=$((total_time / total))
fi

success_rate=0
if [ "$total" -gt 0 ]; then
  success_rate=$(echo "scale=1; $success * 100 / $total" | bc 2>/dev/null || echo "$((success * 100 / total))")
fi

# ── Step 4: Write JSON results ───────────────────────────────────────────────
cat > "$RESULTS_FILE" <<EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "target": "$ORDER_URL",
  "concurrency": $CONCURRENCY,
  "total": $total,
  "success": $success,
  "failed": $failed,
  "slowResponses": $slow,
  "avgResponseTimeMs": $avg_time,
  "maxResponseTimeMs": $max_time,
  "successRate": "$success_rate%"
}
EOF

echo "📊 Results:"
echo "   Total:        $total"
echo "   Success:      $success"
echo "   Failed:       $failed"
echo "   Slow (>1s):   $slow"
echo "   Avg latency:  ${avg_time}ms"
echo "   Max latency:  ${max_time}ms"
echo "   Success rate: ${success_rate}%"
echo ""
echo "📄 Results saved to $RESULTS_FILE"

# Cleanup
rm -rf "$TMP_DIR"

# Exit 0 always — failures are recorded but don't break the pipeline
exit 0
