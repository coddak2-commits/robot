#!/bin/sh
# robot-core 리눅스 빌드 (Fairino 정품 펜던트 FR-HMI: Debian 11, aarch64)
# 필요: g++, cmake(압축 해제용). 개발용 패키지(-dev) 없이
# third_party/linux/include 의 헤더 + 시스템의 libzmq.so.5 / libmariadb.so.3 사용
set -e
cd "$(dirname "$0")"

SDK=../fairino-cpp-sdk-main/linux/libfairino
case "$(uname -m)" in
    aarch64|arm64) ARCH=arm3588 ;;
    *) ARCH=x86 ;;
esac
OUT=build-linux
mkdir -p "$OUT/sdk-$ARCH"

if [ ! -d "$OUT/sdk-$ARCH/lib" ]; then
    (cd "$OUT/sdk-$ARCH" && cmake -E tar xf "../../$SDK/lib/$ARCH.zip")
fi
SO=$(ls "$OUT/sdk-$ARCH"/lib/libfairino.so.* | head -n 1)

echo "[build] arch=$ARCH sdk=$SO"
g++ -std=c++17 -O2 -pthread \
    -Iinclude \
    -Ithird_party/linux/include \
    -Ithird_party/linux/include/mariadb \
    -I"$SDK/include" \
    src/robot_core_all.cpp \
    -o "$OUT/robot_core" \
    "$SO" -l:libzmq.so.5 -l:libmariadb.so.3 \
    -Wl,-rpath,'$ORIGIN'

cp -f "$SO" "$OUT/libfairino.so.2"
echo "[BUILD-OK] $OUT/robot_core"
