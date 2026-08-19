// check_version.cpp
// Fairino 로봇 버전 조회 (SDK, 소프트웨어, 펌웨어 8개 항목)
// 빌드: cl.exe check_version.cpp /I"..\fairino-cpp-sdk-main\windows\libfairino\include" ^
//       ..\fairino-cpp-sdk-main\windows\libfairino\lib\vs2022 x86-64\Release\fairino.lib

#include "robot.h"
#include <iostream>
#include <cstring>

int main(int argc, char* argv[]) {
    const char* ip = (argc > 1) ? argv[1] : "192.168.58.2";

    FRRobot robot;
    std::cout << "=== Fairino Robot Version Check ===\n";
    std::cout << "Target IP: " << ip << "\n\n";

    int ret = robot.RPC(ip);
    if (ret != 0) {
        std::cerr << "RPC connect failed: " << ret << "\n";
        return 1;
    }

    // 1. SDK version
    char sdkVer[64] = {0};
    ret = robot.GetSDKVersion(sdkVer);
    std::cout << "[1] SDK Version: " << (ret == 0 ? sdkVer : "ERROR") << "\n";

    // 2. Software: model, web, controller
    char model[64] = {0}, webVer[64] = {0}, ctrlVer[64] = {0};
    ret = robot.GetSoftwareVersion(model, webVer, ctrlVer);
    if (ret == 0) {
        std::cout << "[2] Robot Model:        " << model << "\n";
        std::cout << "[3] Web Version:        " << webVer << "\n";
        std::cout << "[4] Controller Version: " << ctrlVer << "\n";
    } else {
        std::cout << "[2-4] GetSoftwareVersion ERROR: " << ret << "\n";
    }

    // 3. Firmware: ctrlBox + joint 1~6 + end effector (8 items)
    char ctrlBox[128] = {0};
    char drv[6][128] = {0};
    char endBoard[128] = {0};
    ret = robot.GetFirmwareVersion(ctrlBox, drv[0], drv[1], drv[2],
                                    drv[3], drv[4], drv[5], endBoard);
    if (ret == 0) {
        std::cout << "\n--- Firmware Versions (8 items) ---\n";
        std::cout << "[F1] CtrlBox Board:  " << ctrlBox  << "\n";
        std::cout << "[F2] Joint 1 Driver: " << drv[0]   << "\n";
        std::cout << "[F3] Joint 2 Driver: " << drv[1]   << "\n";
        std::cout << "[F4] Joint 3 Driver: " << drv[2]   << "\n";
        std::cout << "[F5] Joint 4 Driver: " << drv[3]   << "\n";
        std::cout << "[F6] Joint 5 Driver: " << drv[4]   << "\n";
        std::cout << "[F7] Joint 6 Driver: " << drv[5]   << "\n";
        std::cout << "[F8] End Board:      " << endBoard << "\n";
    } else {
        std::cout << "GetFirmwareVersion ERROR: " << ret << "\n";
    }

    robot.CloseRPC();
    std::cout << "\n=== Done ===\n";
    return 0;
}
