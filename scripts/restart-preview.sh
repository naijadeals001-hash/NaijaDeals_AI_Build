#!/usr/bin/env bash
# Restart the NaijaDeals 3015 preview on the CURRENT build.
# `schtasks /end` leaves the detached node child holding the port, so the
# listener tree is killed explicitly before the task is started again.
set -u
PID=$(powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3015 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess" 2>/dev/null | tr -d '\r' | head -1)
if [ -n "${PID:-}" ]; then
  # Walk up to the npm wrapper so the whole chain (npm -> cmd -> next) stops.
  ROOT=$PID
  for _ in 1 2 3 4; do
    PPID_=$(powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=$ROOT').ParentProcessId" 2>/dev/null | tr -d '\r')
    CMD_=$(powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${PPID_}').CommandLine" 2>/dev/null | tr -d '\r')
    case "$CMD_" in
      *"-port 3015"*|*"--port 3015"*) ROOT=$PPID_ ;;
      *) break ;;
    esac
  done
  taskkill //PID "$ROOT" //T //F >/dev/null 2>&1 || taskkill //PID "$PID" //T //F >/dev/null 2>&1
fi
cmd //c "schtasks /run /tn NaijaDealsPreview3015" >/dev/null 2>&1
for _ in $(seq 1 40); do
  sleep 2
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3015/naijafresh/shop)
  [ "$CODE" = "200" ] && { echo "preview up (shop=$CODE)"; exit 0; }
done
echo "preview did not come up (last=$CODE)"; exit 1
