cmake_minimum_required(VERSION 3.16)
project(robot_blackfly LANGUAGES CXX)

# Windows(노트북) 빌드용. 리눅스(펜던트)는 build_blackfly_linux.sh 사용
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(MSVC)
    add_compile_options(/utf-8)
endif()
add_definitions(-D_WIN32_WINNT=0x0A00 -DNOMINMAX -DWIN32_LEAN_AND_MEAN)

# Spinnaker SDK: 설치 폴더(C:\Program Files\Teledyne\Spinnaker)의 include, lib64 를 third_party/spinnaker 에 복사해 둠 (git 에는 안 올림)
# 실행에 필요한 DLL 은 노트북에 설치된 Spinnaker 를 씀 (launcher.bat 가 PATH 에 추가)
set(SPIN_ROOT "${CMAKE_SOURCE_DIR}/third_party/spinnaker")
set(SPIN_LIB "${SPIN_ROOT}/lib64/vs2015/Spinnaker_v140.lib")
if(NOT EXISTS "${SPIN_ROOT}/include/Spinnaker.h" OR NOT EXISTS "${SPIN_LIB}")
    message(FATAL_ERROR "Spinnaker SDK 없음: ${SPIN_ROOT} 에 include, lib64 폴더를 복사하세요")
endif()

find_package(nlohmann_json CONFIG REQUIRED)

add_executable(robot_blackfly src/robot_blackfly.cpp)
target_include_directories(robot_blackfly PRIVATE "${CMAKE_SOURCE_DIR}/../robot-core/include" "${SPIN_ROOT}/include")
target_link_libraries(robot_blackfly PRIVATE "${SPIN_LIB}" nlohmann_json::nlohmann_json ws2_32)
