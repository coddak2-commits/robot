cmake_minimum_required(VERSION 3.16)
project(robot_core VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Windows specific settings
if(WIN32)
    add_definitions(-DWINDOWS_OPTION)
    add_definitions(-DWIN32)
    # Windows 10 required for cpp-httplib
    add_definitions(-D_WIN32_WINNT=0x0A00)
    # Unity build: windows.h의 min/max 매크로가 std::max/std::min과 충돌하는 것 방지
    add_definitions(-DNOMINMAX)
endif()

# MSVC UTF-8 support for Korean text in source files
if(MSVC)
    add_compile_options(/utf-8)
endif()

# Fairino SDK paths (저장소에 포함됨)
if(WIN32)
    set(FAIRINO_SDK_DIR "${CMAKE_SOURCE_DIR}/../fairino-cpp-sdk-main/windows/libfairino")
    set(FAIRINO_INCLUDE_DIR "${FAIRINO_SDK_DIR}/include")
    set(FAIRINO_LIB_DIR "${FAIRINO_SDK_DIR}/lib/vs2022 x86-64/Release")
else()
    # 리눅스: SDK가 zip으로 들어 있으므로 빌드 폴더에 풀어서 사용
    # aarch64 = Fairino 정품 펜던트 FR-HMI(RK3588), 그 외 = x86
    set(FAIRINO_SDK_DIR "${CMAKE_SOURCE_DIR}/../fairino-cpp-sdk-main/linux/libfairino")
    set(FAIRINO_INCLUDE_DIR "${FAIRINO_SDK_DIR}/include")
    if(NOT FAIRINO_LINUX_ARCH)
        if(CMAKE_SYSTEM_PROCESSOR MATCHES "aarch64|arm64")
            set(FAIRINO_LINUX_ARCH "arm3588")
        else()
            set(FAIRINO_LINUX_ARCH "x86")
        endif()
    endif()
    set(FAIRINO_EXTRACT_DIR "${CMAKE_BINARY_DIR}/fairino-${FAIRINO_LINUX_ARCH}")
    if(NOT EXISTS "${FAIRINO_EXTRACT_DIR}/lib")
        file(MAKE_DIRECTORY "${FAIRINO_EXTRACT_DIR}")
        execute_process(
            COMMAND ${CMAKE_COMMAND} -E tar xf "${FAIRINO_SDK_DIR}/lib/${FAIRINO_LINUX_ARCH}.zip"
            WORKING_DIRECTORY "${FAIRINO_EXTRACT_DIR}"
            RESULT_VARIABLE FAIRINO_UNZIP_RESULT
        )
        if(NOT FAIRINO_UNZIP_RESULT EQUAL 0)
            message(FATAL_ERROR "Fairino SDK 압축 해제 실패: ${FAIRINO_LINUX_ARCH}.zip")
        endif()
    endif()
    file(GLOB FAIRINO_SO "${FAIRINO_EXTRACT_DIR}/lib/libfairino.so.*")
    list(GET FAIRINO_SO 0 FAIRINO_SO)
    message(STATUS "Fairino SDK (linux): ${FAIRINO_SO}")
endif()

# MariaDB Connector/C paths
# vcpkg: vcpkg install libmariadb:x64-windows (CI 환경)
# 로컬: C:/Program Files/MariaDB 11.4 설치 시 자동 감지
# 리눅스: libmariadb-dev 패키지 (/usr/include/mariadb)
if(NOT WIN32)
    set(MARIADB_VIA_VCPKG FALSE)
    find_path(MARIADB_INCLUDE_DIR mysql.h PATH_SUFFIXES mariadb mysql REQUIRED)
    find_library(MARIADB_LIBRARY NAMES mariadb mariadbclient REQUIRED)
    message(STATUS "MariaDB (linux): ${MARIADB_LIBRARY}")
else()
find_package(unofficial-libmariadb CONFIG QUIET)
if(unofficial-libmariadb_FOUND)
    message(STATUS "MariaDB found via vcpkg")
    set(MARIADB_VIA_VCPKG TRUE)
else()
    message(STATUS "MariaDB not found via vcpkg, using local installation")
    set(MARIADB_VIA_VCPKG FALSE)
    if(DEFINED ENV{MARIADB_DIR})
        set(MARIADB_DIR "$ENV{MARIADB_DIR}")
    else()
        set(MARIADB_DIR "C:/PROGRA~1/MARIAD~1.4")
    endif()
    set(MARIADB_INCLUDE_DIR "${MARIADB_DIR}/include/mysql")
    set(MARIADB_LIB_DIR "${MARIADB_DIR}/lib")
endif()
endif()

# Find ZeroMQ via vcpkg
if(WIN32)
find_package(ZeroMQ CONFIG REQUIRED)
find_package(cppzmq CONFIG REQUIRED)
else()
    # 리눅스: libzmq3-dev(pkg-config) + cppzmq-dev(zmq.hpp 헤더만 사용)
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(ZMQ REQUIRED libzmq)
    find_path(CPPZMQ_INCLUDE_DIR zmq.hpp REQUIRED)
    find_package(Threads REQUIRED)
endif()
find_package(nlohmann_json CONFIG REQUIRED)

# Include directories
include_directories(
    ${CMAKE_SOURCE_DIR}/include
    ${FAIRINO_INCLUDE_DIR}
)
if(NOT MARIADB_VIA_VCPKG)
    include_directories(${MARIADB_INCLUDE_DIR})
endif()
if(NOT WIN32)
    include_directories(${CPPZMQ_INCLUDE_DIR} ${ZMQ_INCLUDE_DIRS})
endif()

# Source files (33개 .cpp를 src/robot_core_all.cpp 하나로 물리적 병합)
set(SOURCES
    src/robot_core_all.cpp
)

# Windows resource file for icon
if(WIN32)
    set(RESOURCES resources/app.rc)
endif()

# Create executable (WIN32 = Windows GUI application, no console window)
if(WIN32)
    add_executable(robot_core WIN32 ${SOURCES} ${RESOURCES})
else()
    add_executable(robot_core ${SOURCES} ${RESOURCES})
endif()

# Link libraries
if(WIN32)
target_link_libraries(robot_core
    PRIVATE
    ${FAIRINO_LIB_DIR}/fairino.lib
    libzmq
    cppzmq
    nlohmann_json::nlohmann_json
    ws2_32
    shell32
    user32
    comctl32
)
if(MARIADB_VIA_VCPKG)
    target_link_libraries(robot_core PRIVATE unofficial::libmariadb)
else()
    target_link_libraries(robot_core PRIVATE ${MARIADB_LIB_DIR}/libmariadb.lib)
endif()
else()
# 리눅스: libfairino.so.2 를 실행 파일 옆에 두고 거기서 찾도록 RPATH=$ORIGIN
target_link_libraries(robot_core
    PRIVATE
    ${FAIRINO_SO}
    ${ZMQ_LIBRARIES}
    nlohmann_json::nlohmann_json
    ${MARIADB_LIBRARY}
    Threads::Threads
)
set_target_properties(robot_core PROPERTIES
    BUILD_RPATH "$ORIGIN"
    INSTALL_RPATH "$ORIGIN"
)
add_custom_command(TARGET robot_core POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
    "${FAIRINO_SO}"
    "$<TARGET_FILE_DIR:robot_core>/libfairino.so.2"
)
endif()

if(WIN32)
# Copy Fairino DLL to output directory
add_custom_command(TARGET robot_core POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
    "${FAIRINO_LIB_DIR}/fairino.dll"
    $<TARGET_FILE_DIR:robot_core>
)

# Copy ZeroMQ DLL to output directory
add_custom_command(TARGET robot_core POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
    $<TARGET_FILE:libzmq>
    $<TARGET_FILE_DIR:robot_core>
)

# Copy MariaDB DLL to output directory
if(MARIADB_VIA_VCPKG)
    # vcpkg가 VCPKG_APPLOCAL_DEPS로 자동 복사하지만, 명시적으로도 처리
    find_file(MARIADB_DLL_PATH NAMES libmariadb.dll PATHS "${VCPKG_INSTALLED_DIR}/${VCPKG_TARGET_TRIPLET}/bin" "C:/vcpkg/installed/x64-windows/bin" NO_DEFAULT_PATH)
    if(MARIADB_DLL_PATH)
        add_custom_command(TARGET robot_core POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${MARIADB_DLL_PATH}"
            $<TARGET_FILE_DIR:robot_core>
        )
    endif()
else()
    add_custom_command(TARGET robot_core POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${MARIADB_LIB_DIR}/libmariadb.dll"
        $<TARGET_FILE_DIR:robot_core>
    )
endif()

# Installation
install(TARGETS robot_core DESTINATION bin)
install(FILES "${FAIRINO_LIB_DIR}/fairino.dll" DESTINATION bin)
endif()
