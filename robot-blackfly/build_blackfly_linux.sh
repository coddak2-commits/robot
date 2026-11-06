#!/bin/sh
# robot_blackfly 리눅스 빌드 (Fairino 정품 펜던트 FR-HMI: Debian 11, aarch64)
# Spinnaker: libspinnaker, libspinnaker-dev .deb 를 dpkg-deb -x 로 ~/spinnaker/root 에 풀어 둠 (시스템 설치 안 함)
#   다른 위치면: ./build_blackfly_linux.sh /경로/opt/spinnaker
# 헤더: ../robot-core/include(httplib.h), ../robot-core/third_party/linux/include(json)
set -e
cd "$(dirname "$0")"

SPIN="${1:-$HOME/spinnaker/root/opt/spinnaker}"
[ -f "$SPIN/include/Spinnaker.h" ] || { echo "[BUILD-FAILED] Spinnaker 헤더 없음: $SPIN/include (libspinnaker-dev 를 dpkg-deb -x 로 풀었는지 확인)"; exit 1; }
SO="$SPIN/lib/libSpinnaker.so"
[ -e "$SO" ] || SO=$(find "$SPIN/lib" -maxdepth 1 -name 'libSpinnaker.so.*' -type f | head -n 1)
[ -n "$SO" ] && [ -e "$SO" ] || { echo "[BUILD-FAILED] libSpinnaker.so 없음: $SPIN/lib"; exit 1; }

OUT=build-linux
mkdir -p "$OUT"
echo "[build] spinnaker=$SPIN"
# RPATH(RUNPATH 아님): libSpinnaker 가 같은 폴더의 GenApi 등을 찾도록
g++ -std=c++17 -O2 -pthread -w \
    -I../robot-core/include \
    -I../robot-core/third_party/linux/include \
    -I"$SPIN/include" \
    src/robot_blackfly.cpp \
    -o "$OUT/robot_blackfly" \
    "$SO" \
    -Wl,--disable-new-dtags,-rpath,"$SPIN/lib"

echo "[BUILD-OK] $OUT/robot_blackfly"
