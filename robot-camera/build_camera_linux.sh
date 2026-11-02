#!/bin/sh
# robot_camera 리눅스 빌드 (Fairino 정품 펜던트 FR-HMI: Debian 11, aarch64)
# Orbbec SDK: ~/orbbec 의 OrbbecSDK_*linux*arm64* 폴더 (tar.gz 만 있으면 풀어서 사용)
#   다른 위치면: ./build_camera_linux.sh /경로/OrbbecSDK_폴더
# 헤더: ../robot-core/include(httplib.h), ../robot-core/third_party/linux/include(json, mariadb)
set -e
cd "$(dirname "$0")"

SDK="$1"
if [ -z "$SDK" ]; then
    SDK=$(find "$HOME/orbbec" -maxdepth 1 -type d -name 'OrbbecSDK_*linux*' 2>/dev/null | head -n 1)
fi
if [ -z "$SDK" ]; then
    TGZ=$(find "$HOME/orbbec" -maxdepth 1 -type f -name 'OrbbecSDK_*linux*.tar.gz' 2>/dev/null | head -n 1)
    if [ -z "$TGZ" ]; then
        echo "[BUILD-FAILED] Orbbec SDK 없음: ~/orbbec 에 OrbbecSDK_..._linux_arm64.tar.gz 를 넣으세요"
        exit 1
    fi
    echo "[build] 압축 풀기: $TGZ"
    (cd "$HOME/orbbec" && tar xzf "$TGZ")
    SDK=$(find "$HOME/orbbec" -maxdepth 1 -type d -name 'OrbbecSDK_*linux*' | head -n 1)
fi

HDR=$(find "$SDK" -path '*/libobsensor/ObSensor.hpp' | head -n 1)
[ -n "$HDR" ] || { echo "[BUILD-FAILED] ObSensor.hpp 없음: $SDK"; exit 1; }
INC=$(dirname "$(dirname "$HDR")")
SO=$(find "$SDK" -name 'libOrbbecSDK.so*' -type f | head -n 1)
[ -n "$SO" ] || { echo "[BUILD-FAILED] libOrbbecSDK.so 없음: $SDK"; exit 1; }
LIBDIR=$(dirname "$SO")

OUT=build-linux
mkdir -p "$OUT"
# 라이브러리 + extensions 폴더를 실행 파일 옆에 복사 (RPATH=$ORIGIN)
cp -a "$LIBDIR"/. "$OUT"/

echo "[build] sdk=$SDK"
g++ -std=c++17 -O2 -pthread \
    -I../robot-core/include \
    -I../robot-core/third_party/linux/include \
    -I../robot-core/third_party/linux/include/mariadb \
    -I"$INC" \
    src/robot_camera.cpp \
    -o "$OUT/robot_camera" \
    "$SO" -l:libmariadb.so.3 \
    -Wl,-rpath,'$ORIGIN'

echo "[BUILD-OK] $OUT/robot_camera"
