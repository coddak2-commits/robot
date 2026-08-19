#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include <iostream>
#include <csignal>
#include <atomic>
#include <thread>
#include <chrono>
#include <nlohmann/json.hpp>
#include <filesystem>
#ifdef _WIN32
#include <windows.h>
#include <shellapi.h>
#endif
using json = nlohmann::json;
bool g_packagedMode = false;
std::string g_webRoot = "";
#ifdef _WIN32
void startFrontendDevServer() {
    char exePath[MAX_PATH];
    GetModuleFileNameA(NULL, exePath, MAX_PATH);
    std::string exeDir(exePath);
    size_t pos = exeDir.find_last_of("\\/");
    exeDir = exeDir.substr(0, pos);
    pos = exeDir.find_last_of("\\/");
    exeDir = exeDir.substr(0, pos);
    pos = exeDir.find_last_of("\\/");
    std::string projectRoot = exeDir.substr(0, pos);
    std::string frontendDir = projectRoot + "\\robot-front";
    std::cout << "[Main] Starting React dev server in: " << frontendDir << std::endl;
    std::string cmdLine = "cmd.exe /c \"set BROWSER=none && set PORT=3000 && npm start\"";
    STARTUPINFOA si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    if (CreateProcessA(NULL, const_cast<char*>(cmdLine.c_str()), NULL, NULL, FALSE,
                       CREATE_NO_WINDOW, NULL, frontendDir.c_str(), &si, &pi)) {
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
        std::cout << "[Main] React dev server starting (port 3000)..." << std::endl;
    } else {
        std::cerr << "[Main] Failed to start React dev server: " << GetLastError() << std::endl;
    }
}
void stopFrontendDevServer() {
    std::cout << "[Main] Stopping React dev server..." << std::endl;
    STARTUPINFOA si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    std::string cmdLine = "powershell.exe -WindowStyle Hidden -Command \""
        "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | "
        "ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }\"";
    if (CreateProcessA(NULL, const_cast<char*>(cmdLine.c_str()), NULL, NULL, FALSE,
                       CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
        WaitForSingleObject(pi.hProcess, 5000);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
    }
}
#endif
std::atomic<bool> g_running{true};
std::atomic<bool> g_restart{false};
RobotService* g_robotService = nullptr;
ZmqServer* g_zmqServer = nullptr;
HttpServer* g_httpServer = nullptr;
std::string g_robotIp = "192.168.58.2";
std::string g_exePath;
int g_httpPort = 8080;
#ifdef _WIN32
TrayIcon* g_trayIcon = nullptr;
static bool g_consoleAllocated = false;
void allocateConsole() {
    if (!g_consoleAllocated) {
        AllocConsole();
        FILE* fp;
        freopen_s(&fp, "CONOUT$", "w", stdout);
        freopen_s(&fp, "CONOUT$", "w", stderr);
        freopen_s(&fp, "CONIN$", "r", stdin);
        g_consoleAllocated = true;
    }
}
void freeConsole() {
    if (g_consoleAllocated) {
        FreeConsole();
        g_consoleAllocated = false;
    }
}
void hideConsole() {
    HWND hwnd = GetConsoleWindow();
    if (hwnd) {
        ShowWindow(hwnd, SW_HIDE);
    }
}
void showConsole() {
    if (!g_consoleAllocated) {
        allocateConsole();
    }
    HWND hwnd = GetConsoleWindow();
    if (hwnd) {
        ShowWindow(hwnd, SW_SHOW);
        SetForegroundWindow(hwnd);
    }
}
void restartApplication() {
    std::cout << "[Main] Restarting application..." << std::endl;
    g_restart = true;
    g_running = false;
}
#endif
void signalHandler(int signum) {
    std::cout << "\n[Main] Received signal " << signum << ", shutting down..." << std::endl;
    g_running = false;
}
void printBanner() {
    std::cout << "========================================" << std::endl;
    std::cout << "  Robot Core v1.0.0" << std::endl;
    std::cout << "  Fairino Robot Control Service" << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout << std::endl;
}
int runService() {
    printBanner();
    FileLogger::instance().init("", 50, 30, LogLevel::LOG_DEBUG);
    FLOG_INFO("Main", "Robot Core 서비스 시작");
#ifdef _WIN32
    char exePath[MAX_PATH];
    GetModuleFileNameA(NULL, exePath, MAX_PATH);
    std::string exeDir(exePath);
    size_t lastSlash = exeDir.find_last_of("\\/");
    exeDir = exeDir.substr(0, lastSlash);
    std::string wwwPath = exeDir + "\\www";
    if (std::filesystem::exists(wwwPath) && std::filesystem::exists(wwwPath + "\\index.html")) {
        g_packagedMode = true;
        g_webRoot = wwwPath;
        std::cout << "[Main] Packaged mode detected - serving static files from: " << g_webRoot << std::endl;
    } else {
        std::cout << "[Main] Development mode - starting React dev server..." << std::endl;
        startFrontendDevServer();
    }
#endif
    ConfigService::instance().loadFromFile();
    RobotService robotService;
    ZmqServer zmqServer(robotService);
    DatabaseService dbService;
    dbService.connect();
    HttpServer httpServer(robotService, &dbService);
    SafeShutdownManager shutdownMgr(robotService);
    ProcessStability::installCrashHandlers(&shutdownMgr);
    FLOG_INFO("Main", "Error recovery system initialized");
    if (g_packagedMode && !g_webRoot.empty()) {
        httpServer.setWebRoot(g_webRoot);
    }
    g_robotService = &robotService;
    g_zmqServer = &zmqServer;
    g_httpServer = &httpServer;
    if (!zmqServer.start(5555, 5556)) {
        std::cerr << "[Main] Failed to start ZeroMQ server" << std::endl;
        return 1;
    }
    if (!httpServer.start(g_httpPort)) {
        std::cerr << "[Main] Failed to start HTTP server on port " << g_httpPort << std::endl;
    }
    std::cout << "[Main] Robot IP: " << g_robotIp << std::endl;
    std::cout << "[Main] ZeroMQ Command port: 5555" << std::endl;
    std::cout << "[Main] ZeroMQ Publisher port: 5556" << std::endl;
    std::cout << "[Main] HTTP API port: " << g_httpPort << std::endl;
    std::cout << std::endl;
#ifdef _WIN32
    ManagementDialog mgmtDialog;
    mgmtDialog.setHttpPort(g_httpPort);
    mgmtDialog.setExitCallback([]() {
        g_running = false;
    });
    mgmtDialog.setRestartCoreCallback([]() {
        restartApplication();
    });
    TrayIcon trayIcon;
    g_trayIcon = &trayIcon;
    if (trayIcon.initialize("Robot Core - Starting...")) {
        trayIcon.setExitCallback([]() {
            g_running = false;
        });
        trayIcon.setRestartCallback([]() {
            restartApplication();
        });
        trayIcon.setShowWindowCallback([&mgmtDialog]() {
            mgmtDialog.show(GetModuleHandle(NULL));
        });
    }
#endif
    robotService.setStateCallback([&zmqServer](const ROBOT_STATE_PKG& state) {
        json stateJson;
        stateJson["type"] = "state";
        stateJson["robot_state"] = state.robot_state;
        stateJson["robot_mode"] = state.robot_mode;
        stateJson["main_code"] = state.main_code;
        stateJson["sub_code"] = state.sub_code;
        stateJson["motion_done"] = state.motion_done;
        stateJson["emergency_stop"] = state.EmergencyStop;
        stateJson["joints"] = json::array();
        for (int i = 0; i < 6; i++) {
            stateJson["joints"].push_back(state.jt_cur_pos[i]);
        }
        stateJson["tcp"] = {
            {"x", state.tl_cur_pos[0]},
            {"y", state.tl_cur_pos[1]},
            {"z", state.tl_cur_pos[2]},
            {"rx", state.tl_cur_pos[3]},
            {"ry", state.tl_cur_pos[4]},
            {"rz", state.tl_cur_pos[5]}
        };
        zmqServer.publishState(stateJson.dump());
    });
    robotService.setErrorCallback([](int code, const std::string& message) {
        std::cerr << "[Main] Robot error: " << code << " - " << message << std::endl;
    });
    robotService.setReconnectCallback([
#ifdef _WIN32
        &mgmtDialog
#endif
    ](bool connected, const std::string& ip) {
        std::cout << "[Main] Connection status changed: " << (connected ? "Connected" : "Disconnected") << std::endl;
#ifdef _WIN32
        if (g_trayIcon) {
            g_trayIcon->setConnectionStatus(connected, ip);
        }
        mgmtDialog.setRobotStatus(connected, ip);
#endif
    });
    robotService.setAutoReconnect(true);
    std::cout << "[Main] Attempting to connect to robot at " << g_robotIp << "..." << std::endl;
    int connectResult = robotService.connect(g_robotIp);
    if (connectResult == 0) {
        std::cout << "[Main] Connected to robot successfully" << std::endl;
        FLOG_INFO("Main", "로봇 연결 성공: " + g_robotIp);
#ifdef _WIN32
        if (g_trayIcon) {
            g_trayIcon->setConnectionStatus(true, g_robotIp);
        }
#endif
    } else {
        std::cout << "[Main] Failed to connect to robot (code: " << connectResult << ")" << std::endl;
        std::cout << "[Main] Auto-reconnect enabled, will retry automatically..." << std::endl;
        FLOG_WARN("Main", "로봇 연결 실패 (code=" + std::to_string(connectResult) + "), 자동 재연결 대기");
#ifdef _WIN32
        if (g_trayIcon) {
            g_trayIcon->setConnectionStatus(false);
        }
#endif
    }
    robotService.startStateMonitor(50);
    std::cout << std::endl;
    std::cout << "[Main] Robot Core is running." << std::endl;
#ifdef _WIN32
    std::cout << "[Main] Use system tray icon to restart or exit." << std::endl;
#else
    std::cout << "[Main] Press Ctrl+C to stop." << std::endl;
#endif
    std::cout << std::endl;
    while (g_running) {
#ifdef _WIN32
        if (g_trayIcon) {
            g_trayIcon->processMessages();
        }
        mgmtDialog.processMessages();
#endif
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
    std::cout << "[Main] Shutting down..." << std::endl;
    FLOG_INFO("Main", "Robot Core 서비스 종료 시작");
    ProcessStability::uninstallCrashHandlers();
#ifdef _WIN32
    if (g_trayIcon) {
        g_trayIcon->shutdown();
        g_trayIcon = nullptr;
    }
    if (!g_restart && !g_packagedMode) {
        stopFrontendDevServer();
    }
#endif
    robotService.stopStateMonitor();
    httpServer.stop();
    zmqServer.stop();
    if (robotService.isConnected()) {
        robotService.disconnect();
    }
    g_robotService = nullptr;
    g_zmqServer = nullptr;
    g_httpServer = nullptr;
    FLOG_INFO("Main", "Robot Core 서비스 종료 완료");
    FileLogger::instance().shutdown();
    return 0;
}
#ifdef _WIN32
int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow) {
    (void)hInstance;
    (void)hPrevInstance;
    (void)nCmdShow;
    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);
    char exePath[MAX_PATH];
    GetModuleFileNameA(NULL, exePath, MAX_PATH);
    g_exePath = exePath;
    if (lpCmdLine && strlen(lpCmdLine) > 0) {
        g_robotIp = lpCmdLine;
        size_t start = g_robotIp.find_first_not_of(" \t");
        if (start != std::string::npos) {
            g_robotIp = g_robotIp.substr(start);
        }
        size_t space = g_robotIp.find_first_of(" \t");
        if (space != std::string::npos) {
            g_robotIp = g_robotIp.substr(0, space);
        }
    }
    int result = 0;
    do {
        g_restart = false;
        g_running = true;
        result = runService();
        if (g_restart) {
            std::this_thread::sleep_for(std::chrono::seconds(2));
        }
    } while (g_restart);
    return result;
}
#else
int main(int argc, char* argv[]) {
    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);
    if (argc > 0) {
        g_exePath = argv[0];
    }
    if (argc > 1) {
        g_robotIp = argv[1];
    }
    int result = 0;
    do {
        g_restart = false;
        g_running = true;
        result = runService();
        if (g_restart) {
            std::cout << "[Main] Restarting in 2 seconds..." << std::endl;
            std::this_thread::sleep_for(std::chrono::seconds(2));
        }
    } while (g_restart);
    std::cout << "[Main] Goodbye!" << std::endl;
    return result;
}
#endif
#include "robot_core_all.h"
#include "robot_core_all.h"
#include <iostream>
#include <chrono>
RobotService::RobotService() {
}
RobotService::~RobotService() {
    stopStateMonitor();
    if (m_connected) {
        disconnect();
    }
}
int RobotService::connect(const std::string& ip) {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_lastIp = ip;
    if (m_connected) {
        std::cout << "[RobotService] Already connected" << std::endl;
        return 0;
    }
    std::cout << "[RobotService] Connecting to " << ip << "..." << std::endl;
    int ret = m_robot.RPC(ip.c_str());
    if (ret == 0) {
        m_connected = true;
        m_reconnectAttempts = 0;
        std::cout << "[RobotService] Connected successfully" << std::endl;
        char version[64] = {0};
        m_robot.GetSDKVersion(version);
        std::cout << "[RobotService] SDK Version: " << version << std::endl;
        int gasInit = m_robot.SetAspirated(0, 0);
        std::cout << "[RobotService] Initial gas OFF on connect: result=" << gasInit << std::endl;
        if (m_reconnectCallback) {
            m_reconnectCallback(true, ip);
        }
    } else {
        std::cerr << "[RobotService] Connection failed: " << ret << std::endl;
        FLOG_SDK_ERROR("RPC", ret, "로봇 연결 실패 IP=" + ip);
    }
    return ret;
}
int RobotService::disconnect() {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) {
        return 0;
    }
    std::cout << "[RobotService] Disconnecting..." << std::endl;
    int ret = m_robot.CloseRPC();
    m_connected = false;
    if (m_reconnectCallback) {
        m_reconnectCallback(false, m_lastIp);
    }
    return ret;
}
int RobotService::enable() {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    std::cout << "[RobotService] Enabling robot..." << std::endl;
    int ret = m_robot.RobotEnable(1);
    if (ret != 0) {
        FLOG_SDK_ERROR("RobotEnable(1)", ret, "서보 활성화 실패");
    }
    return ret;
}
int RobotService::disable() {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    std::cout << "[RobotService] Disabling robot..." << std::endl;
    int ret = m_robot.RobotEnable(0);
    if (ret != 0) {
        FLOG_SDK_ERROR("RobotEnable(0)", ret, "서보 비활성화 실패");
    }
    return ret;
}
int RobotService::setMode(int mode) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    std::cout << "[RobotService] Setting mode: " << mode << std::endl;
    return m_robot.Mode(mode);
}
ROBOT_STATE_PKG RobotService::getState() {
    ROBOT_STATE_PKG state = {0};
    if (m_connected) {
        m_robot.GetRobotRealTimeState(&state);
    }
    return state;
}
int RobotService::moveJ(const double joints[6], int tool, int user,
                        float vel, float acc, float ovl, float blendT,
                        uint8_t offsetFlag, const double* offsetPos) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    JointPos jointPos(joints[0], joints[1], joints[2],
                      joints[3], joints[4], joints[5]);
    ExaxisPos epos(0, 0, 0, 0);
    DescPose offset(0, 0, 0, 0, 0, 0);
    if (offsetPos) {
        offset = DescPose(offsetPos[0], offsetPos[1], offsetPos[2],
                          offsetPos[3], offsetPos[4], offsetPos[5]);
    }
    std::cout << "[RobotService] MoveJ: ["
              << joints[0] << ", " << joints[1] << ", " << joints[2] << ", "
              << joints[3] << ", " << joints[4] << ", " << joints[5]
              << "] vel=" << vel << std::endl;
    int ret = m_robot.MoveJ(&jointPos, tool, user, vel, acc, ovl,
                            &epos, blendT, offsetFlag, &offset);
    if (ret != 0) {
        FLOG_SDK_ERROR("MoveJ", ret, "관절이동 실패");
    }
    return ret;
}
int RobotService::moveL(const double descPos[6], int tool, int user,
                        float vel, float acc, float ovl, float blendR,
                        uint8_t search, uint8_t offsetFlag,
                        const double* offsetPos, int velAccParamMode,
                        int overSpeedStrategy, int speedPercent) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    DescPose targetPos(descPos[0], descPos[1], descPos[2],
                       descPos[3], descPos[4], descPos[5]);
    ExaxisPos epos(0, 0, 0, 0);
    DescPose offset(0, 0, 0, 0, 0, 0);
    if (offsetPos) {
        offset = DescPose(offsetPos[0], offsetPos[1], offsetPos[2],
                          offsetPos[3], offsetPos[4], offsetPos[5]);
    }
    std::cout << "[RobotService] MoveL: ["
              << descPos[0] << ", " << descPos[1] << ", " << descPos[2] << ", "
              << descPos[3] << ", " << descPos[4] << ", " << descPos[5]
              << "] vel=" << vel << " blendR=" << blendR << " velAccParamMode=" << velAccParamMode << std::endl;
    int ret = m_robot.MoveL(&targetPos, tool, user, vel, acc, ovl,
                            blendR, 0, &epos, search, offsetFlag, &offset,
                            -1, velAccParamMode, overSpeedStrategy, speedPercent);
    if (ret != 0) {
        FLOG_SDK_ERROR("MoveL", ret, "직선이동 실패");
    }
    return ret;
}
int RobotService::getForwardKin(const double joints[6], double descPos[6]) {
    if (!m_connected) return -1;
    JointPos jp(joints[0], joints[1], joints[2], joints[3], joints[4], joints[5]);
    DescPose dp;
    int ret = m_robot.GetForwardKin(&jp, &dp);
    if (ret == 0) {
        descPos[0] = dp.tran.x; descPos[1] = dp.tran.y; descPos[2] = dp.tran.z;
        descPos[3] = dp.rpy.rx; descPos[4] = dp.rpy.ry; descPos[5] = dp.rpy.rz;
    }
    return ret;
}
int RobotService::getInverseKin(const double descPos[6], const double refJoints[6], double jointResult[6]) {
    if (!m_connected) return -1;
    DescPose dp;
    dp.tran.x = descPos[0]; dp.tran.y = descPos[1]; dp.tran.z = descPos[2];
    dp.rpy.rx = descPos[3]; dp.rpy.ry = descPos[4]; dp.rpy.rz = descPos[5];
    JointPos ref(refJoints[0], refJoints[1], refJoints[2], refJoints[3], refJoints[4], refJoints[5]);
    JointPos result;
    int ret = m_robot.GetInverseKinRef(0, &dp, &ref, &result);
    if (ret == 0) {
        for (int i = 0; i < 6; i++) jointResult[i] = result.jPos[i];
    }
    return ret;
}
int RobotService::moveC(const double jointsP[6], const double tcpP[6], int toolP, int userP, float velP,
                         const double jointsT[6], const double tcpT[6], int toolT, int userT, float velT,
                         float ovl, float blendR, float oacc, int velAccParamMode) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    JointPos jpP(jointsP[0], jointsP[1], jointsP[2], jointsP[3], jointsP[4], jointsP[5]);
    DescPose dpP(tcpP[0], tcpP[1], tcpP[2], tcpP[3], tcpP[4], tcpP[5]);
    JointPos jpT(jointsT[0], jointsT[1], jointsT[2], jointsT[3], jointsT[4], jointsT[5]);
    DescPose dpT(tcpT[0], tcpT[1], tcpT[2], tcpT[3], tcpT[4], tcpT[5]);
    ExaxisPos epos(0, 0, 0, 0);
    DescPose offP(0, 0, 0, 0, 0, 0);
    DescPose offT(0, 0, 0, 0, 0, 0);
    std::cout << "[RobotService] MoveC: P=[" << tcpP[0] << "," << tcpP[1] << "," << tcpP[2]
              << "] T=[" << tcpT[0] << "," << tcpT[1] << "," << tcpT[2]
              << "] velP=" << velP << " velT=" << velT << " ovl=" << ovl << std::endl;
    int ret = m_robot.MoveC(&jpP, &dpP, toolP, userP, velP, 100, &epos, 0, &offP,
                            &jpT, &dpT, toolT, userT, velT, 100, &epos, 0, &offT,
                            ovl, blendR, oacc, velAccParamMode);
    if (ret != 0) {
        FLOG_SDK_ERROR("MoveC", ret, "원호이동 실패");
    }
    return ret;
}
int RobotService::moveLWithJoints(const double joints[6], const double descPos[6],
                                   int tool, int user, float vel, float acc, float ovl,
                                   float blendR, uint8_t search, uint8_t offsetFlag,
                                   const double* offsetPos, int velAccParamMode, float oacc,
                                   int overSpeedStrategy, int speedPercent) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    JointPos jointPos(joints[0], joints[1], joints[2],
                      joints[3], joints[4], joints[5]);
    DescPose targetPos(descPos[0], descPos[1], descPos[2],
                       descPos[3], descPos[4], descPos[5]);
    ExaxisPos epos(0, 0, 0, 0);
    DescPose offset(0, 0, 0, 0, 0, 0);
    if (offsetPos) {
        offset = DescPose(offsetPos[0], offsetPos[1], offsetPos[2],
                          offsetPos[3], offsetPos[4], offsetPos[5]);
    }
    std::cout << "[RobotService] MoveLWithJoints: tcp=["
              << descPos[0] << "," << descPos[1] << "," << descPos[2]
              << "] vel=" << vel << " velAccParamMode=" << velAccParamMode
              << " acc=" << acc << " ovl=" << ovl << " blendR=" << blendR << std::endl;
    int ret = m_robot.MoveL(&jointPos, &targetPos, tool, user, vel, acc, ovl,
                            blendR, 0, &epos, search, offsetFlag, &offset,
                            oacc, velAccParamMode, overSpeedStrategy, speedPercent);
    if (ret != 0) {
        FLOG_SDK_ERROR("MoveLWithJoints", ret,
            "vel=" + std::to_string(vel) + " velMode=" + std::to_string(velAccParamMode) +
            " acc=" + std::to_string(acc) + " ovl=" + std::to_string(ovl));
    }
    return ret;
}
int RobotService::stopMotion() {
    if (!m_connected) return -1;
    std::cout << "[RobotService] Stopping motion... (no mutex)" << std::endl;
    return m_robot.StopMotion();
}
int RobotService::emergencyStop() {
    if (!m_connected) return -1;
    std::cout << "[RobotService] 🚨 EMERGENCY STOP! (no mutex)" << std::endl;
    int result1 = m_robot.StopMotion();
    int result2 = m_robot.ImmStopJOG();
    std::cout << "[RobotService] StopMotion=" << result1 << ", ImmStopJOG=" << result2 << std::endl;
    return (result1 == 0 || result2 == 0) ? 0 : -1;
}
int RobotService::setSpeed(float speed) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    std::cout << "[RobotService] Setting speed: " << speed << "%" << std::endl;
    return m_robot.SetSpeed(speed);
}
int RobotService::startJog(int ref, int nb, int dir, float vel, float acc, float maxDis) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    std::cout << "[RobotService] StartJOG ref=" << ref << " axis=" << nb
              << " dir=" << dir << " vel=" << vel << " maxDis=" << maxDis << std::endl;
    return m_robot.StartJOG(static_cast<uint8_t>(ref), static_cast<uint8_t>(nb),
                            static_cast<uint8_t>(dir), vel, acc, maxDis);
}
int RobotService::stopJog(int ref) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    std::cout << "[RobotService] StopJOG ref=" << ref << std::endl;
    return m_robot.StopJOG(static_cast<uint8_t>(ref));
}
int RobotService::immStopJog() {
    if (!m_connected) return -1;
    std::cout << "[RobotService] ImmStopJOG" << std::endl;
    return m_robot.ImmStopJOG();
}
int RobotService::setToolPoint(int toolNum) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    std::cout << "[RobotService] SetToolPoint: " << toolNum << std::endl;
    return m_robot.SetToolPoint(toolNum);
}
int RobotService::setUserPoint(int userNum) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    std::cout << "[RobotService] SetWObjCoordPoint: " << userNum << std::endl;
    return m_robot.SetWObjCoordPoint(userNum);
}
int RobotService::setWeldingCurrentRelation(double currentMin, double currentMax, double voltageMin, double voltageMax, int aoIndex) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    std::cout << "[RobotService] SetWeldingCurrentRelation: " << currentMin << "~" << currentMax << "A -> " << voltageMin << "~" << voltageMax << "V ao=" << aoIndex << std::endl;
    return m_robot.WeldingSetCurrentRelation(currentMin, currentMax, voltageMin, voltageMax, aoIndex);
}
int RobotService::setWeldingVoltageRelation(double weldVoltageMin, double weldVoltageMax, double voltageMin, double voltageMax, int aoIndex) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    std::cout << "[RobotService] SetWeldingVoltageRelation: " << weldVoltageMin << "~" << weldVoltageMax << "V -> " << voltageMin << "~" << voltageMax << "V ao=" << aoIndex << std::endl;
    return m_robot.WeldingSetVoltageRelation(weldVoltageMin, weldVoltageMax, voltageMin, voltageMax, aoIndex);
}
int RobotService::arcStart(int ioType, int arcNum, int timeout) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    std::cout << "[RobotService] Arc start" << std::endl;
    return m_robot.ARCStart(ioType, arcNum, timeout);
}
int RobotService::arcEnd(int ioType, int arcNum, int timeout) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    std::cout << "[RobotService] Arc end" << std::endl;
    return m_robot.ARCEnd(ioType, arcNum, timeout);
}
int RobotService::setWeldingCurrent(int ioType, float current, int aoIndex, int blend) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    std::cout << "[RobotService] Set welding current: " << current << "A" << std::endl;
    return m_robot.WeldingSetCurrent(ioType, current, aoIndex, blend);
}
int RobotService::setWeldingVoltage(int ioType, float voltage, int aoIndex, int blend) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    std::cout << "[RobotService] Set welding voltage: " << voltage << "V" << std::endl;
    return m_robot.WeldingSetVoltage(ioType, voltage, aoIndex, blend);
}
int RobotService::setWeaveParams(int weaveNum, int weaveType, float freq, float range,
                                  float leftRange, float rightRange,
                                  float leftStayTime, float rightStayTime,
                                  float circleRadio, float yawAngle, float rotAngle) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    std::cout << "[RobotService] Set weave params: type=" << weaveType
              << " freq=" << freq << " range=" << range << std::endl;
    return m_robot.WeaveSetPara(weaveNum, weaveType, freq, 0, range,
                                 leftRange, rightRange, 0,
                                 leftStayTime, rightStayTime,
                                 circleRadio, 0, yawAngle, rotAngle);
}
int RobotService::weaveStart(int weaveNum) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    std::cout << "[RobotService] Weave start" << std::endl;
    return m_robot.WeaveStart(weaveNum);
}
int RobotService::weaveEnd(int weaveNum) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    std::cout << "[RobotService] Weave end" << std::endl;
    return m_robot.WeaveEnd(weaveNum);
}
int RobotService::wireSearchStart(int refPos, float searchVel, float searchDis,
                                   int autoBackFlag, float autoBackVel, float autoBackDis,
                                   int offsetFlag) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    std::cout << "[RobotService] Wire search start" << std::endl;
    return m_robot.WireSearchStart(refPos, searchVel, static_cast<int>(searchDis),
                                    autoBackFlag, autoBackVel, static_cast<int>(autoBackDis),
                                    offsetFlag);
}
int RobotService::wireSearchEnd(int refPos, float searchVel, float searchDis,
                                 int autoBackFlag, float autoBackVel, float autoBackDis,
                                 int offsetFlag) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    std::cout << "[RobotService] Wire search end" << std::endl;
    return m_robot.WireSearchEnd(refPos, searchVel, static_cast<int>(searchDis),
                                  autoBackFlag, autoBackVel, static_cast<int>(autoBackDis),
                                  offsetFlag);
}
int RobotService::getMotionDone(int* motionDone) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    uint8_t state = 0;
    int ret = m_robot.GetRobotMotionDone(&state);
    *motionDone = state;
    return ret;
}
int RobotService::resetError() {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    return m_robot.ResetAllError();
}
int RobotService::setAspirated(int ioType, int airControl) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    std::cout << "[RobotService] Set aspirated (gas): " << (airControl ? "ON" : "OFF") << std::endl;
    return m_robot.SetAspirated(ioType, airControl);
}
int RobotService::forwardWireFeed(int ioType, int wireFeed) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    return m_robot.SetForwardWireFeed(ioType, wireFeed);
}
int RobotService::reverseWireFeed(int ioType, int wireFeed) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_connected) return -1;
    return m_robot.SetReverseWireFeed(ioType, wireFeed);
}
#include "robot_core_all.h"
#include "robot_core_all.h"
#include <iostream>
#include <chrono>
#include <algorithm>
#include <cmath>
void RobotService::setStateCallback(StateCallback callback) {
    m_stateCallback = callback;
}
void RobotService::setErrorCallback(ErrorCallback callback) {
    m_errorCallback = callback;
}
void RobotService::startStateMonitor(int intervalMs) {
    if (m_monitorRunning) return;
    FLOG_INFO("RobotMonitor", "State monitor starting: interval=" + std::to_string(intervalMs) + "ms");
    m_monitorRunning = true;
    m_monitorThread = std::thread(&RobotService::monitorLoop, this, intervalMs);
}
void RobotService::stopStateMonitor() {
    FLOG_INFO("RobotMonitor", "State monitor stopping");
    m_monitorRunning = false;
    if (m_monitorThread.joinable()) {
        m_monitorThread.join();
    }
    FLOG_INFO("RobotMonitor", "State monitor stopped");
}
void RobotService::resetReconnectBackoff() {
    m_reconnectAttempts = 0;
    m_currentReconnectDelayMs = BASE_RECONNECT_DELAY_MS;
}
int RobotService::getNextReconnectDelay() {
    int delay = m_currentReconnectDelayMs;
    int nextDelay = static_cast<int>(m_currentReconnectDelayMs * RECONNECT_BACKOFF_MULTIPLIER);
    m_currentReconnectDelayMs = (nextDelay < MAX_RECONNECT_DELAY_MS) ? nextDelay : MAX_RECONNECT_DELAY_MS;
    m_reconnectAttempts++;
    return delay;
}
void RobotService::monitorLoop(int intervalMs) {
    int lastErrorCode = 0;
    int lastSubCode = 0;
    int connectionCheckCounter = 0;
    const int CONNECTION_CHECK_INTERVAL = 50;
    while (m_monitorRunning) {
        if (m_connected && m_stateCallback) {
            try {
                ROBOT_STATE_PKG state = getState();
                m_stateCallback(state);
                if (m_errorCallback) {
                    if (state.main_code != 0) {
                        if (state.main_code != lastErrorCode || state.sub_code != lastSubCode) {
                            m_errorCallback(state.main_code,
                                "Robot error: main=" + std::to_string(state.main_code) +
                                " sub=" + std::to_string(state.sub_code));
                            lastErrorCode = state.main_code;
                            lastSubCode = state.sub_code;
                        }
                    } else {
                        if (lastErrorCode != 0) {
                            lastErrorCode = 0;
                            lastSubCode = 0;
                        }
                    }
                }
                connectionCheckCounter++;
                if (connectionCheckCounter >= CONNECTION_CHECK_INTERVAL) {
                    connectionCheckCounter = 0;
                    if (!checkConnection()) {
                        FLOG_WARN("RobotMonitor", "Connection lost detected: ip=" + m_lastIp);
                        std::cout << "[RobotService] Connection lost detected" << std::endl;
                        m_connected = false;
                        resetReconnectBackoff();
                        if (m_reconnectCallback) {
                            m_reconnectCallback(false, m_lastIp);
                        }
                    }
                }
            } catch (const std::exception& e) {
                FLOG_ERROR("RobotMonitor", std::string("Monitor exception: ") + e.what());
                std::cerr << "[RobotService] Monitor exception: " << e.what() << std::endl;
                m_connected = false;
                resetReconnectBackoff();
                if (m_reconnectCallback) {
                    m_reconnectCallback(false, m_lastIp);
                }
            } catch (...) {
                FLOG_ERROR("RobotMonitor", "Monitor unknown exception");
                std::cerr << "[RobotService] Monitor unknown exception" << std::endl;
                m_connected = false;
                resetReconnectBackoff();
                if (m_reconnectCallback) {
                    m_reconnectCallback(false, m_lastIp);
                }
            }
        }
        if (!m_connected && m_autoReconnect && !m_lastIp.empty()) {
            int delayMs = getNextReconnectDelay();
            FLOG_INFO("RobotMonitor", "Auto-reconnect attempt #" + std::to_string(m_reconnectAttempts) + " delay=" + std::to_string(delayMs) + "ms ip=" + m_lastIp);
            std::cout << "[RobotService] Auto-reconnect attempt #"
                      << m_reconnectAttempts
                      << " (next delay: " << delayMs << "ms)" << std::endl;
            if (tryReconnect()) {
                FLOG_INFO("RobotMonitor", "Auto-reconnect SUCCESSFUL: ip=" + m_lastIp);
                std::cout << "[RobotService] Auto-reconnect successful!" << std::endl;
                resetReconnectBackoff();
            } else {
                int elapsed = 0;
                while (elapsed < delayMs && m_monitorRunning && !m_connected) {
                    std::this_thread::sleep_for(std::chrono::milliseconds(500));
                    elapsed += 500;
                }
            }
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(intervalMs));
    }
}
bool RobotService::checkConnection() {
    if (!m_connected) return false;
    try {
        ROBOT_STATE_PKG state = {0};
        int ret = m_robot.GetRobotRealTimeState(&state);
        if (ret != 0) {
            return false;
        }
        bool allZero = true;
        for (int i = 0; i < 6; i++) {
            if (state.jt_cur_pos[i] != 0.0) {
                allZero = false;
                break;
            }
        }
        if (allZero && state.robot_mode == 0 && state.main_code == 0) {
            return false;
        }
        return true;
    } catch (...) {
        return false;
    }
}
bool RobotService::tryReconnect() {
    if (m_lastIp.empty()) return false;
    FLOG_DEBUG("RobotMonitor", "Trying to reconnect to " + m_lastIp);
    std::cout << "[RobotService] Trying to reconnect to " << m_lastIp << "..." << std::endl;
    try {
        m_robot.CloseRPC();
    } catch (...) {}
    std::this_thread::sleep_for(std::chrono::milliseconds(500));
    try {
        int ret = m_robot.RPC(m_lastIp.c_str());
        if (ret == 0) {
            m_connected = true;
            std::cout << "[RobotService] Reconnected successfully" << std::endl;
            int gasOff = m_robot.SetAspirated(0, 0);
            FLOG_INFO("RobotMonitor", "Force gas OFF on reconnect: result=" + std::to_string(gasOff));
            std::cout << "[RobotService] Force gas OFF on reconnect: result=" << gasOff << std::endl;
            if (m_reconnectCallback) {
                m_reconnectCallback(true, m_lastIp);
            }
            return true;
        }
        FLOG_WARN("RobotMonitor", "Reconnect failed: ret=" + std::to_string(ret) + " ip=" + m_lastIp);
        std::cerr << "[RobotService] Reconnect failed: " << ret << std::endl;
    } catch (const std::exception& e) {
        FLOG_ERROR("RobotMonitor", std::string("Reconnect exception: ") + e.what());
        std::cerr << "[RobotService] Reconnect exception: " << e.what() << std::endl;
    } catch (...) {
        FLOG_ERROR("RobotMonitor", "Reconnect unknown exception");
        std::cerr << "[RobotService] Reconnect unknown exception" << std::endl;
    }
    return false;
}
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include <iostream>
#include <chrono>
ZmqServer::ZmqServer(RobotService& robotService)
    : m_robotService(robotService) {
}
ZmqServer::~ZmqServer() {
    stop();
}
bool ZmqServer::start(int cmdPort, int pubPort) {
    if (m_running) {
        FLOG_WARN("ZmqServer", "Server already running, ignoring start request");
        std::cerr << "[ZmqServer] Already running" << std::endl;
        return false;
    }
    try {
        m_context = std::make_unique<zmq::context_t>(1);
        m_repSocket = std::make_unique<zmq::socket_t>(*m_context, zmq::socket_type::rep);
        m_repSocket->set(zmq::sockopt::rcvtimeo, 1000);
        std::string cmdAddr = "tcp://*:" + std::to_string(cmdPort);
        m_repSocket->bind(cmdAddr);
        FLOG_INFO("ZmqServer", "Command socket bound to " + cmdAddr);
        std::cout << "[ZmqServer] Command socket bound to " << cmdAddr << std::endl;
        m_pubSocket = std::make_unique<zmq::socket_t>(*m_context, zmq::socket_type::pub);
        std::string pubAddr = "tcp://*:" + std::to_string(pubPort);
        m_pubSocket->bind(pubAddr);
        FLOG_INFO("ZmqServer", "Publisher socket bound to " + pubAddr);
        std::cout << "[ZmqServer] Publisher socket bound to " << pubAddr << std::endl;
        m_running = true;
        m_cmdThread = std::thread(&ZmqServer::commandLoop, this);
        FLOG_INFO("ZmqServer", "Server started: cmdPort=" + std::to_string(cmdPort) + " pubPort=" + std::to_string(pubPort));
        std::cout << "[ZmqServer] Server started successfully" << std::endl;
        return true;
    } catch (const zmq::error_t& e) {
        FLOG_ERROR("ZmqServer", std::string("Failed to start: ") + e.what());
        std::cerr << "[ZmqServer] Failed to start: " << e.what() << std::endl;
        return false;
    }
}
void ZmqServer::stop() {
    if (!m_running) return;
    FLOG_INFO("ZmqServer", "Server stopping...");
    std::cout << "[ZmqServer] Stopping server..." << std::endl;
    m_running = false;
    if (m_cmdThread.joinable()) {
        m_cmdThread.join();
    }
    m_repSocket.reset();
    m_pubSocket.reset();
    m_context.reset();
    FLOG_INFO("ZmqServer", "Server stopped");
    std::cout << "[ZmqServer] Server stopped" << std::endl;
}
void ZmqServer::publishState(const std::string& stateJson) {
    if (!m_running || !m_pubSocket) return;
    try {
        zmq::message_t message(stateJson.data(), stateJson.size());
        m_pubSocket->send(message, zmq::send_flags::dontwait);
    } catch (const zmq::error_t& e) {
        FLOG_ERROR("ZmqServer", std::string("Publish error: ") + e.what());
        std::cerr << "[ZmqServer] Publish error: " << e.what() << std::endl;
    }
}
void ZmqServer::commandLoop() {
    CommandHandler handler(m_robotService);
    while (m_running) {
        try {
            zmq::message_t request;
            auto result = m_repSocket->recv(request, zmq::recv_flags::none);
            if (result) {
                std::string requestStr(static_cast<char*>(request.data()), request.size());
                FLOG_DEBUG("ZmqServer", "Received command: " + requestStr);
                std::cout << "[ZmqServer] Received: " << requestStr << std::endl;
                std::string response = handler.handleCommand(requestStr);
                zmq::message_t reply(response.data(), response.size());
                m_repSocket->send(reply, zmq::send_flags::none);
                FLOG_DEBUG("ZmqServer", "Sent response: " + response);
                std::cout << "[ZmqServer] Sent: " << response << std::endl;
            }
        } catch (const zmq::error_t& e) {
            if (e.num() != EAGAIN) {
                FLOG_ERROR("ZmqServer", std::string("Command loop error: ") + e.what());
                std::cerr << "[ZmqServer] Error: " << e.what() << std::endl;
            }
        }
    }
}
#include "robot_core_all.h"
#include "robot_core_all.h"
#include <iostream>
CommandHandler::CommandHandler(RobotService& robotService)
    : m_robotService(robotService) {
}
std::string CommandHandler::handleCommand(const std::string& jsonRequest) {
    try {
        json request = json::parse(jsonRequest);
        if (!request.contains("cmd")) {
            return makeError(-1, "Missing 'cmd' field").dump();
        }
        std::string cmd = request["cmd"];
        json params = request.value("params", json::object());
        json response;
        if (cmd == "connect") {
            response = handleConnect(params);
        } else if (cmd == "disconnect") {
            response = handleDisconnect(params);
        } else if (cmd == "enable") {
            response = handleEnable(params);
        } else if (cmd == "disable") {
            response = handleDisable(params);
        } else if (cmd == "setMode") {
            response = handleSetMode(params);
        } else if (cmd == "getState") {
            response = handleGetState(params);
        } else if (cmd == "moveJ") {
            response = handleMoveJ(params);
        } else if (cmd == "moveL") {
            response = handleMoveL(params);
        } else if (cmd == "stop") {
            response = handleStop(params);
        } else if (cmd == "emergencyStop") {
            response = handleEmergencyStop(params);
        } else if (cmd == "setSpeed") {
            response = handleSetSpeed(params);
        } else if (cmd == "getMotionDone") {
            response = handleGetMotionDone(params);
        } else if (cmd == "arcStart") {
            response = handleArcStart(params);
        } else if (cmd == "arcEnd") {
            response = handleArcEnd(params);
        } else if (cmd == "setWeldingCurrent") {
            response = handleSetWeldingCurrent(params);
        } else if (cmd == "setWeldingVoltage") {
            response = handleSetWeldingVoltage(params);
        } else if (cmd == "setWeaveParams") {
            response = handleSetWeaveParams(params);
        } else if (cmd == "weaveStart") {
            response = handleWeaveStart(params);
        } else if (cmd == "weaveEnd") {
            response = handleWeaveEnd(params);
        } else if (cmd == "wireSearchStart") {
            response = handleWireSearchStart(params);
        } else if (cmd == "wireSearchEnd") {
            response = handleWireSearchEnd(params);
        } else {
            response = makeError(-2, "Unknown command: " + cmd);
        }
        return response.dump();
    } catch (const json::exception& e) {
        return makeError(-3, std::string("JSON parse error: ") + e.what()).dump();
    } catch (const std::exception& e) {
        return makeError(-4, std::string("Error: ") + e.what()).dump();
    }
}
json CommandHandler::handleConnect(const json& params) {
    std::string ip = params.value("ip", "192.168.58.2");
    int ret = m_robotService.connect(ip);
    if (ret == 0) {
        return makeSuccess({{"connected", true}, {"ip", ip}});
    } else {
        return makeError(ret, "Failed to connect to robot");
    }
}
json CommandHandler::handleDisconnect(const json& params) {
    int ret = m_robotService.disconnect();
    return makeSuccess({{"disconnected", true}});
}
json CommandHandler::handleEnable(const json& params) {
    int ret = m_robotService.enable();
    if (ret == 0) {
        return makeSuccess({{"enabled", true}});
    } else {
        return makeError(ret, "Failed to enable robot");
    }
}
json CommandHandler::handleDisable(const json& params) {
    int ret = m_robotService.disable();
    if (ret == 0) {
        return makeSuccess({{"enabled", false}});
    } else {
        return makeError(ret, "Failed to disable robot");
    }
}
json CommandHandler::handleSetMode(const json& params) {
    int mode = params.value("mode", 0);
    int ret = m_robotService.setMode(mode);
    if (ret == 0) {
        return makeSuccess({{"mode", mode}});
    } else {
        return makeError(ret, "Failed to set mode");
    }
}
json CommandHandler::handleGetState(const json& params) {
    ROBOT_STATE_PKG state = m_robotService.getState();
    json data;
    data["connected"] = m_robotService.isConnected();
    data["robot_state"] = state.robot_state;
    data["robot_mode"] = state.robot_mode;
    data["main_code"] = state.main_code;
    data["sub_code"] = state.sub_code;
    data["motion_done"] = state.motion_done;
    data["emergency_stop"] = state.EmergencyStop;
    data["servo_enabled"] = state.rbtEnableState;
    data["joints"] = json::array();
    for (int i = 0; i < 6; i++) {
        data["joints"].push_back(state.jt_cur_pos[i]);
    }
    data["tcp"] = {
        {"x", state.tl_cur_pos[0]},
        {"y", state.tl_cur_pos[1]},
        {"z", state.tl_cur_pos[2]},
        {"rx", state.tl_cur_pos[3]},
        {"ry", state.tl_cur_pos[4]},
        {"rz", state.tl_cur_pos[5]}
    };
    data["tool"] = state.tool;
    data["user"] = state.user;
    return makeSuccess(data);
}
json CommandHandler::handleMoveJ(const json& params) {
    if (!params.contains("joints") || !params["joints"].is_array()) {
        return makeError(-10, "Missing or invalid 'joints' array");
    }
    double joints[6];
    auto& jarr = params["joints"];
    for (int i = 0; i < 6 && i < jarr.size(); i++) {
        joints[i] = jarr[i].get<double>();
    }
    int tool = params.value("tool", 0);
    int user = params.value("user", 0);
    float vel = params.value("vel", 20.0f);
    float acc = params.value("acc", 100.0f);
    float ovl = params.value("ovl", 100.0f);
    float blendT = params.value("blendT", -1.0f);
    uint8_t offsetFlag = params.value("offsetFlag", 0);
    double offsetPos[6] = {0};
    if (params.contains("offsetPos") && params["offsetPos"].is_array()) {
        auto& oarr = params["offsetPos"];
        for (int i = 0; i < 6 && i < oarr.size(); i++) {
            offsetPos[i] = oarr[i].get<double>();
        }
    }
    int ret = m_robotService.moveJ(joints, tool, user, vel, acc, ovl, blendT,
                                    offsetFlag, offsetPos);
    if (ret == 0) {
        return makeSuccess({{"result", ret}});
    } else {
        return makeError(ret, "MoveJ failed");
    }
}
json CommandHandler::handleMoveL(const json& params) {
    if (!params.contains("descPos")) {
        return makeError(-10, "Missing 'descPos'");
    }
    double descPos[6];
    auto& dp = params["descPos"];
    descPos[0] = dp.value("x", 0.0);
    descPos[1] = dp.value("y", 0.0);
    descPos[2] = dp.value("z", 0.0);
    descPos[3] = dp.value("rx", 0.0);
    descPos[4] = dp.value("ry", 0.0);
    descPos[5] = dp.value("rz", 0.0);
    int tool = params.value("tool", 0);
    int user = params.value("user", 0);
    float vel = params.value("vel", 20.0f);
    float acc = params.value("acc", 100.0f);
    float ovl = params.value("ovl", 100.0f);
    float blendR = params.value("blendR", -1.0f);
    uint8_t search = params.value("search", 0);
    uint8_t offsetFlag = params.value("offsetFlag", 0);
    int velAccParamMode = params.value("velAccParamMode", 0);
    double offsetPos[6] = {0};
    if (params.contains("offsetPos") && params["offsetPos"].is_array()) {
        auto& oarr = params["offsetPos"];
        for (int i = 0; i < 6 && i < oarr.size(); i++) {
            offsetPos[i] = oarr[i].get<double>();
        }
    }
    int ret = m_robotService.moveL(descPos, tool, user, vel, acc, ovl, blendR,
                                    search, offsetFlag, offsetPos, velAccParamMode);
    if (ret == 0) {
        return makeSuccess({{"result", ret}});
    } else {
        return makeError(ret, "MoveL failed");
    }
}
json CommandHandler::handleStop(const json& params) {
    int ret = m_robotService.stopMotion();
    return makeSuccess({{"result", ret}});
}
json CommandHandler::handleEmergencyStop(const json& params) {
    int ret = m_robotService.emergencyStop();
    return makeSuccess({{"result", ret}});
}
json CommandHandler::handleSetSpeed(const json& params) {
    float speed = params.value("speed", 20.0f);
    int ret = m_robotService.setSpeed(speed);
    if (ret == 0) {
        return makeSuccess({{"speed", speed}});
    } else {
        return makeError(ret, "Failed to set speed");
    }
}
json CommandHandler::handleGetMotionDone(const json& params) {
    int motionDone = 0;
    int ret = m_robotService.getMotionDone(&motionDone);
    return makeSuccess({
        {"result", ret},
        {"motionDone", motionDone}
    });
}
json CommandHandler::handleArcStart(const json& params) {
    int ioType = params.value("ioType", 0);
    int arcNum = params.value("arcNum", 0);
    int timeout = params.value("timeout", 10000);
    int ret = m_robotService.arcStart(ioType, arcNum, timeout);
    if (ret == 0) {
        return makeSuccess({{"result", ret}});
    } else {
        return makeError(ret, "Arc start failed");
    }
}
json CommandHandler::handleArcEnd(const json& params) {
    int ioType = params.value("ioType", 0);
    int arcNum = params.value("arcNum", 0);
    int timeout = params.value("timeout", 10000);
    int ret = m_robotService.arcEnd(ioType, arcNum, timeout);
    if (ret == 0) {
        return makeSuccess({{"result", ret}});
    } else {
        return makeError(ret, "Arc end failed");
    }
}
json CommandHandler::handleSetWeldingCurrent(const json& params) {
    int ioType = params.value("ioType", 0);
    float current = params.value("current", 0.0f);
    int aoIndex = params.value("aoIndex", 1);
    int blend = params.value("blend", 0);
    int ret = m_robotService.setWeldingCurrent(ioType, current, aoIndex, blend);
    if (ret == 0) {
        return makeSuccess({{"result", ret}});
    } else {
        return makeError(ret, "Set welding current failed");
    }
}
json CommandHandler::handleSetWeldingVoltage(const json& params) {
    int ioType = params.value("ioType", 0);
    float voltage = params.value("voltage", 0.0f);
    int aoIndex = params.value("aoIndex", 0);
    int blend = params.value("blend", 0);
    int ret = m_robotService.setWeldingVoltage(ioType, voltage, aoIndex, blend);
    if (ret == 0) {
        return makeSuccess({{"result", ret}});
    } else {
        return makeError(ret, "Set welding voltage failed");
    }
}
json CommandHandler::handleSetWeaveParams(const json& params) {
    int weaveNum = params.value("weaveNum", 0);
    int weaveType = params.value("weaveType", 0);
    float freq = params.value("frequency", 1.0f);
    float range = params.value("range", 5.0f);
    float leftRange = params.value("leftRange", 5.0f);
    float rightRange = params.value("rightRange", 5.0f);
    float leftStayTime = params.value("leftStayTime", 0.0f);
    float rightStayTime = params.value("rightStayTime", 0.0f);
    float circleRadio = params.value("circleRadio", 50.0f);
    float yawAngle = params.value("yawAngle", 0.0f);
    float rotAngle = params.value("rotAngle", 0.0f);
    int ret = m_robotService.setWeaveParams(weaveNum, weaveType, freq, range,
                                             leftRange, rightRange,
                                             leftStayTime, rightStayTime,
                                             circleRadio, yawAngle, rotAngle);
    if (ret == 0) {
        return makeSuccess({{"result", ret}});
    } else {
        return makeError(ret, "Set weave params failed");
    }
}
json CommandHandler::handleWeaveStart(const json& params) {
    int weaveNum = params.value("weaveNum", 0);
    int ret = m_robotService.weaveStart(weaveNum);
    if (ret == 0) {
        return makeSuccess({{"result", ret}});
    } else {
        return makeError(ret, "Weave start failed");
    }
}
json CommandHandler::handleWeaveEnd(const json& params) {
    int weaveNum = params.value("weaveNum", 0);
    int ret = m_robotService.weaveEnd(weaveNum);
    if (ret == 0) {
        return makeSuccess({{"result", ret}});
    } else {
        return makeError(ret, "Weave end failed");
    }
}
json CommandHandler::handleWireSearchStart(const json& params) {
    int refPos = params.value("refPos", 1);
    float searchVel = params.value("searchVel", 10.0f);
    float searchDis = params.value("searchDis", 100.0f);
    int autoBackFlag = params.value("autoBackFlag", 0);
    float autoBackVel = params.value("autoBackVel", 10.0f);
    float autoBackDis = params.value("autoBackDis", 100.0f);
    int offsetFlag = params.value("offsetFlag", 1);
    int ret = m_robotService.wireSearchStart(refPos, searchVel, searchDis,
                                              autoBackFlag, autoBackVel, autoBackDis,
                                              offsetFlag);
    if (ret == 0) {
        return makeSuccess({{"result", ret}});
    } else {
        return makeError(ret, "Wire search start failed");
    }
}
json CommandHandler::handleWireSearchEnd(const json& params) {
    int refPos = params.value("refPos", 1);
    float searchVel = params.value("searchVel", 10.0f);
    float searchDis = params.value("searchDis", 100.0f);
    int autoBackFlag = params.value("autoBackFlag", 0);
    float autoBackVel = params.value("autoBackVel", 10.0f);
    float autoBackDis = params.value("autoBackDis", 100.0f);
    int offsetFlag = params.value("offsetFlag", 1);
    int ret = m_robotService.wireSearchEnd(refPos, searchVel, searchDis,
                                            autoBackFlag, autoBackVel, autoBackDis,
                                            offsetFlag);
    if (ret == 0) {
        return makeSuccess({{"result", ret}});
    } else {
        return makeError(ret, "Wire search end failed");
    }
}
json CommandHandler::makeResponse(const std::string& status, int code,
                                   const json& data, const std::string& message) {
    json response;
    response["status"] = status;
    response["code"] = code;
    if (!data.is_null()) {
        response["data"] = data;
    }
    if (!message.empty()) {
        response["message"] = message;
    }
    return response;
}
json CommandHandler::makeError(int code, const std::string& message) {
    return makeResponse("error", code, nullptr, message);
}
json CommandHandler::makeSuccess(const json& data) {
    return makeResponse("ok", 0, data, "");
}
#ifdef _WIN32
#include "robot_core_all.h"
#include "../resources/resource.h"
#include <iostream>
#include <sstream>
extern bool g_packagedMode;
extern int g_httpPort;
TrayIcon* TrayIcon::s_instance = nullptr;
TrayIcon::TrayIcon()
    : m_hwnd(nullptr)
    , m_hIcon(nullptr)
    , m_running(false)
    , m_connected(false)
{
    ZeroMemory(&m_nid, sizeof(m_nid));
    s_instance = this;
    char exePath[MAX_PATH];
    GetModuleFileNameA(NULL, exePath, MAX_PATH);
    std::string exeDir(exePath);
    size_t pos = exeDir.find_last_of("\\/");
    exeDir = exeDir.substr(0, pos);
    pos = exeDir.find_last_of("\\/");
    exeDir = exeDir.substr(0, pos);
    pos = exeDir.find_last_of("\\/");
    exeDir = exeDir.substr(0, pos);
    pos = exeDir.find_last_of("\\/");
    m_projectPath = exeDir.substr(0, pos);
}
TrayIcon::~TrayIcon() {
    shutdown();
    s_instance = nullptr;
}
bool TrayIcon::initialize(const std::string& tooltip) {
    WNDCLASSEXW wc = {};
    wc.cbSize = sizeof(WNDCLASSEXW);
    wc.lpfnWndProc = WindowProc;
    wc.hInstance = GetModuleHandle(NULL);
    wc.lpszClassName = L"RobotCoreTrayClass";
    if (!RegisterClassExW(&wc)) {
        DWORD err = GetLastError();
        if (err != ERROR_CLASS_ALREADY_EXISTS) {
            std::cerr << "[TrayIcon] Failed to register window class: " << err << std::endl;
            return false;
        }
    }
    m_hwnd = CreateWindowExW(
        0,
        L"RobotCoreTrayClass",
        L"Robot Core Tray",
        0,
        0, 0, 0, 0,
        HWND_MESSAGE,
        NULL,
        GetModuleHandle(NULL),
        NULL
    );
    if (!m_hwnd) {
        std::cerr << "[TrayIcon] Failed to create window: " << GetLastError() << std::endl;
        return false;
    }
    m_hIcon = LoadIcon(GetModuleHandle(NULL), MAKEINTRESOURCE(IDI_APP_ICON));
    if (!m_hIcon) {
        m_hIcon = LoadIcon(NULL, IDI_APPLICATION);
    }
    m_nid.cbSize = sizeof(NOTIFYICONDATAW);
    m_nid.hWnd = m_hwnd;
    m_nid.uID = ID_TRAY_ICON;
    m_nid.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    m_nid.uCallbackMessage = WM_TRAYICON;
    m_nid.hIcon = m_hIcon;
    std::wstring wtooltip(tooltip.begin(), tooltip.end());
    wcsncpy_s(m_nid.szTip, wtooltip.c_str(), 127);
    if (!Shell_NotifyIconW(NIM_ADD, &m_nid)) {
        std::cerr << "[TrayIcon] Failed to add tray icon: " << GetLastError() << std::endl;
        DestroyWindow(m_hwnd);
        m_hwnd = nullptr;
        return false;
    }
    m_running = true;
    std::cout << "[TrayIcon] System tray icon initialized" << std::endl;
    return true;
}
void TrayIcon::shutdown() {
    if (!m_running) return;
    m_running = false;
    if (m_nid.hWnd) {
        Shell_NotifyIconW(NIM_DELETE, &m_nid);
    }
    if (m_hwnd) {
        DestroyWindow(m_hwnd);
        m_hwnd = nullptr;
    }
    std::cout << "[TrayIcon] System tray icon removed" << std::endl;
}
void TrayIcon::setTooltip(const std::string& tooltip) {
    if (!m_running) return;
    std::wstring wtooltip(tooltip.begin(), tooltip.end());
    wcsncpy_s(m_nid.szTip, wtooltip.c_str(), 127);
    Shell_NotifyIconW(NIM_MODIFY, &m_nid);
}
void TrayIcon::setConnectionStatus(bool connected, const std::string& robotIp) {
    m_connected = connected;
    m_robotIp = robotIp;
    std::string tooltip = "Robot Core";
    if (connected) {
        tooltip += " - Connected (" + robotIp + ")";
    } else {
        tooltip += " - Disconnected";
    }
    setTooltip(tooltip);
}
void TrayIcon::processMessages() {
    MSG msg;
    while (PeekMessage(&msg, m_hwnd, 0, 0, PM_REMOVE)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }
}
LRESULT CALLBACK TrayIcon::WindowProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    if (!s_instance) {
        return DefWindowProc(hwnd, msg, wParam, lParam);
    }
    switch (msg) {
    case WM_TRAYICON:
        if (lParam == WM_RBUTTONUP || lParam == WM_CONTEXTMENU) {
            s_instance->showContextMenu();
        } else if (lParam == WM_LBUTTONUP) {
            s_instance->showMainWindow();
        } else if (lParam == WM_LBUTTONDBLCLK) {
            std::wstring url = L"http://localhost:" + std::to_wstring(g_packagedMode ? g_httpPort : 3000);
            int r = (int)(intptr_t)ShellExecuteW(NULL, L"open",
                L"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
                (L"--kiosk " + url).c_str(), NULL, SW_SHOWNORMAL);
            if (r <= 32) ShellExecuteW(NULL, L"open", url.c_str(), NULL, NULL, SW_SHOWNORMAL);
        }
        return 0;
    case WM_COMMAND:
        s_instance->onMenuCommand(LOWORD(wParam));
        return 0;
    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProc(hwnd, msg, wParam, lParam);
}
bool TrayIcon::isMariaDBRunning() {
    SC_HANDLE scm = OpenSCManager(NULL, NULL, SC_MANAGER_CONNECT);
    if (!scm) return false;
    SC_HANDLE svc = OpenServiceW(scm, L"MariaDB", SERVICE_QUERY_STATUS);
    if (!svc) {
        CloseServiceHandle(scm);
        return false;
    }
    SERVICE_STATUS status;
    bool running = false;
    if (QueryServiceStatus(svc, &status)) {
        running = (status.dwCurrentState == SERVICE_RUNNING);
    }
    CloseServiceHandle(svc);
    CloseServiceHandle(scm);
    return running;
}
bool TrayIcon::isAutoStartEnabled() {
    HKEY hKey;
    bool enabled = false;
    if (RegOpenKeyExW(HKEY_CURRENT_USER,
                      L"Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                      0, KEY_READ, &hKey) == ERROR_SUCCESS) {
        DWORD type;
        if (RegQueryValueExW(hKey, L"RobotCore", NULL, &type, NULL, NULL) == ERROR_SUCCESS) {
            enabled = true;
        }
        RegCloseKey(hKey);
    }
    return enabled;
}
bool TrayIcon::isGitInstalled() {
    DWORD result = 0;
    STARTUPINFOW si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    wchar_t cmd[] = L"cmd /c git --version >nul 2>&1";
    if (CreateProcessW(NULL, cmd, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
        WaitForSingleObject(pi.hProcess, 5000);
        GetExitCodeProcess(pi.hProcess, &result);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
    }
    return result == 0;
}
bool TrayIcon::isNodeInstalled() {
    DWORD result = 1;
    STARTUPINFOW si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    wchar_t cmd[] = L"cmd /c node --version >nul 2>&1";
    if (CreateProcessW(NULL, cmd, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
        WaitForSingleObject(pi.hProcess, 5000);
        GetExitCodeProcess(pi.hProcess, &result);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
    }
    return result == 0;
}
bool TrayIcon::isPm2Installed() {
    DWORD result = 1;
    STARTUPINFOW si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    wchar_t cmd[] = L"cmd /c pm2 --version >nul 2>&1";
    if (CreateProcessW(NULL, cmd, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
        WaitForSingleObject(pi.hProcess, 5000);
        GetExitCodeProcess(pi.hProcess, &result);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
    }
    return result == 0;
}
bool TrayIcon::isMariaDBInstalled() {
    const wchar_t* paths[] = {
        L"C:\\Program Files\\MariaDB 11.4\\bin\\mysql.exe",
        L"C:\\Program Files\\MariaDB 11.3\\bin\\mysql.exe",
        L"C:\\Program Files\\MariaDB 11.2\\bin\\mysql.exe",
        L"C:\\Program Files\\MariaDB 10.11\\bin\\mysql.exe",
        L"C:\\Program Files\\MariaDB\\bin\\mysql.exe"
    };
    for (const auto& path : paths) {
        DWORD attr = GetFileAttributesW(path);
        if (attr != INVALID_FILE_ATTRIBUTES) {
            return true;
        }
    }
    DWORD result = 1;
    STARTUPINFOW si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    wchar_t cmd[] = L"cmd /c mysql --version >nul 2>&1";
    if (CreateProcessW(NULL, cmd, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
        WaitForSingleObject(pi.hProcess, 5000);
        GetExitCodeProcess(pi.hProcess, &result);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
    }
    return result == 0;
}
void TrayIcon::runCommand(const std::wstring& cmd, bool show, bool wait) {
    STARTUPINFOW si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    std::wstring wpath(m_projectPath.begin(), m_projectPath.end());
    if (show) {
        std::wstring fullCmd = L"cmd /c " + cmd;
        if (CreateProcessW(NULL, const_cast<wchar_t*>(fullCmd.c_str()),
                           NULL, NULL, FALSE, 0,
                           NULL, wpath.c_str(), &si, &pi)) {
            if (wait) {
                WaitForSingleObject(pi.hProcess, INFINITE);
            }
            CloseHandle(pi.hProcess);
            CloseHandle(pi.hThread);
        }
    } else {
        si.dwFlags = STARTF_USESHOWWINDOW;
        si.wShowWindow = SW_HIDE;
        std::wstring fullCmd = L"powershell.exe -WindowStyle Hidden -Command \"" + cmd + L"\"";
        if (CreateProcessW(NULL, const_cast<wchar_t*>(fullCmd.c_str()),
                           NULL, NULL, FALSE,
                           CREATE_NO_WINDOW | DETACHED_PROCESS,
                           NULL, wpath.c_str(), &si, &pi)) {
            if (wait) {
                WaitForSingleObject(pi.hProcess, 30000);
            }
            CloseHandle(pi.hProcess);
            CloseHandle(pi.hThread);
        }
    }
}
void TrayIcon::startServices() {
    std::cout << "[TrayIcon] Starting services..." << std::endl;
    startFrontend();
}
void TrayIcon::stopServices() {
    std::cout << "[TrayIcon] Stopping services..." << std::endl;
    stopFrontend();
}
void TrayIcon::restartServices() {
    std::cout << "[TrayIcon] Restarting services..." << std::endl;
    restartFrontend();
}
void TrayIcon::pm2Monitor() {
    std::cout << "[TrayIcon] PM2 Monitor not available (PM2 removed)" << std::endl;
    MessageBoxW(m_hwnd, L"PM2 is no longer used.\nFrontend runs via npm start directly.", L"Info", MB_OK | MB_ICONINFORMATION);
}
bool TrayIcon::isFrontendRunning() {
    DWORD result = 1;
    STARTUPINFOW si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    wchar_t cmd[] = L"powershell.exe -WindowStyle Hidden -Command \"if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }\"";
    if (CreateProcessW(NULL, cmd, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
        WaitForSingleObject(pi.hProcess, 5000);
        GetExitCodeProcess(pi.hProcess, &result);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
    }
    return result == 0;
}
bool TrayIcon::isCoreRunning() {
    return true;
}
void TrayIcon::startFrontend() {
    std::cout << "[TrayIcon] Starting frontend (npm start)..." << std::endl;
    std::wstring wpath(m_projectPath.begin(), m_projectPath.end());
    std::wstring frontendDir = wpath + L"\\robot-front";
    STARTUPINFOW si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    std::wstring cmdLine = L"cmd.exe /c \"set BROWSER=none && set PORT=3000 && npm start\"";
    if (CreateProcessW(NULL, const_cast<wchar_t*>(cmdLine.c_str()), NULL, NULL, FALSE,
                       CREATE_NO_WINDOW | DETACHED_PROCESS, NULL, frontendDir.c_str(), &si, &pi)) {
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
    }
    MessageBoxW(m_hwnd, L"Frontend starting on port 3000...\nPlease wait a few seconds.", L"Robot Core", MB_OK | MB_ICONINFORMATION);
}
void TrayIcon::stopFrontend() {
    std::cout << "[TrayIcon] Stopping frontend (port 3000)..." << std::endl;
    runCommand(L"Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }", false, true);
    MessageBoxW(m_hwnd, L"Frontend stopped", L"Robot Core", MB_OK | MB_ICONINFORMATION);
}
void TrayIcon::restartFrontend() {
    std::cout << "[TrayIcon] Restarting frontend..." << std::endl;
    runCommand(L"Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }", false, true);
    Sleep(2000);
    std::wstring wpath(m_projectPath.begin(), m_projectPath.end());
    std::wstring frontendDir = wpath + L"\\robot-front";
    STARTUPINFOW si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    std::wstring cmdLine = L"cmd.exe /c \"set BROWSER=none && set PORT=3000 && npm start\"";
    if (CreateProcessW(NULL, const_cast<wchar_t*>(cmdLine.c_str()), NULL, NULL, FALSE,
                       CREATE_NO_WINDOW | DETACHED_PROCESS, NULL, frontendDir.c_str(), &si, &pi)) {
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
    }
    MessageBoxW(m_hwnd, L"Frontend restarting on port 3000...\nPlease wait a few seconds.", L"Robot Core", MB_OK | MB_ICONINFORMATION);
}
void TrayIcon::restartCore() {
    std::cout << "[TrayIcon] Restart Core requested (will restart via callback)" << std::endl;
    if (m_restartCallback) {
        m_restartCallback();
    }
}
void TrayIcon::showMainWindow() {
    if (m_showWindowCallback) {
        m_showWindowCallback();
        return;
    }
    std::wstring statusMsg;
    statusMsg += L"=== Robot Core Status ===\r\n\r\n";
    if (m_connected) {
        std::wstring wip(m_robotIp.begin(), m_robotIp.end());
        statusMsg += L"Robot: Connected (" + wip + L")\r\n";
    } else {
        statusMsg += L"Robot: Disconnected\r\n";
    }
    statusMsg += isMariaDBRunning() ? L"MariaDB: Running\r\n" : L"MariaDB: Stopped\r\n";
    statusMsg += L"\r\nRight-click tray icon for more options.\r\n";
    MessageBoxW(NULL, statusMsg.c_str(), L"Robot Core",
                MB_OK | MB_ICONINFORMATION | MB_SETFOREGROUND);
}
#endif
#ifdef _WIN32
#include "robot_core_all.h"
#include "../resources/resource.h"
#include <iostream>
#include <sstream>
extern bool g_packagedMode;
extern int g_httpPort;
void TrayIcon::installAll() {
    std::cout << "[TrayIcon] Installing all dependencies..." << std::endl;
    if (!isGitInstalled()) {
        if (MessageBoxW(m_hwnd, L"Git is not installed. Install now?", L"Install",
                        MB_YESNO | MB_ICONQUESTION) == IDYES) {
            runCommand(L"winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements", true, true);
        }
    }
    if (!isNodeInstalled()) {
        if (MessageBoxW(m_hwnd, L"Node.js is not installed. Install now?", L"Install",
                        MB_YESNO | MB_ICONQUESTION) == IDYES) {
            runCommand(L"winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements", true, true);
        }
    }
    if (isGitInstalled()) {
        runCommand(L"git pull origin master", true, true);
    }
    runCommand(L"cd robot-back && pip install -r requirements.txt", true, true);
    runCommand(L"cd robot-front && npm install", true, true);
    MessageBoxW(m_hwnd, L"Installation complete!", L"Robot Core", MB_OK | MB_ICONINFORMATION);
}
void TrayIcon::gitPull() {
    if (!isGitInstalled()) {
        MessageBoxW(m_hwnd, L"Git is not installed!", L"Error", MB_OK | MB_ICONERROR);
        return;
    }
    std::cout << "[TrayIcon] Updating code..." << std::endl;
    runCommand(L"git pull origin master & pause", true, true);
}
void TrayIcon::installGit() {
    if (isGitInstalled()) {
        MessageBoxW(m_hwnd, L"Git is already installed.", L"Install", MB_OK | MB_ICONINFORMATION);
        return;
    }
    runCommand(L"winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements", true, true);
}
void TrayIcon::installNode() {
    if (isNodeInstalled()) {
        MessageBoxW(m_hwnd, L"Node.js is already installed.", L"Install", MB_OK | MB_ICONINFORMATION);
        return;
    }
    runCommand(L"winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements", true, true);
}
void TrayIcon::installPm2() {
    if (!isNodeInstalled()) {
        MessageBoxW(m_hwnd, L"Node.js must be installed first!", L"Error", MB_OK | MB_ICONERROR);
        return;
    }
    if (isPm2Installed()) {
        MessageBoxW(m_hwnd, L"PM2 is already installed.", L"Install", MB_OK | MB_ICONINFORMATION);
        return;
    }
    runCommand(L"npm install -g pm2 & pause", true, true);
}
void TrayIcon::installMariaDB() {
    if (isMariaDBInstalled()) {
        MessageBoxW(m_hwnd, L"MariaDB is already installed.", L"Install", MB_OK | MB_ICONINFORMATION);
        return;
    }
    std::cout << "[TrayIcon] Installing MariaDB..." << std::endl;
    runCommand(L"winget install --id MariaDB.Server -e --source winget --accept-package-agreements --accept-source-agreements", true, true);
    const wchar_t* mariadbPaths[] = {
        L"C:\\Program Files\\MariaDB 11.4\\bin",
        L"C:\\Program Files\\MariaDB 11.3\\bin",
        L"C:\\Program Files\\MariaDB 11.2\\bin",
        L"C:\\Program Files\\MariaDB 10.11\\bin"
    };
    std::wstring mariadbBinPath;
    for (const auto& path : mariadbPaths) {
        DWORD attr = GetFileAttributesW(path);
        if (attr != INVALID_FILE_ATTRIBUTES && (attr & FILE_ATTRIBUTE_DIRECTORY)) {
            mariadbBinPath = path;
            break;
        }
    }
    if (!mariadbBinPath.empty()) {
        HKEY hKey;
        if (RegOpenKeyExW(HKEY_CURRENT_USER, L"Environment", 0, KEY_READ | KEY_WRITE, &hKey) == ERROR_SUCCESS) {
            wchar_t pathValue[32767] = {0};
            DWORD pathSize = sizeof(pathValue);
            DWORD type = REG_EXPAND_SZ;
            if (RegQueryValueExW(hKey, L"Path", NULL, &type, (BYTE*)pathValue, &pathSize) == ERROR_SUCCESS) {
                std::wstring currentPath(pathValue);
                if (currentPath.find(mariadbBinPath) == std::wstring::npos) {
                    if (!currentPath.empty() && currentPath.back() != L';') {
                        currentPath += L";";
                    }
                    currentPath += mariadbBinPath;
                    RegSetValueExW(hKey, L"Path", 0, REG_EXPAND_SZ,
                                   (BYTE*)currentPath.c_str(), (currentPath.length() + 1) * sizeof(wchar_t));
                    SendMessageTimeoutW(HWND_BROADCAST, WM_SETTINGCHANGE, 0,
                                        (LPARAM)L"Environment", SMTO_ABORTIFHUNG, 5000, NULL);
                    std::wcout << L"[TrayIcon] Added MariaDB to PATH: " << mariadbBinPath << std::endl;
                }
            }
            RegCloseKey(hKey);
        }
        MessageBoxW(m_hwnd, L"MariaDB installed successfully!\nPATH has been updated.\n\nPlease restart the application for PATH changes to take effect.",
                    L"Install", MB_OK | MB_ICONINFORMATION);
    } else {
        MessageBoxW(m_hwnd, L"MariaDB installation completed.\nPlease manually add MariaDB bin folder to your PATH if needed.",
                    L"Install", MB_OK | MB_ICONINFORMATION);
    }
}
void TrayIcon::enableAutoStart() {
    HKEY hKey;
    if (RegOpenKeyExW(HKEY_CURRENT_USER,
                      L"Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                      0, KEY_WRITE, &hKey) == ERROR_SUCCESS) {
        wchar_t exePath[MAX_PATH];
        GetModuleFileNameW(NULL, exePath, MAX_PATH);
        RegSetValueExW(hKey, L"RobotCore", 0, REG_SZ,
                       (BYTE*)exePath, (wcslen(exePath) + 1) * sizeof(wchar_t));
        RegCloseKey(hKey);
        std::cout << "[TrayIcon] Auto-start enabled" << std::endl;
        MessageBoxW(m_hwnd, L"Auto-start enabled.\nRobot Core will start with Windows.",
                    L"Auto Start", MB_OK | MB_ICONINFORMATION);
    } else {
        MessageBoxW(m_hwnd, L"Failed to enable auto-start.", L"Error", MB_OK | MB_ICONERROR);
    }
}
void TrayIcon::disableAutoStart() {
    HKEY hKey;
    if (RegOpenKeyExW(HKEY_CURRENT_USER,
                      L"Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                      0, KEY_WRITE, &hKey) == ERROR_SUCCESS) {
        RegDeleteValueW(hKey, L"RobotCore");
        RegCloseKey(hKey);
        std::cout << "[TrayIcon] Auto-start disabled" << std::endl;
        MessageBoxW(m_hwnd, L"Auto-start disabled.", L"Auto Start", MB_OK | MB_ICONINFORMATION);
    }
}
void TrayIcon::showContextMenu() {
    HMENU hMenu = CreatePopupMenu();
    if (!hMenu) return;
    AppendMenuW(hMenu, MF_STRING, ID_TRAY_RESTART, L"Restart Robot Core");
    AppendMenuW(hMenu, MF_SEPARATOR, 0, NULL);
    AppendMenuW(hMenu, MF_STRING, ID_TRAY_EXIT, L"Exit");
    POINT pt;
    GetCursorPos(&pt);
    SetForegroundWindow(m_hwnd);
    TrackPopupMenu(hMenu, TPM_RIGHTBUTTON, pt.x, pt.y, 0, m_hwnd, NULL);
    DestroyMenu(hMenu);
}
void TrayIcon::onMenuCommand(int cmdId) {
    switch (cmdId) {
    case ID_TRAY_SVC_START:
        startServices();
        break;
    case ID_TRAY_SVC_STOP:
        stopServices();
        break;
    case ID_TRAY_SVC_RESTART:
        restartServices();
        break;
    case ID_TRAY_SVC_MONITOR:
        pm2Monitor();
        break;
    case ID_TRAY_SVC_FRONT_START:
        startFrontend();
        break;
    case ID_TRAY_SVC_FRONT_STOP:
        stopFrontend();
        break;
    case ID_TRAY_SVC_FRONT_RESTART:
        restartFrontend();
        break;
    case ID_TRAY_SVC_CORE_RESTART:
        restartCore();
        break;
    case ID_TRAY_INST_ALL:
        installAll();
        break;
    case ID_TRAY_INST_UPDATE:
        gitPull();
        break;
    case ID_TRAY_INST_GIT:
        installGit();
        break;
    case ID_TRAY_INST_NODE:
        installNode();
        break;
    case ID_TRAY_INST_PM2:
        installPm2();
        break;
    case ID_TRAY_INST_MARIADB:
        installMariaDB();
        break;
    case ID_TRAY_AUTO_ENABLE:
        enableAutoStart();
        break;
    case ID_TRAY_AUTO_DISABLE:
        disableAutoStart();
        break;
    case ID_TRAY_BROWSER: {
        std::cout << "[TrayIcon] Opening browser (Chrome kiosk)..." << std::endl;
        std::wstring url = L"http://localhost:" + std::to_wstring(g_packagedMode ? g_httpPort : 3000);
        int r = (int)(intptr_t)ShellExecuteW(NULL, L"open",
            L"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            (L"--kiosk " + url).c_str(), NULL, SW_SHOWNORMAL);
        if (r <= 32) ShellExecuteW(NULL, L"open", url.c_str(), NULL, NULL, SW_SHOWNORMAL);
        break;
    }
    case ID_TRAY_RESTART:
        std::cout << "[TrayIcon] Restart requested" << std::endl;
        if (m_restartCallback) {
            m_restartCallback();
        }
        break;
    case ID_TRAY_EXIT:
        std::cout << "[TrayIcon] Exit requested" << std::endl;
        if (m_exitCallback) {
            m_exitCallback();
        }
        break;
    }
}
#endif
#ifdef _WIN32
#include "robot_core_all.h"
#pragma comment(linker,"/manifestdependency:\"type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'\"")
ManagementDialog* ManagementDialog::s_instance = nullptr;
ManagementDialog::ManagementDialog() {
    s_instance = this;
    WSADATA wsaData;
    WSAStartup(MAKEWORD(2, 2), &wsaData);
    INITCOMMONCONTROLSEX icc = { sizeof(icc), ICC_PROGRESS_CLASS };
    InitCommonControlsEx(&icc);
    char exePath[MAX_PATH];
    GetModuleFileNameA(NULL, exePath, MAX_PATH);
    std::string dir(exePath);
    size_t pos = dir.find_last_of("\\/");
    dir = dir.substr(0, pos);
    pos = dir.find_last_of("\\/");
    dir = dir.substr(0, pos);
    pos = dir.find_last_of("\\/");
    m_projectPath = dir.substr(0, pos);
}
ManagementDialog::~ManagementDialog() {
    if (m_hwnd) {
        KillTimer(m_hwnd, TIMER_REFRESH);
        DestroyWindow(m_hwnd);
        m_hwnd = nullptr;
    }
    if (m_hFont) { DeleteObject(m_hFont); m_hFont = nullptr; }
    if (m_bgBrush) { DeleteObject(m_bgBrush); m_bgBrush = nullptr; }
    WSACleanup();
    s_instance = nullptr;
}
void ManagementDialog::show(HINSTANCE hInstance) {
    if (m_hwnd) {
        ShowWindow(m_hwnd, SW_SHOW);
        SetForegroundWindow(m_hwnd);
        updateServiceStatus();
        SetTimer(m_hwnd, TIMER_REFRESH, 2000, nullptr);
        return;
    }
    m_hInstance = hInstance;
    createWindow();
    createControls();
    refreshInstallStatus();
    updateServiceStatus();
    ShowWindow(m_hwnd, SW_SHOW);
    UpdateWindow(m_hwnd);
    SetForegroundWindow(m_hwnd);
    SetTimer(m_hwnd, TIMER_REFRESH, 2000, nullptr);
}
void ManagementDialog::close() {
    if (m_hwnd) {
        KillTimer(m_hwnd, TIMER_REFRESH);
        ShowWindow(m_hwnd, SW_HIDE);
    }
}
bool ManagementDialog::isVisible() const {
    return m_hwnd && IsWindowVisible(m_hwnd);
}
void ManagementDialog::processMessages() {
    if (!m_hwnd) return;
    MSG msg;
    while (PeekMessage(&msg, m_hwnd, 0, 0, PM_REMOVE)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }
}
void ManagementDialog::setRobotStatus(bool connected, const std::string& ip) {
    m_robotConnected = connected;
    m_robotIp = ip;
}
void ManagementDialog::setHttpPort(int port) {
    m_httpPort = port;
}
void ManagementDialog::createWindow() {
    WNDCLASSEXW wc = {};
    wc.cbSize = sizeof(WNDCLASSEXW);
    wc.lpfnWndProc = WndProc;
    wc.hInstance = m_hInstance;
    wc.hbrBackground = (HBRUSH)(COLOR_BTNFACE + 1);
    wc.lpszClassName = L"RobotCoreManagerClass";
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    if (!RegisterClassExW(&wc)) {
        if (GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
            std::cerr << "[ManagementDialog] Failed to register class" << std::endl;
            return;
        }
    }
    int w = 490, h = 560;
    int x = (GetSystemMetrics(SM_CXSCREEN) - w) / 2;
    int y = (GetSystemMetrics(SM_CYSCREEN) - h) / 2;
    m_hwnd = CreateWindowExW(
        WS_EX_DLGMODALFRAME,
        L"RobotCoreManagerClass",
        L"Robot Core Manager",
        WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU,
        x, y, w, h,
        nullptr, nullptr, m_hInstance, nullptr
    );
    HDC hdc = GetDC(NULL);
    int dpi = GetDeviceCaps(hdc, LOGPIXELSY);
    ReleaseDC(NULL, hdc);
    m_hFont = CreateFontW(
        -MulDiv(9, dpi, 72), 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
        DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
        CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI"
    );
    m_bgBrush = CreateSolidBrush(GetSysColor(COLOR_BTNFACE));
}
void ManagementDialog::createControls() {
    HFONT f = m_hFont;
    HWND p = m_hwnd;
    auto S = [&](LPCWSTR t, int x, int y, int w, int h, int id = 0) {
        return mkCtrl(p, L"STATIC", t, SS_LEFT, x, y, w, h, id, f);
    };
    auto B = [&](LPCWSTR t, int x, int y, int w, int h, int id) {
        return mkCtrl(p, L"BUTTON", t, BS_PUSHBUTTON, x, y, w, h, id, f);
    };
    auto G = [&](LPCWSTR t, int x, int y, int w, int h) {
        return mkCtrl(p, L"BUTTON", t, BS_GROUPBOX, x, y, w, h, 0, f);
    };
    G(g_packagedMode ? L"서비스 상태  [ Portable Mode ]" : L"서비스 상태  [ Development Mode ]",
      10, 8, 460, 155);
    int rowY[] = {35, 60, 85, 110};
    LPCWSTR labels[] = {L"HTTP 서버", L"Robot SDK", L"MariaDB", L"Frontend"};
    int infoIds[] = {IDC_HTTP_INFO, IDC_SDK_INFO, IDC_DB_INFO, IDC_FRONT_INFO};
    int statIds[] = {IDC_STATUS_HTTP, IDC_STATUS_SDK, IDC_STATUS_DB, IDC_STATUS_FRONT};
    for (int i = 0; i < 4; i++) {
        S(labels[i], 25, rowY[i], 85, 20);
        S(L"", 115, rowY[i], 200, 20, infoIds[i]);
        S(L"", 340, rowY[i], 120, 20, statIds[i]);
    }
    {
        HWND hChkReconn = mkCtrl(p, L"BUTTON", L"Robot SDK 자동 재연결",
                                  BS_AUTOCHECKBOX, 25, 135, 170, 20, IDC_CHK_AUTO_RECONNECT, f);
        if (g_robotService && g_robotService->isAutoReconnectEnabled()) {
            SendMessage(hChkReconn, BM_SETCHECK, BST_CHECKED, 0);
        }
    }
    B(L"새로고침", 350, 133, 100, 24, IDC_BTN_REFRESH);
    G(L"설치 상태", 10, 170, 460, 148);
    int instY[] = {193, 221, 249, 277};
    LPCWSTR pkgNames[] = {L"Git", L"Node.js", L"MariaDB", L"Robot Core"};
    int labelIds[] = {IDC_GIT_LABEL, IDC_NODE_LABEL, IDC_MARIA_LABEL, IDC_CORE_LABEL};
    int btnIds[] = {IDC_BTN_GIT, IDC_BTN_NODE, IDC_BTN_MARIA, IDC_BTN_CORE_UPDATE};
    for (int i = 0; i < 4; i++) {
        S(pkgNames[i], 25, instY[i], 75, 20);
        S(L"", 105, instY[i], 220, 20, labelIds[i]);
        B(L"확인 중...", 335, instY[i] - 3, 120, 24, btnIds[i]);
    }
    G(L"서비스 제어", 10, 327, 460, 120);
    B(L"Frontend 시작", 25, 351, 135, 28, IDC_BTN_FRONT_START);
    B(L"Frontend 중지", 170, 351, 135, 28, IDC_BTN_FRONT_STOP);
    B(L"Frontend 재시작", 315, 351, 135, 28, IDC_BTN_FRONT_RESTART);
    B(L"Backend 재시작", 25, 387, 135, 28, IDC_BTN_CORE_RESTART);
    B(L"브라우저 열기", 170, 387, 135, 28, IDC_BTN_BROWSER);
    HWND hChk = mkCtrl(p, L"BUTTON", L"윈도우 시작 시 자동 실행",
                        BS_AUTOCHECKBOX, 25, 422, 220, 20, IDC_CHK_AUTOSTART, f);
    if (checkAutoStartEnabled()) {
        SendMessage(hChk, BM_SETCHECK, BST_CHECKED, 0);
    }
    B(L"닫기", 280, 473, 90, 32, IDC_BTN_CLOSE);
    B(L"종료", 380, 473, 90, 32, IDC_BTN_EXIT);
}
std::string ManagementDialog::captureCommand(const std::wstring& cmd, int timeoutMs) {
    SECURITY_ATTRIBUTES sa = { sizeof(sa), NULL, TRUE };
    HANDLE hRead, hWrite;
    if (!CreatePipe(&hRead, &hWrite, &sa, 0)) return "";
    SetHandleInformation(hRead, HANDLE_FLAG_INHERIT, 0);
    STARTUPINFOW si = { sizeof(si) };
    si.hStdOutput = hWrite;
    si.hStdError = hWrite;
    si.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    PROCESS_INFORMATION pi;
    std::wstring fullCmd = L"cmd /c " + cmd;
    std::string output;
    if (CreateProcessW(NULL, const_cast<wchar_t*>(fullCmd.c_str()), NULL, NULL, TRUE,
                       CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
        CloseHandle(hWrite);
        hWrite = NULL;
        char buf[4096];
        DWORD read;
        while (ReadFile(hRead, buf, sizeof(buf) - 1, &read, NULL) && read > 0) {
            buf[read] = 0;
            output += buf;
        }
        WaitForSingleObject(pi.hProcess, timeoutMs);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
    }
    if (hWrite) CloseHandle(hWrite);
    CloseHandle(hRead);
    return output;
}
std::string ManagementDialog::normalizeVersion(const std::string& ver) {
    std::string result;
    int dots = 0;
    for (char c : ver) {
        if (c == '.') {
            if (++dots >= 3) break;
            result += c;
        } else if (isdigit((unsigned char)c)) {
            result += c;
        } else {
            break;
        }
    }
    return result;
}
bool ManagementDialog::isNewerVersion(const std::string& installed, const std::string& latest) {
    if (installed.empty() || latest.empty()) return false;
    std::string v1 = normalizeVersion(installed);
    std::string v2 = normalizeVersion(latest);
    if (v1 == v2) return false;
    auto split = [](const std::string& s) {
        std::vector<int> parts;
        std::stringstream ss(s);
        std::string tok;
        while (std::getline(ss, tok, '.')) {
            try { parts.push_back(std::stoi(tok)); } catch (...) { parts.push_back(0); }
        }
        return parts;
    };
    auto p1 = split(v1);
    auto p2 = split(v2);
    size_t n = (std::max)(p1.size(), p2.size());
    p1.resize(n, 0);
    p2.resize(n, 0);
    for (size_t i = 0; i < n; i++) {
        if (p2[i] > p1[i]) return true;
        if (p2[i] < p1[i]) return false;
    }
    return false;
}
std::wstring ManagementDialog::toWide(const std::string& s) {
    return std::wstring(s.begin(), s.end());
}
void ManagementDialog::runHiddenCommand(const std::wstring& cmd, bool wait) {
    STARTUPINFOW si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    std::wstring wpath(m_projectPath.begin(), m_projectPath.end());
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    std::wstring fullCmd = L"powershell.exe -WindowStyle Hidden -Command \"" + cmd + L"\"";
    if (CreateProcessW(NULL, const_cast<wchar_t*>(fullCmd.c_str()), NULL, NULL, FALSE,
                       CREATE_NO_WINDOW, NULL, wpath.c_str(), &si, &pi)) {
        if (wait) WaitForSingleObject(pi.hProcess, 120000);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
    }
}
std::string ManagementDialog::runWithProgress(const std::wstring& cmd,
                                               const std::wstring& statusText,
                                               int timeoutMs,
                                               bool capture) {
    static bool classReg = false;
    HINSTANCE hInst = GetModuleHandle(NULL);
    if (!classReg) {
        WNDCLASSEXW wc = {};
        wc.cbSize = sizeof(wc);
        wc.lpfnWndProc = DefWindowProcW;
        wc.hInstance = hInst;
        wc.hbrBackground = (HBRUSH)(COLOR_BTNFACE + 1);
        wc.lpszClassName = L"RobotCoreProgressClass";
        wc.hCursor = LoadCursor(NULL, IDC_APPSTARTING);
        if (RegisterClassExW(&wc) || GetLastError() == ERROR_CLASS_ALREADY_EXISTS)
            classReg = true;
    }
    RECT pr = {};
    if (m_hwnd) GetWindowRect(m_hwnd, &pr);
    int pw = 420, ph = 120;
    int px = pr.left + ((pr.right - pr.left) - pw) / 2;
    int py = pr.top + ((pr.bottom - pr.top) - ph) / 2;
    HWND hProg = CreateWindowExW(
        WS_EX_DLGMODALFRAME | WS_EX_TOPMOST,
        L"RobotCoreProgressClass",
        L"작업 중...",
        WS_OVERLAPPED | WS_CAPTION,
        px, py, pw, ph,
        m_hwnd, nullptr, hInst, nullptr);
    HWND hText = CreateWindowW(L"STATIC", statusText.c_str(),
        WS_CHILD | WS_VISIBLE | SS_LEFT,
        15, 15, 380, 22, hProg, nullptr, hInst, nullptr);
    SendMessage(hText, WM_SETFONT, (WPARAM)m_hFont, TRUE);
    HWND hBar = CreateWindowW(PROGRESS_CLASSW, NULL,
        WS_CHILD | WS_VISIBLE | PBS_MARQUEE,
        15, 48, 380, 22, hProg, nullptr, hInst, nullptr);
    SendMessage(hBar, PBM_SETMARQUEE, TRUE, 30);
    ShowWindow(hProg, SW_SHOW);
    UpdateWindow(hProg);
    if (m_hwnd) EnableWindow(m_hwnd, FALSE);
    std::string output;
    std::atomic<bool> done{false};
    std::thread worker([cmd, &output, &done, hProg, timeoutMs, capture]() {
        SECURITY_ATTRIBUTES sa = { sizeof(sa), NULL, TRUE };
        HANDLE hRead = NULL, hWrite = NULL;
        CreatePipe(&hRead, &hWrite, &sa, 0);
        if (hRead) SetHandleInformation(hRead, HANDLE_FLAG_INHERIT, 0);
        STARTUPINFOW si = { sizeof(si) };
        PROCESS_INFORMATION pi = {};
        si.dwFlags = STARTF_USESHOWWINDOW;
        if (hWrite) {
            si.hStdOutput = hWrite;
            si.hStdError = hWrite;
            si.dwFlags |= STARTF_USESTDHANDLES;
        }
        si.wShowWindow = SW_HIDE;
        std::wstring fullCmd = L"cmd /c " + cmd;
        if (CreateProcessW(NULL, const_cast<wchar_t*>(fullCmd.c_str()),
                           NULL, NULL, TRUE, CREATE_NO_WINDOW,
                           NULL, NULL, &si, &pi)) {
            if (hWrite) { CloseHandle(hWrite); hWrite = NULL; }
            std::string cmdOutput;
            if (hRead) {
                char buf[4096];
                DWORD bytesRead;
                while (ReadFile(hRead, buf, sizeof(buf) - 1, &bytesRead, NULL) && bytesRead > 0) {
                    buf[bytesRead] = 0;
                    cmdOutput += buf;
                }
            }
            WaitForSingleObject(pi.hProcess, timeoutMs);
            DWORD dwExit = 0;
            GetExitCodeProcess(pi.hProcess, &dwExit);
            output = "EXIT:" + std::to_string((int)dwExit) + "\n" + cmdOutput;
            CloseHandle(pi.hProcess);
            CloseHandle(pi.hThread);
        } else {
            DWORD err = GetLastError();
            output = "EXIT:-1\nCreateProcess failed (error " + std::to_string(err) + ")";
        }
        if (hWrite) CloseHandle(hWrite);
        if (hRead) CloseHandle(hRead);
        done.store(true);
        if (hProg && IsWindow(hProg))
            PostMessage(hProg, WM_APP, 0, 0);
    });
    MSG msg;
    while (!done.load()) {
        DWORD result = MsgWaitForMultipleObjects(0, NULL, FALSE, 100, QS_ALLINPUT);
        if (result == WAIT_OBJECT_0) {
            while (PeekMessage(&msg, NULL, 0, 0, PM_REMOVE)) {
                TranslateMessage(&msg);
                DispatchMessage(&msg);
            }
        }
    }
    worker.join();
    if (m_hwnd) EnableWindow(m_hwnd, TRUE);
    DestroyWindow(hProg);
    if (m_hwnd) SetForegroundWindow(m_hwnd);
    return output;
}
#endif
#ifdef _WIN32
#include "robot_core_all.h"
void ManagementDialog::updateServiceStatus() {
    if (!m_hwnd) return;
    m_httpRunning = g_httpServer && g_httpServer->isRunning();
    m_robotConnected = g_robotService && g_robotService->isConnected();
    if (g_robotService && m_robotConnected) {
        m_robotIp = g_robotIp;
    }
    m_dbRunning = checkMariaDBRunning();
    if (g_packagedMode) {
        m_frontRunning = m_httpRunning;
    } else {
        m_frontRunning = checkPortListening(3000);
    }
    std::wstring httpInfo = L":" + std::to_wstring(m_httpPort);
    SetDlgItemTextW(m_hwnd, IDC_HTTP_INFO, httpInfo.c_str());
    SetDlgItemTextW(m_hwnd, IDC_STATUS_HTTP,
        m_httpRunning ? L"\u25CF Running" : L"\u25CB Stopped");
    std::wstring sdkInfo(m_robotIp.begin(), m_robotIp.end());
    SetDlgItemTextW(m_hwnd, IDC_SDK_INFO, sdkInfo.c_str());
    SetDlgItemTextW(m_hwnd, IDC_STATUS_SDK,
        m_robotConnected ? L"\u25CF Connected" : L"\u25CB Disconnected");
    SetDlgItemTextW(m_hwnd, IDC_DB_INFO, L":3306");
    SetDlgItemTextW(m_hwnd, IDC_STATUS_DB,
        m_dbRunning ? L"\u25CF Running" : L"\u25CB Stopped");
    SetDlgItemTextW(m_hwnd, IDC_FRONT_INFO,
        g_packagedMode ? (L":" + std::to_wstring(m_httpPort)).c_str() : L":3000");
    SetDlgItemTextW(m_hwnd, IDC_STATUS_FRONT,
        m_frontRunning ? L"\u25CF Running" : L"\u25CB Stopped");
    InvalidateRect(m_hwnd, NULL, FALSE);
}
void ManagementDialog::refreshInstallStatus() {
    m_gitInstalled = checkGitInstalled();
    m_nodeInstalled = checkNodeInstalled();
    m_mariaInstalled = checkMariaDBInstalled();
    refreshVersions();
    std::wstring projW(m_projectPath.begin(), m_projectPath.end());
    auto out = captureCommand(L"git -C \"" + projW + L"\" describe --tags --always", 5000);
    while (!out.empty() && out.back() <= ' ') out.pop_back();
    m_coreVersion = out;
    updateButtonStates();
}
void ManagementDialog::refreshVersions() {
    if (m_gitInstalled) {
        auto out = captureCommand(L"git --version", 5000);
        auto pos = out.find("version ");
        if (pos != std::string::npos) {
            m_gitVersion = out.substr(pos + 8);
            auto wp = m_gitVersion.find(".windows");
            if (wp != std::string::npos) m_gitVersion = m_gitVersion.substr(0, wp);
            while (!m_gitVersion.empty() && m_gitVersion.back() <= ' ') m_gitVersion.pop_back();
        }
    } else { m_gitVersion.clear(); }
    if (m_nodeInstalled) {
        auto out = captureCommand(L"node --version", 5000);
        while (!out.empty() && out.back() <= ' ') out.pop_back();
        m_nodeVersion = (!out.empty() && out[0] == 'v') ? out.substr(1) : out;
    } else { m_nodeVersion.clear(); }
    if (m_mariaInstalled) {
        auto out = captureCommand(L"mysql --version", 5000);
        auto pos = out.find("Distrib ");
        if (pos != std::string::npos) {
            m_mariaVersion = out.substr(pos + 8);
            auto dash = m_mariaVersion.find('-');
            if (dash != std::string::npos) m_mariaVersion = m_mariaVersion.substr(0, dash);
            while (!m_mariaVersion.empty() && m_mariaVersion.back() <= ' ') m_mariaVersion.pop_back();
        }
    } else { m_mariaVersion.clear(); }
}
void ManagementDialog::updateButtonStates() {
    if (!m_hwnd) return;
    if (!m_gitInstalled) {
        SetDlgItemTextW(m_hwnd, IDC_GIT_LABEL, L"미설치");
        SetDlgItemTextW(m_hwnd, IDC_BTN_GIT, L"설치");
        EnableWindow(GetDlgItem(m_hwnd, IDC_BTN_GIT), TRUE);
    } else if (m_gitUpdateAvail) {
        auto txt = toWide(m_gitVersion) + L" \u2192 " + toWide(m_gitLatest);
        SetDlgItemTextW(m_hwnd, IDC_GIT_LABEL, txt.c_str());
        SetDlgItemTextW(m_hwnd, IDC_BTN_GIT, L"업데이트");
        EnableWindow(GetDlgItem(m_hwnd, IDC_BTN_GIT), TRUE);
    } else if (!m_gitLatest.empty()) {
        SetDlgItemTextW(m_hwnd, IDC_GIT_LABEL, toWide(m_gitVersion).c_str());
        SetDlgItemTextW(m_hwnd, IDC_BTN_GIT, L"최신 버전");
        EnableWindow(GetDlgItem(m_hwnd, IDC_BTN_GIT), FALSE);
    } else {
        SetDlgItemTextW(m_hwnd, IDC_GIT_LABEL, toWide(m_gitVersion).c_str());
        SetDlgItemTextW(m_hwnd, IDC_BTN_GIT, L"업데이트 확인");
        EnableWindow(GetDlgItem(m_hwnd, IDC_BTN_GIT), TRUE);
    }
    if (!m_nodeInstalled) {
        SetDlgItemTextW(m_hwnd, IDC_NODE_LABEL, L"미설치");
        SetDlgItemTextW(m_hwnd, IDC_BTN_NODE, L"설치");
        EnableWindow(GetDlgItem(m_hwnd, IDC_BTN_NODE), TRUE);
    } else if (m_nodeUpdateAvail) {
        auto txt = toWide(m_nodeVersion) + L" \u2192 " + toWide(m_nodeLatest);
        SetDlgItemTextW(m_hwnd, IDC_NODE_LABEL, txt.c_str());
        SetDlgItemTextW(m_hwnd, IDC_BTN_NODE, L"업데이트");
        EnableWindow(GetDlgItem(m_hwnd, IDC_BTN_NODE), TRUE);
    } else if (!m_nodeLatest.empty()) {
        SetDlgItemTextW(m_hwnd, IDC_NODE_LABEL, toWide(m_nodeVersion).c_str());
        SetDlgItemTextW(m_hwnd, IDC_BTN_NODE, L"최신 버전");
        EnableWindow(GetDlgItem(m_hwnd, IDC_BTN_NODE), FALSE);
    } else {
        SetDlgItemTextW(m_hwnd, IDC_NODE_LABEL, toWide(m_nodeVersion).c_str());
        SetDlgItemTextW(m_hwnd, IDC_BTN_NODE, L"업데이트 확인");
        EnableWindow(GetDlgItem(m_hwnd, IDC_BTN_NODE), TRUE);
    }
    if (!m_mariaInstalled) {
        SetDlgItemTextW(m_hwnd, IDC_MARIA_LABEL, L"미설치");
        SetDlgItemTextW(m_hwnd, IDC_BTN_MARIA, L"설치");
        EnableWindow(GetDlgItem(m_hwnd, IDC_BTN_MARIA), TRUE);
    } else if (m_mariaUpdateAvail) {
        auto txt = toWide(m_mariaVersion) + L" \u2192 " + toWide(m_mariaLatest);
        SetDlgItemTextW(m_hwnd, IDC_MARIA_LABEL, txt.c_str());
        SetDlgItemTextW(m_hwnd, IDC_BTN_MARIA, L"업데이트");
        EnableWindow(GetDlgItem(m_hwnd, IDC_BTN_MARIA), TRUE);
    } else if (!m_mariaLatest.empty()) {
        SetDlgItemTextW(m_hwnd, IDC_MARIA_LABEL, toWide(m_mariaVersion).c_str());
        SetDlgItemTextW(m_hwnd, IDC_BTN_MARIA, L"최신 버전");
        EnableWindow(GetDlgItem(m_hwnd, IDC_BTN_MARIA), FALSE);
    } else {
        SetDlgItemTextW(m_hwnd, IDC_MARIA_LABEL, toWide(m_mariaVersion).c_str());
        SetDlgItemTextW(m_hwnd, IDC_BTN_MARIA, L"업데이트 확인");
        EnableWindow(GetDlgItem(m_hwnd, IDC_BTN_MARIA), TRUE);
    }
    SetDlgItemTextW(m_hwnd, IDC_CORE_LABEL, toWide(m_coreVersion).c_str());
    if (g_packagedMode) {
        SetDlgItemTextW(m_hwnd, IDC_BTN_CORE_UPDATE, L"미지원");
        EnableWindow(GetDlgItem(m_hwnd, IDC_BTN_CORE_UPDATE), FALSE);
    } else if (m_coreUpdateAvail) {
        SetDlgItemTextW(m_hwnd, IDC_BTN_CORE_UPDATE, L"업데이트");
        EnableWindow(GetDlgItem(m_hwnd, IDC_BTN_CORE_UPDATE), TRUE);
    } else if (m_coreChecked) {
        SetDlgItemTextW(m_hwnd, IDC_BTN_CORE_UPDATE, L"최신 버전");
        EnableWindow(GetDlgItem(m_hwnd, IDC_BTN_CORE_UPDATE), FALSE);
    } else {
        SetDlgItemTextW(m_hwnd, IDC_BTN_CORE_UPDATE, L"업데이트 확인");
        EnableWindow(GetDlgItem(m_hwnd, IDC_BTN_CORE_UPDATE), TRUE);
    }
    InvalidateRect(m_hwnd, NULL, FALSE);
}
static std::string parseWingetVersion(const std::string& output) {
    std::istringstream stream(output);
    std::string line;
    bool foundHeader = false;
    while (std::getline(stream, line)) {
        if (!foundHeader) {
            if (line.find('[') != std::string::npos && line.find(']') != std::string::npos)
                foundHeader = true;
            continue;
        }
        auto colon = line.find(": ");
        if (colon != std::string::npos) {
            std::string val = line.substr(colon + 2);
            while (!val.empty() && (val.back() <= ' ')) val.pop_back();
            auto start = val.find_first_not_of(" \t");
            if (start != std::string::npos) val = val.substr(start);
            if (!val.empty() && isdigit((unsigned char)val[0]))
                return val;
        }
    }
    return "";
}
void ManagementDialog::handlePackageAction(int pkgId) {
    bool* installed = nullptr;
    std::string* version = nullptr;
    std::string* latest = nullptr;
    bool* updateAvail = nullptr;
    const wchar_t* wingetId = nullptr;
    const wchar_t* pkgName = nullptr;
    switch (pkgId) {
    case IDC_BTN_GIT:
        installed = &m_gitInstalled; version = &m_gitVersion;
        latest = &m_gitLatest; updateAvail = &m_gitUpdateAvail;
        wingetId = L"Git.Git"; pkgName = L"Git";
        break;
    case IDC_BTN_NODE:
        installed = &m_nodeInstalled; version = &m_nodeVersion;
        latest = &m_nodeLatest; updateAvail = &m_nodeUpdateAvail;
        wingetId = L"OpenJS.NodeJS.LTS"; pkgName = L"Node.js";
        break;
    case IDC_BTN_MARIA:
        installed = &m_mariaInstalled; version = &m_mariaVersion;
        latest = &m_mariaLatest; updateAvail = &m_mariaUpdateAvail;
        wingetId = L"MariaDB.Server"; pkgName = L"MariaDB";
        break;
    default: return;
    }
    wchar_t btnText[64] = {};
    GetDlgItemTextW(m_hwnd, pkgId, btnText, 64);
    std::wstring action(btnText);
    if (action == L"설치" || action == L"업데이트") {
        bool isUpdate = (action == L"업데이트");
        if (pkgId == IDC_BTN_GIT) {
            std::wstring confirmMsg = std::wstring(pkgName) +
                (isUpdate ? L"을(를) 업데이트하시겠습니까?" : L"을(를) 설치하시겠습니까?") +
                L"\n\n※ Git 설치를 위해 실행 중인 모든 bash/터미널 프로세스가 종료됩니다.";
            if (MessageBoxW(m_hwnd, confirmMsg.c_str(), pkgName,
                            MB_YESNO | MB_ICONWARNING) != IDYES)
                return;
        } else {
            std::wstring confirmMsg = std::wstring(pkgName) +
                (isUpdate ? L"을(를) 업데이트하시겠습니까?" : L"을(를) 설치하시겠습니까?");
            if (MessageBoxW(m_hwnd, confirmMsg.c_str(), pkgName,
                            MB_YESNO | MB_ICONQUESTION) != IDYES)
                return;
        }
        if (pkgId == IDC_BTN_GIT) {
            runWithProgress(L"taskkill /F /IM bash.exe", L"Git 프로세스 종료 중...", 10000);
            Sleep(2000);
        }
        std::wstring wingetCmd = std::wstring(L"winget install --id ") + wingetId +
            L" -e --silent --disable-interactivity"
            L" --accept-package-agreements --accept-source-agreements";
        std::wstring progressMsg = std::wstring(pkgName) +
            (isUpdate ? L" 업데이트 중..." : L" 설치 중...");
        auto result = runWithProgress(wingetCmd, progressMsg);
        bool success = false;
        int exitCode = -1;
        auto exitPos = result.find("EXIT:");
        if (exitPos != std::string::npos) {
            try { exitCode = std::stoi(result.substr(exitPos + 5)); } catch (...) {}
            success = (exitCode == 0 || exitCode == -1978335189);
        }
        if (pkgId == IDC_BTN_MARIA && success && !isUpdate) {
            const wchar_t* paths[] = {
                L"C:\\Program Files\\MariaDB 11.4\\bin",
                L"C:\\Program Files\\MariaDB 11.3\\bin",
            };
            for (auto& binPath : paths) {
                if (GetFileAttributesW(binPath) == INVALID_FILE_ATTRIBUTES) continue;
                HKEY hKey;
                if (RegOpenKeyExW(HKEY_CURRENT_USER, L"Environment", 0,
                                  KEY_READ | KEY_WRITE, &hKey) == ERROR_SUCCESS) {
                    wchar_t pathVal[32767] = {};
                    DWORD sz = sizeof(pathVal);
                    DWORD type;
                    if (RegQueryValueExW(hKey, L"Path", NULL, &type,
                                         (BYTE*)pathVal, &sz) == ERROR_SUCCESS) {
                        std::wstring cur(pathVal);
                        if (cur.find(binPath) == std::wstring::npos) {
                            if (!cur.empty() && cur.back() != L';') cur += L";";
                            cur += binPath;
                            RegSetValueExW(hKey, L"Path", 0, REG_EXPAND_SZ,
                                (BYTE*)cur.c_str(), (DWORD)((cur.length() + 1) * sizeof(wchar_t)));
                            SendMessageTimeoutW(HWND_BROADCAST, WM_SETTINGCHANGE, 0,
                                (LPARAM)L"Environment", SMTO_ABORTIFHUNG, 5000, NULL);
                        }
                    }
                    RegCloseKey(hKey);
                }
                break;
            }
        }
        latest->clear();
        *updateAvail = false;
        refreshInstallStatus();
        if (success) {
            MessageBoxW(m_hwnd, (std::wstring(pkgName) +
                (isUpdate ? L" 업데이트가 완료되었습니다." : L" 설치가 완료되었습니다.")).c_str(),
                pkgName, MB_OK | MB_ICONINFORMATION);
        } else {
            std::wstring errMsg = std::wstring(pkgName) +
                (isUpdate ? L" 업데이트에 실패했습니다." : L" 설치에 실패했습니다.") +
                L"\n(종료 코드: " + std::to_wstring(exitCode) + L")";
            if (pkgId == IDC_BTN_GIT) {
                errMsg += L"\n\nGit Bash 또는 Git을 사용하는 프로세스가 실행 중일 수 있습니다."
                          L"\n모든 터미널을 닫고 다시 시도해 주세요.";
            } else {
                errMsg += L"\n\n관리자 권한으로 실행하면 해결될 수 있습니다.";
            }
            MessageBoxW(m_hwnd, errMsg.c_str(), pkgName, MB_OK | MB_ICONWARNING);
        }
    } else if (action == L"업데이트 확인") {
        std::wstring showCmd = std::wstring(L"winget show --id ") + wingetId +
            L" --source winget --accept-source-agreements";
        *latest = parseWingetVersion(
            runWithProgress(showCmd, std::wstring(pkgName) + L" 최신 버전 확인 중...", 15000, true));
        if (!latest->empty() && !version->empty()) {
            *updateAvail = isNewerVersion(*version, *latest);
        } else {
            *updateAvail = false;
        }
        updateButtonStates();
    }
}
void ManagementDialog::handleCoreUpdate() {
    wchar_t btnText[64] = {};
    GetDlgItemTextW(m_hwnd, IDC_BTN_CORE_UPDATE, btnText, 64);
    std::wstring action(btnText);
    std::wstring projW(m_projectPath.begin(), m_projectPath.end());
    if (action == L"업데이트 확인") {
        runWithProgress(L"git -C \"" + projW + L"\" fetch origin",
            L"Robot Core 업데이트 확인 중...", 15000);
        auto local = captureCommand(L"git -C \"" + projW + L"\" rev-parse HEAD", 5000);
        auto remote = captureCommand(L"git -C \"" + projW + L"\" rev-parse origin/master", 5000);
        while (!local.empty() && local.back() <= ' ') local.pop_back();
        while (!remote.empty() && remote.back() <= ' ') remote.pop_back();
        m_coreChecked = true;
        m_coreUpdateAvail = (!local.empty() && !remote.empty() && local != remote);
        if (m_coreUpdateAvail) {
            auto logOut = captureCommand(
                L"git -C \"" + projW + L"\" log --oneline HEAD..origin/master", 5000);
            int commitCount = 0;
            for (char c : logOut) if (c == '\n') commitCount++;
            std::wstring msg = std::to_wstring(commitCount) +
                L"개의 새로운 커밋이 있습니다.\n'업데이트' 버튼을 눌러 적용하세요.";
            MessageBoxW(m_hwnd, msg.c_str(), L"Robot Core 업데이트", MB_OK | MB_ICONINFORMATION);
        } else {
            MessageBoxW(m_hwnd, L"이미 최신 버전입니다.", L"Robot Core 업데이트",
                        MB_OK | MB_ICONINFORMATION);
        }
        updateButtonStates();
    } else if (action == L"업데이트") {
        if (MessageBoxW(m_hwnd,
                L"소스 코드를 업데이트합니다.\n"
                L"프론트엔드는 자동 반영되며,\n"
                L"백엔드는 빌드 후 재시작이 필요합니다.\n\n"
                L"계속하시겠습니까?",
                L"Robot Core 업데이트", MB_YESNO | MB_ICONQUESTION) != IDYES)
            return;
        auto result = runWithProgress(L"git -C \"" + projW + L"\" pull origin master",
            L"Robot Core 소스 코드 업데이트 중...", 30000);
        bool success = false;
        auto exitPos = result.find("EXIT:");
        if (exitPos != std::string::npos) {
            try { success = (std::stoi(result.substr(exitPos + 5)) == 0); } catch (...) {}
        }
        m_coreChecked = false;
        m_coreUpdateAvail = false;
        refreshInstallStatus();
        if (success) {
            MessageBoxW(m_hwnd,
                L"소스 코드가 업데이트되었습니다.\n"
                L"백엔드 변경사항을 적용하려면\n"
                L"빌드 후 재시작해 주세요.",
                L"Robot Core 업데이트", MB_OK | MB_ICONINFORMATION);
        } else {
            MessageBoxW(m_hwnd,
                L"소스 코드 업데이트에 실패했습니다.\n"
                L"수동으로 git pull을 실행해 보세요.",
                L"Robot Core 업데이트", MB_OK | MB_ICONWARNING);
        }
    }
}
#endif
#ifdef _WIN32
#include "robot_core_all.h"
#include "robot_core_all.h"
void ManagementDialog::doStartFrontend() {
    std::wstring wpath(m_projectPath.begin(), m_projectPath.end());
    std::wstring frontDir = wpath + L"\\robot-front";
    STARTUPINFOW si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    std::wstring cmd = L"cmd.exe /c \"set BROWSER=none && set PORT=3000 && npm start\"";
    if (CreateProcessW(NULL, const_cast<wchar_t*>(cmd.c_str()), NULL, NULL, FALSE,
                       CREATE_NO_WINDOW, NULL, frontDir.c_str(), &si, &pi)) {
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
    }
    MessageBoxW(m_hwnd, L"Frontend를 시작합니다.\n잠시 기다려 주세요.",
                L"서비스 제어", MB_OK | MB_ICONINFORMATION);
}
void ManagementDialog::doStopFrontend() {
    runHiddenCommand(L"Get-NetTCPConnection -LocalPort 3000 -State Listen "
        L"-ErrorAction SilentlyContinue | ForEach-Object { "
        L"Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }");
    Sleep(500);
    updateServiceStatus();
    MessageBoxW(m_hwnd, L"Frontend를 중지했습니다.", L"서비스 제어", MB_OK | MB_ICONINFORMATION);
}
void ManagementDialog::doRestartFrontend() {
    runHiddenCommand(L"Get-NetTCPConnection -LocalPort 3000 -State Listen "
        L"-ErrorAction SilentlyContinue | ForEach-Object { "
        L"Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }");
    Sleep(2000);
    doStartFrontend();
}
void ManagementDialog::toggleAutoStart() {
    bool current = checkAutoStartEnabled();
    HKEY hKey;
    if (current) {
        if (RegOpenKeyExW(HKEY_CURRENT_USER,
                          L"Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                          0, KEY_WRITE, &hKey) == ERROR_SUCCESS) {
            RegDeleteValueW(hKey, L"RobotCore");
            RegCloseKey(hKey);
        }
    } else {
        if (RegOpenKeyExW(HKEY_CURRENT_USER,
                          L"Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                          0, KEY_WRITE, &hKey) == ERROR_SUCCESS) {
            wchar_t exePath[MAX_PATH];
            GetModuleFileNameW(NULL, exePath, MAX_PATH);
            RegSetValueExW(hKey, L"RobotCore", 0, REG_SZ,
                (BYTE*)exePath, (DWORD)((wcslen(exePath) + 1) * sizeof(wchar_t)));
            RegCloseKey(hKey);
        }
    }
}
bool ManagementDialog::checkMariaDBRunning() {
    SC_HANDLE scm = OpenSCManager(NULL, NULL, SC_MANAGER_CONNECT);
    if (!scm) return false;
    SC_HANDLE svc = OpenServiceW(scm, L"MariaDB", SERVICE_QUERY_STATUS);
    if (!svc) { CloseServiceHandle(scm); return false; }
    SERVICE_STATUS st;
    bool running = QueryServiceStatus(svc, &st) && (st.dwCurrentState == SERVICE_RUNNING);
    CloseServiceHandle(svc);
    CloseServiceHandle(scm);
    return running;
}
bool ManagementDialog::checkPortListening(int port) {
    SOCKET sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (sock == INVALID_SOCKET) return false;
    u_long mode = 1;
    ioctlsocket(sock, FIONBIO, &mode);
    sockaddr_in addr = {};
    addr.sin_family = AF_INET;
    addr.sin_port = htons((u_short)port);
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    int ret = connect(sock, (sockaddr*)&addr, sizeof(addr));
    if (ret == 0) { closesocket(sock); return true; }
    if (WSAGetLastError() != WSAEWOULDBLOCK) { closesocket(sock); return false; }
    fd_set wset;
    FD_ZERO(&wset);
    FD_SET(sock, &wset);
    timeval tv = { 0, 300000 };
    bool connected = false;
    if (select(0, NULL, &wset, NULL, &tv) > 0) {
        int optVal = 0;
        int optLen = sizeof(optVal);
        if (getsockopt(sock, SOL_SOCKET, SO_ERROR, (char*)&optVal, &optLen) == 0)
            connected = (optVal == 0);
    }
    closesocket(sock);
    return connected;
}
bool ManagementDialog::checkCommandAvailable(const wchar_t* cmd) {
    DWORD result = 1;
    STARTUPINFOW si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    wchar_t buf[256];
    wsprintfW(buf, L"cmd /c %s >nul 2>&1", cmd);
    if (CreateProcessW(NULL, buf, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
        WaitForSingleObject(pi.hProcess, 5000);
        GetExitCodeProcess(pi.hProcess, &result);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
    }
    return result == 0;
}
bool ManagementDialog::checkGitInstalled() { return checkCommandAvailable(L"git --version"); }
bool ManagementDialog::checkNodeInstalled() { return checkCommandAvailable(L"node --version"); }
bool ManagementDialog::checkMariaDBInstalled() {
    const wchar_t* paths[] = {
        L"C:\\Program Files\\MariaDB 11.4\\bin\\mysql.exe",
        L"C:\\Program Files\\MariaDB 11.3\\bin\\mysql.exe",
        L"C:\\Program Files\\MariaDB 11.2\\bin\\mysql.exe",
    };
    for (auto& p : paths) {
        if (GetFileAttributesW(p) != INVALID_FILE_ATTRIBUTES) return true;
    }
    return checkCommandAvailable(L"mysql --version");
}
bool ManagementDialog::checkAutoStartEnabled() {
    HKEY hKey;
    bool enabled = false;
    if (RegOpenKeyExW(HKEY_CURRENT_USER,
                      L"Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                      0, KEY_READ, &hKey) == ERROR_SUCCESS) {
        enabled = (RegQueryValueExW(hKey, L"RobotCore", NULL, NULL, NULL, NULL) == ERROR_SUCCESS);
        RegCloseKey(hKey);
    }
    return enabled;
}
LRESULT CALLBACK ManagementDialog::WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    if (!s_instance) return DefWindowProc(hwnd, msg, wParam, lParam);
    switch (msg) {
    case WM_CTLCOLORSTATIC: {
        HDC hdc = (HDC)wParam;
        int id = GetDlgCtrlID((HWND)lParam);
        COLORREF color = GetSysColor(COLOR_WINDOWTEXT);
        bool handled = false;
        switch (id) {
        case IDC_STATUS_HTTP:
            color = s_instance->m_httpRunning ? RGB(0, 160, 0) : RGB(200, 0, 0);
            handled = true; break;
        case IDC_STATUS_SDK:
            color = s_instance->m_robotConnected ? RGB(0, 160, 0) : RGB(200, 0, 0);
            handled = true; break;
        case IDC_STATUS_DB:
            color = s_instance->m_dbRunning ? RGB(0, 160, 0) : RGB(200, 0, 0);
            handled = true; break;
        case IDC_STATUS_FRONT:
            color = s_instance->m_frontRunning ? RGB(0, 160, 0) : RGB(200, 0, 0);
            handled = true; break;
        case IDC_GIT_LABEL:
            if (!s_instance->m_gitInstalled) color = RGB(200, 0, 0);
            else if (s_instance->m_gitUpdateAvail) color = RGB(200, 120, 0);
            else color = RGB(0, 160, 0);
            handled = true; break;
        case IDC_NODE_LABEL:
            if (!s_instance->m_nodeInstalled) color = RGB(200, 0, 0);
            else if (s_instance->m_nodeUpdateAvail) color = RGB(200, 120, 0);
            else color = RGB(0, 160, 0);
            handled = true; break;
        case IDC_MARIA_LABEL:
            if (!s_instance->m_mariaInstalled) color = RGB(200, 0, 0);
            else if (s_instance->m_mariaUpdateAvail) color = RGB(200, 120, 0);
            else color = RGB(0, 160, 0);
            handled = true; break;
        case IDC_CORE_LABEL:
            if (s_instance->m_coreUpdateAvail) color = RGB(200, 120, 0);
            else color = RGB(0, 160, 0);
            handled = true; break;
        }
        if (handled) {
            SetTextColor(hdc, color);
            SetBkColor(hdc, GetSysColor(COLOR_BTNFACE));
            return (LRESULT)s_instance->m_bgBrush;
        }
        break;
    }
    case WM_TIMER:
        if (wParam == TIMER_REFRESH)
            s_instance->updateServiceStatus();
        return 0;
    case WM_COMMAND: {
        int id = LOWORD(wParam);
        switch (id) {
        case IDC_BTN_REFRESH:
            s_instance->refreshInstallStatus();
            s_instance->updateServiceStatus();
            break;
        case IDC_BTN_GIT:
        case IDC_BTN_NODE:
        case IDC_BTN_MARIA:
            s_instance->handlePackageAction(id);
            break;
        case IDC_BTN_CORE_UPDATE:
            s_instance->handleCoreUpdate();
            break;
        case IDC_BTN_FRONT_START:
            s_instance->doStartFrontend();
            break;
        case IDC_BTN_FRONT_STOP:
            s_instance->doStopFrontend();
            break;
        case IDC_BTN_FRONT_RESTART:
            s_instance->doRestartFrontend();
            break;
        case IDC_BTN_CORE_RESTART:
            if (MessageBoxW(hwnd, L"Backend를 재시작하시겠습니까?",
                            L"확인", MB_YESNO | MB_ICONQUESTION) == IDYES) {
                if (s_instance->m_restartCoreCallback)
                    s_instance->m_restartCoreCallback();
            }
            break;
        case IDC_BTN_BROWSER: {
            std::wstring url = L"http://localhost:" + std::to_wstring(g_packagedMode ? g_httpPort : 3000);
            int chromeResult = (int)(intptr_t)ShellExecuteW(NULL, L"open",
                L"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
                (L"--kiosk " + url).c_str(), NULL, SW_SHOWNORMAL);
            if (chromeResult <= 32) {
                ShellExecuteW(NULL, L"open", url.c_str(), NULL, NULL, SW_SHOWNORMAL);
            }
            break;
        }
        case IDC_CHK_AUTOSTART:
            s_instance->toggleAutoStart();
            break;
        case IDC_CHK_AUTO_RECONNECT: {
            HWND hChk = GetDlgItem(hwnd, IDC_CHK_AUTO_RECONNECT);
            bool enabled = (SendMessage(hChk, BM_GETCHECK, 0, 0) == BST_CHECKED);
            if (g_robotService) {
                g_robotService->setAutoReconnect(enabled);
                FLOG_INFO("ManagementDialog", std::string("Auto-reconnect ") + (enabled ? "ENABLED" : "DISABLED"));
                std::cout << "[ManagementDialog] Auto-reconnect " << (enabled ? "ENABLED" : "DISABLED") << std::endl;
            }
            break;
        }
        case IDC_BTN_CLOSE:
            s_instance->close();
            break;
        case IDC_BTN_EXIT:
            if (MessageBoxW(hwnd, L"Robot Core를 종료하시겠습니까?",
                            L"종료 확인", MB_YESNO | MB_ICONQUESTION) == IDYES) {
                if (s_instance->m_exitCallback)
                    s_instance->m_exitCallback();
            }
            break;
        }
        return 0;
    }
    case WM_CLOSE:
        s_instance->close();
        return 0;
    case WM_DESTROY:
        KillTimer(hwnd, TIMER_REFRESH);
        s_instance->m_hwnd = nullptr;
        return 0;
    }
    return DefWindowProc(hwnd, msg, wParam, lParam);
}
#endif
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#ifdef CPPHTTPLIB_OPENSSL_SUPPORT
#undef CPPHTTPLIB_OPENSSL_SUPPORT
#endif
#include "httplib.h"
#include <iostream>
#include <thread>
#include <chrono>
#include <fstream>
#include <filesystem>
class HttpServer::Impl {
public:
    httplib::Server server;
};
class HttpServer::EmergencyServerImpl {
public:
    httplib::Server server;
};
HttpServer::HttpServer(RobotService& robotService, DatabaseService* dbService)
    : m_robotService(robotService)
    , m_dbService(dbService)
    , m_impl(std::make_unique<Impl>())
    , m_emergencyImpl(std::make_unique<EmergencyServerImpl>()) {
}
HttpServer::~HttpServer() {
    stopEmergencyServer();
    stop();
}
bool HttpServer::start(int port) {
    if (m_running) {
        std::cerr << "[HttpServer] Already running" << std::endl;
        return false;
    }
    m_port = port;
    auto& server = m_impl->server;
    server.Options(".*", [](const httplib::Request&, httplib::Response& res) {
        res.set_header("Access-Control-Allow-Origin", "*");
        res.set_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-refresh-token");
        res.status = 204;
    });
    server.set_pre_routing_handler([](const httplib::Request& req, httplib::Response& res)
        -> httplib::Server::HandlerResponse {
        if (req.method == "OPTIONS") {
            return httplib::Server::HandlerResponse::Unhandled;
        }
        const std::string& path = req.path;
        if (path.find("/static/") == 0 ||
            path.find(".html") != std::string::npos ||
            path.find(".css") != std::string::npos ||
            path.find(".js") != std::string::npos ||
            path.find(".png") != std::string::npos ||
            path.find(".ico") != std::string::npos ||
            path.find(".svg") != std::string::npos ||
            path.find(".jpg") != std::string::npos ||
            path.find(".json") != std::string::npos ||
            path.find(".mp4") != std::string::npos ||
            path.find(".map") != std::string::npos ||
            path.find(".txt") != std::string::npos) {
            return httplib::Server::HandlerResponse::Unhandled;
        }
        if (path == "/auth/login" ||
            path == "/health" ||
            path == "/system/version") {
            return httplib::Server::HandlerResponse::Unhandled;
        }
        if (path.find("/updater/") == 0) {
            return httplib::Server::HandlerResponse::Unhandled;
        }
        if (path.find("/api/logs/download.zip") == 0) {
            return httplib::Server::HandlerResponse::Unhandled;
        }
        if (req.method == "GET" &&
            path.find("/api/") != 0 &&
            path.find("/robot_sdk/") != 0 &&
            path.find("/welding/") != 0 &&
            path.find("/welding-config") != 0 &&
            path.find("/teaching/") != 0 &&
            path.find("/auth/") != 0 &&
            path.find("/users") != 0 &&
            path.find("/system/") != 0 &&
            path.find("/debug-logs") != 0) {
            return httplib::Server::HandlerResponse::Unhandled;
        }
        std::string token;
        if (req.has_header("Authorization")) {
            std::string authHeader = req.get_header_value("Authorization");
            if (authHeader.find("Bearer ") == 0) {
                token = authHeader.substr(7);
            }
        }
        if (token.empty()) {
            res.set_header("Access-Control-Allow-Origin", "*");
            res.status = 401;
            res.set_content(
                "{\"status_code\":401,\"message\":\"Authentication required\"}",
                "application/json");
            return httplib::Server::HandlerResponse::Handled;
        }
        auto user = AuthService::instance().validateSession(token);
        if (user.is_null()) {
            res.set_header("Access-Control-Allow-Origin", "*");
            res.status = 401;
            res.set_content(
                "{\"status_code\":401,\"message\":\"Invalid or expired session\"}",
                "application/json");
            return httplib::Server::HandlerResponse::Handled;
        }
        return httplib::Server::HandlerResponse::Unhandled;
    });
    registerRobotRoutes(server, m_robotService, m_port);
    registerWeldingRoutes(server, m_robotService, m_dbService);
    registerWeldingBatchRoutes(server, m_robotService, m_dbService);
    registerTeachingRoutes(server, m_robotService, m_dbService);
    registerSdkRoutes(server, m_robotService, m_dbService);
    registerSystemRoutes(server, m_dbService);
    registerUpdaterRoutes(server, m_robotService);
    if (!m_webRoot.empty() && std::filesystem::exists(m_webRoot)) {
        std::cout << "[HttpServer] Setting up static file serving from: " << m_webRoot << std::endl;
        if (!server.set_mount_point("/", m_webRoot)) {
            std::cerr << "[HttpServer] Warning: Failed to mount web root" << std::endl;
        }
        server.Get(".*", [this](const httplib::Request& req, httplib::Response& res) {
            if (req.path.find("/robot") == 0 ||
                req.path.find("/welding") == 0 ||
                req.path.find("/teaching") == 0 ||
                req.path.find("/system") == 0 ||
                req.path.find("/health") == 0 ||
                req.path.find("/emergency") == 0) {
                res.status = 404;
                res.set_content("{\"error\":\"Not found\"}", "application/json");
                return;
            }
            std::string filePath = m_webRoot + req.path;
            if (std::filesystem::exists(filePath) && std::filesystem::is_regular_file(filePath)) {
                std::ifstream file(filePath, std::ios::binary);
                if (file) {
                    std::string content((std::istreambuf_iterator<char>(file)),
                                        std::istreambuf_iterator<char>());
                    std::string contentType = "application/octet-stream";
                    if (req.path.find(".html") != std::string::npos) contentType = "text/html";
                    else if (req.path.find(".css") != std::string::npos) contentType = "text/css";
                    else if (req.path.find(".js") != std::string::npos) contentType = "application/javascript";
                    else if (req.path.find(".json") != std::string::npos) contentType = "application/json";
                    else if (req.path.find(".png") != std::string::npos) contentType = "image/png";
                    else if (req.path.find(".jpg") != std::string::npos || req.path.find(".jpeg") != std::string::npos) contentType = "image/jpeg";
                    else if (req.path.find(".ico") != std::string::npos) contentType = "image/x-icon";
                    else if (req.path.find(".svg") != std::string::npos) contentType = "image/svg+xml";
                    else if (req.path.find(".mp4") != std::string::npos) contentType = "video/mp4";
                    res.set_content(content, contentType);
                    return;
                }
            }
            std::string indexPath = m_webRoot + "/index.html";
            if (std::filesystem::exists(indexPath)) {
                std::ifstream file(indexPath, std::ios::binary);
                if (file) {
                    std::string content((std::istreambuf_iterator<char>(file)),
                                        std::istreambuf_iterator<char>());
                    res.set_content(content, "text/html");
                    return;
                }
            }
            res.status = 404;
            res.set_content("<html><body><h1>404 Not Found</h1></body></html>", "text/html");
        });
        std::cout << "[HttpServer] Static file serving enabled (SPA mode)" << std::endl;
    }
    m_running = true;
    m_serverThread = std::thread([this]() {
        std::cout << "[HttpServer] Starting on port " << m_port << std::endl;
        if (!m_impl->server.listen("0.0.0.0", m_port)) {
            std::cerr << "[HttpServer] Failed to start server" << std::endl;
            m_running = false;
        }
    });
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    if (m_running) {
        std::cout << "[HttpServer] Server started on http://0.0.0.0:" << m_port << std::endl;
        startEmergencyServer();
    }
    return m_running;
}
void HttpServer::stop() {
    if (!m_running) return;
    std::cout << "[HttpServer] Stopping server..." << std::endl;
    m_running = false;
    if (m_impl) {
        m_impl->server.stop();
    }
    if (m_serverThread.joinable()) {
        m_serverThread.join();
    }
    std::cout << "[HttpServer] Server stopped" << std::endl;
}
void HttpServer::startEmergencyServer() {
    if (m_emergencyRunning) {
        std::cerr << "[EmergencyServer] Already running" << std::endl;
        return;
    }
    auto& emergencyServer = m_emergencyImpl->server;
    emergencyServer.Options(".*", [](const httplib::Request&, httplib::Response& res) {
        res.set_header("Access-Control-Allow-Origin", "*");
        res.set_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.status = 204;
    });
    emergencyServer.Post("/emergency_stop", [this](const httplib::Request&, httplib::Response& res) {
        res.set_header("Access-Control-Allow-Origin", "*");
        res.set_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization");
        std::cout << "[EmergencyServer] 🚨 EMERGENCY STOP RECEIVED!" << std::endl;
        if (m_dbService && m_dbService->isConnected()) {
            m_dbService->logDebug("EmergencyServer", "EMERGENCY_STOP_REQUEST", "Emergency stop button pressed");
        }
        int result = m_robotService.emergencyStop();
        if (m_dbService && m_dbService->isConnected()) {
            m_dbService->logDebug("EmergencyServer", "EMERGENCY_STOP_RESULT",
                "result=" + std::to_string(result) + (result == 0 ? " SUCCESS" : " FAILED"));
        }
        std::string response = "{\"status_code\":" + std::to_string(result == 0 ? 200 : 500) +
                               ",\"result\":" + std::to_string(result) +
                               ",\"message\":\"" + (result == 0 ? "Emergency stop executed" : "Emergency stop failed") + "\"}";
        res.set_content(response, "application/json");
    });
    emergencyServer.Get("/health", [](const httplib::Request&, httplib::Response& res) {
        res.set_header("Access-Control-Allow-Origin", "*");
        res.set_content("{\"status\":\"ok\",\"server\":\"emergency\"}", "application/json");
    });
    m_emergencyRunning = true;
    int emergencyPort = m_port + 1;
    if (m_port == 8080) {
        emergencyPort = 8001;
    }
    m_emergencyServerThread = std::thread([this, emergencyPort]() {
        std::cout << "[EmergencyServer] Starting on port " << emergencyPort << std::endl;
        if (!m_emergencyImpl->server.listen("0.0.0.0", emergencyPort)) {
            std::cerr << "[EmergencyServer] Failed to start server on port " << emergencyPort << std::endl;
            m_emergencyRunning = false;
        }
    });
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    if (m_emergencyRunning) {
        std::cout << "[EmergencyServer] Emergency server started on http://0.0.0.0:" << emergencyPort << std::endl;
    }
}
void HttpServer::stopEmergencyServer() {
    if (!m_emergencyRunning) return;
    std::cout << "[EmergencyServer] Stopping emergency server..." << std::endl;
    m_emergencyRunning = false;
    if (m_emergencyImpl) {
        m_emergencyImpl->server.stop();
    }
    if (m_emergencyServerThread.joinable()) {
        m_emergencyServerThread.join();
    }
    std::cout << "[EmergencyServer] Emergency server stopped" << std::endl;
}
void HttpServer::setWebRoot(const std::string& path) {
    if (std::filesystem::exists(path)) {
        m_webRoot = path;
        std::cout << "[HttpServer] Web root set to: " << m_webRoot << std::endl;
    } else {
        std::cerr << "[HttpServer] Warning: Web root path does not exist: " << path << std::endl;
        m_webRoot = "";
    }
}
#include "robot_core_all.h"
using json = nlohmann::json;
namespace HttpRouteHelpers {
void setCorsHeaders(httplib::Response& res) {
    res.set_header("Access-Control-Allow-Origin", "*");
    res.set_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    res.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-refresh-token");
    res.set_header("Access-Control-Max-Age", "86400");
}
std::string makeSuccessResponse(const std::string& data) {
    json response;
    response["success"] = true;
    response["code"] = 200;
    if (data != "null") {
        response["data"] = json::parse(data);
    } else {
        response["data"] = nullptr;
    }
    return response.dump();
}
std::string makeErrorResponse(int code, const std::string& message) {
    json response;
    response["success"] = false;
    response["code"] = code;
    response["message"] = message;
    response["data"] = nullptr;
    return response.dump();
}
nlohmann::json makeStatusResponse(int statusCode, const nlohmann::json& data) {
    json response;
    response["status_code"] = statusCode;
    if (!data.is_null()) {
        response["data"] = data;
    }
    return response;
}
}
#include "robot_core_all.h"
#include "robot_core_all.h"
#include <iostream>
using json = nlohmann::json;
void registerRobotRoutes(
    httplib::Server& server,
    RobotService& robotService,
    int& port
) {
    server.Options(R"(/api/.*)", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        res.status = 200;
    });
    server.Get("/api/status", [&robotService, &port](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json data;
        data["connected"] = robotService.isConnected();
        data["http_port"] = port;
        data["version"] = "1.0.0";
        res.set_content(HttpRouteHelpers::makeSuccessResponse(data.dump()), "application/json");
    });
    server.Get("/api/state", [&robotService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, "Robot not connected"), "application/json");
            return;
        }
        try {
            ROBOT_STATE_PKG state = robotService.getState();
            json data;
            data["joint_positions"] = {
                state.jt_cur_pos[0], state.jt_cur_pos[1], state.jt_cur_pos[2],
                state.jt_cur_pos[3], state.jt_cur_pos[4], state.jt_cur_pos[5]
            };
            data["tcp_position"] = {
                state.tl_cur_pos[0], state.tl_cur_pos[1], state.tl_cur_pos[2],
                state.tl_cur_pos[3], state.tl_cur_pos[4], state.tl_cur_pos[5]
            };
            data["flange_position"] = {
                state.flange_cur_pos[0], state.flange_cur_pos[1], state.flange_cur_pos[2],
                state.flange_cur_pos[3], state.flange_cur_pos[4], state.flange_cur_pos[5]
            };
            data["robot_state"] = state.robot_state;
            data["robot_mode"] = state.robot_mode;
            data["motion_done"] = state.motion_done;
            data["emergency_stop"] = state.EmergencyStop;
            data["enable_state"] = state.rbtEnableState;
            data["error_code"] = { state.main_code, state.sub_code };
            res.set_content(HttpRouteHelpers::makeSuccessResponse(data.dump()), "application/json");
        } catch (const std::exception& e) {
            res.set_content(HttpRouteHelpers::makeErrorResponse(500, e.what()), "application/json");
        }
    });
    server.Post("/api/connect", [&robotService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        std::string ip = "192.168.58.2";
        if (!req.body.empty()) {
            try {
                json body = json::parse(req.body);
                if (body.contains("ip")) {
                    ip = body["ip"].get<std::string>();
                }
            } catch (...) {
            }
        }
        int result = robotService.connect(ip);
        if (result == 0) {
            json data;
            data["connected"] = true;
            data["ip"] = ip;
            res.set_content(HttpRouteHelpers::makeSuccessResponse(data.dump()), "application/json");
        } else {
            res.set_content(HttpRouteHelpers::makeErrorResponse(500, "Connection failed: " + std::to_string(result)), "application/json");
        }
    });
    server.Post("/api/disconnect", [&robotService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        int result = robotService.disconnect();
        json data;
        data["disconnected"] = (result == 0);
        res.set_content(HttpRouteHelpers::makeSuccessResponse(data.dump()), "application/json");
    });
    server.Post("/api/enable", [&robotService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, "Robot not connected"), "application/json");
            return;
        }
        int result = robotService.enable();
        if (result == 0) {
            json data;
            data["enabled"] = true;
            res.set_content(HttpRouteHelpers::makeSuccessResponse(data.dump()), "application/json");
        } else {
            res.set_content(HttpRouteHelpers::makeErrorResponse(500, "Enable failed: " + std::to_string(result)), "application/json");
        }
    });
    server.Post("/api/disable", [&robotService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, "Robot not connected"), "application/json");
            return;
        }
        int result = robotService.disable();
        json data;
        data["disabled"] = (result == 0);
        res.set_content(HttpRouteHelpers::makeSuccessResponse(data.dump()), "application/json");
    });
    server.Post("/api/speed", [&robotService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, "Robot not connected"), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            float speed = body.value("speed", 10.0f);
            int result = robotService.setSpeed(speed);
            if (result == 0) {
                json data;
                data["speed"] = speed;
                res.set_content(HttpRouteHelpers::makeSuccessResponse(data.dump()), "application/json");
            } else {
                res.set_content(HttpRouteHelpers::makeErrorResponse(500, "SetSpeed failed: " + std::to_string(result)), "application/json");
            }
        } catch (const std::exception& e) {
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, e.what()), "application/json");
        }
    });
    server.Post("/api/stop", [&robotService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, "Robot not connected"), "application/json");
            return;
        }
        int result = robotService.stopMotion();
        if (result == 0) {
            json data;
            data["stopped"] = true;
            res.set_content(HttpRouteHelpers::makeSuccessResponse(data.dump()), "application/json");
        } else {
            res.set_content(HttpRouteHelpers::makeErrorResponse(500, "Stop failed: " + std::to_string(result)), "application/json");
        }
    });
    server.Post("/api/emergency-stop", [&robotService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        int result = robotService.emergencyStop();
        json data;
        data["emergency_stopped"] = (result == 0);
        res.set_content(HttpRouteHelpers::makeSuccessResponse(data.dump()), "application/json");
    });
    server.Get("/api/motion-done", [&robotService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, "Robot not connected"), "application/json");
            return;
        }
        int motionDone = 0;
        int result = robotService.getMotionDone(&motionDone);
        json data;
        data["motion_done"] = (motionDone == 1);
        data["result"] = result;
        res.set_content(HttpRouteHelpers::makeSuccessResponse(data.dump()), "application/json");
    });
    server.Post("/api/move/joint", [&robotService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, "Robot not connected"), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            auto jointsArr = body["joints"];
            double joints[6];
            for (int i = 0; i < 6; i++) {
                joints[i] = jointsArr[i].get<double>();
            }
            int tool = body.value("tool", 0);
            int user = body.value("user", 0);
            float vel = body.value("vel", 20.0f);
            float acc = body.value("acc", 100.0f);
            float ovl = body.value("ovl", 100.0f);
            float blendT = body.value("blendT", -1.0f);
            int result = robotService.moveJ(joints, tool, user, vel, acc, ovl, blendT);
            json data;
            data["result"] = result;
            data["success"] = (result == 0);
            res.set_content(HttpRouteHelpers::makeSuccessResponse(data.dump()), "application/json");
        } catch (const std::exception& e) {
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, e.what()), "application/json");
        }
    });
    server.Post("/api/move/linear", [&robotService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, "Robot not connected"), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            auto posArr = body["position"];
            double pos[6];
            for (int i = 0; i < 6; i++) {
                pos[i] = posArr[i].get<double>();
            }
            int tool = body.value("tool", 0);
            int user = body.value("user", 0);
            float vel = body.value("vel", 20.0f);
            float acc = body.value("acc", 100.0f);
            float ovl = body.value("ovl", 100.0f);
            float blendR = body.value("blendR", -1.0f);
            int result = robotService.moveL(pos, tool, user, vel, acc, ovl, blendR);
            json data;
            data["result"] = result;
            data["success"] = (result == 0);
            res.set_content(HttpRouteHelpers::makeSuccessResponse(data.dump()), "application/json");
        } catch (const std::exception& e) {
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, e.what()), "application/json");
        }
    });
}
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include <sstream>
#include <iomanip>
#include <thread>
#include <chrono>
using json = nlohmann::json;
void registerWeldingConfigRoutes(
    httplib::Server& server,
    RobotService& robotService,
    DatabaseService* dbService
);
void registerWeldingRoutes(
    httplib::Server& server,
    RobotService& robotService,
    DatabaseService* dbService
) {
    server.Post("/api/arc/start", [&robotService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            FLOG_WARN("WeldingRoute", "Arc start rejected - robot not connected");
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, "Robot not connected"), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            int ioType = body.value("io_type", 0);
            int arcNum = body.value("arc_num", 0);
            int timeout = body.value("timeout", 5000);
            FLOG_INFO("WeldingRoute", "Arc START request: ioType=" + std::to_string(ioType) + " arcNum=" + std::to_string(arcNum) + " timeout=" + std::to_string(timeout));
            int result = robotService.arcStart(ioType, arcNum, timeout);
            if (result != 0) {
                FLOG_SDK_ERROR("arcStart", result, "ioType=" + std::to_string(ioType) + " arcNum=" + std::to_string(arcNum));
            } else {
                FLOG_INFO("WeldingRoute", "Arc START success");
            }
            json data;
            data["result"] = result;
            data["success"] = (result == 0);
            res.set_content(HttpRouteHelpers::makeSuccessResponse(data.dump()), "application/json");
        } catch (const std::exception& e) {
            FLOG_ERROR("WeldingRoute", std::string("Arc start exception: ") + e.what());
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, e.what()), "application/json");
        }
    });
    server.Post("/api/arc/end", [&robotService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            FLOG_WARN("WeldingRoute", "Arc end rejected - robot not connected");
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, "Robot not connected"), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            int ioType = body.value("io_type", 0);
            int arcNum = body.value("arc_num", 0);
            int timeout = body.value("timeout", 5000);
            FLOG_INFO("WeldingRoute", "Arc END request: ioType=" + std::to_string(ioType) + " arcNum=" + std::to_string(arcNum) + " timeout=" + std::to_string(timeout));
            int result = robotService.arcEnd(ioType, arcNum, timeout);
            if (result != 0) {
                FLOG_SDK_ERROR("arcEnd", result, "ioType=" + std::to_string(ioType) + " arcNum=" + std::to_string(arcNum));
            } else {
                FLOG_INFO("WeldingRoute", "Arc END success");
            }
            json data;
            data["result"] = result;
            data["success"] = (result == 0);
            res.set_content(HttpRouteHelpers::makeSuccessResponse(data.dump()), "application/json");
        } catch (const std::exception& e) {
            FLOG_ERROR("WeldingRoute", std::string("Arc end exception: ") + e.what());
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, e.what()), "application/json");
        }
    });
    server.Post("/api/welding/current", [&robotService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, "Robot not connected"), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            int ioType = body.value("io_type", 0);
            float current = body.value("current", 200.0f);
            int aoIndex = body.value("ao_index", 0);
            int blend = body.value("blend", 0);
            FLOG_INFO("WeldingRoute", "Set current: " + std::to_string(current) + "A ioType=" + std::to_string(ioType) + " aoIndex=" + std::to_string(aoIndex));
            int result = robotService.setWeldingCurrent(ioType, current, aoIndex, blend);
            if (result != 0) {
                FLOG_SDK_ERROR("setWeldingCurrent", result, "current=" + std::to_string(current));
            }
            json data;
            data["result"] = result;
            data["current"] = current;
            res.set_content(HttpRouteHelpers::makeSuccessResponse(data.dump()), "application/json");
        } catch (const std::exception& e) {
            FLOG_ERROR("WeldingRoute", std::string("Set current exception: ") + e.what());
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, e.what()), "application/json");
        }
    });
    server.Post("/api/welding/voltage", [&robotService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            FLOG_WARN("WeldingRoute", "Set voltage rejected - robot not connected");
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, "Robot not connected"), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            int ioType = body.value("io_type", 0);
            float voltage = body.value("voltage", 24.0f);
            int aoIndex = body.value("ao_index", 1);
            int blend = body.value("blend", 0);
            FLOG_INFO("WeldingRoute", "Set voltage: " + std::to_string(voltage) + "V ioType=" + std::to_string(ioType) + " aoIndex=" + std::to_string(aoIndex));
            int result = robotService.setWeldingVoltage(ioType, voltage, aoIndex, blend);
            if (result != 0) {
                FLOG_SDK_ERROR("setWeldingVoltage", result, "voltage=" + std::to_string(voltage));
            }
            json data;
            data["result"] = result;
            data["voltage"] = voltage;
            res.set_content(HttpRouteHelpers::makeSuccessResponse(data.dump()), "application/json");
        } catch (const std::exception& e) {
            FLOG_ERROR("WeldingRoute", std::string("Set voltage exception: ") + e.what());
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, e.what()), "application/json");
        }
    });
    server.Post("/api/weave/params", [&robotService, dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, "Robot not connected"), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            int weaveNum = body.value("weave_num", 0);
            int weaveType = body.value("weave_type", 0);
            float freq = body.value("frequency", 1.0f);
            float range = body.value("range_val", 5.0f);
            float leftRange = body.value("left_range", 5.0f);
            float rightRange = body.value("right_range", 5.0f);
            float leftStayTime = body.value("left_stay_time", 0.0f);
            float rightStayTime = body.value("right_stay_time", 0.0f);
            if (dbService && dbService->isConnected()) {
                std::ostringstream details;
                details << std::fixed << std::setprecision(3)
                        << "weaveNum=" << weaveNum << " type=" << weaveType
                        << " freq=" << freq << " range=" << range
                        << " leftRange=" << leftRange << " rightRange=" << rightRange
                        << " leftStay=" << leftStayTime << " rightStay=" << rightStayTime;
                dbService->logDebug("WeaveSetPara", "CALL_START", details.str());
            }
            FLOG_DEBUG("WeldingRoute", "Weave params: num=" + std::to_string(weaveNum) + " type=" + std::to_string(weaveType) + " freq=" + std::to_string(freq) + " range=" + std::to_string(range));
            int result = robotService.setWeaveParams(
                weaveNum, weaveType, freq, range,
                leftRange, rightRange, leftStayTime, rightStayTime,
                0.0f, 0.0f, 0.0f);
            if (dbService && dbService->isConnected()) {
                dbService->logDebug("WeaveSetPara", "CALL_END", "result=" + std::to_string(result));
            }
            if (result != 0) {
                FLOG_SDK_ERROR("setWeaveParams", result, "weaveNum=" + std::to_string(weaveNum));
            }
            json data;
            data["result"] = result;
            res.set_content(HttpRouteHelpers::makeSuccessResponse(data.dump()), "application/json");
        } catch (const std::exception& e) {
            FLOG_ERROR("WeldingRoute", std::string("Weave params exception: ") + e.what());
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, e.what()), "application/json");
        }
    });
    server.Post("/api/weave/start", [&robotService, dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, "Robot not connected"), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            int weaveNum = body.value("weave_num", 0);
            if (dbService && dbService->isConnected()) {
                dbService->logDebug("WeaveStart", "CALL_START", "weaveNum=" + std::to_string(weaveNum));
            }
            FLOG_INFO("WeldingRoute", "Weave START: weaveNum=" + std::to_string(weaveNum));
            int result = robotService.weaveStart(weaveNum);
            if (dbService && dbService->isConnected()) {
                dbService->logDebug("WeaveStart", "CALL_END", "weaveNum=" + std::to_string(weaveNum) + " result=" + std::to_string(result));
            }
            if (result != 0) {
                FLOG_SDK_ERROR("weaveStart", result, "weaveNum=" + std::to_string(weaveNum));
            } else {
                FLOG_INFO("WeldingRoute", "Weave START success: weaveNum=" + std::to_string(weaveNum));
            }
            json data;
            data["result"] = result;
            data["success"] = (result == 0);
            res.set_content(HttpRouteHelpers::makeSuccessResponse(data.dump()), "application/json");
        } catch (const std::exception& e) {
            FLOG_ERROR("WeldingRoute", std::string("Weave start exception: ") + e.what());
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, e.what()), "application/json");
        }
    });
    server.Post("/api/weave/end", [&robotService, dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            FLOG_WARN("WeldingRoute", "Weave end rejected - robot not connected");
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, "Robot not connected"), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            int weaveNum = body.value("weave_num", 0);
            if (dbService && dbService->isConnected()) {
                dbService->logDebug("WeaveEnd", "CALL_START", "weaveNum=" + std::to_string(weaveNum));
            }
            FLOG_INFO("WeldingRoute", "Weave END: weaveNum=" + std::to_string(weaveNum));
            int result = robotService.weaveEnd(weaveNum);
            if (dbService && dbService->isConnected()) {
                dbService->logDebug("WeaveEnd", "CALL_END", "weaveNum=" + std::to_string(weaveNum) + " result=" + std::to_string(result));
            }
            if (result != 0) {
                FLOG_SDK_ERROR("weaveEnd", result, "weaveNum=" + std::to_string(weaveNum));
            } else {
                FLOG_INFO("WeldingRoute", "Weave END success: weaveNum=" + std::to_string(weaveNum));
            }
            json data;
            data["result"] = result;
            data["success"] = (result == 0);
            res.set_content(HttpRouteHelpers::makeSuccessResponse(data.dump()), "application/json");
        } catch (const std::exception& e) {
            FLOG_ERROR("WeldingRoute", std::string("Weave end exception: ") + e.what());
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, e.what()), "application/json");
        }
    });
    server.Post("/api/welding/emergency-shutdown", [&robotService, dbService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        FLOG_FATAL("WeldingRoute", "=== EMERGENCY SHUTDOWN REQUESTED ===");
        requestBatchStop();
        if (!robotService.isConnected()) {
            FLOG_ERROR("WeldingRoute", "Emergency shutdown failed - robot not connected");
            res.set_content(HttpRouteHelpers::makeErrorResponse(400, "Robot not connected"), "application/json");
            return;
        }
        if (dbService && dbService->isConnected()) {
            dbService->logDebug("EmergencyShutdown", "START", "Welding emergency shutdown initiated");
        }
        json results;
        results["steps"] = json::array();
        try {
            int r = robotService.arcEnd(0, 0, 1000);
            FLOG_INFO("WeldingRoute", "Emergency step 1/4 Arc OFF: result=" + std::to_string(r));
            results["steps"].push_back({{"step", "arc_off"}, {"result", r}});
        } catch (...) {
            FLOG_ERROR("WeldingRoute", "Emergency step 1/4 Arc OFF: EXCEPTION");
            results["steps"].push_back({{"step", "arc_off"}, {"result", -1}, {"error", "exception"}});
        }
        try {
            int r = robotService.weaveEnd(0);
            FLOG_INFO("WeldingRoute", "Emergency step 2/4 Weave OFF: result=" + std::to_string(r));
            results["steps"].push_back({{"step", "weave_off"}, {"result", r}});
        } catch (...) {
            FLOG_ERROR("WeldingRoute", "Emergency step 2/4 Weave OFF: EXCEPTION");
            results["steps"].push_back({{"step", "weave_off"}, {"result", -1}, {"error", "exception"}});
        }
        try {
            int r = robotService.setAspirated(0, 0);
            FLOG_INFO("WeldingRoute", "Emergency step 3/4 Gas OFF: result=" + std::to_string(r));
            results["steps"].push_back({{"step", "gas_off"}, {"result", r}});
        } catch (...) {
            FLOG_ERROR("WeldingRoute", "Emergency step 3/4 Gas OFF: EXCEPTION");
            results["steps"].push_back({{"step", "gas_off"}, {"result", -1}, {"error", "exception"}});
        }
        try {
            int r = robotService.stopMotion();
            FLOG_INFO("WeldingRoute", "Emergency step 4/4 StopMotion: result=" + std::to_string(r));
            results["steps"].push_back({{"step", "stop_motion"}, {"result", r}});
        } catch (...) {
            FLOG_ERROR("WeldingRoute", "Emergency step 4/4 StopMotion: EXCEPTION");
            results["steps"].push_back({{"step", "stop_motion"}, {"result", -1}, {"error", "exception"}});
        }
        if (dbService && dbService->isConnected()) {
            dbService->logDebug("EmergencyShutdown", "COMPLETE", results.dump());
        }
        FLOG_FATAL("WeldingRoute", "=== EMERGENCY SHUTDOWN COMPLETE ===");
        results["success"] = true;
        res.set_content(HttpRouteHelpers::makeSuccessResponse(results.dump()), "application/json");
    });
    registerWeldingConfigRoutes(server, robotService, dbService);
}
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include <sstream>
#include <iomanip>
#include <thread>
#include <chrono>
using json = nlohmann::json;
void registerWeldingConfigRoutes(
    httplib::Server& server,
    RobotService& robotService,
    DatabaseService* dbService
) {
    server.Options(R"(/welding.*)", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        res.status = 200;
    });
    server.Options("/welding-config", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        res.status = 200;
    });
    server.Post("/welding/weave/set-para", [&robotService, dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            int weaveNum = body.value("weave_num", 0);
            int weaveType = body.value("weave_type", 0);
            float freq = body.contains("weave_frequency") ? body["weave_frequency"].get<float>() : body.value("frequency", 1.0f);
            float rangeVal = body.contains("weave_range") ? body["weave_range"].get<float>() : body.value("range_val", 5.0f);
            float leftRange = body.contains("weave_left_range") ? body["weave_left_range"].get<float>() : body.value("left_range", 5.0f);
            float rightRange = body.contains("weave_right_range") ? body["weave_right_range"].get<float>() : body.value("right_range", 5.0f);
            float leftStayTime = body.contains("weave_left_stay_time") ? body["weave_left_stay_time"].get<float>() : body.value("left_stay_time", 0.0f);
            float rightStayTime = body.contains("weave_right_stay_time") ? body["weave_right_stay_time"].get<float>() : body.value("right_stay_time", 0.0f);
            float circleRadio = body.contains("weave_circle_radio") ? body["weave_circle_radio"].get<float>() : body.value("circle_radio", 0.0f);
            float yawAngle = body.contains("weave_yaw_angle") ? body["weave_yaw_angle"].get<float>() : body.value("yaw_angle", 0.0f);
            float rotAngle = body.contains("weave_rot_angle") ? body["weave_rot_angle"].get<float>() : body.value("rot_angle", 0.0f);
            std::cout << "[WeaveSetPara] num=" << weaveNum << " type=" << weaveType
                      << " freq=" << freq << " range=" << rangeVal
                      << " L=" << leftRange << " R=" << rightRange
                      << " leftStay=" << leftStayTime << " rightStay=" << rightStayTime
                      << " circle=" << circleRadio << " yaw=" << yawAngle << " rot=" << rotAngle << std::endl;
            if (dbService && dbService->isConnected()) {
                std::ostringstream details;
                details << std::fixed << std::setprecision(3)
                        << "weaveNum=" << weaveNum << " type=" << weaveType
                        << " freq=" << freq << " range=" << rangeVal
                        << " leftRange=" << leftRange << " rightRange=" << rightRange
                        << " leftStay=" << leftStayTime << " rightStay=" << rightStayTime
                        << " circle=" << circleRadio << " yaw=" << yawAngle << " rot=" << rotAngle;
                dbService->logDebug("WeaveSetPara", "CALL_START", details.str());
            }
            FLOG_DEBUG("WeldingConfig", "WeaveSetPara: num=" + std::to_string(weaveNum) + " type=" + std::to_string(weaveType) + " freq=" + std::to_string(freq));
            int result = robotService.setWeaveParams(
                weaveNum, weaveType, freq, rangeVal,
                leftRange, rightRange, leftStayTime, rightStayTime,
                circleRadio, yawAngle, rotAngle);
            if (dbService && dbService->isConnected()) {
                dbService->logDebug("WeaveSetPara", "CALL_END", "result=" + std::to_string(result));
            }
            if (result != 0) {
                FLOG_SDK_ERROR("setWeaveParams", result, "weaveNum=" + std::to_string(weaveNum) + " type=" + std::to_string(weaveType));
            }
            res.set_content(HttpRouteHelpers::makeStatusResponse(
                (result == 0) ? 200 : 500,
                {{"result", result}}
            ).dump(), "application/json");
        } catch (const std::exception& e) {
            FLOG_ERROR("WeldingConfig", std::string("WeaveSetPara exception: ") + e.what());
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", e.what()}}).dump(), "application/json");
        }
    });
    server.Post("/welding/weave/start", [&robotService, dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            FLOG_WARN("WeldingConfig", "Weave start rejected - robot not connected");
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            int weaveNum = body.value("weave_num", 0);
            if (dbService && dbService->isConnected()) {
                dbService->logDebug("WeaveStart", "CALL_START", "weaveNum=" + std::to_string(weaveNum));
            }
            FLOG_INFO("WeldingConfig", "Weave START: weaveNum=" + std::to_string(weaveNum));
            int result = robotService.weaveStart(weaveNum);
            if (dbService && dbService->isConnected()) {
                dbService->logDebug("WeaveStart", "CALL_END", "weaveNum=" + std::to_string(weaveNum) + " result=" + std::to_string(result));
            }
            if (result != 0) {
                FLOG_SDK_ERROR("weaveStart", result, "weaveNum=" + std::to_string(weaveNum));
            }
            res.set_content(HttpRouteHelpers::makeStatusResponse(
                (result == 0) ? 200 : 500,
                {{"result", result}}
            ).dump(), "application/json");
        } catch (const std::exception& e) {
            FLOG_ERROR("WeldingConfig", std::string("Weave start exception: ") + e.what());
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", e.what()}}).dump(), "application/json");
        }
    });
    server.Post("/welding/weave/end", [&robotService, dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            FLOG_WARN("WeldingConfig", "Weave end rejected - robot not connected");
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            int weaveNum = body.value("weave_num", 0);
            if (dbService && dbService->isConnected()) {
                dbService->logDebug("WeaveEnd", "CALL_START", "weaveNum=" + std::to_string(weaveNum));
            }
            FLOG_INFO("WeldingConfig", "Weave END: weaveNum=" + std::to_string(weaveNum));
            int result = robotService.weaveEnd(weaveNum);
            if (dbService && dbService->isConnected()) {
                dbService->logDebug("WeaveEnd", "CALL_END", "weaveNum=" + std::to_string(weaveNum) + " result=" + std::to_string(result));
            }
            if (result != 0) {
                FLOG_SDK_ERROR("weaveEnd", result, "weaveNum=" + std::to_string(weaveNum));
            }
            res.set_content(HttpRouteHelpers::makeStatusResponse(
                (result == 0) ? 200 : 500,
                {{"result", result}}
            ).dump(), "application/json");
        } catch (const std::exception& e) {
            FLOG_ERROR("WeldingConfig", std::string("Weave end exception: ") + e.what());
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", e.what()}}).dump(), "application/json");
        }
    });
    server.Post("/welding/arc/on", [&robotService, dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            FLOG_WARN("WeldingConfig", "Arc ON sequence rejected - robot not connected");
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            int ioType = body.value("io_type", 0);
            int arcNum = body.value("arc_num", 0);
            int timeout = body.value("timeout", 10000);
            float current = body.value("current", 0.0f);
            float voltage = body.value("voltage", 0.0f);
            int gasPreFlowMs = body.value("gas_pre_flow_ms", 500);
            FLOG_INFO("WeldingConfig", "Arc ON sequence: current=" + std::to_string(current) + "A voltage=" + std::to_string(voltage) + "V gasPreFlow=" + std::to_string(gasPreFlowMs) + "ms");
            if (dbService && dbService->isConnected()) {
                std::ostringstream oss;
                oss << "ioType=" << ioType << " arcNum=" << arcNum
                    << " timeout=" << timeout
                    << " current=" << std::fixed << std::setprecision(1) << current << "A"
                    << " voltage=" << voltage << "V"
                    << " gasPreFlow=" << gasPreFlowMs << "ms";
                dbService->logDebug("ArcOn", "SEQUENCE_START", oss.str());
            }
            int resultCurrent = 0;
            if (current > 0) {
                resultCurrent = robotService.setWeldingCurrent(ioType, current, 1, 0);
                FLOG_INFO("WeldingConfig", "SetCurrent: " + std::to_string(current) + "A ao_index=1 result=" + std::to_string(resultCurrent));
                if (resultCurrent != 0) {
                    FLOG_SDK_ERROR("setWeldingCurrent", resultCurrent, "current=" + std::to_string(current));
                }
            }
            int resultVoltage = 0;
            if (voltage > 0) {
                resultVoltage = robotService.setWeldingVoltage(ioType, voltage, 0, 0);
                FLOG_INFO("WeldingConfig", "SetVoltage: " + std::to_string(voltage) + "V ao_index=0 result=" + std::to_string(resultVoltage));
                if (resultVoltage != 0) {
                    FLOG_SDK_ERROR("setWeldingVoltage", resultVoltage, "voltage=" + std::to_string(voltage));
                }
            }
            int resultGas = robotService.setAspirated(ioType, 1);
            if (dbService && dbService->isConnected()) {
                dbService->logDebug("ArcOn", "GAS_ON", "result=" + std::to_string(resultGas));
            }
            if (resultGas != 0) {
                std::cout << "[ArcOn] WARNING: SetAspirated(ON) failed: " << resultGas << std::endl;
            }
            if (gasPreFlowMs > 0) {
                std::this_thread::sleep_for(std::chrono::milliseconds(gasPreFlowMs));
            }
            int resultArc = robotService.arcStart(ioType, arcNum, timeout);
            if (dbService && dbService->isConnected()) {
                dbService->logDebug("ArcOn", "ARC_START", "result=" + std::to_string(resultArc));
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(500));
            if (resultArc != 0) {
                FLOG_SDK_ERROR("arcStart", resultArc, "Arc ON sequence arc start failed");
            } else {
                FLOG_INFO("WeldingConfig", "Arc ON sequence completed successfully");
            }
            if (dbService && dbService->isConnected()) {
                std::ostringstream oss;
                oss << "current=" << resultCurrent << " voltage=" << resultVoltage
                    << " gas=" << resultGas << " arc=" << resultArc;
                dbService->logDebug("ArcOn", "SEQUENCE_END", oss.str());
            }
            res.set_content(HttpRouteHelpers::makeStatusResponse(
                (resultArc == 0) ? 200 : 500,
                {{"result", resultArc},
                 {"current_result", resultCurrent},
                 {"voltage_result", resultVoltage},
                 {"gas_result", resultGas}}
            ).dump(), "application/json");
        } catch (const std::exception& e) {
            FLOG_ERROR("WeldingConfig", std::string("Arc ON sequence exception: ") + e.what());
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", e.what()}}).dump(), "application/json");
        }
    });
    server.Post("/welding/arc/off", [&robotService, dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            FLOG_WARN("WeldingConfig", "Arc OFF sequence rejected - robot not connected");
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            int ioType = body.value("io_type", 0);
            int arcNum = body.value("arc_num", 0);
            int timeout = body.value("timeout", 1000);
            int gasPostFlowMs = body.value("gas_post_flow_ms", 500);
            FLOG_INFO("WeldingConfig", "Arc OFF sequence: ioType=" + std::to_string(ioType) + " arcNum=" + std::to_string(arcNum) + " gasPostFlow=" + std::to_string(gasPostFlowMs) + "ms");
            if (dbService && dbService->isConnected()) {
                std::ostringstream oss;
                oss << "ioType=" << ioType << " arcNum=" << arcNum
                    << " timeout=" << timeout << " gasPostFlow=" << gasPostFlowMs << "ms";
                dbService->logDebug("ArcOff", "SEQUENCE_START", oss.str());
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(500));
            int resultArc = robotService.arcEnd(ioType, arcNum, timeout);
            if (dbService && dbService->isConnected()) {
                dbService->logDebug("ArcOff", "ARC_END", "result=" + std::to_string(resultArc));
            }
            if (gasPostFlowMs > 0) {
                std::this_thread::sleep_for(std::chrono::milliseconds(gasPostFlowMs));
            }
            int resultGas = robotService.setAspirated(ioType, 0);
            if (dbService && dbService->isConnected()) {
                dbService->logDebug("ArcOff", "GAS_OFF", "result=" + std::to_string(resultGas));
            }
            if (resultGas != 0) {
                std::cout << "[ArcOff] WARNING: SetAspirated(OFF) failed: " << resultGas << std::endl;
            }
            if (resultArc != 0) {
                FLOG_SDK_ERROR("arcEnd", resultArc, "Arc OFF sequence arc end failed");
            } else {
                FLOG_INFO("WeldingConfig", "Arc OFF sequence completed successfully");
            }
            if (dbService && dbService->isConnected()) {
                dbService->logDebug("ArcOff", "SEQUENCE_END", "arc=" + std::to_string(resultArc) + " gas=" + std::to_string(resultGas));
            }
            res.set_content(HttpRouteHelpers::makeStatusResponse(
                (resultArc == 0) ? 200 : 500,
                {{"result", resultArc},
                 {"gas_result", resultGas}}
            ).dump(), "application/json");
        } catch (const std::exception& e) {
            FLOG_ERROR("WeldingConfig", std::string("Arc OFF sequence exception: ") + e.what());
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", e.what()}}).dump(), "application/json");
        }
    });
    server.Post("/welding/arc-trace/control", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        res.set_content(HttpRouteHelpers::makeStatusResponse(200, {
            {"result", 0},
            {"message", "Arc trace control acknowledged (stub)"}
        }).dump(), "application/json");
    });
    server.Post("/welding/gas/start", [&robotService, dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        try {
            int ioType = 0;
            if (!req.body.empty()) {
                json body = json::parse(req.body);
                ioType = body.value("io_type", 0);
            }
            int result = robotService.setAspirated(ioType, 1);
            FLOG_INFO("WeldingConfig", "Gas start: ioType=" + std::to_string(ioType) + " result=" + std::to_string(result));
            if (dbService && dbService->isConnected()) {
                dbService->logDebug("Gas", "START", "ioType=" + std::to_string(ioType) + " result=" + std::to_string(result));
            }
            res.set_content(HttpRouteHelpers::makeStatusResponse(
                (result == 0) ? 200 : 500,
                {{"result", result}, {"message", result == 0 ? "Gas ON" : "Gas ON failed"}}
            ).dump(), "application/json");
        } catch (const std::exception& e) {
            FLOG_ERROR("WeldingConfig", std::string("Gas start exception: ") + e.what());
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", e.what()}}).dump(), "application/json");
        }
    });
    server.Post("/welding/gas/stop", [&robotService, dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        try {
            int ioType = 0;
            if (!req.body.empty()) {
                json body = json::parse(req.body);
                ioType = body.value("io_type", 0);
            }
            int result = robotService.setAspirated(ioType, 0);
            FLOG_INFO("WeldingConfig", "Gas stop: ioType=" + std::to_string(ioType) + " result=" + std::to_string(result));
            if (dbService && dbService->isConnected()) {
                dbService->logDebug("Gas", "STOP", "ioType=" + std::to_string(ioType) + " result=" + std::to_string(result));
            }
            res.set_content(HttpRouteHelpers::makeStatusResponse(
                (result == 0) ? 200 : 500,
                {{"result", result}, {"message", result == 0 ? "Gas OFF" : "Gas OFF failed"}}
            ).dump(), "application/json");
        } catch (const std::exception& e) {
            FLOG_ERROR("WeldingConfig", std::string("Gas stop exception: ") + e.what());
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", e.what()}}).dump(), "application/json");
        }
    });
    server.Get("/welding-config", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json config;
        config["touchSensingEnabled"] = true;
        config["arcTrackingEnabled"] = false;
        config["gasPreFlowTime"] = 500;
        config["gasPostFlowTime"] = 2000;
        config["defaultCurrent"] = 220;
        config["defaultVoltage"] = 24;
        res.set_content(HttpRouteHelpers::makeStatusResponse(200, config).dump(), "application/json");
    });
    server.Put("/welding-config", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        res.set_content(HttpRouteHelpers::makeStatusResponse(200, {
            {"result", 0},
            {"message", "Configuration updated (stub)"}
        }).dump(), "application/json");
    });
    server.Get("/welding-config/part-order", [dbService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!dbService || !dbService->isConnected()) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(500, {{"message", "DB not connected"}}).dump(), "application/json");
            return;
        }
        json order = dbService->getWeldingPartOrder();
        res.set_content(HttpRouteHelpers::makeStatusResponse(200, {{"order", order}}).dump(), "application/json");
    });
    server.Put("/welding-config/part-order", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!dbService || !dbService->isConnected()) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(500, {{"message", "DB not connected"}}).dump(), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            json orderArray = body.value("order", json::array());
            bool ok = dbService->updateWeldingPartOrder(orderArray);
            res.set_content(HttpRouteHelpers::makeStatusResponse(ok ? 200 : 500, {{"result", ok ? 0 : -1}}).dump(), "application/json");
        } catch (const std::exception& e) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", e.what()}}).dump(), "application/json");
        }
    });
    server.Options("/welding-config/part-order", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res); res.status = 200;
    });
}
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include <atomic>
#include <sstream>
#include <cmath>
#include <vector>
using json = nlohmann::json;
static std::atomic<bool> g_batchStopFlag{false};
void requestBatchStop() {
    g_batchStopFlag = true;
}
void resetBatchStop() {
    g_batchStopFlag = false;
}
bool isBatchStopped() {
    return g_batchStopFlag.load();
}
void registerWeldingBatchRoutes(
    httplib::Server& server,
    RobotService& robotService,
    DatabaseService* dbService
) {
    server.Options("/welding/batch-move", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        res.status = 200;
    });
    server.Post("/welding/batch-move", [&robotService, dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            auto points = body["points"];
            int total = static_cast<int>(points.size());
            FLOG_INFO("WeldBatch", "Batch MoveL start: " + std::to_string(total) + " points");
            robotService.setSpeed(60);
            FLOG_INFO("WeldBatch", "SetSpeed(60) - global override");
            g_batchStopFlag = false;
            auto& lastPt = points[total - 1];
            auto& firstPt = points[0];
            double tcp[6] = {0};
            for (int k = 0; k < 6; k++) tcp[k] = lastPt["tcp"][k].get<double>();
            double joints[6] = {0};
            bool hasJoints = lastPt.contains("joints") && lastPt["joints"].is_array() && lastPt["joints"].size() == 6;
            if (hasJoints) {
                for (int k = 0; k < 6; k++) joints[k] = lastPt["joints"][k].get<double>();
                double fk[6] = {0};
                if (robotService.getForwardKin(joints, fk) == 0) {
                    for (int k = 0; k < 6; k++) tcp[k] = fk[k];
                }
            }
            float speedRaw = firstPt.value("speed", 15.0f);
            int velModeIn = firstPt.value("vel_mode", 1);
            float speed = (velModeIn == 1) ? speedRaw * 1.13f / 72.0f : speedRaw;
            int velMode = 0;
            int tool = firstPt.value("tool", 3);
            int user = firstPt.value("user", 0);
            bool perPoint = body.value("per_point", false);
            if (perPoint) {
                float blendRMid = body.value("blend_r", 10.0f);
                const int OVERSPEED_ADAPTIVE = 3;
                int overSpeedPct = body.value("over_speed_pct", 10);
                const float accPP = 100.0f, ovlPP = 100.0f, oaccPP = 100.0f;
                FLOG_INFO("WeldBatch", "[per_point] queue preload: " + std::to_string(total) +
                    " points, blendR=" + std::to_string(blendRMid) + "mm");
                std::vector<int> results;
                int completed = 0;
                bool stopped = false;
                for (int idx = 0; idx < total; idx++) {
                    if (g_batchStopFlag) { stopped = true; break; }
                    auto& pt = points[idx];
                    double ptTcp[6] = {0};
                    for (int k = 0; k < 6; k++) ptTcp[k] = pt["tcp"][k].get<double>();
                    bool ptHasJoints = pt.contains("joints") && pt["joints"].is_array() && pt["joints"].size() == 6;
                    double ptJoints[6] = {0};
                    if (ptHasJoints) for (int k = 0; k < 6; k++) ptJoints[k] = pt["joints"][k].get<double>();
                    int ptOffsetFlag = pt.value("offset_flag", 0);
                    double ptOffset[6] = {0};
                    if (ptOffsetFlag > 0 && pt.contains("offset") && pt["offset"].is_array()) {
                        for (int k = 0; k < 6 && k < (int)pt["offset"].size(); k++)
                            ptOffset[k] = pt["offset"][k].get<double>();
                    }
                    float blendR = (idx == total - 1) ? -1.0f : blendRMid;
                    int ret;
                    if (ptHasJoints) {
                        ret = robotService.moveLWithJoints(ptJoints, ptTcp, tool, user, speed,
                            accPP, ovlPP, blendR, 0, static_cast<uint8_t>(ptOffsetFlag), ptOffset, velMode, oaccPP,
                            OVERSPEED_ADAPTIVE, overSpeedPct);
                    } else {
                        ret = robotService.moveL(ptTcp, tool, user, speed,
                            accPP, ovlPP, blendR, 0, static_cast<uint8_t>(ptOffsetFlag), ptOffset, velMode,
                            OVERSPEED_ADAPTIVE, overSpeedPct);
                    }
                    results.push_back(ret);
                    FLOG_INFO("WeldBatch", "[per_point] move " + std::to_string(idx + 1) + "/" +
                        std::to_string(total) + " blendR=" + std::to_string(blendR) + " ret=" + std::to_string(ret));
                    if (ret == 0) {
                        completed++;
                    } else {
                        FLOG_ERROR("WeldBatch", "[per_point] MoveL FAILED at idx " +
                            std::to_string(idx) + " ret=" + std::to_string(ret) + " → stop");
                        stopped = true;
                        break;
                    }
                }
                FLOG_INFO("WeldBatch", "[per_point] complete: " + std::to_string(completed) +
                    "/" + std::to_string(total) + (stopped ? " (stopped)" : ""));
                json resultData;
                resultData["completed"] = completed;
                resultData["total"] = total;
                resultData["stopped"] = stopped;
                resultData["results"] = results;
                res.set_content(HttpRouteHelpers::makeStatusResponse(
                    stopped ? 499 : 200, resultData).dump(), "application/json");
                return;
            }
            int offsetFlag = 0;
            double offset[6] = {0};
            int offsetCount = 0;
            double avgOffset[6] = {0};
            for (int i = 0; i < total; i++) {
                auto& pt = points[i];
                int ptOffsetFlag = pt.value("offset_flag", 0);
                if (ptOffsetFlag > 0 && pt.contains("offset") && pt["offset"].is_array()) {
                    for (int k = 0; k < 6 && k < (int)pt["offset"].size(); k++) {
                        avgOffset[k] += pt["offset"][k].get<double>();
                    }
                    offsetCount++;
                }
            }
            if (offsetCount > 0) {
                offsetFlag = 1;
                for (int k = 0; k < 6; k++) offset[k] = avgOffset[k] / offsetCount;
                FLOG_INFO("WeldBatch", "Interpolated offset from " + std::to_string(offsetCount) +
                    " points: [" + std::to_string(offset[0]) + "," + std::to_string(offset[1]) + "," + std::to_string(offset[2]) + "]");
            }
            if (total > 1) {
                FLOG_INFO("WeldBatch", "Skipping " + std::to_string(total - 1) +
                    " waypoint(s), single MoveL to endpoint with interpolated offset");
            }
            FLOG_DEBUG("WeldBatch", "MoveL to endpoint: tcp=[" +
                std::to_string(tcp[0]) + "," + std::to_string(tcp[1]) + "," + std::to_string(tcp[2]) +
                "] speed=" + std::to_string(speed) + " offsetFlag=" + std::to_string(offsetFlag) +
                " hasJoints=" + (hasJoints ? "Y" : "N"));
            float acc = 100.0f;
            float ovl = 100.0f;
            float oacc = 100.0f;
            float blendR = -1.0f;
            std::vector<int> results;
            int completed = 0;
            bool stopped = false;
            if (g_batchStopFlag) { stopped = true; }
            else {
                int ret;
                if (hasJoints) {
                    ret = robotService.moveLWithJoints(joints, tcp, tool, user,
                        speed, acc, ovl, blendR, 0, offsetFlag, offset, velMode, oacc);
                } else {
                    ret = robotService.moveL(tcp, tool, user,
                        speed, acc, ovl, blendR, 0, offsetFlag, offset, velMode);
                }
                results.push_back(ret);
                if (ret == 0) {
                    completed = total;
                    FLOG_INFO("WeldBatch", "Single MoveL completed (all " + std::to_string(total) + " points)");
                } else {
                    FLOG_ERROR("WeldBatch", "MoveL failed: " + std::to_string(ret));
                    stopped = true;
                }
            }
            FLOG_INFO("WeldBatch", "Batch complete: " + std::to_string(completed) + "/" +
                std::to_string(total) + (stopped ? " (stopped)" : ""));
            json resultData;
            resultData["completed"] = completed;
            resultData["total"] = total;
            resultData["stopped"] = stopped;
            resultData["results"] = results;
            res.set_content(HttpRouteHelpers::makeStatusResponse(
                stopped ? 499 : 200, resultData
            ).dump(), "application/json");
        } catch (const std::exception& e) {
            FLOG_ERROR("WeldBatch", std::string("Exception: ") + e.what());
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", e.what()}}).dump(), "application/json");
        }
    });
}
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
using json = nlohmann::json;
void registerTeachingLogRoutes(
    httplib::Server& server,
    RobotService& robotService,
    DatabaseService* dbService
);
void registerTeachingRoutes(
    httplib::Server& server,
    RobotService& robotService,
    DatabaseService* dbService
) {
    server.Options(R"(/teaching/.*)", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        res.status = 200;
    });
    server.Get("/teaching/jobs", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json response;
        response["status_code"] = 200;
        if (dbService && dbService->isConnected()) {
            int limit = 100;
            int offset = 0;
            if (req.has_param("limit")) {
                try { limit = std::stoi(req.get_param_value("limit")); } catch (...) {}
            }
            if (req.has_param("offset")) {
                try { offset = std::stoi(req.get_param_value("offset")); } catch (...) {}
            }
            auto jobs = dbService->getJobs(limit, offset);
            json jobsArray = json::array();
            for (const auto& job : jobs) {
                jobsArray.push_back(DatabaseService::jobToJson(job));
            }
            response["data"] = {
                {"jobs", jobsArray},
                {"total", static_cast<int>(jobs.size())}
            };
        } else {
            response["data"] = {
                {"jobs", json::array()},
                {"total", 0}
            };
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Get(R"(/teaching/jobs/(\d+))", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        int jobId = std::stoi(req.matches[1]);
        json response;
        if (dbService && dbService->isConnected()) {
            auto job = dbService->getJob(jobId);
            if (job.id > 0) {
                auto points = dbService->getPoints(jobId);
                json jobJson = DatabaseService::jobToJson(job);
                json pointsArray = json::array();
                for (const auto& point : points) {
                    pointsArray.push_back(DatabaseService::pointToJson(point));
                }
                jobJson["points"] = pointsArray;
                response["status_code"] = 200;
                response["data"] = jobJson;
            } else {
                response["status_code"] = 404;
                response["message"] = "Job not found";
            }
        } else {
            response["status_code"] = 500;
            response["message"] = "Database not connected";
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Post("/teaching/jobs", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json response;
        if (dbService && dbService->isConnected()) {
            try {
                json body = json::parse(req.body);
                TeachingJob job = DatabaseService::jsonToJob(body);
                int jobId = dbService->createJob(job);
                if (jobId > 0) {
                    job.id = jobId;
                    int pointsCreated = 0;
                    if (body.contains("points") && body["points"].is_array()) {
                        for (const auto& pointJson : body["points"]) {
                            TeachingPoint point = DatabaseService::jsonToPoint(pointJson);
                            point.job_id = jobId;
                            int pointId = dbService->createPoint(point);
                            if (pointId > 0) {
                                pointsCreated++;
                            }
                        }
                        job.total_points = pointsCreated;
                        dbService->updateJob(job);
                    }
                    response["status_code"] = 200;
                    response["data"] = DatabaseService::jobToJson(job);
                    response["data"]["points_created"] = pointsCreated;
                } else {
                    response["status_code"] = 500;
                    response["message"] = "Failed to create job";
                }
            } catch (const std::exception& e) {
                response["status_code"] = 400;
                response["message"] = std::string("Invalid request: ") + e.what();
            }
        } else {
            response["status_code"] = 500;
            response["message"] = "Database not connected";
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Put(R"(/teaching/jobs/(\d+))", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        int jobId = std::stoi(req.matches[1]);
        json response;
        if (dbService && dbService->isConnected()) {
            try {
                json body = json::parse(req.body);
                TeachingJob job = DatabaseService::jsonToJob(body);
                job.id = jobId;
                if (dbService->updateJob(job)) {
                    response["status_code"] = 200;
                    response["data"] = DatabaseService::jobToJson(job);
                } else {
                    response["status_code"] = 500;
                    response["message"] = "Failed to update job";
                }
            } catch (const std::exception& e) {
                response["status_code"] = 400;
                response["message"] = std::string("Invalid request: ") + e.what();
            }
        } else {
            response["status_code"] = 500;
            response["message"] = "Database not connected";
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Patch(R"(/teaching/jobs/(\d+)/name)", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        int jobId = std::stoi(req.matches[1]);
        json response;
        if (dbService && dbService->isConnected()) {
            try {
                json body = json::parse(req.body);
                std::string name = body.value("name", "");
                auto job = dbService->getJob(jobId);
                if (job.id > 0) {
                    job.name = name;
                    if (dbService->updateJob(job)) {
                        response["status_code"] = 200;
                        response["data"] = DatabaseService::jobToJson(job);
                    } else {
                        response["status_code"] = 500;
                        response["message"] = "Failed to update job name";
                    }
                } else {
                    response["status_code"] = 404;
                    response["message"] = "Job not found";
                }
            } catch (const std::exception& e) {
                response["status_code"] = 400;
                response["message"] = std::string("Invalid request: ") + e.what();
            }
        } else {
            response["status_code"] = 500;
            response["message"] = "Database not connected";
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Patch(R"(/teaching/jobs/(\d+)/status)", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        int jobId = std::stoi(req.matches[1]);
        json response;
        if (dbService && dbService->isConnected()) {
            try {
                json body = json::parse(req.body);
                std::string status = body.value("status", "");
                auto job = dbService->getJob(jobId);
                if (job.id > 0) {
                    job.status = status;
                    if (dbService->updateJob(job)) {
                        response["status_code"] = 200;
                        response["data"] = DatabaseService::jobToJson(job);
                    } else {
                        response["status_code"] = 500;
                        response["message"] = "Failed to update job status";
                    }
                } else {
                    response["status_code"] = 404;
                    response["message"] = "Job not found";
                }
            } catch (const std::exception& e) {
                response["status_code"] = 400;
                response["message"] = std::string("Invalid request: ") + e.what();
            }
        } else {
            response["status_code"] = 500;
            response["message"] = "Database not connected";
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Delete(R"(/teaching/jobs/(\d+))", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        int jobId = std::stoi(req.matches[1]);
        json response;
        if (dbService && dbService->isConnected()) {
            if (dbService->deleteJob(jobId)) {
                response["status_code"] = 200;
                response["message"] = "Job deleted successfully";
            } else {
                response["status_code"] = 500;
                response["message"] = "Failed to delete job";
            }
        } else {
            response["status_code"] = 500;
            response["message"] = "Database not connected";
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Post(R"(/teaching/jobs/(\d+)/points)", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        int jobId = std::stoi(req.matches[1]);
        json response;
        if (dbService && dbService->isConnected()) {
            try {
                json body = json::parse(req.body);
                TeachingPoint point = DatabaseService::jsonToPoint(body);
                point.job_id = jobId;
                int pointId = dbService->createPoint(point);
                if (pointId > 0) {
                    point.id = pointId;
                    response["status_code"] = 200;
                    response["data"] = DatabaseService::pointToJson(point);
                } else {
                    response["status_code"] = 500;
                    response["message"] = "Failed to create point";
                }
            } catch (const std::exception& e) {
                response["status_code"] = 400;
                response["message"] = std::string("Invalid request: ") + e.what();
            }
        } else {
            response["status_code"] = 500;
            response["message"] = "Database not connected";
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Put(R"(/teaching/jobs/(\d+)/points/(\d+))", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        int jobId = std::stoi(req.matches[1]);
        int pointId = std::stoi(req.matches[2]);
        json response;
        if (dbService && dbService->isConnected()) {
            try {
                json body = json::parse(req.body);
                TeachingPoint point = DatabaseService::jsonToPoint(body);
                point.id = pointId;
                point.job_id = jobId;
                if (dbService->updatePoint(point)) {
                    response["status_code"] = 200;
                    response["data"] = DatabaseService::pointToJson(point);
                } else {
                    response["status_code"] = 500;
                    response["message"] = "Failed to update point";
                }
            } catch (const std::exception& e) {
                response["status_code"] = 400;
                response["message"] = std::string("Invalid request: ") + e.what();
            }
        } else {
            response["status_code"] = 500;
            response["message"] = "Database not connected";
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Delete(R"(/teaching/jobs/(\d+)/points/(\d+))", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        int pointId = std::stoi(req.matches[2]);
        json response;
        if (dbService && dbService->isConnected()) {
            if (dbService->deletePoint(pointId)) {
                response["status_code"] = 200;
                response["message"] = "Point deleted successfully";
            } else {
                response["status_code"] = 500;
                response["message"] = "Failed to delete point";
            }
        } else {
            response["status_code"] = 500;
            response["message"] = "Database not connected";
        }
        res.set_content(response.dump(), "application/json");
    });
    registerTeachingLogRoutes(server, robotService, dbService);
}
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
using json = nlohmann::json;
void registerTeachingLogRoutes(
    httplib::Server& server,
    RobotService& robotService,
    DatabaseService* dbService
) {
    server.Options(R"(/welding-logs.*)", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        res.status = 200;
    });
    server.Get("/welding-logs", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json response;
        response["status_code"] = 200;
        if (dbService && dbService->isConnected()) {
            int limit = 100;
            int offset = 0;
            int jobId = -1;
            if (req.has_param("limit")) {
                try { limit = std::stoi(req.get_param_value("limit")); } catch (...) {}
            }
            if (req.has_param("offset")) {
                try { offset = std::stoi(req.get_param_value("offset")); } catch (...) {}
            }
            if (req.has_param("job_id")) {
                try { jobId = std::stoi(req.get_param_value("job_id")); } catch (...) {}
            }
            auto logs = dbService->getWeldingLogs(limit, offset, jobId);
            int total = dbService->getWeldingLogsCount(jobId);
            json logsArray = json::array();
            for (const auto& log : logs) {
                logsArray.push_back(DatabaseService::weldingLogToJson(log));
            }
            response["data"] = {
                {"logs", logsArray},
                {"total", total}
            };
        } else {
            response["data"] = {
                {"logs", json::array()},
                {"total", 0}
            };
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Get(R"(/welding-logs/(\d+))", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        int logId = std::stoi(req.matches[1]);
        json response;
        if (dbService && dbService->isConnected()) {
            auto log = dbService->getWeldingLog(logId);
            if (log.id > 0) {
                response["status_code"] = 200;
                response["data"] = DatabaseService::weldingLogToJson(log);
            } else {
                response["status_code"] = 404;
                response["message"] = "Welding log not found";
            }
        } else {
            response["status_code"] = 500;
            response["message"] = "Database not connected";
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Post("/welding-logs", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json response;
        if (dbService && dbService->isConnected()) {
            try {
                json body = json::parse(req.body);
                WeldingLog log = DatabaseService::jsonToWeldingLog(body);
                int logId = dbService->createWeldingLog(log);
                if (logId > 0) {
                    log.id = logId;
                    response["status_code"] = 200;
                    response["data"] = DatabaseService::weldingLogToJson(log);
                } else {
                    response["status_code"] = 500;
                    response["message"] = "Failed to create welding log";
                }
            } catch (const std::exception& e) {
                response["status_code"] = 400;
                response["message"] = std::string("Invalid request: ") + e.what();
            }
        } else {
            response["status_code"] = 500;
            response["message"] = "Database not connected";
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Put(R"(/welding-logs/(\d+))", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        int logId = std::stoi(req.matches[1]);
        json response;
        if (dbService && dbService->isConnected()) {
            try {
                WeldingLog existing = dbService->getWeldingLog(logId);
                if (existing.id == 0) {
                    response["status_code"] = 404;
                    response["message"] = "Welding log not found";
                    res.set_content(response.dump(), "application/json");
                    return;
                }
                json body = json::parse(req.body);
                json merged = DatabaseService::weldingLogToJson(existing);
                merged.merge_patch(body);
                WeldingLog log = DatabaseService::jsonToWeldingLog(merged);
                log.id = logId;
                if (dbService->updateWeldingLog(log)) {
                    response["status_code"] = 200;
                    response["data"] = DatabaseService::weldingLogToJson(log);
                } else {
                    response["status_code"] = 500;
                    response["message"] = "Failed to update welding log";
                }
            } catch (const std::exception& e) {
                response["status_code"] = 400;
                response["message"] = std::string("Invalid request: ") + e.what();
            }
        } else {
            response["status_code"] = 500;
            response["message"] = "Database not connected";
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Delete("/welding-logs", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json response;
        if (dbService && dbService->isConnected()) {
            try {
                json body = json::parse(req.body);
                if (!body.contains("ids") || !body["ids"].is_array()) {
                    response["status_code"] = 400;
                    response["message"] = "Missing or invalid 'ids' array";
                } else {
                    std::vector<int> ids;
                    for (const auto& id : body["ids"]) {
                        ids.push_back(id.get<int>());
                    }
                    if (dbService->deleteWeldingLogs(ids)) {
                        response["status_code"] = 200;
                        response["message"] = "Deleted " + std::to_string(ids.size()) + " log(s)";
                        response["data"] = {{"deleted_count", ids.size()}};
                    } else {
                        response["status_code"] = 500;
                        response["message"] = "Failed to delete welding logs";
                    }
                }
            } catch (const std::exception& e) {
                response["status_code"] = 400;
                response["message"] = std::string("Invalid request: ") + e.what();
            }
        } else {
            response["status_code"] = 500;
            response["message"] = "Database not connected";
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Get("/teaching/error_message", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json response;
        response["status_code"] = 200;
        if (dbService && dbService->isConnected()) {
            int mainCode = 0;
            int subCode = 0;
            if (req.has_param("main_code")) {
                try { mainCode = std::stoi(req.get_param_value("main_code")); } catch (...) {}
            }
            if (req.has_param("sub_code")) {
                try { subCode = std::stoi(req.get_param_value("sub_code")); } catch (...) {}
            }
            json errorData = dbService->getErrorMessage(mainCode, subCode);
            response["data"] = errorData;
        } else {
            response["status_code"] = 500;
            response["message"] = "Database not connected";
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Get("/teaching/debug_logs", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json response;
        if (!dbService || !dbService->isConnected()) {
            response["status_code"] = 500;
            response["message"] = "Database not connected";
            res.set_content(response.dump(), "application/json");
            return;
        }
        int limit = 100;
        if (req.has_param("limit")) {
            try { limit = std::stoi(req.get_param_value("limit")); } catch (...) {}
        }
        json logsArray = dbService->getDebugLogs(limit);
        response["status_code"] = 200;
        response["data"] = {{"logs", logsArray}, {"count", logsArray.size()}};
        res.set_content(response.dump(), "application/json");
    });
    server.Delete("/teaching/debug_logs", [dbService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json response;
        if (!dbService || !dbService->isConnected()) {
            response["status_code"] = 500;
            response["message"] = "Database not connected";
            res.set_content(response.dump(), "application/json");
            return;
        }
        if (dbService->clearDebugLogs()) {
            response["status_code"] = 200;
            response["message"] = "Debug logs cleared";
        } else {
            response["status_code"] = 500;
            response["message"] = "Failed to clear debug logs";
        }
        res.set_content(response.dump(), "application/json");
    });
}
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include <sstream>
using json = nlohmann::json;
void registerSdkRoutes(
    httplib::Server& server,
    RobotService& robotService,
    DatabaseService* dbService
) {
    server.Options(R"(/robot_sdk/.*)", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        res.status = 200;
    });
    server.Options("/robot_sdk/settings", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        res.status = 200;
    });
    server.Get("/robot_sdk/realtime", [&robotService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            json data;
            data["connected"] = false;
            data["joints"] = json::array();
            data["tcp"] = json::array();
            data["reason"] = "Robot not connected";
            res.set_content(data.dump(), "application/json");
            return;
        }
        try {
            ROBOT_STATE_PKG state = robotService.getState();
            json data;
            data["connected"] = true;
            data["joints"] = json::array({
                state.jt_cur_pos[0], state.jt_cur_pos[1], state.jt_cur_pos[2],
                state.jt_cur_pos[3], state.jt_cur_pos[4], state.jt_cur_pos[5]
            });
            data["tcp"] = json::array({
                state.tl_cur_pos[0], state.tl_cur_pos[1], state.tl_cur_pos[2],
                state.tl_cur_pos[3], state.tl_cur_pos[4], state.tl_cur_pos[5]
            });
            data["robot_state"] = state.robot_state;
            data["robot_mode"] = state.robot_mode;
            data["servo_enabled"] = (state.rbtEnableState == 1);
            data["error_code"] = state.main_code;
            if (state.main_code != 0) {
                data["error_message"] = "Error";
            }
            res.set_content(data.dump(), "application/json");
        } catch (const std::exception& e) {
            json data;
            data["connected"] = false;
            data["joints"] = json::array();
            data["tcp"] = json::array();
            data["reason"] = e.what();
            res.set_content(data.dump(), "application/json");
        }
    });
    server.Get("/robot_sdk/connection_status", [&robotService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        bool connected = robotService.isConnected();
        json data;
        data["connected"] = connected;
        data["instance_count"] = connected ? 1 : 0;
        data["auto_reconnect"] = robotService.isAutoReconnectEnabled();
        res.set_content(HttpRouteHelpers::makeStatusResponse(200, data).dump(), "application/json");
    });
    server.Post("/robot_sdk/auto_reconnect", [&robotService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        try {
            json body = json::parse(req.body);
            bool enabled = body.value("enabled", true);
            robotService.setAutoReconnect(enabled);
            FLOG_INFO("SdkRoute", std::string("Auto-reconnect ") + (enabled ? "ENABLED" : "DISABLED"));
            res.set_content(HttpRouteHelpers::makeStatusResponse(200, {
                {"auto_reconnect", enabled}
            }).dump(), "application/json");
        } catch (const std::exception& e) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", e.what()}}).dump(), "application/json");
        }
    });
    server.Post("/robot_sdk/connect", [&robotService, dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        std::string ip = "192.168.58.2";
        if (!req.body.empty()) {
            try {
                json body = json::parse(req.body);
                if (body.contains("ip") && !body["ip"].is_null()) {
                    ip = body["ip"].get<std::string>();
                }
            } catch (...) {}
        }
        FLOG_INFO("SdkRoute", "Connect request: ip=" + ip);
        int result = robotService.connect(ip);
        if (result != 0) {
            FLOG_SDK_ERROR("connect", result, "ip=" + ip);
        } else {
            FLOG_INFO("SdkRoute", "Robot connected successfully: ip=" + ip);
        }
        int toolNum = 0, userNum = 0;
        if (result == 0 && dbService && dbService->isConnected()) {
            RobotSettings settings = dbService->getRobotSettings();
            toolNum = settings.tool_num;
            userNum = settings.user_num;
            std::cout << "[connect] Applying coordinate settings: tool=" << toolNum << ", user=" << userNum << std::endl;
            robotService.setToolPoint(toolNum);
            robotService.setUserPoint(userNum);
        }
        json response;
        response["status_code"] = (result == 0) ? 200 : 500;
        response["data"] = {
            {"result", result},
            {"connected", (result == 0)},
            {"success", (result == 0)},
            {"tool_num", toolNum},
            {"user_num", userNum}
        };
        res.set_content(response.dump(), "application/json");
    });
    server.Post("/robot_sdk/robot/enable", [&robotService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            FLOG_WARN("SdkRoute", "Servo enable rejected - robot not connected");
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        FLOG_INFO("SdkRoute", "Servo ENABLE request");
        int result = robotService.enable();
        if (result != 0) {
            FLOG_SDK_ERROR("enable", result, "Servo enable failed");
        } else {
            FLOG_INFO("SdkRoute", "Servo ENABLE success");
        }
        json response;
        response["status_code"] = (result == 0) ? 200 : 500;
        response["result"] = result;
        res.set_content(response.dump(), "application/json");
    });
    server.Post("/robot_sdk/robot/disable", [&robotService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            FLOG_WARN("SdkRoute", "Servo disable rejected - robot not connected");
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        FLOG_INFO("SdkRoute", "Servo DISABLE request");
        int result = robotService.disable();
        if (result != 0) {
            FLOG_SDK_ERROR("disable", result, "Servo disable failed");
        } else {
            FLOG_INFO("SdkRoute", "Servo DISABLE success");
        }
        json response;
        response["status_code"] = (result == 0) ? 200 : 500;
        response["result"] = result;
        res.set_content(response.dump(), "application/json");
    });
    server.Get("/robot_sdk/robot/error", [&robotService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        try {
            ROBOT_STATE_PKG state = robotService.getState();
            json data;
            data["main_code"] = state.main_code;
            data["sub_code"] = state.sub_code;
            data["has_error"] = (state.main_code != 0);
            data["message"] = (state.main_code != 0) ? "Error detected" : "No error";
            res.set_content(HttpRouteHelpers::makeStatusResponse(200, data).dump(), "application/json");
        } catch (const std::exception& e) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(500, {{"message", e.what()}}).dump(), "application/json");
        }
    });
    server.Post("/robot_sdk/robot/reset-error", [&robotService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        FLOG_INFO("SdkRoute", "Reset error request");
        int result = robotService.resetError();
        if (result != 0) {
            FLOG_SDK_ERROR("resetError", result, "Reset error failed");
        }
        json response;
        response["status_code"] = (result == 0) ? 200 : 500;
        response["result"] = result;
        res.set_content(response.dump(), "application/json");
    });
    server.Get("/robot_sdk/settings", [dbService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json response;
        if (dbService && dbService->isConnected()) {
            RobotSettings settings = dbService->getRobotSettings();
            response["status_code"] = 200;
            response["data"] = DatabaseService::settingsToJson(settings);
        } else {
            response["status_code"] = 500;
            response["message"] = "Database not connected";
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Put("/robot_sdk/settings", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json response;
        if (!dbService || !dbService->isConnected()) {
            response["status_code"] = 500;
            response["message"] = "Database not connected";
            res.set_content(response.dump(), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            RobotSettings settings = dbService->getRobotSettings();
            if (body.contains("tool_num")) settings.tool_num = body["tool_num"].get<int>();
            if (body.contains("user_num")) settings.user_num = body["user_num"].get<int>();
            if (body.contains("default_vel")) settings.default_vel = body["default_vel"].get<int>();
            if (body.contains("default_acc")) settings.default_acc = body["default_acc"].get<int>();
            if (body.contains("default_ovl")) settings.default_ovl = body["default_ovl"].get<int>();
            if (body.contains("auto_clear_error")) settings.auto_clear_error = body["auto_clear_error"].get<bool>();
            if (body.contains("min_weaving_distance")) settings.min_weaving_distance = body["min_weaving_distance"].get<int>();
            if (dbService->updateRobotSettings(settings)) {
                RobotSettings updated = dbService->getRobotSettings();
                response["status_code"] = 200;
                response["data"] = DatabaseService::settingsToJson(updated);
            } else {
                response["status_code"] = 500;
                response["message"] = "Failed to update settings";
            }
        } catch (const std::exception& e) {
            response["status_code"] = 400;
            response["message"] = e.what();
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Options("/robot_sdk/welding-config", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        res.set_content("", "text/plain");
    });
    server.Get("/robot_sdk/welding-config", [dbService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json response;
        if (dbService && dbService->isConnected()) {
            WeldingConfig config = dbService->getWeldingConfig();
            response["status_code"] = 200;
            response["data"] = DatabaseService::weldingConfigToJson(config);
        } else {
            response["status_code"] = 500;
            response["message"] = "Database not connected";
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Put("/robot_sdk/welding-config", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json response;
        if (!dbService || !dbService->isConnected()) {
            response["status_code"] = 500;
            response["message"] = "Database not connected";
            res.set_content(response.dump(), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            WeldingConfig config = dbService->getWeldingConfig();
            if (body.contains("touch_sensing_enabled")) config.touch_sensing_enabled = body["touch_sensing_enabled"].get<bool>();
            if (body.contains("touch_speed")) config.touch_speed = body["touch_speed"].get<double>();
            if (body.contains("touch_distance")) config.touch_distance = body["touch_distance"].get<double>();
            if (body.contains("touch_offset_depth")) config.touch_offset_depth = body["touch_offset_depth"].get<double>();
            if (body.contains("touch_approach_angle")) config.touch_approach_angle = body["touch_approach_angle"].get<double>();
            if (body.contains("touch_sensing_velocity")) config.touch_sensing_velocity = body["touch_sensing_velocity"].get<double>();
            if (body.contains("touch_sensing_acceleration")) config.touch_sensing_acceleration = body["touch_sensing_acceleration"].get<double>();
            if (body.contains("touch_sensing_step_size")) config.touch_sensing_step_size = body["touch_sensing_step_size"].get<double>();
            if (body.contains("touch_sensing_retract_distance")) config.touch_sensing_retract_distance = body["touch_sensing_retract_distance"].get<double>();
            if (body.contains("touch_sensing_approach_offset")) config.touch_sensing_approach_offset = body["touch_sensing_approach_offset"].get<double>();
            if (body.contains("touch_sensing_move_distance")) config.touch_sensing_move_distance = body["touch_sensing_move_distance"].get<double>();
            if (body.contains("touch_sensing_point_speed")) config.touch_sensing_point_speed = body["touch_sensing_point_speed"].get<double>();
            if (body.contains("touch_sensing_search_speed")) config.touch_sensing_search_speed = body["touch_sensing_search_speed"].get<double>();
            if (body.contains("p1_touch_center")) config.p1_touch_center = body["p1_touch_center"].get<bool>();
            if (body.contains("p1_touch_left")) config.p1_touch_left = body["p1_touch_left"].get<bool>();
            if (body.contains("p1_touch_right")) config.p1_touch_right = body["p1_touch_right"].get<bool>();
            if (body.contains("p1_touch_bottom")) config.p1_touch_bottom = body["p1_touch_bottom"].get<bool>();
            if (body.contains("p2_touch_center")) config.p2_touch_center = body["p2_touch_center"].get<bool>();
            if (body.contains("p2_touch_left")) config.p2_touch_left = body["p2_touch_left"].get<bool>();
            if (body.contains("p2_touch_right")) config.p2_touch_right = body["p2_touch_right"].get<bool>();
            if (body.contains("p3_touch_center")) config.p3_touch_center = body["p3_touch_center"].get<bool>();
            if (body.contains("p3_touch_left")) config.p3_touch_left = body["p3_touch_left"].get<bool>();
            if (body.contains("p3_touch_right")) config.p3_touch_right = body["p3_touch_right"].get<bool>();
            if (body.contains("p3_touch_bottom")) config.p3_touch_bottom = body["p3_touch_bottom"].get<bool>();
            if (body.contains("p4_touch_center")) config.p4_touch_center = body["p4_touch_center"].get<bool>();
            if (body.contains("p4_touch_top")) config.p4_touch_top = body["p4_touch_top"].get<bool>();
            if (body.contains("p4_touch_bottom")) config.p4_touch_bottom = body["p4_touch_bottom"].get<bool>();
            if (body.contains("p4_touch_side")) config.p4_touch_side = body["p4_touch_side"].get<bool>();
            if (body.contains("p5_touch_center")) config.p5_touch_center = body["p5_touch_center"].get<bool>();
            if (body.contains("p5_touch_top")) config.p5_touch_top = body["p5_touch_top"].get<bool>();
            if (body.contains("p5_touch_bottom")) config.p5_touch_bottom = body["p5_touch_bottom"].get<bool>();
            if (body.contains("p6_touch_center")) config.p6_touch_center = body["p6_touch_center"].get<bool>();
            if (body.contains("p6_touch_top")) config.p6_touch_top = body["p6_touch_top"].get<bool>();
            if (body.contains("p6_touch_bottom")) config.p6_touch_bottom = body["p6_touch_bottom"].get<bool>();
            if (body.contains("p7_touch_center")) config.p7_touch_center = body["p7_touch_center"].get<bool>();
            if (body.contains("p7_touch_left")) config.p7_touch_left = body["p7_touch_left"].get<bool>();
            if (body.contains("p7_touch_right")) config.p7_touch_right = body["p7_touch_right"].get<bool>();
            if (body.contains("p8_touch_center")) config.p8_touch_center = body["p8_touch_center"].get<bool>();
            if (body.contains("p8_touch_left")) config.p8_touch_left = body["p8_touch_left"].get<bool>();
            if (body.contains("p8_touch_right")) config.p8_touch_right = body["p8_touch_right"].get<bool>();
            if (body.contains("p9_touch_center")) config.p9_touch_center = body["p9_touch_center"].get<bool>();
            if (body.contains("p9_touch_left")) config.p9_touch_left = body["p9_touch_left"].get<bool>();
            if (body.contains("p9_touch_right")) config.p9_touch_right = body["p9_touch_right"].get<bool>();
            if (body.contains("p9_touch_bottom")) config.p9_touch_bottom = body["p9_touch_bottom"].get<bool>();
            if (body.contains("p10_touch_center")) config.p10_touch_center = body["p10_touch_center"].get<bool>();
            if (body.contains("p10_touch_top")) config.p10_touch_top = body["p10_touch_top"].get<bool>();
            if (body.contains("p10_touch_bottom")) config.p10_touch_bottom = body["p10_touch_bottom"].get<bool>();
            if (body.contains("p10_touch_side")) config.p10_touch_side = body["p10_touch_side"].get<bool>();
            if (body.contains("p11_touch_center")) config.p11_touch_center = body["p11_touch_center"].get<bool>();
            if (body.contains("p11_touch_top")) config.p11_touch_top = body["p11_touch_top"].get<bool>();
            if (body.contains("p11_touch_bottom")) config.p11_touch_bottom = body["p11_touch_bottom"].get<bool>();
            if (body.contains("p12_touch_center")) config.p12_touch_center = body["p12_touch_center"].get<bool>();
            if (body.contains("p12_touch_top")) config.p12_touch_top = body["p12_touch_top"].get<bool>();
            if (body.contains("p12_touch_bottom")) config.p12_touch_bottom = body["p12_touch_bottom"].get<bool>();
            if (body.contains("arc_tracking_enabled")) config.arc_tracking_enabled = body["arc_tracking_enabled"].get<bool>();
            if (body.contains("arc_tracking_left_right")) config.arc_tracking_left_right = body["arc_tracking_left_right"].get<bool>();
            if (body.contains("arc_tracking_up_down")) config.arc_tracking_up_down = body["arc_tracking_up_down"].get<bool>();
            if (body.contains("arc_tracking_klr")) config.arc_tracking_klr = body["arc_tracking_klr"].get<double>();
            if (body.contains("arc_tracking_kud")) config.arc_tracking_kud = body["arc_tracking_kud"].get<double>();
            if (body.contains("arc_tracking_step_max_lr")) config.arc_tracking_step_max_lr = body["arc_tracking_step_max_lr"].get<double>();
            if (body.contains("arc_tracking_step_max_ud")) config.arc_tracking_step_max_ud = body["arc_tracking_step_max_ud"].get<double>();
            if (body.contains("arc_tracking_sum_max_lr")) config.arc_tracking_sum_max_lr = body["arc_tracking_sum_max_lr"].get<double>();
            if (body.contains("arc_tracking_sum_max_ud")) config.arc_tracking_sum_max_ud = body["arc_tracking_sum_max_ud"].get<double>();
            if (dbService->updateWeldingConfig(config)) {
                WeldingConfig updated = dbService->getWeldingConfig();
                response["status_code"] = 200;
                response["data"] = DatabaseService::weldingConfigToJson(updated);
            } else {
                response["status_code"] = 500;
                response["message"] = "Failed to update welding config";
            }
        } catch (const std::exception& e) {
            response["status_code"] = 400;
            response["message"] = e.what();
        }
        res.set_content(response.dump(), "application/json");
    });
    registerSdkMotionRoutes(server, robotService, dbService);
}
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include <sstream>
#include <cmath>
#include <chrono>
#include <thread>
#include <iomanip>
using json = nlohmann::json;
void registerSdkMotionTouchRoutes(
    httplib::Server& server,
    RobotService& robotService,
    DatabaseService* dbService
);
void registerSdkMotionRoutes(
    httplib::Server& server,
    RobotService& robotService,
    DatabaseService* dbService
) {
    server.Post("/robot_sdk/robot/stop", [&robotService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        FLOG_INFO("SdkMotion", "Stop motion request");
        int result = robotService.stopMotion();
        if (result != 0) {
            FLOG_SDK_ERROR("stopMotion", result, "Stop motion failed");
        }
        json response;
        response["status_code"] = (result == 0) ? 200 : 500;
        response["result"] = result;
        res.set_content(response.dump(), "application/json");
    });
    server.Post("/robot_sdk/robot/emergency_stop", [&robotService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        FLOG_FATAL("SdkMotion", "EMERGENCY STOP request");
        int result = robotService.emergencyStop();
        if (result != 0) {
            FLOG_SDK_ERROR("emergencyStop", result, "Emergency stop failed");
        } else {
            FLOG_INFO("SdkMotion", "Emergency stop executed successfully");
        }
        json response;
        response["status_code"] = 200;
        response["result"] = result;
        res.set_content(response.dump(), "application/json");
    });
    server.Post("/robot_sdk/robot/mode", [&robotService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        int mode = 0;
        if (req.has_param("mode")) {
            mode = std::stoi(req.get_param_value("mode"));
        }
        FLOG_INFO("SdkMotion", "Set mode: " + std::to_string(mode));
        int result = robotService.setMode(mode);
        if (result != 0) {
            FLOG_SDK_ERROR("setMode", result, "mode=" + std::to_string(mode));
        }
        json response;
        response["status_code"] = (result == 0) ? 200 : 500;
        response["result"] = result;
        response["mode"] = mode;
        res.set_content(response.dump(), "application/json");
    });
    server.Get("/robot_sdk/motion/done", [&robotService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        int motionDone = 0;
        robotService.getMotionDone(&motionDone);
        res.set_content(HttpRouteHelpers::makeStatusResponse(200, {{"motion_done", motionDone}}).dump(), "application/json");
    });
    server.Post("/robot_sdk/robot/stop_motion", [&robotService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        int result = robotService.stopMotion();
        json response;
        response["status_code"] = (result == 0) ? 200 : 500;
        response["result"] = result;
        res.set_content(response.dump(), "application/json");
    });
    server.Post("/robot_sdk/robot/stop_move", [&robotService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        int result = robotService.stopMotion();
        json response;
        response["status_code"] = (result == 0) ? 200 : 500;
        response["result"] = result;
        res.set_content(response.dump(), "application/json");
    });
    server.Post("/robot_sdk/jog/start", [&robotService, dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            int ref = body.value("ref", 0);
            int nb = body.value("nb", 1);
            int dir = body.value("dir", 1);
            float vel = body.value("vel", 20.0f);
            float acc = body.value("acc", 100.0f);
            float maxDis = body.value("max_dis", 360.0f);
            int toolNum = 0, userNum = 0;
            if (dbService && dbService->isConnected()) {
                RobotSettings settings = dbService->getRobotSettings();
                toolNum = settings.tool_num;
                userNum = settings.user_num;
                if (ref == 2) {
                    robotService.setToolPoint(toolNum);
                    robotService.setUserPoint(userNum);
                }
            }
            FLOG_DEBUG("SdkMotion", "Jog start: ref=" + std::to_string(ref) + " nb=" + std::to_string(nb) + " dir=" + std::to_string(dir) + " vel=" + std::to_string(vel));
            int result = robotService.startJog(ref, nb, dir, vel, acc, maxDis);
            if (result != 0) {
                FLOG_SDK_ERROR("startJog", result, "ref=" + std::to_string(ref) + " nb=" + std::to_string(nb));
            }
            json response;
            response["status_code"] = (result == 0) ? 200 : 500;
            response["result"] = result;
            response["data"] = {
                {"ref", ref},
                {"nb", nb},
                {"dir", dir},
                {"vel", vel},
                {"tool_num", toolNum},
                {"user_num", userNum}
            };
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", std::string("Parse error: ") + e.what()}}).dump(), "application/json");
        }
    });
    server.Post("/robot_sdk/jog/stop", [&robotService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        int ref = 1;
        if (req.has_param("ref")) {
            ref = std::stoi(req.get_param_value("ref"));
        } else if (!req.body.empty()) {
            try {
                json body = json::parse(req.body);
                ref = body.value("ref", 1);
            } catch (...) {}
        }
        int result = robotService.stopJog(ref);
        json response;
        response["status_code"] = (result == 0) ? 200 : 500;
        response["result"] = result;
        res.set_content(response.dump(), "application/json");
    });
    server.Post("/robot_sdk/jog/stop_immediate", [&robotService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        int result = robotService.immStopJog();
        json response;
        response["status_code"] = (result == 0) ? 200 : 500;
        response["result"] = result;
        res.set_content(response.dump(), "application/json");
    });
    server.Post("/robot_sdk/move/joint", [&robotService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            double joints[6] = {0};
            if (body.contains("joint_pos")) {
                auto jp = body["joint_pos"];
                joints[0] = jp.value("j1", 0.0);
                joints[1] = jp.value("j2", 0.0);
                joints[2] = jp.value("j3", 0.0);
                joints[3] = jp.value("j4", 0.0);
                joints[4] = jp.value("j5", 0.0);
                joints[5] = jp.value("j6", 0.0);
            }
            int tool = body.value("tool", 0);
            int user = body.value("user", 0);
            float vel = body.value("vel", 20.0f);
            float acc = body.value("acc", 100.0f);
            float ovl = body.value("ovl", 100.0f);
            float blendT = body.value("blend_t", -1.0f);
            int velMode = body.value("vel_mode", 0);
            float actualVel = vel;
            if (velMode == 1) {
                actualVel = vel / 15.0f;
                if (actualVel > 100.0f) actualVel = 100.0f;
                if (actualVel < 1.0f) actualVel = 1.0f;
                std::cout << "[MoveJ] vel_mode=CPM, converting " << vel << " CPM to " << actualVel << "%" << std::endl;
            }
            {
                std::ostringstream oss;
                oss << std::fixed << std::setprecision(2) << "MoveJ: joints=[" << joints[0] << "," << joints[1] << "," << joints[2] << "," << joints[3] << "," << joints[4] << "," << joints[5] << "] vel=" << actualVel << " tool=" << tool << " user=" << user;
                FLOG_INFO("SdkMotion", oss.str());
            }
            int result = robotService.moveJ(joints, tool, user, actualVel, acc, ovl, blendT);
            if (result != 0) {
                FLOG_SDK_ERROR("moveJ", result, "vel=" + std::to_string(actualVel));
            }
            json response;
            response["status_code"] = (result == 0) ? 200 : 500;
            response["result"] = result;
            if (result != 0) {
                response["message"] = "MoveJ failed with code " + std::to_string(result);
            }
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            FLOG_ERROR("SdkMotion", std::string("MoveJ exception: ") + e.what());
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", e.what()}}).dump(), "application/json");
        }
    });
    server.Post("/robot_sdk/move/linear", [&robotService, dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            double descPos[6] = {0};
            if (body.contains("desc_pos")) {
                auto dp = body["desc_pos"];
                descPos[0] = dp.value("x", 0.0);
                descPos[1] = dp.value("y", 0.0);
                descPos[2] = dp.value("z", 0.0);
                descPos[3] = dp.value("rx", 0.0);
                descPos[4] = dp.value("ry", 0.0);
                descPos[5] = dp.value("rz", 0.0);
            }
            int tool = body.value("tool", 3);
            int user = body.value("user", 0);
            float vel = body.value("vel", 20.0f);
            float acc = body.value("acc", 100.0f);
            float ovl = body.value("ovl", 100.0f);
            float blendR = body.value("blend_t", -1.0f);
            int velMode = body.value("vel_mode", 0);
            int offsetFlag = body.value("offset_flag", 0);
            double offsetPos[6] = {0};
            if (body.contains("offset_pos") && body["offset_pos"].is_array()) {
                auto op = body["offset_pos"];
                for (int i = 0; i < 6 && i < (int)op.size(); i++) {
                    offsetPos[i] = op[i].get<double>();
                }
            }
            float actualVel = vel;
            if (velMode == 1) {
                actualVel = vel / 15.0f;
                if (actualVel > 100.0f) actualVel = 100.0f;
                if (actualVel < 1.0f) actualVel = 1.0f;
                std::cout << "[MoveL] vel_mode=CPM, converting " << vel << " CPM to " << actualVel << "%" << std::endl;
            }
            std::ostringstream logDetails;
            logDetails << "pos=[" << descPos[0] << "," << descPos[1] << "," << descPos[2] << ","
                       << descPos[3] << "," << descPos[4] << "," << descPos[5] << "] "
                       << "vel=" << actualVel << " blendR=" << blendR;
            FLOG_INFO("SdkMotion", "MoveL: " + logDetails.str());
            if (dbService && dbService->isConnected()) {
                dbService->logDebug("MoveL", "CALL_START", logDetails.str());
            }
            uint8_t search = 0;
            int result = robotService.moveL(descPos, tool, user, actualVel, acc, ovl, blendR, search, offsetFlag, offsetPos, 0);
            if (dbService && dbService->isConnected()) {
                dbService->logDebug("MoveL", "CALL_END", "result=" + std::to_string(result));
            }
            if (result != 0) {
                FLOG_SDK_ERROR("moveL", result, "vel=" + std::to_string(actualVel));
            }
            json response;
            response["status_code"] = (result == 0) ? 200 : 500;
            response["result"] = result;
            if (result != 0) {
                response["message"] = "MoveL failed with code " + std::to_string(result);
            }
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            FLOG_ERROR("SdkMotion", std::string("MoveL exception: ") + e.what());
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", e.what()}}).dump(), "application/json");
        }
    });
    server.Post("/robot_sdk/wire/forward", [&robotService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        int ioType = 0;
        int wireFeed = 1;
        if (!req.body.empty()) {
            try {
                json body = json::parse(req.body);
                if (body.contains("ioType")) ioType = body["ioType"].get<int>();
                if (body.contains("wireFeed")) wireFeed = body["wireFeed"].get<int>();
            } catch (...) {}
        }
        FLOG_INFO("SdkMotion", "Wire FORWARD: ioType=" + std::to_string(ioType) + " wireFeed=" + std::to_string(wireFeed));
        int result = robotService.forwardWireFeed(ioType, wireFeed);
        if (result != 0) {
            FLOG_SDK_ERROR("forwardWireFeed", result, "ioType=" + std::to_string(ioType));
        }
        json response;
        response["status_code"] = (result == 0) ? 200 : 500;
        response["result"] = result;
        res.set_content(response.dump(), "application/json");
    });
    server.Post("/robot_sdk/wire/reverse", [&robotService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        int ioType = 0;
        int wireFeed = 1;
        if (!req.body.empty()) {
            try {
                json body = json::parse(req.body);
                if (body.contains("ioType")) ioType = body["ioType"].get<int>();
                if (body.contains("wireFeed")) wireFeed = body["wireFeed"].get<int>();
            } catch (...) {}
        }
        FLOG_INFO("SdkMotion", "Wire REVERSE: ioType=" + std::to_string(ioType) + " wireFeed=" + std::to_string(wireFeed));
        int result = robotService.reverseWireFeed(ioType, wireFeed);
        if (result != 0) {
            FLOG_SDK_ERROR("reverseWireFeed", result, "ioType=" + std::to_string(ioType));
        }
        json response;
        response["status_code"] = (result == 0) ? 200 : 500;
        response["result"] = result;
        res.set_content(response.dump(), "application/json");
    });
    server.Post("/robot_sdk/inverse-kin", [&robotService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            auto pose = body.at("pose");
            auto ref = body.at("refJoints");
            if (!pose.is_array() || pose.size() < 6 || !ref.is_array() || ref.size() < 6) {
                res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "pose/refJoints must be length-6 arrays"}}).dump(), "application/json");
                return;
            }
            double descPos[6], refJoints[6], jointResult[6];
            for (int i = 0; i < 6; i++) {
                descPos[i] = pose[i].get<double>();
                refJoints[i] = ref[i].get<double>();
            }
            int result = robotService.getInverseKin(descPos, refJoints, jointResult);
            if (result != 0) {
                FLOG_SDK_ERROR("getInverseKin", result, "inverse kinematics failed");
            }
            json response;
            response["status_code"] = (result == 0) ? 200 : 500;
            response["result"] = result;
            if (result == 0) {
                response["joints"] = {
                    jointResult[0], jointResult[1], jointResult[2],
                    jointResult[3], jointResult[4], jointResult[5],
                };
            }
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            FLOG_ERROR("SdkMotion", std::string("InverseKin exception: ") + e.what());
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", e.what()}}).dump(), "application/json");
        }
    });
    registerSdkMotionTouchRoutes(server, robotService, dbService);
}
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include <sstream>
#include <cmath>
#include <chrono>
#include <thread>
#include <iomanip>
using json = nlohmann::json;
void registerSdkMotionTouchRoutes(
    httplib::Server& server,
    RobotService& robotService,
    DatabaseService* dbService
) {
    server.Post("/robot_sdk/move/find-dx", [&robotService, dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            int direction = body.value("direction", -1);
            int toolNum = 0, userNum = 0;
            float searchDis = 100.0f;
            float searchVel = 3.0f;
            float retractDistance = 10.0f;
            double searchMoveDist = 0.5;
            if (dbService && dbService->isConnected()) {
                RobotSettings settings = dbService->getRobotSettings();
                toolNum = settings.tool_num;
                userNum = settings.user_num;
                WeldingConfig config = dbService->getWeldingConfig();
                searchDis = static_cast<float>(config.touch_distance);
                searchVel = static_cast<float>(config.touch_sensing_search_speed);
                retractDistance = static_cast<float>(config.touch_sensing_retract_distance);
                searchMoveDist = config.touch_sensing_move_distance;
            }
            searchDis = body.value("search_dis", searchDis);
            searchVel = body.value("search_vel", searchVel);
            retractDistance = body.value("retract_distance", retractDistance);
            ROBOT_STATE_PKG state = robotService.getState();
            double startX = state.tl_cur_pos[0];
            double curPos[6] = {
                state.tl_cur_pos[0], state.tl_cur_pos[1], state.tl_cur_pos[2],
                state.tl_cur_pos[3], state.tl_cur_pos[4], state.tl_cur_pos[5]
            };
            const double SEARCH_MOVE_DIST = searchMoveDist;
            double searchTarget[6] = {
                curPos[0] + direction * SEARCH_MOVE_DIST,
                curPos[1], curPos[2],
                curPos[3], curPos[4], curPos[5]
            };
            FLOG_INFO("TouchSensing", "find-dx START: dir=" + std::to_string(direction) + " searchDis=" + std::to_string(searchDis) + "mm vel=" + std::to_string(searchVel));
            std::cout << "[find-dx] Starting X search: dir=" << direction << ", searchDis=" << searchDis << "mm, vel=" << searchVel << std::endl;
            const float LUA_SEARCH_DIS = 30.0f;
            std::cout << "[find-dx] Using params: vel=" << searchVel << "% (from DB), dis=" << LUA_SEARCH_DIS << "mm" << std::endl;
            int wsStart = robotService.wireSearchStart(0, searchVel, LUA_SEARCH_DIS, 0, 10, 10, 0);
            std::cout << "[find-dx] WireSearchStart result=" << wsStart << " (0=success)" << std::endl;
            if (wsStart != 0) {
                FLOG_SDK_ERROR("wireSearchStart", wsStart, "find-dx WireSearchStart failed");
                std::cout << "[find-dx] ERROR: WireSearchStart failed with code " << wsStart << std::endl;
            }
            robotService.moveL(curPos, toolNum, userNum, searchVel, 3.0f, 100, -1.0f, 0, 0, nullptr, 0);
            {
                int motionDone = 0;
                int waitCnt = 0;
                while (waitCnt < 100) {
                    robotService.getMotionDone(&motionDone);
                    if (motionDone == 1) break;
                    std::this_thread::sleep_for(std::chrono::milliseconds(100));
                    waitCnt++;
                }
            }
            std::cout << "[find-dx] MoveL with search=1, move=" << SEARCH_MOVE_DIST << "mm, searchDis=" << LUA_SEARCH_DIS << "mm" << std::endl;
            int result = robotService.moveL(searchTarget, toolNum, userNum, searchVel, 3.0f, 100, -1.0f, 1, 0, nullptr, 0);
            std::cout << "[find-dx] MoveL(search=1) result=" << result << " (0=success)" << std::endl;
            int motionDone = 0;
            int waitCount = 0;
            const int MAX_WAIT = 300;
            while (waitCount < MAX_WAIT) {
                robotService.getMotionDone(&motionDone);
                if (motionDone == 1) {
                    std::cout << "[find-dx] Motion done after " << waitCount * 100 << "ms" << std::endl;
                    break;
                }
                std::this_thread::sleep_for(std::chrono::milliseconds(100));
                waitCount++;
            }
            if (waitCount >= MAX_WAIT) {
                FLOG_WARN("TouchSensing", "find-dx motion wait timeout after 30s");
                std::cout << "[find-dx] WARNING: Motion wait timeout!" << std::endl;
            }
            int wsEnd = robotService.wireSearchEnd(0, 10, 10, 0, 10, 10, 0);
            std::cout << "[find-dx] WireSearchEnd result=" << wsEnd << std::endl;
            if (result != 0) {
                FLOG_WARN("TouchSensing", "find-dx MoveL returned error code " + std::to_string(result));
                std::cout << "[find-dx] WARNING: MoveL returned error code " << result << std::endl;
            }
            state = robotService.getState();
            double deltaX = state.tl_cur_pos[0] - startX;
            double contactX = state.tl_cur_pos[0];
            FLOG_INFO("TouchSensing", "find-dx COMPLETE: deltaX=" + std::to_string(deltaX) + " contactX=" + std::to_string(contactX));
            std::cout << "[find-dx] Contact: X=" << contactX << ", deltaX=" << deltaX << std::endl;
            double retractPos[6] = {
                state.tl_cur_pos[0] - direction * retractDistance,
                state.tl_cur_pos[1],
                state.tl_cur_pos[2],
                state.tl_cur_pos[3], state.tl_cur_pos[4], state.tl_cur_pos[5]
            };
            std::cout << "[find-dx] Retracting " << retractDistance << "mm" << std::endl;
            robotService.moveL(retractPos, toolNum, userNum, 30.0f, 30.0f, 100, -1.0f, 0, 0, nullptr, 0);
            if (dbService && dbService->isConnected()) {
                std::ostringstream logDtl;
                logDtl << "delta_x=" << std::fixed << std::setprecision(3) << deltaX
                       << " start=" << startX << " end=" << contactX << " dir=" << direction;
                dbService->logDebug("TouchSensing", "FindDx", logDtl.str());
            }
            json response;
            response["status_code"] = 200;
            response["result"] = result;
            response["data"] = {
                {"delta_x", deltaX},
                {"start_x", startX},
                {"end_x", contactX},
                {"direction", direction},
                {"search_vel", searchVel},
                {"search_dis", searchDis},
                {"retract_distance", retractDistance},
                {"tool_num", toolNum},
                {"user_num", userNum}
            };
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            FLOG_ERROR("TouchSensing", std::string("find-dx exception: ") + e.what());
            res.set_content(HttpRouteHelpers::makeStatusResponse(500, {{"message", e.what()}}).dump(), "application/json");
        }
    });
    server.Post("/robot_sdk/move/find-dy", [&robotService, dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            int direction = body.value("direction", 1);
            int toolNum = 0, userNum = 0;
            float searchDis = 100.0f;
            float searchVel = 3.0f;
            float retractDistance = 10.0f;
            double searchMoveDist = 0.5;
            if (dbService && dbService->isConnected()) {
                RobotSettings settings = dbService->getRobotSettings();
                toolNum = settings.tool_num;
                userNum = settings.user_num;
                WeldingConfig config = dbService->getWeldingConfig();
                searchDis = static_cast<float>(config.touch_distance);
                searchVel = static_cast<float>(config.touch_sensing_search_speed);
                retractDistance = static_cast<float>(config.touch_sensing_retract_distance);
                searchMoveDist = config.touch_sensing_move_distance;
            }
            searchDis = body.value("search_dis", searchDis);
            searchVel = body.value("search_vel", searchVel);
            retractDistance = body.value("retract_distance", retractDistance);
            ROBOT_STATE_PKG state = robotService.getState();
            double startY = state.tl_cur_pos[1];
            double curPos[6] = {
                state.tl_cur_pos[0], state.tl_cur_pos[1], state.tl_cur_pos[2],
                state.tl_cur_pos[3], state.tl_cur_pos[4], state.tl_cur_pos[5]
            };
            const double SEARCH_MOVE_DIST = searchMoveDist;
            double searchTarget[6] = {
                curPos[0], curPos[1] + direction * SEARCH_MOVE_DIST, curPos[2],
                curPos[3], curPos[4], curPos[5]
            };
            const float LUA_SEARCH_DIS = 30.0f;
            FLOG_INFO("TouchSensing", "find-dy START: dir=" + std::to_string(direction) + " vel=" + std::to_string(searchVel));
            std::cout << "[find-dy] Using params: vel=" << searchVel << "% (from DB), dis=" << LUA_SEARCH_DIS << "mm" << std::endl;
            int wsStart = robotService.wireSearchStart(0, searchVel, LUA_SEARCH_DIS, 0, 10, 10, 0);
            if (wsStart != 0) {
                FLOG_SDK_ERROR("wireSearchStart", wsStart, "find-dy WireSearchStart failed");
            }
            std::cout << "[find-dy] WireSearchStart result=" << wsStart << " (0=success)" << std::endl;
            robotService.moveL(curPos, toolNum, userNum, searchVel, 3.0f, 100, -1.0f, 0, 0, nullptr, 0);
            {
                int motionDone = 0;
                int waitCnt = 0;
                while (waitCnt < 100) {
                    robotService.getMotionDone(&motionDone);
                    if (motionDone == 1) break;
                    std::this_thread::sleep_for(std::chrono::milliseconds(100));
                    waitCnt++;
                }
            }
            std::cout << "[find-dy] MoveL with search=1, move=" << SEARCH_MOVE_DIST << "mm, searchDis=" << LUA_SEARCH_DIS << "mm" << std::endl;
            int result = robotService.moveL(searchTarget, toolNum, userNum, searchVel, 3.0f, 100, -1.0f, 1, 0, nullptr, 0);
            std::cout << "[find-dy] MoveL(search=1) result=" << result << " (0=success)" << std::endl;
            int motionDone = 0;
            int waitCount = 0;
            const int MAX_WAIT = 300;
            while (waitCount < MAX_WAIT) {
                robotService.getMotionDone(&motionDone);
                if (motionDone == 1) {
                    std::cout << "[find-dy] Motion done after " << waitCount * 100 << "ms" << std::endl;
                    break;
                }
                std::this_thread::sleep_for(std::chrono::milliseconds(100));
                waitCount++;
            }
            if (waitCount >= MAX_WAIT) {
                FLOG_WARN("TouchSensing", "find-dy motion wait timeout after 30s");
                std::cout << "[find-dy] WARNING: Motion wait timeout!" << std::endl;
            }
            int wsEnd = robotService.wireSearchEnd(0, 10, 10, 0, 10, 10, 0);
            std::cout << "[find-dy] WireSearchEnd result=" << wsEnd << std::endl;
            state = robotService.getState();
            double deltaY = state.tl_cur_pos[1] - startY;
            double contactY = state.tl_cur_pos[1];
            FLOG_INFO("TouchSensing", "find-dy COMPLETE: deltaY=" + std::to_string(deltaY) + " contactY=" + std::to_string(contactY));
            std::cout << "[find-dy] Contact: Y=" << contactY << ", deltaY=" << deltaY << std::endl;
            double retractPos[6] = {
                state.tl_cur_pos[0],
                state.tl_cur_pos[1] - direction * retractDistance,
                state.tl_cur_pos[2],
                state.tl_cur_pos[3], state.tl_cur_pos[4], state.tl_cur_pos[5]
            };
            std::cout << "[find-dy] Retracting " << retractDistance << "mm" << std::endl;
            robotService.moveL(retractPos, toolNum, userNum, 30.0f, 30.0f, 100, -1.0f, 0, 0, nullptr, 0);
            if (dbService && dbService->isConnected()) {
                std::ostringstream logDtl;
                logDtl << "delta_y=" << std::fixed << std::setprecision(3) << deltaY
                       << " start=" << startY << " end=" << contactY << " dir=" << direction;
                dbService->logDebug("TouchSensing", "FindDy", logDtl.str());
            }
            json response;
            response["status_code"] = 200;
            response["result"] = result;
            response["data"] = {
                {"delta_y", deltaY},
                {"start_y", startY},
                {"end_y", contactY},
                {"direction", direction},
                {"search_vel", searchVel},
                {"search_dis", searchDis},
                {"retract_distance", retractDistance},
                {"tool_num", toolNum},
                {"user_num", userNum}
            };
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            FLOG_ERROR("TouchSensing", std::string("find-dy exception: ") + e.what());
            res.set_content(HttpRouteHelpers::makeStatusResponse(500, {{"message", e.what()}}).dump(), "application/json");
        }
    });
    server.Post("/robot_sdk/move/find-dz", [&robotService, dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        if (!robotService.isConnected()) {
            res.set_content(HttpRouteHelpers::makeStatusResponse(400, {{"message", "Robot not connected"}}).dump(), "application/json");
            return;
        }
        try {
            json body = json::parse(req.body);
            int direction = body.value("direction", -1);
            int toolNum = 0, userNum = 0;
            float searchDis = 100.0f;
            float searchVel = 3.0f;
            float retractDistance = 10.0f;
            double searchMoveDist = 0.5;
            if (dbService && dbService->isConnected()) {
                RobotSettings settings = dbService->getRobotSettings();
                toolNum = settings.tool_num;
                userNum = settings.user_num;
                WeldingConfig config = dbService->getWeldingConfig();
                searchDis = static_cast<float>(config.touch_distance);
                searchVel = static_cast<float>(config.touch_sensing_search_speed);
                retractDistance = static_cast<float>(config.touch_sensing_retract_distance);
                searchMoveDist = config.touch_sensing_move_distance;
            }
            searchDis = body.value("search_dis", searchDis);
            searchVel = body.value("search_vel", searchVel);
            retractDistance = body.value("retract_distance", retractDistance);
            ROBOT_STATE_PKG state = robotService.getState();
            double startZ = state.tl_cur_pos[2];
            double curPos[6] = {
                state.tl_cur_pos[0], state.tl_cur_pos[1], state.tl_cur_pos[2],
                state.tl_cur_pos[3], state.tl_cur_pos[4], state.tl_cur_pos[5]
            };
            const double SEARCH_MOVE_DIST = searchMoveDist;
            double searchTarget[6] = {
                curPos[0], curPos[1], curPos[2] + direction * SEARCH_MOVE_DIST,
                curPos[3], curPos[4], curPos[5]
            };
            const float LUA_SEARCH_DIS = 30.0f;
            FLOG_INFO("TouchSensing", "find-dz START: dir=" + std::to_string(direction) + " vel=" + std::to_string(searchVel));
            std::cout << "[find-dz] Using params: vel=" << searchVel << "% (from DB), dis=" << LUA_SEARCH_DIS << "mm" << std::endl;
            int wsStart = robotService.wireSearchStart(0, searchVel, LUA_SEARCH_DIS, 0, 10, 10, 0);
            if (wsStart != 0) {
                FLOG_SDK_ERROR("wireSearchStart", wsStart, "find-dz WireSearchStart failed");
            }
            std::cout << "[find-dz] WireSearchStart result=" << wsStart << " (0=success)" << std::endl;
            robotService.moveL(curPos, toolNum, userNum, searchVel, 3.0f, 100, -1.0f, 0, 0, nullptr, 0);
            {
                int motionDone = 0;
                int waitCnt = 0;
                while (waitCnt < 100) {
                    robotService.getMotionDone(&motionDone);
                    if (motionDone == 1) break;
                    std::this_thread::sleep_for(std::chrono::milliseconds(100));
                    waitCnt++;
                }
            }
            std::cout << "[find-dz] MoveL with search=1, move=" << SEARCH_MOVE_DIST << "mm, searchDis=" << LUA_SEARCH_DIS << "mm" << std::endl;
            int result = robotService.moveL(searchTarget, toolNum, userNum, searchVel, 3.0f, 100, -1.0f, 1, 0, nullptr, 0);
            std::cout << "[find-dz] MoveL(search=1) result=" << result << " (0=success)" << std::endl;
            int motionDone = 0;
            int waitCount = 0;
            const int MAX_WAIT = 300;
            while (waitCount < MAX_WAIT) {
                robotService.getMotionDone(&motionDone);
                if (motionDone == 1) {
                    std::cout << "[find-dz] Motion done after " << waitCount * 100 << "ms" << std::endl;
                    break;
                }
                std::this_thread::sleep_for(std::chrono::milliseconds(100));
                waitCount++;
            }
            if (waitCount >= MAX_WAIT) {
                FLOG_WARN("TouchSensing", "find-dz motion wait timeout after 30s");
                std::cout << "[find-dz] WARNING: Motion wait timeout!" << std::endl;
            }
            int wsEnd = robotService.wireSearchEnd(0, 10, 10, 0, 10, 10, 0);
            std::cout << "[find-dz] WireSearchEnd result=" << wsEnd << std::endl;
            state = robotService.getState();
            double deltaZ = state.tl_cur_pos[2] - startZ;
            double contactZ = state.tl_cur_pos[2];
            FLOG_INFO("TouchSensing", "find-dz COMPLETE: deltaZ=" + std::to_string(deltaZ) + " contactZ=" + std::to_string(contactZ));
            std::cout << "[find-dz] Contact: Z=" << contactZ << ", deltaZ=" << deltaZ << std::endl;
            double retractPos[6] = {
                state.tl_cur_pos[0],
                state.tl_cur_pos[1],
                state.tl_cur_pos[2] - direction * retractDistance,
                state.tl_cur_pos[3], state.tl_cur_pos[4], state.tl_cur_pos[5]
            };
            std::cout << "[find-dz] Retracting " << retractDistance << "mm" << std::endl;
            robotService.moveL(retractPos, toolNum, userNum, 30.0f, 30.0f, 100, -1.0f, 0, 0, nullptr, 0);
            if (dbService && dbService->isConnected()) {
                std::ostringstream logDtl;
                logDtl << "delta_z=" << std::fixed << std::setprecision(3) << deltaZ
                       << " start=" << startZ << " end=" << contactZ << " dir=" << direction;
                dbService->logDebug("TouchSensing", "FindDz", logDtl.str());
            }
            json response;
            response["status_code"] = 200;
            response["result"] = result;
            response["data"] = {
                {"delta_z", deltaZ},
                {"start_z", startZ},
                {"end_z", contactZ},
                {"direction", direction},
                {"search_vel", searchVel},
                {"search_dis", searchDis},
                {"retract_distance", retractDistance},
                {"tool_num", toolNum},
                {"user_num", userNum}
            };
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            FLOG_ERROR("TouchSensing", std::string("find-dz exception: ") + e.what());
            res.set_content(HttpRouteHelpers::makeStatusResponse(500, {{"message", e.what()}}).dump(), "application/json");
        }
    });
}
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include <filesystem>
#include <fstream>
#include <sstream>
#include <chrono>
#include <ctime>
#include <regex>
#include <algorithm>
#include <vector>
#include <cstdlib>
#ifdef _WIN32
#include <windows.h>
#endif
using json = nlohmann::json;
namespace fs = std::filesystem;
void registerSystemRoutes(httplib::Server& server, DatabaseService* dbService) {
    server.Get("/", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json data;
        data["status"] = "ok";
        data["service"] = "Robot Core HTTP API";
        data["version"] = "1.0.0";
        res.set_content(data.dump(), "application/json");
    });
    server.Get("/health", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json data;
        data["status"] = "ok";
        res.set_content(data.dump(), "application/json");
    });
    server.Options("/system/version", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        res.status = 200;
    });
    server.Get("/system/version", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json data;
        data["version"] = "1.0.0";
        data["name"] = "Robot Core";
        data["api_type"] = "cpp-http";
        res.set_content(data.dump(), "application/json");
    });
    server.Options(R"(/logs.*)", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        res.status = 200;
    });
    server.Post("/logs", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json response;
        try {
            json body = json::parse(req.body);
            if (dbService) {
                std::string level = body.value("level", "info");
                std::string source = body.value("source", "frontend");
                std::string page = body.value("page", "");
                std::string action = body.value("action", "");
                std::string message = body.value("message", "");
                double duration_ms = body.value("duration_ms", -1.0);
                std::string error_code = body.value("error_code", "");
                std::string error_stack = body.value("error_stack", "");
                json data = body.contains("data") ? body["data"] : json(nullptr);
                dbService->logApp(level, source, page, action, message, data, duration_ms, error_code, error_stack);
            }
            response["status_code"] = 200;
            response["message"] = "ok";
        } catch (const std::exception& e) {
            response["status_code"] = 400;
            response["message"] = e.what();
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Post("/logs/batch", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json response;
        try {
            json body = json::parse(req.body);
            int count = 0;
            if (dbService && body.contains("logs") && body["logs"].is_array()) {
                json logs = body["logs"];
                count = logs.size();
                dbService->logAppBatch(logs);
            }
            response["status_code"] = 200;
            response["message"] = "ok";
            response["received"] = count;
        } catch (const std::exception& e) {
            response["status_code"] = 400;
            response["message"] = e.what();
            response["received"] = 0;
        }
        res.set_content(response.dump(), "application/json");
    });
#ifdef _WIN32
    server.Get("/api/logs/download.zip", [](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        try {
            int days = 7;
            if (req.has_param("days")) days = std::max(1, std::stoi(req.get_param_value("days")));
            std::string logDir = FileLogger::instance().getLogDir();
            const char* localAppData = std::getenv("LOCALAPPDATA");
            std::string tmpDir = (localAppData ? std::string(localAppData) : ".") + "\\VoT";
            std::error_code ec;
            fs::create_directories(tmpDir, ec);
            auto now = std::chrono::system_clock::now();
            auto t = std::chrono::system_clock::to_time_t(now);
            std::tm tm_local{};
            localtime_s(&tm_local, &t);
            char ts[32] = {0};
            std::strftime(ts, sizeof(ts), "%Y%m%d_%H%M%S", &tm_local);
            std::string zipPath = tmpDir + "\\vot_logs_" + ts + ".zip";
            std::string script =
                "$ErrorActionPreference='Stop'; "
                "$cut=(Get-Date).AddDays(-" + std::to_string(days) + "); "
                "$files=Get-ChildItem -Path '" + logDir + "' -Filter '*.log' | "
                "Where-Object { $_.LastWriteTime -ge $cut }; "
                "if ($files.Count -eq 0) { exit 2; } "
                "$stage = Join-Path $env:TEMP ('vot_logs_stage_' + [guid]::NewGuid().ToString('N')); "
                "New-Item -ItemType Directory -Force -Path $stage | Out-Null; "
                "foreach ($f in $files) { "
                "  $dst = Join-Path $stage $f.Name; "
                "  try { $src=[System.IO.File]::Open($f.FullName,'Open','Read','ReadWrite'); "
                "        $out=[System.IO.File]::Create($dst); "
                "        $src.CopyTo($out); $out.Close(); $src.Close() } catch {} "
                "}; "
                "$st=Get-ChildItem -Path $stage -Filter '*.log'; "
                "if ($st.Count -eq 0) { exit 3 }; "
                "Compress-Archive -Path ($st.FullName) -DestinationPath '" + zipPath + "' -Force; "
                "Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue; ";
            std::string psPath;
            {
                char* sysRoot = std::getenv("SystemRoot");
                std::string root = sysRoot ? sysRoot : "C:\\Windows";
                psPath = root + "\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
            }
            std::string cmdLine = "\"" + psPath + "\" -NoProfile -WindowStyle Hidden "
                                  "-ExecutionPolicy Bypass -Command \"" + script + "\"";
            std::vector<char> mutCmd(cmdLine.begin(), cmdLine.end());
            mutCmd.push_back('\0');
            STARTUPINFOA si{}; si.cb = sizeof(si);
            si.dwFlags = STARTF_USESHOWWINDOW;
            si.wShowWindow = SW_HIDE;
            PROCESS_INFORMATION pi{};
            int rc = -1;
            if (CreateProcessA(nullptr, mutCmd.data(), nullptr, nullptr, FALSE,
                               CREATE_NO_WINDOW, nullptr, nullptr, &si, &pi)) {
                WaitForSingleObject(pi.hProcess, 60000);
                DWORD ec2 = 1;
                GetExitCodeProcess(pi.hProcess, &ec2);
                CloseHandle(pi.hProcess);
                CloseHandle(pi.hThread);
                rc = static_cast<int>(ec2);
            }
            if (rc != 0) {
                res.status = 500;
                res.set_content(HttpRouteHelpers::makeErrorResponse(500,
                    "zip 생성 실패 (PowerShell rc=" + std::to_string(rc) + ")"), "application/json");
                return;
            }
            std::ifstream f(zipPath, std::ios::binary);
            if (!f) {
                res.status = 500;
                res.set_content(HttpRouteHelpers::makeErrorResponse(500, "zip 파일 없음"), "application/json");
                return;
            }
            std::stringstream ss;
            ss << f.rdbuf();
            res.set_header("Content-Disposition",
                "attachment; filename=\"vot_logs_" + std::string(ts) + ".zip\"");
            res.set_content(ss.str(), "application/zip");
            std::error_code remEc;
            fs::remove(zipPath, remEc);
        } catch (const std::exception& e) {
            res.status = 500;
            res.set_content(HttpRouteHelpers::makeErrorResponse(500, e.what()), "application/json");
        }
    });
    server.Post("/api/logs/send-email", [](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        try {
            json body = req.body.empty() ? json::object() : json::parse(req.body);
            std::string recipient = body.value("recipient", "the@aeokorea.com");
            int days = body.value("days", 7);
            int maxFiles = body.value("max_files", 1);
            std::string note = body.value("note", "");
            static const std::regex emailPattern(R"(^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$)");
            if (!std::regex_match(recipient, emailPattern)) {
                res.status = 400;
                res.set_content(HttpRouteHelpers::makeErrorResponse(400, "invalid recipient email"), "application/json");
                return;
            }
            std::string logDir = FileLogger::instance().getLogDir();
            const char* localAppData = std::getenv("LOCALAPPDATA");
            std::string tmpDir = (localAppData ? std::string(localAppData) : ".") + "\\VoT";
            std::error_code ec;
            fs::create_directories(tmpDir, ec);
            auto now = std::chrono::system_clock::now();
            auto t = std::chrono::system_clock::to_time_t(now);
            std::tm tm_local{};
            localtime_s(&tm_local, &t);
            char ts[32] = {0};
            std::strftime(ts, sizeof(ts), "%Y%m%d_%H%M%S", &tm_local);
            std::string zipPath = tmpDir + "\\vot_logs_" + ts + ".zip";
            std::string ps1Path = tmpDir + "\\vot_send_" + ts + ".ps1";
            std::string outPath = tmpDir + "\\vot_send_" + ts + ".out.txt";
            auto esc = [](const std::string& s) {
                std::string out; out.reserve(s.size());
                for (char c : s) {
                    if (c == '\'') out += "''";
                    else out += c;
                }
                return out;
            };
            auto& cfg = ConfigService::instance();
            std::string smtpHost = cfg.get("smtp.host", "smtp.xos.kr");
            std::string smtpPort = cfg.get("smtp.port", "465");
            std::string smtpUser = cfg.get("smtp.user", "");
            std::string smtpPass = cfg.get("smtp.password", "");
            std::string smtpFrom = cfg.get("smtp.from", smtpUser);
            if (smtpUser.empty() || smtpPass.empty()) {
                res.status = 500;
                res.set_content(HttpRouteHelpers::makeErrorResponse(500,
                    "SMTP 미설정: 서버 config.ini의 [smtp] 섹션에 user/password를 설정하세요."), "application/json");
                return;
            }
            std::string subject = "[VoT] 진단 로그 " + std::string(ts);
            std::string bodyText = "VoT 로봇 용접 시스템 로그입니다.\n\n메모: " + note +
                                   "\n최근 " + std::to_string(maxFiles) + "개 파일.\n발송시각: " + ts;
            std::ostringstream ss;
            ss << "$ErrorActionPreference='Stop'\n";
            ss << "$outPath='" << esc(outPath) << "'\n";
            ss << "function Write-Out($t) { Add-Content -LiteralPath $outPath -Value $t -Encoding UTF8 }\n";
            ss << "Set-Content -LiteralPath $outPath -Value '' -Encoding UTF8\n";
            ss << "try {\n";
            ss << "  $cut = (Get-Date).AddDays(-" << days << ")\n";
            ss << "  $files = Get-ChildItem -Path '" << esc(logDir) << "' -Filter '*.log' | "
                  "Where-Object { $_.LastWriteTime -ge $cut } | "
                  "Sort-Object LastWriteTime -Descending | "
                  "Select-Object -First " << maxFiles << "\n";
            ss << "  if ($files.Count -eq 0) { throw 'no log files in range' }\n";
            ss << "  $stage = Join-Path $env:TEMP ('vot_logs_stage_' + [guid]::NewGuid().ToString('N'))\n";
            ss << "  New-Item -ItemType Directory -Force -Path $stage | Out-Null\n";
            ss << "  foreach ($f in $files) {\n";
            ss << "    $dst = Join-Path $stage $f.Name\n";
            ss << "    try {\n";
            ss << "      $src = [System.IO.File]::Open($f.FullName, 'Open', 'Read', 'ReadWrite')\n";
            ss << "      $out = [System.IO.File]::Create($dst)\n";
            ss << "      $src.CopyTo($out); $out.Close(); $src.Close()\n";
            ss << "    } catch { Write-Out ('SKIP: ' + $f.Name + ' (' + $_.Exception.Message + ')') }\n";
            ss << "  }\n";
            ss << "  $staged = Get-ChildItem -Path $stage -Filter '*.log'\n";
            ss << "  if ($staged.Count -eq 0) { throw 'all log files locked / copy failed' }\n";
            ss << "  Compress-Archive -Path ($staged.FullName) -DestinationPath '" << esc(zipPath) << "' -Force\n";
            ss << "  Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue\n";
            ss << "  $client = New-Object System.Net.Sockets.TcpClient\n";
            ss << "  $client.ReceiveTimeout = 30000; $client.SendTimeout = 30000\n";
            ss << "  $client.Connect('" << esc(smtpHost) << "', " << smtpPort << ")\n";
            ss << "  $ssl = New-Object System.Net.Security.SslStream($client.GetStream(), $false, { $true })\n";
            ss << "  $ssl.AuthenticateAsClient('" << esc(smtpHost) << "')\n";
            ss << "  $reader = New-Object System.IO.StreamReader($ssl, [System.Text.Encoding]::ASCII)\n";
            ss << "  $writer = New-Object System.IO.StreamWriter($ssl, [System.Text.Encoding]::ASCII)\n";
            ss << "  $writer.NewLine = \"`r`n\"; $writer.AutoFlush = $true\n";
            ss << "  function ReadResp { while ($true) { $l = $reader.ReadLine(); if ($null -eq $l) { return $null }; "
                  "if ($l.Length -ge 4 -and $l[3] -eq ' ') { return $l } } }\n";
            ss << "  function SendCmd($c) { $writer.WriteLine($c) }\n";
            ss << "  function B64($s) { return [Convert]::ToBase64String([System.Text.Encoding]::ASCII.GetBytes($s)) }\n";
            ss << "  function B64U($s) { return [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($s)) }\n";
            ss << "  $g = ReadResp\n";
            ss << "  SendCmd 'EHLO localhost'\n";
            ss << "  while ($true) { $l = $reader.ReadLine(); if ($l.Length -ge 4 -and $l[3] -eq ' ') { break } }\n";
            ss << "  SendCmd 'AUTH LOGIN'; ReadResp | Out-Null\n";
            ss << "  SendCmd (B64 '" << esc(smtpUser) << "'); ReadResp | Out-Null\n";
            ss << "  SendCmd (B64 '" << esc(smtpPass) << "'); $rA = ReadResp\n";
            ss << "  if ($rA -notmatch '^235') { throw ('AUTH FAIL: ' + $rA) }\n";
            ss << "  SendCmd 'MAIL FROM:<" << esc(smtpFrom) << ">'; $r1 = ReadResp\n";
            ss << "  if ($r1 -notmatch '^250') { throw ('MAIL FROM FAIL: ' + $r1) }\n";
            ss << "  SendCmd 'RCPT TO:<" << esc(recipient) << ">'; $r2 = ReadResp\n";
            ss << "  if ($r2 -notmatch '^250') { throw ('RCPT FAIL: ' + $r2) }\n";
            ss << "  SendCmd 'DATA'; $r3 = ReadResp\n";
            ss << "  if ($r3 -notmatch '^354') { throw ('DATA FAIL: ' + $r3) }\n";
            ss << "  $boundary = '----VoTBoundary_' + [Guid]::NewGuid().ToString('N')\n";
            ss << "  $subjB64 = '=?UTF-8?B?' + (B64U '" << esc(subject) << "') + '?='\n";
            ss << "  $writer.WriteLine('From: " << esc(smtpFrom) << "')\n";
            ss << "  $writer.WriteLine('To: " << esc(recipient) << "')\n";
            ss << "  $writer.WriteLine('Subject: ' + $subjB64)\n";
            ss << "  $writer.WriteLine('MIME-Version: 1.0')\n";
            ss << "  $writer.WriteLine('Content-Type: multipart/mixed; boundary=\"' + $boundary + '\"')\n";
            ss << "  $writer.WriteLine('')\n";
            ss << "  $writer.WriteLine('--' + $boundary)\n";
            ss << "  $writer.WriteLine('Content-Type: text/plain; charset=UTF-8')\n";
            ss << "  $writer.WriteLine('Content-Transfer-Encoding: base64')\n";
            ss << "  $writer.WriteLine('')\n";
            ss << "  $writer.WriteLine([Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes(@'\n"
               << bodyText << "\n'@)))\n";
            ss << "  $attBytes = [System.IO.File]::ReadAllBytes('" << esc(zipPath) << "')\n";
            ss << "  $attB64 = [Convert]::ToBase64String($attBytes)\n";
            ss << "  $attName = Split-Path '" << esc(zipPath) << "' -Leaf\n";
            ss << "  $writer.WriteLine('--' + $boundary)\n";
            ss << "  $writer.WriteLine('Content-Type: application/zip; name=\"' + $attName + '\"')\n";
            ss << "  $writer.WriteLine('Content-Transfer-Encoding: base64')\n";
            ss << "  $writer.WriteLine('Content-Disposition: attachment; filename=\"' + $attName + '\"')\n";
            ss << "  $writer.WriteLine('')\n";
            ss << "  for ($i = 0; $i -lt $attB64.Length; $i += 76) {\n";
            ss << "    $len = [Math]::Min(76, $attB64.Length - $i)\n";
            ss << "    $writer.WriteLine($attB64.Substring($i, $len))\n";
            ss << "  }\n";
            ss << "  $writer.WriteLine('--' + $boundary + '--')\n";
            ss << "  $writer.WriteLine('.')\n";
            ss << "  $rEnd = ReadResp\n";
            ss << "  if ($rEnd -notmatch '^250') { throw ('SEND END FAIL: ' + $rEnd) }\n";
            ss << "  SendCmd 'QUIT'; ReadResp | Out-Null\n";
            ss << "  $ssl.Close(); $client.Close()\n";
            ss << "  Remove-Item '" << esc(zipPath) << "' -Force -ErrorAction SilentlyContinue\n";
            ss << "  Write-Out ('OK: ' + $rEnd)\n";
            ss << "} catch {\n";
            ss << "  Write-Out ('ERR: ' + $_.Exception.Message)\n";
            ss << "  if ($_.Exception.InnerException) { Write-Out ('INNER: ' + $_.Exception.InnerException.Message) }\n";
            ss << "  exit 1\n";
            ss << "}\n";
            {
                std::ofstream ofs(ps1Path, std::ios::binary);
                const char bom[3] = { (char)0xEF, (char)0xBB, (char)0xBF };
                ofs.write(bom, 3);
                ofs << ss.str();
            }
            std::string psPath;
            {
                char* sysRoot = std::getenv("SystemRoot");
                std::string root = sysRoot ? sysRoot : "C:\\Windows";
                psPath = root + "\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
            }
            FLOG_INFO("Logs/SendEmail", "to=" + recipient + " days=" + std::to_string(days));
            std::string cmdLine = "\"" + psPath + "\" -NoProfile -WindowStyle Hidden "
                                  "-ExecutionPolicy Bypass -File \"" + ps1Path + "\"";
            std::vector<char> mutCmd(cmdLine.begin(), cmdLine.end());
            mutCmd.push_back('\0');
            STARTUPINFOA si{}; si.cb = sizeof(si);
            si.dwFlags = STARTF_USESHOWWINDOW;
            si.wShowWindow = SW_HIDE;
            PROCESS_INFORMATION pi{};
            int rc = -1;
            BOOL ok = CreateProcessA(nullptr, mutCmd.data(), nullptr, nullptr, FALSE,
                                     CREATE_NO_WINDOW, nullptr, nullptr, &si, &pi);
            if (ok) {
                WaitForSingleObject(pi.hProcess, 120000);
                DWORD exitCode = 1;
                GetExitCodeProcess(pi.hProcess, &exitCode);
                CloseHandle(pi.hProcess);
                CloseHandle(pi.hThread);
                rc = static_cast<int>(exitCode);
            } else {
                FLOG_ERROR("Logs/SendEmail", "CreateProcess 실패: " + std::to_string(GetLastError()));
            }
            std::string output;
            {
                std::ifstream ofs(outPath, std::ios::binary);
                std::stringstream o;
                o << ofs.rdbuf();
                output = o.str();
                if (output.size() >= 3 &&
                    (unsigned char)output[0] == 0xEF &&
                    (unsigned char)output[1] == 0xBB &&
                    (unsigned char)output[2] == 0xBF) {
                    output = output.substr(3);
                }
            }
            fs::remove(ps1Path, ec);
            fs::remove(outPath, ec);
            if (rc != 0) {
                FLOG_ERROR("Logs/SendEmail", "rc=" + std::to_string(rc) + " out=" + output);
                std::string msg = "이메일 발송 실패 (rc=" + std::to_string(rc) + "). " +
                                  (output.empty() ? "출력 없음. SMTP 설정/네트워크 확인." : output);
                res.set_content(HttpRouteHelpers::makeErrorResponse(500, msg), "application/json");
                return;
            }
            json okJson;
            okJson["recipient"] = recipient;
            okJson["days"] = days;
            okJson["output"] = output;
            res.set_content(HttpRouteHelpers::makeSuccessResponse(okJson.dump()), "application/json");
        } catch (const std::exception& e) {
            res.set_content(HttpRouteHelpers::makeErrorResponse(500, e.what()), "application/json");
        }
    });
#endif
    server.Get("/logs", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json response;
        try {
            int limit = 100;
            std::string level = "";
            std::string source = "";
            if (req.has_param("limit")) {
                limit = std::stoi(req.get_param_value("limit"));
            }
            if (req.has_param("level")) {
                level = req.get_param_value("level");
            }
            if (req.has_param("source")) {
                source = req.get_param_value("source");
            }
            json logs = dbService ? dbService->getAppLogs(limit, level, source) : json::array();
            response["status_code"] = 200;
            response["data"] = logs;
        } catch (const std::exception& e) {
            response["status_code"] = 500;
            response["message"] = e.what();
            response["data"] = json::array();
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Options(R"(/users.*)", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        res.status = 200;
    });
    server.Get("/users", [dbService](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json response;
        try {
            if (!dbService) {
                throw std::runtime_error("Database service not available");
            }
            json users = dbService->getUsers();
            response["status_code"] = 200;
            response["data"] = users;
        } catch (const std::exception& e) {
            response["status_code"] = 500;
            response["message"] = e.what();
            response["data"] = json::array();
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Post("/users", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json response;
        try {
            if (!dbService) {
                throw std::runtime_error("Database service not available");
            }
            json body = json::parse(req.body);
            std::string username = body.value("username", "");
            std::string password = body.value("password", "");
            std::string name = body.value("name", "");
            std::string email = body.value("email", "");
            std::string role = body.value("role", "operator");
            if (username.empty() || password.empty() || name.empty()) {
                response["status_code"] = 400;
                response["message"] = "username, password, name are required";
            } else {
                int userId = dbService->createUser(username, password, name, email, role);
                if (userId > 0) {
                    response["status_code"] = 200;
                    response["message"] = "User created";
                    response["data"] = json{{"id", userId}};
                } else {
                    response["status_code"] = 400;
                    response["message"] = "Failed to create user (username may already exist)";
                }
            }
        } catch (const std::exception& e) {
            response["status_code"] = 500;
            response["message"] = e.what();
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Put(R"(/users/(\d+))", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json response;
        try {
            if (!dbService) {
                throw std::runtime_error("Database service not available");
            }
            int userId = std::stoi(req.matches[1]);
            json body = json::parse(req.body);
            bool success = dbService->updateUser(userId, body);
            if (success) {
                response["status_code"] = 200;
                response["message"] = "User updated";
            } else {
                response["status_code"] = 404;
                response["message"] = "User not found";
            }
        } catch (const std::exception& e) {
            response["status_code"] = 500;
            response["message"] = e.what();
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Delete(R"(/users/(\d+))", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json response;
        try {
            if (!dbService) {
                throw std::runtime_error("Database service not available");
            }
            int userId = std::stoi(req.matches[1]);
            bool success = dbService->deleteUser(userId);
            if (success) {
                response["status_code"] = 200;
                response["message"] = "User deleted";
            } else {
                response["status_code"] = 404;
                response["message"] = "User not found";
            }
        } catch (const std::exception& e) {
            response["status_code"] = 500;
            response["message"] = e.what();
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Options(R"(/auth.*)", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        res.status = 200;
    });
    server.Post("/auth/login", [dbService](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json response;
        try {
            if (!dbService) {
                throw std::runtime_error("Database service not available");
            }
            json body = json::parse(req.body);
            std::string username = body.value("username", "");
            std::string password = body.value("password", "");
            json user = dbService->authenticateUser(username, password);
            if (!user.is_null()) {
                std::string token = AuthService::instance().createSession(
                    user["id"].get<int>(),
                    user["username"].get<std::string>(),
                    user["role"].get<std::string>()
                );
                response["status_code"] = 200;
                response["message"] = "Login successful";
                user["accessToken"] = token;
                user["refreshToken"] = token;
                response["data"] = user;
            } else {
                response["status_code"] = 401;
                response["message"] = "Invalid username or password";
            }
        } catch (const std::exception& e) {
            response["status_code"] = 500;
            response["message"] = e.what();
        }
        res.set_content(response.dump(), "application/json");
    });
    server.Post("/auth/logout", [](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json response;
        if (req.has_header("Authorization")) {
            std::string authHeader = req.get_header_value("Authorization");
            if (authHeader.find("Bearer ") == 0) {
                std::string token = authHeader.substr(7);
                AuthService::instance().removeSession(token);
            }
        }
        response["status_code"] = 200;
        response["message"] = "Logout successful";
        res.set_content(response.dump(), "application/json");
    });
}
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include <atomic>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <mutex>
#include <sstream>
#include <thread>
#include <chrono>
#ifdef _WIN32
#include <windows.h>
#endif
using json = nlohmann::json;
namespace {
enum class DownloadState { Idle, Running, Done, Error };
struct DownloadStatus {
    std::atomic<DownloadState> state{DownloadState::Idle};
    std::mutex mtx;
    std::string path;
    std::string expectedSha;
    std::string actualSha;
    std::string errorMessage;
    uint64_t totalBytes = 0;
    uint64_t downloadedBytes = 0;
};
DownloadStatus g_download;
std::string getUpdaterTempDir() {
#ifdef _WIN32
    const char* localAppData = std::getenv("LOCALAPPDATA");
    std::string base = localAppData ? localAppData : ".";
    return base + "\\VoT";
#else
    return "/tmp/VoT";
#endif
}
std::string stateToString(DownloadState s) {
    switch (s) {
        case DownloadState::Idle: return "idle";
        case DownloadState::Running: return "running";
        case DownloadState::Done: return "done";
        case DownloadState::Error: return "error";
    }
    return "unknown";
}
#ifdef _WIN32
std::string findPowerShell() {
    char* sysRoot = std::getenv("SystemRoot");
    std::string root = sysRoot ? sysRoot : "C:\\Windows";
    return root + "\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
}
bool runPowerShellScript(const std::string& script) {
    std::string psPath = findPowerShell();
    std::string cmdLine = "\"" + psPath + "\" -NoProfile -ExecutionPolicy Bypass -Command \"" + script + "\"";
    STARTUPINFOA si{};
    PROCESS_INFORMATION pi{};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    std::vector<char> mutableCmd(cmdLine.begin(), cmdLine.end());
    mutableCmd.push_back('\0');
    BOOL ok = CreateProcessA(
        nullptr, mutableCmd.data(), nullptr, nullptr, FALSE,
        CREATE_NO_WINDOW, nullptr, nullptr, &si, &pi
    );
    if (!ok) return false;
    WaitForSingleObject(pi.hProcess, INFINITE);
    DWORD exitCode = 0;
    GetExitCodeProcess(pi.hProcess, &exitCode);
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    return exitCode == 0;
}
std::string computeSha256(const std::string& filePath) {
    std::string tempOut = getUpdaterTempDir() + "\\_sha.txt";
    std::string script =
        "(Get-FileHash '" + filePath + "' -Algorithm SHA256).Hash.ToLower() "
        "| Out-File -Encoding ascii '" + tempOut + "'";
    if (!runPowerShellScript(script)) return "";
    std::ifstream f(tempOut);
    std::string hash;
    std::getline(f, hash);
    while (!hash.empty() && (hash.back() == '\r' || hash.back() == '\n' || hash.back() == ' ')) {
        hash.pop_back();
    }
    std::filesystem::remove(tempOut);
    return hash;
}
void runDownload(const std::string& url, const std::string& destPath) {
    std::string script =
        "$ProgressPreference='SilentlyContinue'; "
        "try { "
        "Invoke-WebRequest -Uri '" + url + "' -OutFile '" + destPath + "' -UseBasicParsing; "
        "exit 0 "
        "} catch { "
        "Write-Error $_.Exception.Message; "
        "exit 1 "
        "}";
    bool ok = runPowerShellScript(script);
    std::lock_guard<std::mutex> lock(g_download.mtx);
    if (!ok) {
        g_download.state = DownloadState::Error;
        g_download.errorMessage = "PowerShell 다운로드 실패";
        FLOG_ERROR("Updater", std::string("Download failed: ") + url);
        return;
    }
    std::error_code ec;
    auto sz = std::filesystem::file_size(destPath, ec);
    if (ec || sz == 0) {
        g_download.state = DownloadState::Error;
        g_download.errorMessage = "다운로드된 파일이 비어있음";
        return;
    }
    g_download.downloadedBytes = sz;
    g_download.totalBytes = sz;
    if (!g_download.expectedSha.empty()) {
        std::string actual = computeSha256(destPath);
        g_download.actualSha = actual;
        if (actual != g_download.expectedSha) {
            g_download.state = DownloadState::Error;
            g_download.errorMessage = "SHA-256 불일치\n예상: " + g_download.expectedSha +
                                     "\n실제: " + actual;
            FLOG_ERROR("Updater", "SHA mismatch: expected=" + g_download.expectedSha +
                                  " actual=" + actual);
            return;
        }
        FLOG_INFO("Updater", "SHA-256 검증 통과: " + actual);
    }
    g_download.state = DownloadState::Done;
    FLOG_INFO("Updater", std::string("Download complete: ") + destPath +
                         " (" + std::to_string(sz) + " bytes)");
}
void monitorDownloadProgress(const std::string& destPath) {
    while (g_download.state == DownloadState::Running) {
        std::error_code ec;
        auto sz = std::filesystem::file_size(destPath, ec);
        if (!ec) {
            std::lock_guard<std::mutex> lock(g_download.mtx);
            g_download.downloadedBytes = sz;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(300));
    }
}
struct InstallerSearchCtx {
    HWND foundWindow;
};
BOOL CALLBACK findInstallerWindowProc(HWND hwnd, LPARAM lParam) {
    if (!IsWindowVisible(hwnd)) return TRUE;
    if (GetWindow(hwnd, GW_OWNER) != nullptr) return TRUE;
    char title[256] = {0};
    GetWindowTextA(hwnd, title, sizeof(title));
    std::string titleStr(title);
    char className[256] = {0};
    GetClassNameA(hwnd, className, sizeof(className));
    std::string classStr(className);
    bool isInstaller =
        classStr == "TWizardForm" ||
        classStr == "TMainForm" ||
        titleStr.find("Setup") != std::string::npos ||
        titleStr.find("VoT") != std::string::npos ||
        titleStr.find("Robot Welding") != std::string::npos ||
        titleStr.find("설치") != std::string::npos;
    if (isInstaller) {
        reinterpret_cast<InstallerSearchCtx*>(lParam)->foundWindow = hwnd;
        FLOG_INFO("Updater", std::string("인스톨러 창 발견: class=") + classStr +
                              " title=" + titleStr);
        return FALSE;
    }
    return TRUE;
}
void forceBringToFront(HWND hwnd) {
    keybd_event(VK_MENU, 0, 0, 0);
    keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);
    HWND fgWnd = GetForegroundWindow();
    DWORD fgThread = fgWnd ? GetWindowThreadProcessId(fgWnd, nullptr) : 0;
    DWORD targetThread = GetWindowThreadProcessId(hwnd, nullptr);
    DWORD myThread = GetCurrentThreadId();
    AttachThreadInput(myThread, fgThread, TRUE);
    AttachThreadInput(targetThread, fgThread, TRUE);
    if (IsIconic(hwnd)) {
        ShowWindow(hwnd, SW_RESTORE);
    } else {
        ShowWindow(hwnd, SW_SHOWNORMAL);
    }
    SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0,
                 SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
    SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0,
                 SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
    BringWindowToTop(hwnd);
    SetForegroundWindow(hwnd);
    SetActiveWindow(hwnd);
    SetFocus(hwnd);
    AttachThreadInput(myThread, fgThread, FALSE);
    AttachThreadInput(targetThread, fgThread, FALSE);
}
void bringInstallerToForeground() {
    InstallerSearchCtx ctx{nullptr};
    for (int i = 0; i < 200; ++i) {
        EnumWindows(findInstallerWindowProc, reinterpret_cast<LPARAM>(&ctx));
        if (ctx.foundWindow) {
            forceBringToFront(ctx.foundWindow);
            Sleep(500);
            if (GetForegroundWindow() != ctx.foundWindow) {
                FLOG_INFO("Updater", "전면 배치 재시도");
                forceBringToFront(ctx.foundWindow);
            }
            FLOG_INFO("Updater", "인스톨러 창 전면 배치 완료");
            return;
        }
        Sleep(100);
    }
    FLOG_WARN("Updater", "인스톨러 창 탐색 20초 초과 — 기본 동작");
}
bool launchInstaller(const std::string& path) {
    AllowSetForegroundWindow(ASFW_ANY);
    STARTUPINFOA si{};
    PROCESS_INFORMATION pi{};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_SHOWNORMAL;
    std::string cmdLine = "\"" + path + "\"";
    std::vector<char> mutableCmd(cmdLine.begin(), cmdLine.end());
    mutableCmd.push_back('\0');
    BOOL ok = CreateProcessA(
        nullptr, mutableCmd.data(), nullptr, nullptr, FALSE,
        0, nullptr, nullptr, &si, &pi
    );
    if (!ok) {
        FLOG_ERROR("Updater", std::string("CreateProcessA 실패: ") + std::to_string(GetLastError()));
        return false;
    }
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    std::thread(bringInstallerToForeground).detach();
    return true;
}
#else
bool launchInstaller(const std::string&) { return false; }
void runDownload(const std::string&, const std::string&) {}
void monitorDownloadProgress(const std::string&) {}
#endif
}
void registerUpdaterRoutes(
    httplib::Server& server,
    RobotService&
) {
    server.Options(R"(/updater.*)", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        res.status = 200;
    });
    server.Get("/updater/busy", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        json r = {{"busy", false}};
        res.set_content(r.dump(), "application/json");
    });
    server.Post("/updater/download", [](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        try {
            if (g_download.state == DownloadState::Running) {
                res.set_content(
                    HttpRouteHelpers::makeStatusResponse(409, {{"message", "이미 다운로드 진행 중"}}).dump(),
                    "application/json"
                );
                return;
            }
            json body = json::parse(req.body);
            std::string url = body.value("url", "");
            std::string filename = body.value("filename", "installer.exe");
            std::string expectedSha = body.value("expected_sha256", "");
            if (url.empty()) {
                res.set_content(
                    HttpRouteHelpers::makeStatusResponse(400, {{"message", "url이 필요합니다"}}).dump(),
                    "application/json"
                );
                return;
            }
            size_t pos = filename.find_last_of("\\/");
            if (pos != std::string::npos) filename = filename.substr(pos + 1);
            std::string dir = getUpdaterTempDir();
            std::error_code ec;
            std::filesystem::create_directories(dir, ec);
            std::string destPath = dir + "\\" + filename;
            {
                std::lock_guard<std::mutex> lock(g_download.mtx);
                g_download.path = destPath;
                g_download.expectedSha = expectedSha;
                g_download.actualSha.clear();
                g_download.errorMessage.clear();
                g_download.totalBytes = body.value("total_size", uint64_t(0));
                g_download.downloadedBytes = 0;
            }
            g_download.state = DownloadState::Running;
            FLOG_INFO("Updater", std::string("다운로드 시작: ") + url + " → " + destPath);
            std::thread([url, destPath]() {
                std::thread monitor([destPath]() { monitorDownloadProgress(destPath); });
                runDownload(url, destPath);
                monitor.join();
            }).detach();
            res.set_content(
                HttpRouteHelpers::makeStatusResponse(200, {
                    {"message", "다운로드 시작됨"},
                    {"path", destPath}
                }).dump(),
                "application/json"
            );
        } catch (const std::exception& e) {
            FLOG_ERROR("Updater", std::string("다운로드 요청 예외: ") + e.what());
            res.set_content(
                HttpRouteHelpers::makeStatusResponse(500, {{"message", e.what()}}).dump(),
                "application/json"
            );
        }
    });
    server.Get("/updater/download/progress", [](const httplib::Request&, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        std::lock_guard<std::mutex> lock(g_download.mtx);
        json r = {
            {"state", stateToString(g_download.state)},
            {"downloaded", g_download.downloadedBytes},
            {"total", g_download.totalBytes},
            {"path", g_download.path},
            {"error", g_download.errorMessage},
            {"sha256", g_download.actualSha}
        };
        res.set_content(r.dump(), "application/json");
    });
    server.Post("/updater/launch", [](const httplib::Request& req, httplib::Response& res) {
        HttpRouteHelpers::setCorsHeaders(res);
        try {
            json body = json::parse(req.body);
            std::string path = body.value("path", "");
            if (path.empty() || !std::filesystem::exists(path)) {
                res.set_content(
                    HttpRouteHelpers::makeStatusResponse(400, {{"message", "인스톨러 경로가 유효하지 않음: " + path}}).dump(),
                    "application/json"
                );
                return;
            }
            FLOG_INFO("Updater", std::string("인스톨러 실행: ") + path);
            if (!launchInstaller(path)) {
                res.set_content(
                    HttpRouteHelpers::makeStatusResponse(500, {{"message", "인스톨러 실행 실패"}}).dump(),
                    "application/json"
                );
                return;
            }
            res.set_content(
                HttpRouteHelpers::makeStatusResponse(200, {{"message", "인스톨러 실행됨"}}).dump(),
                "application/json"
            );
            std::thread([]() {
                std::this_thread::sleep_for(std::chrono::seconds(10));
                FLOG_INFO("Updater", "본체 종료 (인스톨러 실행 후)");
                std::exit(0);
            }).detach();
        } catch (const std::exception& e) {
            FLOG_ERROR("Updater", std::string("실행 예외: ") + e.what());
            res.set_content(
                HttpRouteHelpers::makeStatusResponse(500, {{"message", e.what()}}).dump(),
                "application/json"
            );
        }
    });
}
#include "robot_core_all.h"
#include <iostream>
#include <sstream>
#include <iomanip>
#include <filesystem>
#include <chrono>
#include <algorithm>
#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif
namespace fs = std::filesystem;
FileLogger& FileLogger::instance() {
    static FileLogger inst;
    return inst;
}
FileLogger::~FileLogger() {
    shutdown();
}
void FileLogger::init(const std::string& logDir, int maxFileSizeMB,
                      int maxDaysToKeep, LogLevel minLevel) {
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;
        m_maxDaysToKeep = maxDaysToKeep;
        m_minLevel = minLevel;
        if (!logDir.empty()) {
            m_logDir = logDir;
        } else {
#ifdef _WIN32
            char exePath[MAX_PATH];
            GetModuleFileNameA(NULL, exePath, MAX_PATH);
            std::string exeDir(exePath);
            size_t lastSlash = exeDir.find_last_of("\\/");
            exeDir = exeDir.substr(0, lastSlash);
            m_logDir = exeDir + "\\logs";
#else
            m_logDir = "./logs";
#endif
        }
        try {
            fs::create_directories(m_logDir);
        } catch (const std::exception& e) {
            std::cerr << "[FileLogger] 로그 디렉토리 생성 실패: " << e.what() << std::endl;
            return;
        }
        m_initialized = true;
        m_currentDate.clear();
        m_fileIndex = 0;
        rotateIfNeeded();
        cleanOldLogs();
    }
    std::string startMsg = "=== FileLogger 시작 (dir=" + m_logDir +
                           ", maxSize=" + std::to_string(maxFileSizeMB) + "MB" +
                           ", keepDays=" + std::to_string(maxDaysToKeep) + ") ===";
    log(LogLevel::LOG_INFO, "FileLogger", startMsg);
}
void FileLogger::log(LogLevel level, const std::string& component,
                     const std::string& message) {
    if (level < m_minLevel) return;
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_initialized) return;
    rotateIfNeeded();
    if (!m_file.is_open()) return;
    m_file << "[" << currentTimestamp() << "] "
           << "[" << levelToString(level) << "] "
           << "[" << component << "] "
           << message << "\n";
    if (level >= LogLevel::LOG_ERROR) {
        m_file.flush();
    }
}
void FileLogger::debug(const std::string& component, const std::string& message) {
    log(LogLevel::LOG_DEBUG, component, message);
}
void FileLogger::info(const std::string& component, const std::string& message) {
    log(LogLevel::LOG_INFO, component, message);
}
void FileLogger::warn(const std::string& component, const std::string& message) {
    log(LogLevel::LOG_WARN, component, message);
}
void FileLogger::error(const std::string& component, const std::string& message) {
    log(LogLevel::LOG_ERROR, component, message);
}
void FileLogger::fatal(const std::string& component, const std::string& message) {
    log(LogLevel::LOG_FATAL, component, message);
}
void FileLogger::robotSdkError(const std::string& sdkFunction, int resultCode,
                                const std::string& detail) {
    std::ostringstream oss;
    oss << "SDK 호출 실패: " << sdkFunction << "() -> code=" << resultCode;
    if (!detail.empty()) {
        oss << " | " << detail;
    }
    log(LogLevel::LOG_ERROR, "RobotSDK", oss.str());
}
void FileLogger::shutdown() {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (m_file.is_open()) {
        m_file << "[" << currentTimestamp() << "] [INFO] [FileLogger] === FileLogger 종료 ===\n";
        m_file.flush();
        m_file.close();
    }
    m_initialized = false;
}
void FileLogger::rotateIfNeeded() {
    std::string today = currentDateString();
    bool needNewFile = false;
    if (today != m_currentDate) {
        m_currentDate = today;
        m_fileIndex = 0;
        needNewFile = true;
    }
    if (m_file.is_open()) {
        auto pos = m_file.tellp();
        if (pos >= m_maxFileSizeBytes) {
            m_fileIndex++;
            needNewFile = true;
        }
    }
    if (!needNewFile && m_file.is_open()) return;
    if (m_file.is_open()) {
        m_file.flush();
        m_file.close();
    }
    std::ostringstream filename;
    filename << "robot_core_" << m_currentDate;
    if (m_fileIndex > 0) {
        filename << "_" << m_fileIndex;
    }
    filename << ".log";
    m_currentFilePath = m_logDir + "/" + filename.str();
    m_file.open(m_currentFilePath, std::ios::app);
    if (!m_file.is_open()) {
        std::cerr << "[FileLogger] 로그 파일 열기 실패: " << m_currentFilePath << std::endl;
    }
}
void FileLogger::cleanOldLogs() {
    if (m_logDir.empty() || m_maxDaysToKeep <= 0) return;
    try {
        auto now = fs::file_time_type::clock::now();
        for (const auto& entry : fs::directory_iterator(m_logDir)) {
            if (!entry.is_regular_file()) continue;
            auto ext = entry.path().extension().string();
            if (ext != ".log") continue;
            auto lastWrite = entry.last_write_time();
            auto age = std::chrono::duration_cast<std::chrono::hours>(now - lastWrite);
            int ageDays = static_cast<int>(age.count() / 24);
            if (ageDays > m_maxDaysToKeep) {
                fs::remove(entry.path());
            }
        }
    } catch (const std::exception& e) {
        std::cerr << "[FileLogger] 오래된 로그 정리 실패: " << e.what() << std::endl;
    }
}
std::string FileLogger::currentDateString() const {
    auto now = std::chrono::system_clock::now();
    auto time = std::chrono::system_clock::to_time_t(now);
    std::tm tm;
#ifdef _WIN32
    localtime_s(&tm, &time);
#else
    localtime_r(&time, &tm);
#endif
    std::ostringstream oss;
    oss << std::put_time(&tm, "%Y-%m-%d");
    return oss.str();
}
std::string FileLogger::currentTimestamp() const {
    auto now = std::chrono::system_clock::now();
    auto time = std::chrono::system_clock::to_time_t(now);
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()) % 1000;
    std::tm tm;
#ifdef _WIN32
    localtime_s(&tm, &time);
#else
    localtime_r(&time, &tm);
#endif
    std::ostringstream oss;
    oss << std::put_time(&tm, "%Y-%m-%d %H:%M:%S")
        << "." << std::setfill('0') << std::setw(3) << ms.count();
    return oss.str();
}
const char* FileLogger::levelToString(LogLevel level) {
    switch (level) {
        case LogLevel::LOG_DEBUG: return "DEBUG";
        case LogLevel::LOG_INFO:  return "INFO ";
        case LogLevel::LOG_WARN:  return "WARN ";
        case LogLevel::LOG_ERROR: return "ERROR";
        case LogLevel::LOG_FATAL: return "FATAL";
        default: return "?????";
    }
}
#include "robot_core_all.h"
#include <fstream>
#include <iostream>
#include <algorithm>
#include <cstdlib>
#include <filesystem>
#ifdef _WIN32
#include <windows.h>
#endif
ConfigService& ConfigService::instance() {
    static ConfigService inst;
    return inst;
}
bool ConfigService::loadFromFile(const std::string& filePath) {
    std::string path = filePath;
    if (path.empty()) {
#ifdef _WIN32
        char exePath[MAX_PATH];
        GetModuleFileNameA(NULL, exePath, MAX_PATH);
        std::string exeDir(exePath);
        size_t pos = exeDir.find_last_of("\\/");
        exeDir = exeDir.substr(0, pos);
        path = exeDir + "\\config.ini";
        if (!std::filesystem::exists(path)) {
            std::string parentDir = exeDir;
            pos = parentDir.find_last_of("\\/");
            if (pos != std::string::npos) {
                parentDir = parentDir.substr(0, pos);
                std::string altPath = parentDir + "\\config.ini";
                if (std::filesystem::exists(altPath)) {
                    path = altPath;
                }
            }
        }
#else
        path = "config.ini";
#endif
    }
    std::ifstream file(path);
    if (!file.is_open()) {
        std::cout << "[ConfigService] config.ini not found at: " << path
                  << " (using environment variables or defaults)" << std::endl;
        return false;
    }
    std::string line;
    std::string currentSection;
    while (std::getline(file, line)) {
        line.erase(0, line.find_first_not_of(" \t\r\n"));
        line.erase(line.find_last_not_of(" \t\r\n") + 1);
        if (line.empty() || line[0] == '#' || line[0] == ';') continue;
        if (line[0] == '[' && line.back() == ']') {
            currentSection = line.substr(1, line.size() - 2);
            continue;
        }
        size_t eq = line.find('=');
        if (eq != std::string::npos) {
            std::string key = line.substr(0, eq);
            std::string value = line.substr(eq + 1);
            key.erase(0, key.find_first_not_of(" \t"));
            key.erase(key.find_last_not_of(" \t") + 1);
            value.erase(0, value.find_first_not_of(" \t"));
            value.erase(value.find_last_not_of(" \t") + 1);
            std::string fullKey = currentSection.empty() ? key : (currentSection + "." + key);
            m_values[fullKey] = value;
        }
    }
    std::cout << "[ConfigService] Loaded config from: " << path
              << " (" << m_values.size() << " entries)" << std::endl;
    return true;
}
std::string ConfigService::getEnv(const std::string& envName) const {
#ifdef _WIN32
    char buffer[1024];
    DWORD len = GetEnvironmentVariableA(envName.c_str(), buffer, sizeof(buffer));
    if (len > 0 && len < sizeof(buffer)) {
        return std::string(buffer, len);
    }
    return "";
#else
    const char* val = std::getenv(envName.c_str());
    return val ? std::string(val) : "";
#endif
}
std::string ConfigService::get(const std::string& key, const std::string& defaultValue) const {
    std::string envKey = "ROBOT_";
    for (char c : key) {
        if (c == '.') envKey += '_';
        else envKey += static_cast<char>(toupper(c));
    }
    std::string envVal = getEnv(envKey);
    if (!envVal.empty()) return envVal;
    if (key.find("database.") == 0) {
        std::string shortKey = "ROBOT_DB_";
        std::string suffix = key.substr(9);
        for (char c : suffix) {
            shortKey += static_cast<char>(toupper(c));
        }
        envVal = getEnv(shortKey);
        if (!envVal.empty()) return envVal;
    }
    auto it = m_values.find(key);
    if (it != m_values.end()) return it->second;
    return defaultValue;
}
int ConfigService::getInt(const std::string& key, int defaultValue) const {
    std::string val = get(key, "");
    if (val.empty()) return defaultValue;
    try {
        return std::stoi(val);
    } catch (...) {
        return defaultValue;
    }
}
std::string ConfigService::getDbHost() const {
    return get("database.host", "localhost");
}
std::string ConfigService::getDbUser() const {
    return get("database.user", "root");
}
std::string ConfigService::getDbPassword() const {
    return get("database.password", "");
}
std::string ConfigService::getDbName() const {
    return get("database.name", "robot_welding");
}
unsigned int ConfigService::getDbPort() const {
    return static_cast<unsigned int>(getInt("database.port", 3306));
}
#include "robot_core_all.h"
#include "robot_core_all.h"
#include <random>
#include <sstream>
#include <iomanip>
#include <iostream>
#include <algorithm>
using json = nlohmann::json;
AuthService& AuthService::instance() {
    static AuthService inst;
    return inst;
}
std::string AuthService::generateToken() {
    std::random_device rd;
    std::mt19937_64 gen(rd());
    std::uniform_int_distribution<uint64_t> dist;
    std::ostringstream ss;
    ss << std::hex << std::setfill('0');
    ss << std::setw(16) << dist(gen);
    ss << std::setw(16) << dist(gen);
    ss << std::setw(16) << dist(gen);
    ss << std::setw(16) << dist(gen);
    return ss.str();
}
std::string AuthService::createSession(int userId, const std::string& username, const std::string& role) {
    std::lock_guard<std::mutex> lock(m_mutex);
    static int callCount = 0;
    if (++callCount % 10 == 0) {
        auto now = std::time(nullptr);
        for (auto it = m_sessions.begin(); it != m_sessions.end(); ) {
            if (now - it->second.lastAccessAt > m_sessionTimeout) {
                it = m_sessions.erase(it);
            } else {
                ++it;
            }
        }
    }
    std::string token = generateToken();
    Session session;
    session.userId = userId;
    session.username = username;
    session.role = role;
    session.createdAt = std::time(nullptr);
    session.lastAccessAt = session.createdAt;
    m_sessions[token] = session;
    FLOG_INFO("AuthService", "Login success: user=" + username + " role=" + role + " activeSessions=" + std::to_string(m_sessions.size()));
    std::cout << "[AuthService] Session created for user: " << username
              << " (active sessions: " << m_sessions.size() << ")" << std::endl;
    return token;
}
json AuthService::validateSession(const std::string& token) {
    std::lock_guard<std::mutex> lock(m_mutex);
    auto it = m_sessions.find(token);
    if (it == m_sessions.end()) {
        FLOG_WARN("AuthService", "Token validation failed: invalid token");
        return nullptr;
    }
    auto now = std::time(nullptr);
    if (now - it->second.lastAccessAt > m_sessionTimeout) {
        FLOG_WARN("AuthService", "Session expired: user=" + it->second.username);
        std::cout << "[AuthService] Session expired for user: " << it->second.username << std::endl;
        m_sessions.erase(it);
        return nullptr;
    }
    it->second.lastAccessAt = now;
    json user;
    user["id"] = it->second.userId;
    user["username"] = it->second.username;
    user["role"] = it->second.role;
    return user;
}
void AuthService::removeSession(const std::string& token) {
    std::lock_guard<std::mutex> lock(m_mutex);
    auto it = m_sessions.find(token);
    if (it != m_sessions.end()) {
        FLOG_INFO("AuthService", "Logout: user=" + it->second.username);
        std::cout << "[AuthService] Session removed for user: " << it->second.username << std::endl;
        m_sessions.erase(it);
    }
}
void AuthService::cleanExpiredSessions() {
    std::lock_guard<std::mutex> lock(m_mutex);
    auto now = std::time(nullptr);
    int removed = 0;
    for (auto it = m_sessions.begin(); it != m_sessions.end(); ) {
        if (now - it->second.lastAccessAt > m_sessionTimeout) {
            it = m_sessions.erase(it);
            removed++;
        } else {
            ++it;
        }
    }
    if (removed > 0) {
        std::cout << "[AuthService] Cleaned " << removed << " expired sessions"
                  << " (remaining: " << m_sessions.size() << ")" << std::endl;
    }
}
int AuthService::getActiveSessionCount() {
    std::lock_guard<std::mutex> lock(m_mutex);
    return static_cast<int>(m_sessions.size());
}
#include "robot_core_all.h"
#include "robot_core_all.h"
#include "robot_core_all.h"
#include <iostream>
#include <sstream>
#include <iomanip>
DatabaseService::DatabaseService() {
    mysql_library_init(0, nullptr, nullptr);
}
DatabaseService::~DatabaseService() {
    disconnect();
    mysql_library_end();
}
bool DatabaseService::connect(const std::string& host,
                               const std::string& user,
                               const std::string& password,
                               const std::string& database,
                               unsigned int port) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (m_connected) {
        return true;
    }
    auto& config = ConfigService::instance();
    m_host = host.empty() ? config.getDbHost() : host;
    m_user = user.empty() ? config.getDbUser() : user;
    m_password = password.empty() ? config.getDbPassword() : password;
    m_database = database.empty() ? config.getDbName() : database;
    m_port = (port == 0) ? config.getDbPort() : port;
    m_conn = mysql_init(nullptr);
    if (!m_conn) {
        m_lastError = "MySQL init failed";
        std::cerr << "[DatabaseService] " << m_lastError << std::endl;
        FLOG_FATAL("DatabaseService", "MySQL 라이브러리 초기화 실패");
        return false;
    }
    unsigned int timeout = 5;
    mysql_options(m_conn, MYSQL_OPT_CONNECT_TIMEOUT, &timeout);
    bool reconnect = true;
    mysql_options(m_conn, MYSQL_OPT_RECONNECT, &reconnect);
    mysql_options(m_conn, MYSQL_SET_CHARSET_NAME, "utf8mb4");
    if (!mysql_real_connect(m_conn, m_host.c_str(), m_user.c_str(), m_password.c_str(),
                            m_database.c_str(), m_port, nullptr, 0)) {
        m_lastError = mysql_error(m_conn);
        std::cerr << "[DatabaseService] Connection failed: " << m_lastError << std::endl;
        FLOG_ERROR("DatabaseService", "DB 연결 실패: " + m_lastError);
        mysql_close(m_conn);
        m_conn = nullptr;
        return false;
    }
    m_connected = true;
    std::cout << "[DatabaseService] Connected to MariaDB: " << m_host << ":" << m_port << "/" << m_database << std::endl;
    return true;
}
void DatabaseService::disconnect() {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (m_conn) {
        mysql_close(m_conn);
        m_conn = nullptr;
    }
    m_connected = false;
    std::cout << "[DatabaseService] Disconnected" << std::endl;
}
bool DatabaseService::reconnect() {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (m_conn) {
        mysql_close(m_conn);
        m_conn = nullptr;
    }
    m_connected = false;
    m_conn = mysql_init(nullptr);
    if (!m_conn) {
        m_lastError = "MySQL init failed";
        std::cerr << "[DatabaseService] reconnect: " << m_lastError << std::endl;
        return false;
    }
    unsigned int timeout = 5;
    mysql_options(m_conn, MYSQL_OPT_CONNECT_TIMEOUT, &timeout);
    bool autoReconnect = true;
    mysql_options(m_conn, MYSQL_OPT_RECONNECT, &autoReconnect);
    mysql_options(m_conn, MYSQL_SET_CHARSET_NAME, "utf8mb4");
    if (!mysql_real_connect(m_conn, m_host.c_str(), m_user.c_str(), m_password.c_str(),
                            m_database.c_str(), m_port, nullptr, 0)) {
        m_lastError = mysql_error(m_conn);
        std::cerr << "[DatabaseService] reconnect failed: " << m_lastError << std::endl;
        mysql_close(m_conn);
        m_conn = nullptr;
        return false;
    }
    m_connected = true;
    std::cout << "[DatabaseService] Reconnected to MariaDB" << std::endl;
    return true;
}
std::string DatabaseService::escapeString(const std::string& str) {
    if (!m_conn) return str;
    std::vector<char> buffer(str.length() * 2 + 1);
    mysql_real_escape_string(m_conn, buffer.data(), str.c_str(), str.length());
    return std::string(buffer.data());
}
std::string DatabaseService::getCurrentTimestamp() {
    std::time_t now = std::time(nullptr);
    std::tm* tm = std::localtime(&now);
    std::ostringstream oss;
    oss << std::put_time(tm, "%Y-%m-%d %H:%M:%S");
    return oss.str();
}
std::string DatabaseService::convertIso8601ToDatetime(const std::string& iso8601) {
    if (iso8601.empty()) return "";
    std::string result = iso8601;
    size_t tPos = result.find('T');
    if (tPos != std::string::npos) {
        result[tPos] = ' ';
    }
    if (!result.empty() && result.back() == 'Z') {
        result.pop_back();
    }
    size_t dotPos = result.find('.');
    if (dotPos != std::string::npos) {
        result = result.substr(0, dotPos);
    }
    return result;
}
bool DatabaseService::executeQuery(const std::string& query) {
    if (!m_conn) {
        m_lastError = "Not connected";
        return false;
    }
    if (mysql_query(m_conn, query.c_str()) != 0) {
        m_lastError = mysql_error(m_conn);
        std::cerr << "[DatabaseService] Query failed: " << m_lastError << std::endl;
        FLOG_ERROR("DatabaseService", "쿼리 실패: " + m_lastError);
        return false;
    }
    return true;
}
MYSQL_RES* DatabaseService::executeSelect(const std::string& query) {
    if (!executeQuery(query)) {
        return nullptr;
    }
    return mysql_store_result(m_conn);
}
#include "robot_core_all.h"
#include <iostream>
#include <sstream>
std::vector<TeachingJob> DatabaseService::getJobs(int limit, int offset) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::vector<TeachingJob> jobs;
    std::ostringstream query;
    query << "SELECT id, name, description, status, current_point_index, total_points, "
          << "cell_type, cell_id, cell_name, width, height, "
          << "created_at, updated_at, started_at, completed_at "
          << "FROM teaching_jobs ORDER BY created_at DESC LIMIT " << limit << " OFFSET " << offset;
    MYSQL_RES* result = executeSelect(query.str());
    if (!result) return jobs;
    MYSQL_ROW row;
    while ((row = mysql_fetch_row(result))) {
        TeachingJob job;
        int col = 0;
        job.id = row[col] ? std::stoi(row[col]) : 0; col++;
        job.name = row[col] ? row[col] : ""; col++;
        job.description = row[col] ? row[col] : ""; col++;
        job.status = row[col] ? row[col] : "pending"; col++;
        job.current_point_index = row[col] ? std::stoi(row[col]) : 0; col++;
        job.total_points = row[col] ? std::stoi(row[col]) : 0; col++;
        job.cell_type = row[col] ? row[col] : ""; col++;
        job.cell_id = row[col] ? std::stoi(row[col]) : 0; col++;
        job.cell_name = row[col] ? row[col] : ""; col++;
        job.width = row[col] ? std::stoi(row[col]) : 0; col++;
        job.height = row[col] ? std::stoi(row[col]) : 0; col++;
        job.created_at = row[col] ? row[col] : ""; col++;
        job.updated_at = row[col] ? row[col] : ""; col++;
        job.started_at = row[col] ? row[col] : ""; col++;
        job.completed_at = row[col] ? row[col] : ""; col++;
        jobs.push_back(job);
    }
    mysql_free_result(result);
    return jobs;
}
TeachingJob DatabaseService::getJob(int id) {
    std::lock_guard<std::mutex> lock(m_mutex);
    TeachingJob job;
    std::ostringstream query;
    query << "SELECT id, name, description, status, current_point_index, total_points, "
          << "cell_type, cell_id, cell_name, width, height, "
          << "created_at, updated_at, started_at, completed_at "
          << "FROM teaching_jobs WHERE id = " << id;
    MYSQL_RES* result = executeSelect(query.str());
    if (!result) return job;
    MYSQL_ROW row = mysql_fetch_row(result);
    if (row) {
        int col = 0;
        job.id = row[col] ? std::stoi(row[col]) : 0; col++;
        job.name = row[col] ? row[col] : ""; col++;
        job.description = row[col] ? row[col] : ""; col++;
        job.status = row[col] ? row[col] : "pending"; col++;
        job.current_point_index = row[col] ? std::stoi(row[col]) : 0; col++;
        job.total_points = row[col] ? std::stoi(row[col]) : 0; col++;
        job.cell_type = row[col] ? row[col] : ""; col++;
        job.cell_id = row[col] ? std::stoi(row[col]) : 0; col++;
        job.cell_name = row[col] ? row[col] : ""; col++;
        job.width = row[col] ? std::stoi(row[col]) : 0; col++;
        job.height = row[col] ? std::stoi(row[col]) : 0; col++;
        job.created_at = row[col] ? row[col] : ""; col++;
        job.updated_at = row[col] ? row[col] : ""; col++;
        job.started_at = row[col] ? row[col] : ""; col++;
        job.completed_at = row[col] ? row[col] : ""; col++;
    }
    mysql_free_result(result);
    return job;
}
int DatabaseService::createJob(const TeachingJob& job) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::ostringstream query;
    query << "INSERT INTO teaching_jobs (name, description, status, cell_type, cell_id, cell_name, width, height) VALUES ("
          << "'" << escapeString(job.name) << "', "
          << "'" << escapeString(job.description) << "', "
          << "'" << escapeString(job.status) << "', "
          << "'" << escapeString(job.cell_type) << "', "
          << job.cell_id << ", "
          << "'" << escapeString(job.cell_name) << "', "
          << job.width << ", "
          << job.height << ")";
    if (!executeQuery(query.str())) {
        return -1;
    }
    return static_cast<int>(mysql_insert_id(m_conn));
}
bool DatabaseService::updateJob(const TeachingJob& job) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::ostringstream query;
    query << "UPDATE teaching_jobs SET "
          << "name = '" << escapeString(job.name) << "', "
          << "description = '" << escapeString(job.description) << "', "
          << "status = '" << escapeString(job.status) << "', "
          << "current_point_index = " << job.current_point_index << ", "
          << "total_points = " << job.total_points << ", "
          << "cell_type = '" << escapeString(job.cell_type) << "', "
          << "cell_id = " << job.cell_id << ", "
          << "cell_name = '" << escapeString(job.cell_name) << "', "
          << "width = " << job.width << ", "
          << "height = " << job.height;
    if (!job.started_at.empty()) {
        query << ", started_at = '" << job.started_at << "'";
    }
    if (!job.completed_at.empty()) {
        query << ", completed_at = '" << job.completed_at << "'";
    }
    query << " WHERE id = " << job.id;
    return executeQuery(query.str());
}
bool DatabaseService::deleteJob(int id) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::ostringstream query;
    query << "DELETE FROM teaching_jobs WHERE id = " << id;
    return executeQuery(query.str());
}
json DatabaseService::jobToJson(const TeachingJob& job) {
    return {
        {"id", job.id},
        {"name", job.name},
        {"description", job.description},
        {"status", job.status},
        {"current_point_index", job.current_point_index},
        {"total_points", job.total_points},
        {"cell_type", job.cell_type},
        {"cell_id", job.cell_id},
        {"cell_name", job.cell_name},
        {"width", job.width},
        {"height", job.height},
        {"created_at", job.created_at},
        {"updated_at", job.updated_at},
        {"started_at", job.started_at},
        {"completed_at", job.completed_at}
    };
}
TeachingJob DatabaseService::jsonToJob(const json& j) {
    TeachingJob job;
    if (j.contains("id")) job.id = j["id"].get<int>();
    if (j.contains("name")) job.name = j["name"].get<std::string>();
    if (j.contains("description")) job.description = j["description"].is_null() ? "" : j["description"].get<std::string>();
    if (j.contains("status")) job.status = j["status"].get<std::string>();
    if (j.contains("current_point_index")) job.current_point_index = j["current_point_index"].get<int>();
    if (j.contains("total_points")) job.total_points = j["total_points"].get<int>();
    if (j.contains("cell_type")) job.cell_type = j["cell_type"].is_null() ? "" : j["cell_type"].get<std::string>();
    if (j.contains("cell_id")) job.cell_id = j["cell_id"].is_null() ? 0 : j["cell_id"].get<int>();
    if (j.contains("cell_name")) job.cell_name = j["cell_name"].is_null() ? "" : j["cell_name"].get<std::string>();
    if (j.contains("width")) job.width = j["width"].is_null() ? 0 : j["width"].get<int>();
    if (j.contains("height")) job.height = j["height"].is_null() ? 0 : j["height"].get<int>();
    return job;
}
#include "robot_core_all.h"
#include <iostream>
#include <sstream>
std::vector<TeachingPoint> DatabaseService::getPoints(int jobId) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::vector<TeachingPoint> points;
    std::ostringstream query;
    query << "SELECT id, job_id, point_id, name, `order`, "
          << "tcp_x, tcp_y, tcp_z, tcp_rx, tcp_ry, tcp_rz, "
          << "joints, tool_num, user_num, move_speed, vel_mode, "
          << "weld_voltage, weld_current, weaving_type, weave_params, "
          << "is_saved, is_completed, completed_at "
          << "FROM teaching_points WHERE job_id = " << jobId << " ORDER BY `order`";
    MYSQL_RES* result = executeSelect(query.str());
    if (!result) return points;
    MYSQL_ROW row;
    while ((row = mysql_fetch_row(result))) {
        TeachingPoint point;
        int col = 0;
        point.id = row[col] ? std::stoi(row[col]) : 0; col++;
        point.job_id = row[col] ? std::stoi(row[col]) : 0; col++;
        point.point_id = row[col] ? row[col] : ""; col++;
        point.name = row[col] ? row[col] : ""; col++;
        point.order = row[col] ? std::stoi(row[col]) : 0; col++;
        point.tcp_x = row[col] ? std::stod(row[col]) : 0; col++;
        point.tcp_y = row[col] ? std::stod(row[col]) : 0; col++;
        point.tcp_z = row[col] ? std::stod(row[col]) : 0; col++;
        point.tcp_rx = row[col] ? std::stod(row[col]) : 0; col++;
        point.tcp_ry = row[col] ? std::stod(row[col]) : 0; col++;
        point.tcp_rz = row[col] ? std::stod(row[col]) : 0; col++;
        if (row[col]) {
            try {
                json j = json::parse(row[col]);
                if (j.is_array()) {
                    for (auto& v : j) {
                        point.joints.push_back(v.get<double>());
                    }
                }
            } catch (...) {}
        }
        col++;
        point.tool_num = row[col] ? std::stoi(row[col]) : 0; col++;
        point.user_num = row[col] ? std::stoi(row[col]) : 0; col++;
        point.move_speed = row[col] ? std::stod(row[col]) : 30.0; col++;
        point.vel_mode = row[col] ? std::stoi(row[col]) : 1; col++;
        point.weld_voltage = row[col] ? std::stod(row[col]) : 0; col++;
        point.weld_current = row[col] ? std::stod(row[col]) : 0; col++;
        point.weaving_type = row[col] ? row[col] : ""; col++;
        if (row[col]) {
            try {
                point.weave_params = json::parse(row[col]);
            } catch (...) {
                point.weave_params = json::object();
            }
        }
        col++;
        point.is_saved = row[col] ? (std::stoi(row[col]) != 0) : false; col++;
        point.is_completed = row[col] ? (std::stoi(row[col]) != 0) : false; col++;
        point.completed_at = row[col] ? row[col] : ""; col++;
        points.push_back(point);
    }
    mysql_free_result(result);
    return points;
}
TeachingPoint DatabaseService::getPoint(int id) {
    std::lock_guard<std::mutex> lock(m_mutex);
    TeachingPoint point;
    std::ostringstream query;
    query << "SELECT id, job_id, point_id, name, `order`, "
          << "tcp_x, tcp_y, tcp_z, tcp_rx, tcp_ry, tcp_rz, "
          << "joints, tool_num, user_num, move_speed, vel_mode, "
          << "weld_voltage, weld_current, weaving_type, weave_params, "
          << "is_saved, is_completed, completed_at "
          << "FROM teaching_points WHERE id = " << id;
    MYSQL_RES* result = executeSelect(query.str());
    if (!result) return point;
    MYSQL_ROW row = mysql_fetch_row(result);
    if (row) {
        int col = 0;
        point.id = row[col] ? std::stoi(row[col]) : 0; col++;
        point.job_id = row[col] ? std::stoi(row[col]) : 0; col++;
        point.point_id = row[col] ? row[col] : ""; col++;
        point.name = row[col] ? row[col] : ""; col++;
        point.order = row[col] ? std::stoi(row[col]) : 0; col++;
        point.tcp_x = row[col] ? std::stod(row[col]) : 0; col++;
        point.tcp_y = row[col] ? std::stod(row[col]) : 0; col++;
        point.tcp_z = row[col] ? std::stod(row[col]) : 0; col++;
        point.tcp_rx = row[col] ? std::stod(row[col]) : 0; col++;
        point.tcp_ry = row[col] ? std::stod(row[col]) : 0; col++;
        point.tcp_rz = row[col] ? std::stod(row[col]) : 0; col++;
        if (row[col]) {
            try {
                json j = json::parse(row[col]);
                if (j.is_array()) {
                    for (auto& v : j) {
                        point.joints.push_back(v.get<double>());
                    }
                }
            } catch (...) {}
        }
        col++;
        point.tool_num = row[col] ? std::stoi(row[col]) : 0; col++;
        point.user_num = row[col] ? std::stoi(row[col]) : 0; col++;
        point.move_speed = row[col] ? std::stod(row[col]) : 30.0; col++;
        point.vel_mode = row[col] ? std::stoi(row[col]) : 1; col++;
        point.weld_voltage = row[col] ? std::stod(row[col]) : 0; col++;
        point.weld_current = row[col] ? std::stod(row[col]) : 0; col++;
        point.weaving_type = row[col] ? row[col] : ""; col++;
        if (row[col]) {
            try {
                point.weave_params = json::parse(row[col]);
            } catch (...) {
                point.weave_params = json::object();
            }
        }
        col++;
        point.is_saved = row[col] ? (std::stoi(row[col]) != 0) : false; col++;
        point.is_completed = row[col] ? (std::stoi(row[col]) != 0) : false; col++;
        point.completed_at = row[col] ? row[col] : ""; col++;
    }
    mysql_free_result(result);
    return point;
}
int DatabaseService::createPoint(const TeachingPoint& point) {
    std::lock_guard<std::mutex> lock(m_mutex);
    json jointsJson = json::array();
    for (auto& j : point.joints) {
        jointsJson.push_back(j);
    }
    std::ostringstream query;
    query << "INSERT INTO teaching_points (job_id, point_id, name, `order`, "
          << "tcp_x, tcp_y, tcp_z, tcp_rx, tcp_ry, tcp_rz, joints, "
          << "tool_num, user_num, move_speed, vel_mode, "
          << "weld_voltage, weld_current, weaving_type, weave_params, is_saved) VALUES ("
          << point.job_id << ", "
          << "'" << escapeString(point.point_id) << "', "
          << "'" << escapeString(point.name) << "', "
          << point.order << ", "
          << point.tcp_x << ", " << point.tcp_y << ", " << point.tcp_z << ", "
          << point.tcp_rx << ", " << point.tcp_ry << ", " << point.tcp_rz << ", "
          << "'" << escapeString(jointsJson.dump()) << "', "
          << point.tool_num << ", " << point.user_num << ", "
          << point.move_speed << ", " << point.vel_mode << ", "
          << point.weld_voltage << ", " << point.weld_current << ", "
          << "'" << escapeString(point.weaving_type) << "', "
          << "'" << escapeString(point.weave_params.dump()) << "', "
          << (point.is_saved ? 1 : 0) << ")";
    if (!executeQuery(query.str())) {
        return -1;
    }
    return static_cast<int>(mysql_insert_id(m_conn));
}
bool DatabaseService::updatePoint(const TeachingPoint& point) {
    std::lock_guard<std::mutex> lock(m_mutex);
    json jointsJson = json::array();
    for (auto& j : point.joints) {
        jointsJson.push_back(j);
    }
    std::ostringstream query;
    query << "UPDATE teaching_points SET "
          << "point_id = '" << escapeString(point.point_id) << "', "
          << "name = '" << escapeString(point.name) << "', "
          << "`order` = " << point.order << ", "
          << "tcp_x = " << point.tcp_x << ", "
          << "tcp_y = " << point.tcp_y << ", "
          << "tcp_z = " << point.tcp_z << ", "
          << "tcp_rx = " << point.tcp_rx << ", "
          << "tcp_ry = " << point.tcp_ry << ", "
          << "tcp_rz = " << point.tcp_rz << ", "
          << "joints = '" << escapeString(jointsJson.dump()) << "', "
          << "tool_num = " << point.tool_num << ", "
          << "user_num = " << point.user_num << ", "
          << "move_speed = " << point.move_speed << ", "
          << "vel_mode = " << point.vel_mode << ", "
          << "weld_voltage = " << point.weld_voltage << ", "
          << "weld_current = " << point.weld_current << ", "
          << "weaving_type = '" << escapeString(point.weaving_type) << "', "
          << "weave_params = '" << escapeString(point.weave_params.dump()) << "', "
          << "is_saved = " << (point.is_saved ? 1 : 0) << ", "
          << "is_completed = " << (point.is_completed ? 1 : 0);
    if (!point.completed_at.empty()) {
        query << ", completed_at = '" << point.completed_at << "'";
    }
    query << " WHERE id = " << point.id;
    return executeQuery(query.str());
}
bool DatabaseService::deletePoint(int id) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::ostringstream query;
    query << "DELETE FROM teaching_points WHERE id = " << id;
    return executeQuery(query.str());
}
bool DatabaseService::savePoints(int jobId, const std::vector<TeachingPoint>& points) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!executeQuery("START TRANSACTION")) {
        return false;
    }
    std::ostringstream delQuery;
    delQuery << "DELETE FROM teaching_points WHERE job_id = " << jobId;
    if (!executeQuery(delQuery.str())) {
        executeQuery("ROLLBACK");
        return false;
    }
    for (const auto& point : points) {
        json jointsJson = json::array();
        for (auto& j : point.joints) {
            jointsJson.push_back(j);
        }
        std::ostringstream query;
        query << "INSERT INTO teaching_points (job_id, point_id, name, `order`, "
              << "tcp_x, tcp_y, tcp_z, tcp_rx, tcp_ry, tcp_rz, joints, "
              << "tool_num, user_num, move_speed, vel_mode, "
              << "weld_voltage, weld_current, weaving_type, weave_params, is_saved) VALUES ("
              << jobId << ", "
              << "'" << escapeString(point.point_id) << "', "
              << "'" << escapeString(point.name) << "', "
              << point.order << ", "
              << point.tcp_x << ", " << point.tcp_y << ", " << point.tcp_z << ", "
              << point.tcp_rx << ", " << point.tcp_ry << ", " << point.tcp_rz << ", "
              << "'" << escapeString(jointsJson.dump()) << "', "
              << point.tool_num << ", " << point.user_num << ", "
              << point.move_speed << ", " << point.vel_mode << ", "
              << point.weld_voltage << ", " << point.weld_current << ", "
              << "'" << escapeString(point.weaving_type) << "', "
              << "'" << escapeString(point.weave_params.dump()) << "', "
              << (point.is_saved ? 1 : 0) << ")";
        if (!executeQuery(query.str())) {
            executeQuery("ROLLBACK");
            return false;
        }
    }
    std::ostringstream updateQuery;
    updateQuery << "UPDATE teaching_jobs SET total_points = " << points.size() << " WHERE id = " << jobId;
    executeQuery(updateQuery.str());
    return executeQuery("COMMIT");
}
json DatabaseService::pointToJson(const TeachingPoint& point) {
    json jointsArray = json::array();
    for (auto& j : point.joints) {
        jointsArray.push_back(j);
    }
    json tcpObj = nullptr;
    if (point.tcp_x != 0 || point.tcp_y != 0 || point.tcp_z != 0 ||
        point.tcp_rx != 0 || point.tcp_ry != 0 || point.tcp_rz != 0) {
        tcpObj = {
            {"x", point.tcp_x},
            {"y", point.tcp_y},
            {"z", point.tcp_z},
            {"rx", point.tcp_rx},
            {"ry", point.tcp_ry},
            {"rz", point.tcp_rz}
        };
    }
    return {
        {"id", point.id},
        {"job_id", point.job_id},
        {"point_id", point.point_id},
        {"name", point.name},
        {"order", point.order},
        {"tcp", tcpObj},
        {"joints", jointsArray},
        {"tool_num", point.tool_num},
        {"user_num", point.user_num},
        {"move_speed", point.move_speed},
        {"vel_mode", point.vel_mode},
        {"weld_voltage", point.weld_voltage},
        {"weld_current", point.weld_current},
        {"weaving_type", point.weaving_type},
        {"weave_params", point.weave_params},
        {"is_saved", point.is_saved},
        {"is_completed", point.is_completed},
        {"completed_at", point.completed_at}
    };
}
TeachingPoint DatabaseService::jsonToPoint(const json& j) {
    TeachingPoint point;
    if (j.contains("id")) point.id = j["id"].get<int>();
    if (j.contains("job_id")) point.job_id = j["job_id"].get<int>();
    if (j.contains("point_id")) point.point_id = j["point_id"].get<std::string>();
    if (j.contains("name")) point.name = j["name"].get<std::string>();
    if (j.contains("order")) point.order = j["order"].get<int>();
    if (j.contains("tcp") && j["tcp"].is_object()) {
        const auto& tcp = j["tcp"];
        if (tcp.contains("x")) point.tcp_x = tcp["x"].get<double>();
        if (tcp.contains("y")) point.tcp_y = tcp["y"].get<double>();
        if (tcp.contains("z")) point.tcp_z = tcp["z"].get<double>();
        if (tcp.contains("rx")) point.tcp_rx = tcp["rx"].get<double>();
        if (tcp.contains("ry")) point.tcp_ry = tcp["ry"].get<double>();
        if (tcp.contains("rz")) point.tcp_rz = tcp["rz"].get<double>();
    } else {
        if (j.contains("tcp_x")) point.tcp_x = j["tcp_x"].get<double>();
        if (j.contains("tcp_y")) point.tcp_y = j["tcp_y"].get<double>();
        if (j.contains("tcp_z")) point.tcp_z = j["tcp_z"].get<double>();
        if (j.contains("tcp_rx")) point.tcp_rx = j["tcp_rx"].get<double>();
        if (j.contains("tcp_ry")) point.tcp_ry = j["tcp_ry"].get<double>();
        if (j.contains("tcp_rz")) point.tcp_rz = j["tcp_rz"].get<double>();
    }
    if (j.contains("joints") && j["joints"].is_array()) {
        for (auto& v : j["joints"]) {
            point.joints.push_back(v.get<double>());
        }
    }
    if (j.contains("tool_num")) point.tool_num = j["tool_num"].get<int>();
    if (j.contains("user_num")) point.user_num = j["user_num"].get<int>();
    if (j.contains("move_speed")) point.move_speed = j["move_speed"].get<double>();
    if (j.contains("vel_mode")) point.vel_mode = j["vel_mode"].get<int>();
    if (j.contains("weld_voltage")) point.weld_voltage = j["weld_voltage"].is_null() ? 0 : j["weld_voltage"].get<double>();
    if (j.contains("weld_current")) point.weld_current = j["weld_current"].is_null() ? 0 : j["weld_current"].get<double>();
    if (j.contains("weaving_type")) point.weaving_type = j["weaving_type"].is_null() ? "" : j["weaving_type"].get<std::string>();
    if (j.contains("weave_params")) point.weave_params = j["weave_params"];
    if (j.contains("is_saved")) point.is_saved = j["is_saved"].get<bool>();
    if (j.contains("is_completed")) point.is_completed = j["is_completed"].get<bool>();
    return point;
}
#include "robot_core_all.h"
#include <iostream>
#include <sstream>
RobotSettings DatabaseService::getRobotSettings() {
    std::lock_guard<std::mutex> lock(m_mutex);
    RobotSettings settings;
    MYSQL_RES* result = executeSelect("SELECT tool_num, user_num, default_vel, default_acc, default_ovl, auto_clear_error, min_weaving_distance, updated_at FROM robot_settings WHERE id = 1");
    if (!result) {
        return settings;
    }
    MYSQL_ROW row = mysql_fetch_row(result);
    if (row) {
        settings.tool_num = row[0] ? std::stoi(row[0]) : 0;
        settings.user_num = row[1] ? std::stoi(row[1]) : 0;
        settings.default_vel = row[2] ? std::stoi(row[2]) : 20;
        settings.default_acc = row[3] ? std::stoi(row[3]) : 100;
        settings.default_ovl = row[4] ? std::stoi(row[4]) : 100;
        settings.auto_clear_error = row[5] ? (std::stoi(row[5]) != 0) : true;
        settings.min_weaving_distance = row[6] ? std::stoi(row[6]) : 50;
        settings.updated_at = row[7] ? row[7] : "";
    }
    mysql_free_result(result);
    return settings;
}
bool DatabaseService::updateRobotSettings(const RobotSettings& settings) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::ostringstream query;
    query << "UPDATE robot_settings SET "
          << "tool_num = " << settings.tool_num << ", "
          << "user_num = " << settings.user_num << ", "
          << "default_vel = " << settings.default_vel << ", "
          << "default_acc = " << settings.default_acc << ", "
          << "default_ovl = " << settings.default_ovl << ", "
          << "auto_clear_error = " << (settings.auto_clear_error ? 1 : 0) << ", "
          << "min_weaving_distance = " << settings.min_weaving_distance
          << " WHERE id = 1";
    return executeQuery(query.str());
}
json DatabaseService::settingsToJson(const RobotSettings& settings) {
    return {
        {"tool_num", settings.tool_num},
        {"user_num", settings.user_num},
        {"default_vel", settings.default_vel},
        {"default_acc", settings.default_acc},
        {"default_ovl", settings.default_ovl},
        {"auto_clear_error", settings.auto_clear_error},
        {"min_weaving_distance", settings.min_weaving_distance},
        {"updated_at", settings.updated_at}
    };
}
RobotSettings DatabaseService::jsonToSettings(const json& j) {
    RobotSettings settings;
    if (j.contains("tool_num")) settings.tool_num = j["tool_num"].get<int>();
    if (j.contains("user_num")) settings.user_num = j["user_num"].get<int>();
    if (j.contains("default_vel")) settings.default_vel = j["default_vel"].get<int>();
    if (j.contains("default_acc")) settings.default_acc = j["default_acc"].get<int>();
    if (j.contains("default_ovl")) settings.default_ovl = j["default_ovl"].get<int>();
    if (j.contains("auto_clear_error")) settings.auto_clear_error = j["auto_clear_error"].get<bool>();
    if (j.contains("min_weaving_distance")) settings.min_weaving_distance = j["min_weaving_distance"].get<int>();
    return settings;
}
WeldingConfig DatabaseService::getWeldingConfig() {
    std::lock_guard<std::mutex> lock(m_mutex);
    WeldingConfig config;
    MYSQL_RES* result = executeSelect(
        "SELECT touch_sensing_enabled, touch_speed, touch_distance, touch_offset_depth, "
        "touch_approach_angle, touch_sensing_velocity, touch_sensing_acceleration, touch_sensing_step_size, "
        "touch_sensing_retract_distance, touch_sensing_approach_offset, touch_sensing_move_distance, "
        "touch_sensing_point_speed, touch_sensing_search_speed, "
        "p1_touch_center, p1_touch_left, p1_touch_right, p1_touch_bottom, "
        "p2_touch_center, p2_touch_left, p2_touch_right, "
        "p3_touch_center, p3_touch_left, p3_touch_right, p3_touch_bottom, "
        "p4_touch_center, p4_touch_top, p4_touch_bottom, p4_touch_side, "
        "p5_touch_center, p5_touch_top, p5_touch_bottom, "
        "p6_touch_center, p6_touch_top, p6_touch_bottom, "
        "p7_touch_center, p7_touch_left, p7_touch_right, "
        "p8_touch_center, p8_touch_left, p8_touch_right, "
        "p9_touch_center, p9_touch_left, p9_touch_right, p9_touch_bottom, "
        "p10_touch_center, p10_touch_top, p10_touch_bottom, p10_touch_side, "
        "p11_touch_center, p11_touch_top, p11_touch_bottom, "
        "p12_touch_center, p12_touch_top, p12_touch_bottom, "
        "arc_tracking_enabled, arc_tracking_left_right, arc_tracking_up_down, "
        "arc_tracking_klr, arc_tracking_kud, arc_tracking_step_max_lr, arc_tracking_step_max_ud, "
        "arc_tracking_sum_max_lr, arc_tracking_sum_max_ud, updated_at "
        "FROM welding_config WHERE id = 1"
    );
    if (!result) {
        return config;
    }
    MYSQL_ROW row = mysql_fetch_row(result);
    if (row) {
        int col = 0;
        config.touch_sensing_enabled = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.touch_speed = row[col] ? std::stod(row[col]) : 10.0; col++;
        config.touch_distance = row[col] ? std::stod(row[col]) : 100.0; col++;
        config.touch_offset_depth = row[col] ? std::stod(row[col]) : 5.0; col++;
        config.touch_approach_angle = row[col] ? std::stod(row[col]) : 20.0; col++;
        config.touch_sensing_velocity = row[col] ? std::stod(row[col]) : 1.0; col++;
        config.touch_sensing_acceleration = row[col] ? std::stod(row[col]) : 3.0; col++;
        config.touch_sensing_step_size = row[col] ? std::stod(row[col]) : 5.0; col++;
        config.touch_sensing_retract_distance = row[col] ? std::stod(row[col]) : 10.0; col++;
        config.touch_sensing_approach_offset = row[col] ? std::stod(row[col]) : 100.0; col++;
        config.touch_sensing_move_distance = row[col] ? std::stod(row[col]) : 0.5; col++;
        config.touch_sensing_point_speed = row[col] ? std::stod(row[col]) : 50.0; col++;
        config.touch_sensing_search_speed = row[col] ? std::stod(row[col]) : 3.0; col++;
        config.p1_touch_center = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p1_touch_left = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p1_touch_right = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p1_touch_bottom = row[col] ? (std::stoi(row[col]) != 0) : false; col++;
        config.p2_touch_center = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p2_touch_left = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p2_touch_right = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p3_touch_center = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p3_touch_left = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p3_touch_right = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p3_touch_bottom = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p4_touch_center = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p4_touch_top = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p4_touch_bottom = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p4_touch_side = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p5_touch_center = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p5_touch_top = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p5_touch_bottom = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p6_touch_center = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p6_touch_top = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p6_touch_bottom = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p7_touch_center = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p7_touch_left = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p7_touch_right = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p8_touch_center = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p8_touch_left = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p8_touch_right = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p9_touch_center = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p9_touch_left = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p9_touch_right = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p9_touch_bottom = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p10_touch_center = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p10_touch_top = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p10_touch_bottom = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p10_touch_side = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p11_touch_center = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p11_touch_top = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p11_touch_bottom = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p12_touch_center = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p12_touch_top = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.p12_touch_bottom = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.arc_tracking_enabled = row[col] ? (std::stoi(row[col]) != 0) : false; col++;
        config.arc_tracking_left_right = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.arc_tracking_up_down = row[col] ? (std::stoi(row[col]) != 0) : true; col++;
        config.arc_tracking_klr = row[col] ? std::stod(row[col]) : 0.06; col++;
        config.arc_tracking_kud = row[col] ? std::stod(row[col]) : 0.06; col++;
        config.arc_tracking_step_max_lr = row[col] ? std::stod(row[col]) : 5.0; col++;
        config.arc_tracking_step_max_ud = row[col] ? std::stod(row[col]) : 5.0; col++;
        config.arc_tracking_sum_max_lr = row[col] ? std::stod(row[col]) : 30.0; col++;
        config.arc_tracking_sum_max_ud = row[col] ? std::stod(row[col]) : 30.0; col++;
        config.updated_at = row[col] ? row[col] : ""; col++;
    }
    mysql_free_result(result);
    return config;
}
bool DatabaseService::updateWeldingConfig(const WeldingConfig& config) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::ostringstream query;
    query << "UPDATE welding_config SET "
          << "touch_sensing_enabled = " << (config.touch_sensing_enabled ? 1 : 0) << ", "
          << "touch_speed = " << config.touch_speed << ", "
          << "touch_distance = " << config.touch_distance << ", "
          << "touch_offset_depth = " << config.touch_offset_depth << ", "
          << "touch_approach_angle = " << config.touch_approach_angle << ", "
          << "touch_sensing_velocity = " << config.touch_sensing_velocity << ", "
          << "touch_sensing_acceleration = " << config.touch_sensing_acceleration << ", "
          << "touch_sensing_step_size = " << config.touch_sensing_step_size << ", "
          << "touch_sensing_retract_distance = " << config.touch_sensing_retract_distance << ", "
          << "touch_sensing_approach_offset = " << config.touch_sensing_approach_offset << ", "
          << "touch_sensing_move_distance = " << config.touch_sensing_move_distance << ", "
          << "touch_sensing_point_speed = " << config.touch_sensing_point_speed << ", "
          << "touch_sensing_search_speed = " << config.touch_sensing_search_speed << ", "
          << "p1_touch_center = " << (config.p1_touch_center ? 1 : 0) << ", "
          << "p1_touch_left = " << (config.p1_touch_left ? 1 : 0) << ", "
          << "p1_touch_right = " << (config.p1_touch_right ? 1 : 0) << ", "
          << "p1_touch_bottom = " << (config.p1_touch_bottom ? 1 : 0) << ", "
          << "p2_touch_center = " << (config.p2_touch_center ? 1 : 0) << ", "
          << "p2_touch_left = " << (config.p2_touch_left ? 1 : 0) << ", "
          << "p2_touch_right = " << (config.p2_touch_right ? 1 : 0) << ", "
          << "p3_touch_center = " << (config.p3_touch_center ? 1 : 0) << ", "
          << "p3_touch_left = " << (config.p3_touch_left ? 1 : 0) << ", "
          << "p3_touch_right = " << (config.p3_touch_right ? 1 : 0) << ", "
          << "p3_touch_bottom = " << (config.p3_touch_bottom ? 1 : 0) << ", "
          << "p4_touch_center = " << (config.p4_touch_center ? 1 : 0) << ", "
          << "p4_touch_top = " << (config.p4_touch_top ? 1 : 0) << ", "
          << "p4_touch_bottom = " << (config.p4_touch_bottom ? 1 : 0) << ", "
          << "p4_touch_side = " << (config.p4_touch_side ? 1 : 0) << ", "
          << "p5_touch_center = " << (config.p5_touch_center ? 1 : 0) << ", "
          << "p5_touch_top = " << (config.p5_touch_top ? 1 : 0) << ", "
          << "p5_touch_bottom = " << (config.p5_touch_bottom ? 1 : 0) << ", "
          << "p6_touch_center = " << (config.p6_touch_center ? 1 : 0) << ", "
          << "p6_touch_top = " << (config.p6_touch_top ? 1 : 0) << ", "
          << "p6_touch_bottom = " << (config.p6_touch_bottom ? 1 : 0) << ", "
          << "p7_touch_center = " << (config.p7_touch_center ? 1 : 0) << ", "
          << "p7_touch_left = " << (config.p7_touch_left ? 1 : 0) << ", "
          << "p7_touch_right = " << (config.p7_touch_right ? 1 : 0) << ", "
          << "p8_touch_center = " << (config.p8_touch_center ? 1 : 0) << ", "
          << "p8_touch_left = " << (config.p8_touch_left ? 1 : 0) << ", "
          << "p8_touch_right = " << (config.p8_touch_right ? 1 : 0) << ", "
          << "p9_touch_center = " << (config.p9_touch_center ? 1 : 0) << ", "
          << "p9_touch_left = " << (config.p9_touch_left ? 1 : 0) << ", "
          << "p9_touch_right = " << (config.p9_touch_right ? 1 : 0) << ", "
          << "p9_touch_bottom = " << (config.p9_touch_bottom ? 1 : 0) << ", "
          << "p10_touch_center = " << (config.p10_touch_center ? 1 : 0) << ", "
          << "p10_touch_top = " << (config.p10_touch_top ? 1 : 0) << ", "
          << "p10_touch_bottom = " << (config.p10_touch_bottom ? 1 : 0) << ", "
          << "p10_touch_side = " << (config.p10_touch_side ? 1 : 0) << ", "
          << "p11_touch_center = " << (config.p11_touch_center ? 1 : 0) << ", "
          << "p11_touch_top = " << (config.p11_touch_top ? 1 : 0) << ", "
          << "p11_touch_bottom = " << (config.p11_touch_bottom ? 1 : 0) << ", "
          << "p12_touch_center = " << (config.p12_touch_center ? 1 : 0) << ", "
          << "p12_touch_top = " << (config.p12_touch_top ? 1 : 0) << ", "
          << "p12_touch_bottom = " << (config.p12_touch_bottom ? 1 : 0) << ", "
          << "arc_tracking_enabled = " << (config.arc_tracking_enabled ? 1 : 0) << ", "
          << "arc_tracking_left_right = " << (config.arc_tracking_left_right ? 1 : 0) << ", "
          << "arc_tracking_up_down = " << (config.arc_tracking_up_down ? 1 : 0) << ", "
          << "arc_tracking_klr = " << config.arc_tracking_klr << ", "
          << "arc_tracking_kud = " << config.arc_tracking_kud << ", "
          << "arc_tracking_step_max_lr = " << config.arc_tracking_step_max_lr << ", "
          << "arc_tracking_step_max_ud = " << config.arc_tracking_step_max_ud << ", "
          << "arc_tracking_sum_max_lr = " << config.arc_tracking_sum_max_lr << ", "
          << "arc_tracking_sum_max_ud = " << config.arc_tracking_sum_max_ud
          << " WHERE id = 1";
    return executeQuery(query.str());
}
json DatabaseService::weldingConfigToJson(const WeldingConfig& config) {
    return {
        {"touch_sensing_enabled", config.touch_sensing_enabled},
        {"touch_speed", config.touch_speed},
        {"touch_distance", config.touch_distance},
        {"touch_offset_depth", config.touch_offset_depth},
        {"touch_approach_angle", config.touch_approach_angle},
        {"touch_sensing_velocity", config.touch_sensing_velocity},
        {"touch_sensing_acceleration", config.touch_sensing_acceleration},
        {"touch_sensing_step_size", config.touch_sensing_step_size},
        {"touch_sensing_retract_distance", config.touch_sensing_retract_distance},
        {"touch_sensing_approach_offset", config.touch_sensing_approach_offset},
        {"touch_sensing_move_distance", config.touch_sensing_move_distance},
        {"touch_sensing_point_speed", config.touch_sensing_point_speed},
        {"touch_sensing_search_speed", config.touch_sensing_search_speed},
        {"p1_touch_center", config.p1_touch_center},
        {"p1_touch_left", config.p1_touch_left},
        {"p1_touch_right", config.p1_touch_right},
        {"p1_touch_bottom", config.p1_touch_bottom},
        {"p2_touch_center", config.p2_touch_center},
        {"p2_touch_left", config.p2_touch_left},
        {"p2_touch_right", config.p2_touch_right},
        {"p3_touch_center", config.p3_touch_center},
        {"p3_touch_left", config.p3_touch_left},
        {"p3_touch_right", config.p3_touch_right},
        {"p3_touch_bottom", config.p3_touch_bottom},
        {"p4_touch_center", config.p4_touch_center},
        {"p4_touch_top", config.p4_touch_top},
        {"p4_touch_bottom", config.p4_touch_bottom},
        {"p4_touch_side", config.p4_touch_side},
        {"p5_touch_center", config.p5_touch_center},
        {"p5_touch_top", config.p5_touch_top},
        {"p5_touch_bottom", config.p5_touch_bottom},
        {"p6_touch_center", config.p6_touch_center},
        {"p6_touch_top", config.p6_touch_top},
        {"p6_touch_bottom", config.p6_touch_bottom},
        {"p7_touch_center", config.p7_touch_center},
        {"p7_touch_left", config.p7_touch_left},
        {"p7_touch_right", config.p7_touch_right},
        {"p8_touch_center", config.p8_touch_center},
        {"p8_touch_left", config.p8_touch_left},
        {"p8_touch_right", config.p8_touch_right},
        {"p9_touch_center", config.p9_touch_center},
        {"p9_touch_left", config.p9_touch_left},
        {"p9_touch_right", config.p9_touch_right},
        {"p9_touch_bottom", config.p9_touch_bottom},
        {"p10_touch_center", config.p10_touch_center},
        {"p10_touch_top", config.p10_touch_top},
        {"p10_touch_bottom", config.p10_touch_bottom},
        {"p10_touch_side", config.p10_touch_side},
        {"p11_touch_center", config.p11_touch_center},
        {"p11_touch_top", config.p11_touch_top},
        {"p11_touch_bottom", config.p11_touch_bottom},
        {"p12_touch_center", config.p12_touch_center},
        {"p12_touch_top", config.p12_touch_top},
        {"p12_touch_bottom", config.p12_touch_bottom},
        {"arc_tracking_enabled", config.arc_tracking_enabled},
        {"arc_tracking_left_right", config.arc_tracking_left_right},
        {"arc_tracking_up_down", config.arc_tracking_up_down},
        {"arc_tracking_klr", config.arc_tracking_klr},
        {"arc_tracking_kud", config.arc_tracking_kud},
        {"arc_tracking_step_max_lr", config.arc_tracking_step_max_lr},
        {"arc_tracking_step_max_ud", config.arc_tracking_step_max_ud},
        {"arc_tracking_sum_max_lr", config.arc_tracking_sum_max_lr},
        {"arc_tracking_sum_max_ud", config.arc_tracking_sum_max_ud},
        {"updated_at", config.updated_at}
    };
}
WeldingConfig DatabaseService::jsonToWeldingConfig(const json& j) {
    WeldingConfig config;
    if (j.contains("touch_sensing_enabled")) config.touch_sensing_enabled = j["touch_sensing_enabled"].get<bool>();
    if (j.contains("touch_speed")) config.touch_speed = j["touch_speed"].get<double>();
    if (j.contains("touch_distance")) config.touch_distance = j["touch_distance"].get<double>();
    if (j.contains("touch_offset_depth")) config.touch_offset_depth = j["touch_offset_depth"].get<double>();
    if (j.contains("touch_approach_angle")) config.touch_approach_angle = j["touch_approach_angle"].get<double>();
    if (j.contains("touch_sensing_velocity")) config.touch_sensing_velocity = j["touch_sensing_velocity"].get<double>();
    if (j.contains("touch_sensing_acceleration")) config.touch_sensing_acceleration = j["touch_sensing_acceleration"].get<double>();
    if (j.contains("touch_sensing_step_size")) config.touch_sensing_step_size = j["touch_sensing_step_size"].get<double>();
    if (j.contains("touch_sensing_retract_distance")) config.touch_sensing_retract_distance = j["touch_sensing_retract_distance"].get<double>();
    if (j.contains("touch_sensing_approach_offset")) config.touch_sensing_approach_offset = j["touch_sensing_approach_offset"].get<double>();
    if (j.contains("touch_sensing_move_distance")) config.touch_sensing_move_distance = j["touch_sensing_move_distance"].get<double>();
    if (j.contains("touch_sensing_point_speed")) config.touch_sensing_point_speed = j["touch_sensing_point_speed"].get<double>();
    if (j.contains("touch_sensing_search_speed")) config.touch_sensing_search_speed = j["touch_sensing_search_speed"].get<double>();
    if (j.contains("p1_touch_center")) config.p1_touch_center = j["p1_touch_center"].get<bool>();
    if (j.contains("p1_touch_left")) config.p1_touch_left = j["p1_touch_left"].get<bool>();
    if (j.contains("p1_touch_right")) config.p1_touch_right = j["p1_touch_right"].get<bool>();
    if (j.contains("p1_touch_bottom")) config.p1_touch_bottom = j["p1_touch_bottom"].get<bool>();
    if (j.contains("p2_touch_center")) config.p2_touch_center = j["p2_touch_center"].get<bool>();
    if (j.contains("p2_touch_left")) config.p2_touch_left = j["p2_touch_left"].get<bool>();
    if (j.contains("p2_touch_right")) config.p2_touch_right = j["p2_touch_right"].get<bool>();
    if (j.contains("p3_touch_center")) config.p3_touch_center = j["p3_touch_center"].get<bool>();
    if (j.contains("p3_touch_left")) config.p3_touch_left = j["p3_touch_left"].get<bool>();
    if (j.contains("p3_touch_right")) config.p3_touch_right = j["p3_touch_right"].get<bool>();
    if (j.contains("p3_touch_bottom")) config.p3_touch_bottom = j["p3_touch_bottom"].get<bool>();
    if (j.contains("p4_touch_center")) config.p4_touch_center = j["p4_touch_center"].get<bool>();
    if (j.contains("p4_touch_top")) config.p4_touch_top = j["p4_touch_top"].get<bool>();
    if (j.contains("p4_touch_bottom")) config.p4_touch_bottom = j["p4_touch_bottom"].get<bool>();
    if (j.contains("p4_touch_side")) config.p4_touch_side = j["p4_touch_side"].get<bool>();
    if (j.contains("p5_touch_center")) config.p5_touch_center = j["p5_touch_center"].get<bool>();
    if (j.contains("p5_touch_top")) config.p5_touch_top = j["p5_touch_top"].get<bool>();
    if (j.contains("p5_touch_bottom")) config.p5_touch_bottom = j["p5_touch_bottom"].get<bool>();
    if (j.contains("p6_touch_center")) config.p6_touch_center = j["p6_touch_center"].get<bool>();
    if (j.contains("p6_touch_top")) config.p6_touch_top = j["p6_touch_top"].get<bool>();
    if (j.contains("p6_touch_bottom")) config.p6_touch_bottom = j["p6_touch_bottom"].get<bool>();
    if (j.contains("p7_touch_center")) config.p7_touch_center = j["p7_touch_center"].get<bool>();
    if (j.contains("p7_touch_left")) config.p7_touch_left = j["p7_touch_left"].get<bool>();
    if (j.contains("p7_touch_right")) config.p7_touch_right = j["p7_touch_right"].get<bool>();
    if (j.contains("p8_touch_center")) config.p8_touch_center = j["p8_touch_center"].get<bool>();
    if (j.contains("p8_touch_left")) config.p8_touch_left = j["p8_touch_left"].get<bool>();
    if (j.contains("p8_touch_right")) config.p8_touch_right = j["p8_touch_right"].get<bool>();
    if (j.contains("p9_touch_center")) config.p9_touch_center = j["p9_touch_center"].get<bool>();
    if (j.contains("p9_touch_left")) config.p9_touch_left = j["p9_touch_left"].get<bool>();
    if (j.contains("p9_touch_right")) config.p9_touch_right = j["p9_touch_right"].get<bool>();
    if (j.contains("p9_touch_bottom")) config.p9_touch_bottom = j["p9_touch_bottom"].get<bool>();
    if (j.contains("p10_touch_center")) config.p10_touch_center = j["p10_touch_center"].get<bool>();
    if (j.contains("p10_touch_top")) config.p10_touch_top = j["p10_touch_top"].get<bool>();
    if (j.contains("p10_touch_bottom")) config.p10_touch_bottom = j["p10_touch_bottom"].get<bool>();
    if (j.contains("p10_touch_side")) config.p10_touch_side = j["p10_touch_side"].get<bool>();
    if (j.contains("p11_touch_center")) config.p11_touch_center = j["p11_touch_center"].get<bool>();
    if (j.contains("p11_touch_top")) config.p11_touch_top = j["p11_touch_top"].get<bool>();
    if (j.contains("p11_touch_bottom")) config.p11_touch_bottom = j["p11_touch_bottom"].get<bool>();
    if (j.contains("p12_touch_center")) config.p12_touch_center = j["p12_touch_center"].get<bool>();
    if (j.contains("p12_touch_top")) config.p12_touch_top = j["p12_touch_top"].get<bool>();
    if (j.contains("p12_touch_bottom")) config.p12_touch_bottom = j["p12_touch_bottom"].get<bool>();
    if (j.contains("arc_tracking_enabled")) config.arc_tracking_enabled = j["arc_tracking_enabled"].get<bool>();
    if (j.contains("arc_tracking_left_right")) config.arc_tracking_left_right = j["arc_tracking_left_right"].get<bool>();
    if (j.contains("arc_tracking_up_down")) config.arc_tracking_up_down = j["arc_tracking_up_down"].get<bool>();
    if (j.contains("arc_tracking_klr")) config.arc_tracking_klr = j["arc_tracking_klr"].get<double>();
    if (j.contains("arc_tracking_kud")) config.arc_tracking_kud = j["arc_tracking_kud"].get<double>();
    if (j.contains("arc_tracking_step_max_lr")) config.arc_tracking_step_max_lr = j["arc_tracking_step_max_lr"].get<double>();
    if (j.contains("arc_tracking_step_max_ud")) config.arc_tracking_step_max_ud = j["arc_tracking_step_max_ud"].get<double>();
    if (j.contains("arc_tracking_sum_max_lr")) config.arc_tracking_sum_max_lr = j["arc_tracking_sum_max_lr"].get<double>();
    if (j.contains("arc_tracking_sum_max_ud")) config.arc_tracking_sum_max_ud = j["arc_tracking_sum_max_ud"].get<double>();
    return config;
}
json DatabaseService::getWeldingPartOrder() {
    std::lock_guard<std::mutex> lock(m_mutex);
    json result = json::array();
    MYSQL_RES* res = executeSelect("SELECT part_index, execution_order, part_name, points FROM welding_part_order ORDER BY execution_order");
    if (!res) return result;
    MYSQL_ROW row;
    while ((row = mysql_fetch_row(res))) {
        json item;
        item["part_index"] = row[0] ? std::stoi(row[0]) : 0;
        item["execution_order"] = row[1] ? std::stoi(row[1]) : 0;
        item["part_name"] = row[2] ? row[2] : "";
        item["points"] = row[3] ? json::parse(row[3]) : json::array();
        result.push_back(item);
    }
    mysql_free_result(res);
    return result;
}
bool DatabaseService::updateWeldingPartOrder(const json& orderArray) {
    std::lock_guard<std::mutex> lock(m_mutex);
    for (size_t i = 0; i < orderArray.size(); i++) {
        auto& item = orderArray[i];
        int partIndex = item.value("part_index", (int)i);
        std::string sql = "UPDATE welding_part_order SET execution_order = " + std::to_string(i) +
            " WHERE part_index = " + std::to_string(partIndex);
        if (!executeQuery(sql)) return false;
    }
    return true;
}
#include "robot_core_all.h"
#include <iostream>
#include <sstream>
std::vector<WeldingLog> DatabaseService::getWeldingLogs(int limit, int offset, int jobId) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::vector<WeldingLog> logs;
    std::ostringstream query;
    query << "SELECT id, job_id, job_name, user_id, operation_type, start_type, "
          << "started_at, completed_at, total_distance_mm, cpm, "
          << "expected_duration_sec, actual_duration_sec, segments, "
          << "total_points, completed_points, weld_voltage, weld_current, "
          << "weaving_type, weave_params, points_snapshot, result_status, error_message, created_at "
          << "FROM welding_logs";
    if (jobId >= 0) {
        query << " WHERE job_id = " << jobId;
    }
    query << " ORDER BY started_at DESC LIMIT " << limit << " OFFSET " << offset;
    MYSQL_RES* result = executeSelect(query.str());
    if (!result) return logs;
    MYSQL_ROW row;
    while ((row = mysql_fetch_row(result))) {
        WeldingLog log;
        int col = 0;
        log.id = row[col] ? std::stoi(row[col]) : 0; col++;
        log.job_id = row[col] ? std::stoi(row[col]) : 0; col++;
        log.job_name = row[col] ? row[col] : ""; col++;
        log.user_id = row[col] ? row[col] : ""; col++;
        log.operation_type = row[col] ? row[col] : ""; col++;
        log.start_type = row[col] ? row[col] : "start"; col++;
        log.started_at = row[col] ? row[col] : ""; col++;
        log.completed_at = row[col] ? row[col] : ""; col++;
        log.total_distance_mm = row[col] ? std::stod(row[col]) : 0; col++;
        log.cpm = row[col] ? std::stod(row[col]) : 0; col++;
        log.expected_duration_sec = row[col] ? std::stod(row[col]) : 0; col++;
        log.actual_duration_sec = row[col] ? std::stod(row[col]) : 0; col++;
        if (row[col]) {
            try {
                log.segments = json::parse(row[col]);
            } catch (...) {
                log.segments = json::array();
            }
        }
        col++;
        log.total_points = row[col] ? std::stoi(row[col]) : 0; col++;
        log.completed_points = row[col] ? std::stoi(row[col]) : 0; col++;
        log.weld_voltage = row[col] ? std::stod(row[col]) : 0; col++;
        log.weld_current = row[col] ? std::stod(row[col]) : 0; col++;
        log.weaving_type = row[col] ? row[col] : ""; col++;
        if (row[col]) {
            try {
                log.weave_params = json::parse(row[col]);
            } catch (...) {
                log.weave_params = json::object();
            }
        }
        col++;
        if (row[col]) {
            try {
                log.points_snapshot = json::parse(row[col]);
            } catch (...) {
                log.points_snapshot = json::array();
            }
        }
        col++;
        log.result_status = row[col] ? row[col] : "pending"; col++;
        log.error_message = row[col] ? row[col] : ""; col++;
        log.created_at = row[col] ? row[col] : ""; col++;
        logs.push_back(log);
    }
    mysql_free_result(result);
    return logs;
}
int DatabaseService::getWeldingLogsCount(int jobId) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::ostringstream query;
    query << "SELECT COUNT(*) FROM welding_logs";
    if (jobId >= 0) {
        query << " WHERE job_id = " << jobId;
    }
    MYSQL_RES* result = executeSelect(query.str());
    if (!result) return 0;
    MYSQL_ROW row = mysql_fetch_row(result);
    int count = 0;
    if (row && row[0]) {
        count = std::stoi(row[0]);
    }
    mysql_free_result(result);
    return count;
}
WeldingLog DatabaseService::getWeldingLog(int id) {
    std::lock_guard<std::mutex> lock(m_mutex);
    WeldingLog log;
    std::ostringstream query;
    query << "SELECT id, job_id, job_name, user_id, operation_type, start_type, "
          << "started_at, completed_at, total_distance_mm, cpm, "
          << "expected_duration_sec, actual_duration_sec, segments, "
          << "total_points, completed_points, weld_voltage, weld_current, "
          << "weaving_type, weave_params, points_snapshot, result_status, error_message, created_at "
          << "FROM welding_logs WHERE id = " << id;
    MYSQL_RES* result = executeSelect(query.str());
    if (!result) return log;
    MYSQL_ROW row = mysql_fetch_row(result);
    if (row) {
        int col = 0;
        log.id = row[col] ? std::stoi(row[col]) : 0; col++;
        log.job_id = row[col] ? std::stoi(row[col]) : 0; col++;
        log.job_name = row[col] ? row[col] : ""; col++;
        log.user_id = row[col] ? row[col] : ""; col++;
        log.operation_type = row[col] ? row[col] : ""; col++;
        log.start_type = row[col] ? row[col] : "start"; col++;
        log.started_at = row[col] ? row[col] : ""; col++;
        log.completed_at = row[col] ? row[col] : ""; col++;
        log.total_distance_mm = row[col] ? std::stod(row[col]) : 0; col++;
        log.cpm = row[col] ? std::stod(row[col]) : 0; col++;
        log.expected_duration_sec = row[col] ? std::stod(row[col]) : 0; col++;
        log.actual_duration_sec = row[col] ? std::stod(row[col]) : 0; col++;
        if (row[col]) {
            try {
                log.segments = json::parse(row[col]);
            } catch (...) {
                log.segments = json::array();
            }
        }
        col++;
        log.total_points = row[col] ? std::stoi(row[col]) : 0; col++;
        log.completed_points = row[col] ? std::stoi(row[col]) : 0; col++;
        log.weld_voltage = row[col] ? std::stod(row[col]) : 0; col++;
        log.weld_current = row[col] ? std::stod(row[col]) : 0; col++;
        log.weaving_type = row[col] ? row[col] : ""; col++;
        if (row[col]) {
            try {
                log.weave_params = json::parse(row[col]);
            } catch (...) {
                log.weave_params = json::object();
            }
        }
        col++;
        if (row[col]) {
            try {
                log.points_snapshot = json::parse(row[col]);
            } catch (...) {
                log.points_snapshot = json::array();
            }
        }
        col++;
        log.result_status = row[col] ? row[col] : "pending"; col++;
        log.error_message = row[col] ? row[col] : ""; col++;
        log.created_at = row[col] ? row[col] : ""; col++;
    }
    mysql_free_result(result);
    return log;
}
int DatabaseService::createWeldingLog(const WeldingLog& log) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::ostringstream query;
    query << "INSERT INTO welding_logs ("
          << "job_id, job_name, user_id, operation_type, start_type, started_at, completed_at, "
          << "total_distance_mm, cpm, expected_duration_sec, actual_duration_sec, "
          << "segments, total_points, completed_points, weld_voltage, weld_current, "
          << "weaving_type, weave_params, points_snapshot, result_status, error_message"
          << ") VALUES ("
          << (log.job_id > 0 ? std::to_string(log.job_id) : "NULL") << ", "
          << "'" << escapeString(log.job_name) << "', "
          << "'" << escapeString(log.user_id) << "', "
          << "'" << escapeString(log.operation_type) << "', "
          << "'" << escapeString(log.start_type) << "', "
          << "'" << convertIso8601ToDatetime(log.started_at) << "', "
          << (log.completed_at.empty() ? "NULL" : "'" + convertIso8601ToDatetime(log.completed_at) + "'") << ", "
          << log.total_distance_mm << ", "
          << log.cpm << ", "
          << log.expected_duration_sec << ", "
          << log.actual_duration_sec << ", "
          << "'" << escapeString(log.segments.dump()) << "', "
          << log.total_points << ", "
          << log.completed_points << ", "
          << log.weld_voltage << ", "
          << log.weld_current << ", "
          << "'" << escapeString(log.weaving_type) << "', "
          << "'" << escapeString(log.weave_params.dump()) << "', "
          << "'" << escapeString(log.points_snapshot.dump()) << "', "
          << "'" << escapeString(log.result_status) << "', "
          << "'" << escapeString(log.error_message) << "'"
          << ")";
    if (!executeQuery(query.str())) {
        return -1;
    }
    return static_cast<int>(mysql_insert_id(m_conn));
}
bool DatabaseService::updateWeldingLog(const WeldingLog& log) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::ostringstream query;
    query << "UPDATE welding_logs SET "
          << "job_name = '" << escapeString(log.job_name) << "', "
          << "completed_at = " << (log.completed_at.empty() ? "NULL" : "'" + convertIso8601ToDatetime(log.completed_at) + "'") << ", "
          << "total_distance_mm = " << log.total_distance_mm << ", "
          << "cpm = " << log.cpm << ", "
          << "expected_duration_sec = " << log.expected_duration_sec << ", "
          << "actual_duration_sec = " << log.actual_duration_sec << ", "
          << "segments = '" << escapeString(log.segments.dump()) << "', "
          << "completed_points = " << log.completed_points << ", "
          << "result_status = '" << escapeString(log.result_status) << "', "
          << "error_message = '" << escapeString(log.error_message) << "' "
          << "WHERE id = " << log.id;
    return executeQuery(query.str());
}
bool DatabaseService::deleteWeldingLogs(const std::vector<int>& ids) {
    if (ids.empty()) return true;
    std::lock_guard<std::mutex> lock(m_mutex);
    std::ostringstream query;
    query << "DELETE FROM welding_logs WHERE id IN (";
    for (size_t i = 0; i < ids.size(); ++i) {
        if (i > 0) query << ", ";
        query << ids[i];
    }
    query << ")";
    return executeQuery(query.str());
}
json DatabaseService::weldingLogToJson(const WeldingLog& log) {
    return {
        {"id", log.id},
        {"job_id", log.job_id},
        {"job_name", log.job_name},
        {"user_id", log.user_id},
        {"operation_type", log.operation_type},
        {"start_type", log.start_type},
        {"started_at", log.started_at},
        {"completed_at", log.completed_at},
        {"total_distance_mm", log.total_distance_mm},
        {"cpm", log.cpm},
        {"expected_duration_sec", log.expected_duration_sec},
        {"actual_duration_sec", log.actual_duration_sec},
        {"segments", log.segments},
        {"total_points", log.total_points},
        {"completed_points", log.completed_points},
        {"weld_voltage", log.weld_voltage},
        {"weld_current", log.weld_current},
        {"weaving_type", log.weaving_type},
        {"weave_params", log.weave_params},
        {"points_snapshot", log.points_snapshot},
        {"result_status", log.result_status},
        {"error_message", log.error_message},
        {"created_at", log.created_at}
    };
}
WeldingLog DatabaseService::jsonToWeldingLog(const json& j) {
    WeldingLog log;
    if (j.contains("id")) log.id = j["id"].get<int>();
    if (j.contains("job_id") && !j["job_id"].is_null()) log.job_id = j["job_id"].get<int>();
    if (j.contains("job_name")) log.job_name = j["job_name"].is_null() ? "" : j["job_name"].get<std::string>();
    if (j.contains("user_id") && !j["user_id"].is_null()) log.user_id = j["user_id"].get<std::string>();
    if (j.contains("operation_type")) log.operation_type = j["operation_type"].get<std::string>();
    if (j.contains("start_type") && !j["start_type"].is_null()) log.start_type = j["start_type"].get<std::string>();
    if (j.contains("started_at")) log.started_at = j["started_at"].get<std::string>();
    if (j.contains("completed_at") && !j["completed_at"].is_null()) log.completed_at = j["completed_at"].get<std::string>();
    if (j.contains("total_distance_mm")) log.total_distance_mm = j["total_distance_mm"].get<double>();
    if (j.contains("cpm")) log.cpm = j["cpm"].get<double>();
    if (j.contains("expected_duration_sec")) log.expected_duration_sec = j["expected_duration_sec"].get<double>();
    if (j.contains("actual_duration_sec")) log.actual_duration_sec = j["actual_duration_sec"].get<double>();
    if (j.contains("segments")) log.segments = j["segments"];
    if (j.contains("total_points")) log.total_points = j["total_points"].get<int>();
    if (j.contains("completed_points")) log.completed_points = j["completed_points"].get<int>();
    if (j.contains("weld_voltage") && !j["weld_voltage"].is_null()) log.weld_voltage = j["weld_voltage"].get<double>();
    if (j.contains("weld_current") && !j["weld_current"].is_null()) log.weld_current = j["weld_current"].get<double>();
    if (j.contains("weaving_type") && !j["weaving_type"].is_null()) log.weaving_type = j["weaving_type"].get<std::string>();
    if (j.contains("weave_params")) log.weave_params = j["weave_params"];
    if (j.contains("points_snapshot")) log.points_snapshot = j["points_snapshot"];
    if (j.contains("result_status")) log.result_status = j["result_status"].get<std::string>();
    if (j.contains("error_message") && !j["error_message"].is_null()) log.error_message = j["error_message"].get<std::string>();
    return log;
}
#include "robot_core_all.h"
#include <iostream>
#include <sstream>
bool DatabaseService::logDebug(const std::string& source, const std::string& action, const std::string& details) {
    if (!m_conn || !m_connected) {
        return false;
    }
    std::ostringstream query;
    query << "INSERT INTO debug_logs (source, action, details) VALUES ("
          << "'" << escapeString(source) << "', "
          << "'" << escapeString(action) << "', "
          << "'" << escapeString(details) << "')";
    if (mysql_query(m_conn, query.str().c_str()) != 0) {
        return false;
    }
    return true;
}
json DatabaseService::getDebugLogs(int limit) {
    std::lock_guard<std::mutex> lock(m_mutex);
    json logsArray = json::array();
    std::ostringstream query;
    query << "SELECT id, timestamp, source, action, details FROM debug_logs "
          << "ORDER BY timestamp DESC LIMIT " << limit;
    MYSQL_RES* result = executeSelect(query.str());
    if (!result) return logsArray;
    MYSQL_ROW row;
    while ((row = mysql_fetch_row(result))) {
        json logEntry;
        logEntry["id"] = row[0] ? std::stoi(row[0]) : 0;
        logEntry["timestamp"] = row[1] ? row[1] : "";
        logEntry["source"] = row[2] ? row[2] : "";
        logEntry["action"] = row[3] ? row[3] : "";
        logEntry["details"] = row[4] ? row[4] : "";
        logsArray.push_back(logEntry);
    }
    mysql_free_result(result);
    return logsArray;
}
bool DatabaseService::clearDebugLogs() {
    std::lock_guard<std::mutex> lock(m_mutex);
    return executeQuery("TRUNCATE TABLE debug_logs");
}
bool DatabaseService::logApp(const std::string& level, const std::string& source, const std::string& page,
                             const std::string& action, const std::string& message, const json& data,
                             double duration_ms, const std::string& error_code, const std::string& error_stack) {
    if (!m_conn || !m_connected) {
        return false;
    }
    std::ostringstream query;
    query << "INSERT INTO app_logs (level, source, page, action, message, data, duration_ms, error_code, error_stack) VALUES ("
          << "'" << escapeString(level) << "', "
          << "'" << escapeString(source) << "', "
          << "'" << escapeString(page) << "', "
          << "'" << escapeString(action) << "', "
          << "'" << escapeString(message) << "', "
          << (data.is_null() ? "NULL" : "'" + escapeString(data.dump()) + "'") << ", "
          << (duration_ms < 0 ? "NULL" : std::to_string(duration_ms)) << ", "
          << (error_code.empty() ? "NULL" : "'" + escapeString(error_code) + "'") << ", "
          << (error_stack.empty() ? "NULL" : "'" + escapeString(error_stack) + "'") << ")";
    if (mysql_query(m_conn, query.str().c_str()) != 0) {
        return false;
    }
    return true;
}
bool DatabaseService::logAppBatch(const json& logs) {
    if (!m_conn || !m_connected || !logs.is_array() || logs.empty()) {
        return false;
    }
    std::ostringstream query;
    query << "INSERT INTO app_logs (level, source, page, action, message, data, duration_ms, error_code, error_stack) VALUES ";
    bool first = true;
    for (const auto& log : logs) {
        if (!first) query << ", ";
        first = false;
        std::string level = log.value("level", "info");
        std::string source = log.value("source", "frontend");
        std::string page = log.value("page", "");
        std::string action = log.value("action", "");
        std::string message = log.value("message", "");
        double duration_ms = log.value("duration_ms", -1.0);
        std::string error_code = log.value("error_code", "");
        std::string error_stack = log.value("error_stack", "");
        json data = log.contains("data") && !log["data"].is_null() ? log["data"] : json(nullptr);
        query << "("
              << "'" << escapeString(level) << "', "
              << "'" << escapeString(source) << "', "
              << "'" << escapeString(page) << "', "
              << "'" << escapeString(action) << "', "
              << "'" << escapeString(message) << "', "
              << (data.is_null() ? "NULL" : "'" + escapeString(data.dump()) + "'") << ", "
              << (duration_ms < 0 ? "NULL" : std::to_string(duration_ms)) << ", "
              << (error_code.empty() ? "NULL" : "'" + escapeString(error_code) + "'") << ", "
              << (error_stack.empty() ? "NULL" : "'" + escapeString(error_stack) + "'") << ")";
    }
    std::lock_guard<std::mutex> lock(m_mutex);
    return executeQuery(query.str());
}
json DatabaseService::getAppLogs(int limit, const std::string& level, const std::string& source) {
    std::lock_guard<std::mutex> lock(m_mutex);
    json logsArray = json::array();
    std::ostringstream query;
    query << "SELECT id, timestamp, level, source, page, action, message, data, duration_ms, error_code, error_stack "
          << "FROM app_logs WHERE 1=1";
    if (!level.empty()) {
        query << " AND level = '" << escapeString(level) << "'";
    }
    if (!source.empty()) {
        query << " AND source = '" << escapeString(source) << "'";
    }
    query << " ORDER BY timestamp DESC LIMIT " << limit;
    MYSQL_RES* result = executeSelect(query.str());
    if (!result) return logsArray;
    MYSQL_ROW row;
    while ((row = mysql_fetch_row(result))) {
        json logEntry;
        int col = 0;
        logEntry["id"] = row[col] ? std::stoi(row[col]) : 0; col++;
        logEntry["timestamp"] = row[col] ? row[col] : ""; col++;
        logEntry["level"] = row[col] ? row[col] : "info"; col++;
        logEntry["source"] = row[col] ? row[col] : ""; col++;
        logEntry["page"] = row[col] ? row[col] : ""; col++;
        logEntry["action"] = row[col] ? row[col] : ""; col++;
        logEntry["message"] = row[col] ? row[col] : ""; col++;
        if (row[col]) {
            try {
                logEntry["data"] = json::parse(row[col]);
            } catch (...) {
                logEntry["data"] = nullptr;
            }
        } else {
            logEntry["data"] = nullptr;
        }
        col++;
        if (row[col]) {
            logEntry["duration_ms"] = std::stod(row[col]);
        } else {
            logEntry["duration_ms"] = nullptr;
        }
        col++;
        logEntry["error_code"] = row[col] ? json(row[col]) : json(nullptr); col++;
        logEntry["error_stack"] = row[col] ? json(row[col]) : json(nullptr); col++;
        logsArray.push_back(logEntry);
    }
    mysql_free_result(result);
    return logsArray;
}
json DatabaseService::getErrorMessage(int mainCode, int subCode) {
    std::lock_guard<std::mutex> lock(m_mutex);
    json result = {
        {"main_code", mainCode},
        {"sub_code", subCode},
        {"description", nullptr},
        {"recoverable", true},
        {"found", false}
    };
    std::ostringstream query;
    query << "SELECT description_ko, recoverable FROM robot_error_codes "
          << "WHERE main_code = " << mainCode << " AND sub_code = " << subCode;
    MYSQL_RES* res = executeSelect(query.str());
    if (!res) {
        return result;
    }
    MYSQL_ROW row = mysql_fetch_row(res);
    if (row) {
        result["description"] = row[0] ? row[0] : "";
        result["recoverable"] = row[1] ? (std::stoi(row[1]) != 0) : true;
        result["found"] = true;
    }
    mysql_free_result(res);
    return result;
}
json DatabaseService::getUsers() {
    std::lock_guard<std::mutex> lock(m_mutex);
    json usersArray = json::array();
    std::string query = "SELECT id, username, name, email, role, active, last_login, created_at FROM users ORDER BY id";
    MYSQL_RES* result = executeSelect(query);
    if (!result) {
        return usersArray;
    }
    MYSQL_ROW row;
    while ((row = mysql_fetch_row(result))) {
        json user;
        user["id"] = row[0] ? std::stoi(row[0]) : 0;
        user["username"] = row[1] ? std::string(row[1]) : "";
        user["name"] = row[2] ? std::string(row[2]) : "";
        user["email"] = row[3] ? std::string(row[3]) : "";
        user["role"] = row[4] ? std::string(row[4]) : "operator";
        user["active"] = row[5] ? (std::stoi(row[5]) != 0) : false;
        user["lastLogin"] = row[6] ? json(row[6]) : json(nullptr);
        user["createdAt"] = row[7] ? std::string(row[7]) : "";
        usersArray.push_back(user);
    }
    mysql_free_result(result);
    return usersArray;
}
int DatabaseService::createUser(const std::string& username, const std::string& password,
                                 const std::string& name, const std::string& email, const std::string& role) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::ostringstream query;
    query << "INSERT INTO users (username, password_hash, name, email, role, active) VALUES ('"
          << escapeString(username) << "', SHA2('" << escapeString(password) << "', 256), '"
          << escapeString(name) << "', '" << escapeString(email) << "', '"
          << escapeString(role) << "', TRUE)";
    if (!executeQuery(query.str())) {
        return -1;
    }
    return static_cast<int>(mysql_insert_id(m_conn));
}
bool DatabaseService::updateUser(int userId, const json& data) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::ostringstream query;
    query << "UPDATE users SET ";
    bool first = true;
    if (data.contains("name")) {
        query << (first ? "" : ", ") << "name = '" << escapeString(data["name"].get<std::string>()) << "'";
        first = false;
    }
    if (data.contains("email")) {
        query << (first ? "" : ", ") << "email = '" << escapeString(data["email"].get<std::string>()) << "'";
        first = false;
    }
    if (data.contains("role")) {
        query << (first ? "" : ", ") << "role = '" << escapeString(data["role"].get<std::string>()) << "'";
        first = false;
    }
    if (data.contains("active")) {
        query << (first ? "" : ", ") << "active = " << (data["active"].get<bool>() ? "TRUE" : "FALSE");
        first = false;
    }
    if (data.contains("password") && !data["password"].get<std::string>().empty()) {
        query << (first ? "" : ", ") << "password_hash = SHA2('" << escapeString(data["password"].get<std::string>()) << "', 256)";
        first = false;
    }
    if (first) {
        return false;
    }
    query << " WHERE id = " << userId;
    return executeQuery(query.str());
}
bool DatabaseService::deleteUser(int userId) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::string checkQuery = "SELECT COUNT(*) FROM users WHERE role = 'admin' AND id != " + std::to_string(userId);
    MYSQL_RES* result = executeSelect(checkQuery);
    if (result) {
        MYSQL_ROW row = mysql_fetch_row(result);
        int adminCount = row && row[0] ? std::stoi(row[0]) : 0;
        mysql_free_result(result);
        if (adminCount == 0) {
            m_lastError = "Cannot delete the last admin user";
            return false;
        }
    }
    std::string query = "DELETE FROM users WHERE id = " + std::to_string(userId);
    return executeQuery(query);
}
json DatabaseService::authenticateUser(const std::string& username, const std::string& password) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::ostringstream query;
    query << "SELECT id, username, name, email, role, active FROM users "
          << "WHERE username = '" << escapeString(username) << "' "
          << "AND password_hash = SHA2('" << escapeString(password) << "', 256) "
          << "AND active = TRUE";
    MYSQL_RES* result = executeSelect(query.str());
    if (!result) {
        return nullptr;
    }
    MYSQL_ROW row = mysql_fetch_row(result);
    if (!row) {
        mysql_free_result(result);
        return nullptr;
    }
    json user;
    user["id"] = row[0] ? std::stoi(row[0]) : 0;
    user["username"] = row[1] ? row[1] : "";
    user["name"] = row[2] ? row[2] : "";
    user["email"] = row[3] ? row[3] : "";
    user["role"] = row[4] ? row[4] : "operator";
    mysql_free_result(result);
    std::ostringstream updateQuery;
    updateQuery << "UPDATE users SET last_login = NOW() WHERE id = " << user["id"].get<int>();
    executeQuery(updateQuery.str());
    return user;
}
#include "robot_core_all.h"
#include "robot_core_all.h"
#include <iostream>
#include <algorithm>
#include <cmath>
#ifdef _WIN32
#include <windows.h>
#include <dbghelp.h>
#endif
SafeShutdownManager::SafeShutdownManager(RobotService& robotService)
    : m_robotService(robotService) {
}
void SafeShutdownManager::emergencyWeldingShutdown() {
    if (!m_robotService.isConnected()) {
        FLOG_ERROR("SafeShutdown", "Robot not connected, cannot execute shutdown sequence");
        std::cerr << "[SafeShutdown] Robot not connected, cannot execute shutdown sequence" << std::endl;
        return;
    }
    FLOG_FATAL("SafeShutdown", "=== EMERGENCY WELDING SHUTDOWN START ===");
    std::cout << "[SafeShutdown] === EMERGENCY WELDING SHUTDOWN START ===" << std::endl;
    try {
        int arcResult = m_robotService.arcEnd(0, 0, 1000);
        FLOG_INFO("SafeShutdown", "Step 1/4 Arc OFF: result=" + std::to_string(arcResult));
        std::cout << "[SafeShutdown] Step 1/4: Arc OFF -> " << (arcResult == 0 ? "OK" : "WARN") << std::endl;
    } catch (...) {
        FLOG_ERROR("SafeShutdown", "Step 1/4 Arc OFF: EXCEPTION (continuing)");
        std::cerr << "[SafeShutdown] Step 1/4: Arc OFF -> EXCEPTION (continuing)" << std::endl;
    }
    try {
        int weaveResult = m_robotService.weaveEnd(0);
        FLOG_INFO("SafeShutdown", "Step 2/4 Weave OFF: result=" + std::to_string(weaveResult));
        std::cout << "[SafeShutdown] Step 2/4: Weave OFF -> " << (weaveResult == 0 ? "OK" : "WARN") << std::endl;
    } catch (...) {
        FLOG_ERROR("SafeShutdown", "Step 2/4 Weave OFF: EXCEPTION (continuing)");
        std::cerr << "[SafeShutdown] Step 2/4: Weave OFF -> EXCEPTION (continuing)" << std::endl;
    }
    try {
        int gasResult = m_robotService.setAspirated(0, 0);
        FLOG_INFO("SafeShutdown", "Step 3/4 Gas OFF: result=" + std::to_string(gasResult));
        std::cout << "[SafeShutdown] Step 3/4: Gas OFF -> " << (gasResult == 0 ? "OK" : "WARN") << std::endl;
    } catch (...) {
        FLOG_ERROR("SafeShutdown", "Step 3/4 Gas OFF: EXCEPTION (continuing)");
        std::cerr << "[SafeShutdown] Step 3/4: Gas OFF -> EXCEPTION (continuing)" << std::endl;
    }
    try {
        int stopResult = m_robotService.stopMotion();
        FLOG_INFO("SafeShutdown", "Step 4/4 StopMotion: result=" + std::to_string(stopResult));
        std::cout << "[SafeShutdown] Step 4/4: StopMotion -> " << (stopResult == 0 ? "OK" : "WARN") << std::endl;
    } catch (...) {
        FLOG_ERROR("SafeShutdown", "Step 4/4 StopMotion: EXCEPTION (continuing)");
        std::cerr << "[SafeShutdown] Step 4/4: StopMotion -> EXCEPTION (continuing)" << std::endl;
    }
    m_weldingActive = false;
    FLOG_FATAL("SafeShutdown", "=== EMERGENCY WELDING SHUTDOWN COMPLETE ===");
    std::cout << "[SafeShutdown] === EMERGENCY WELDING SHUTDOWN COMPLETE ===" << std::endl;
}
ReconnectBackoff::ReconnectBackoff(int baseMs, int maxMs, double multiplier)
    : m_baseMs(baseMs), m_maxMs(maxMs), m_multiplier(multiplier) {
}
int ReconnectBackoff::getNextDelay() {
    double delay = m_baseMs * std::pow(m_multiplier, m_attempts);
    int delayInt = static_cast<int>(delay);
    int delayMs = (delayInt < m_maxMs) ? delayInt : m_maxMs;
    m_attempts++;
    return delayMs;
}
void ReconnectBackoff::reset() {
    m_attempts = 0;
}
static SafeShutdownManager* g_shutdownMgr = nullptr;
#ifdef _WIN32
static LONG WINAPI sehHandler(EXCEPTION_POINTERS* exInfo) {
    DWORD code = exInfo ? exInfo->ExceptionRecord->ExceptionCode : 0;
    FLOG_FATAL("ProcessStability", "SEH exception caught: code=0x" + std::to_string(code));
    std::cerr << "[ProcessStability] SEH exception caught: 0x"
              << std::hex << code << std::dec << std::endl;
    if (g_shutdownMgr && g_shutdownMgr->isWeldingActive()) {
        FLOG_FATAL("ProcessStability", "Welding was active, executing emergency shutdown from SEH handler");
        std::cerr << "[ProcessStability] Welding was active, executing emergency shutdown..." << std::endl;
        g_shutdownMgr->emergencyWeldingShutdown();
    }
    return EXCEPTION_EXECUTE_HANDLER;
}
static void terminateHandler() {
    FLOG_FATAL("ProcessStability", "Unhandled C++ exception (std::terminate called)");
    std::cerr << "[ProcessStability] Unhandled C++ exception (std::terminate called)" << std::endl;
    if (g_shutdownMgr && g_shutdownMgr->isWeldingActive()) {
        FLOG_FATAL("ProcessStability", "Welding was active, executing emergency shutdown from terminate handler");
        std::cerr << "[ProcessStability] Welding was active, executing emergency shutdown..." << std::endl;
        g_shutdownMgr->emergencyWeldingShutdown();
    }
    std::abort();
}
#endif
void ProcessStability::installCrashHandlers(SafeShutdownManager* shutdownMgr) {
    g_shutdownMgr = shutdownMgr;
#ifdef _WIN32
    SetUnhandledExceptionFilter(sehHandler);
    FLOG_INFO("ProcessStability", "SEH handler installed");
    std::cout << "[ProcessStability] SEH handler installed" << std::endl;
#endif
    std::set_terminate(terminateHandler);
    FLOG_INFO("ProcessStability", "Terminate handler installed");
    std::cout << "[ProcessStability] Terminate handler installed" << std::endl;
}
void ProcessStability::uninstallCrashHandlers() {
    FLOG_INFO("ProcessStability", "Crash handlers uninstalled");
    g_shutdownMgr = nullptr;
#ifdef _WIN32
    SetUnhandledExceptionFilter(nullptr);
#endif
}
