#ifndef ROBOT_CORE_ALL_H
#define ROBOT_CORE_ALL_H
#ifndef ROBOT_SERVICE_H
#define ROBOT_SERVICE_H
#include "robot.h"
#include "robot_types.h"
#include <string>
#include <mutex>
#include <atomic>
#include <thread>
#include <functional>
class RobotService {
public:
    using StateCallback = std::function<void(const ROBOT_STATE_PKG&)>;
    using ErrorCallback = std::function<void(int code, const std::string& message)>;
    RobotService();
    ~RobotService();
    int connect(const std::string& ip = "192.168.58.2");
    int disconnect();
    bool isConnected() const { return m_connected; }
    int enable();
    int disable();
    int setMode(int mode);
    ROBOT_STATE_PKG getState();
    int moveJ(const double joints[6], int tool, int user,
              float vel, float acc, float ovl, float blendT = -1.0f,
              uint8_t offsetFlag = 0, const double* offsetPos = nullptr);
    int moveL(const double descPos[6], int tool, int user,
              float vel, float acc, float ovl, float blendR = -1.0f,
              uint8_t search = 0, uint8_t offsetFlag = 0,
              const double* offsetPos = nullptr,
              int velAccParamMode = 0,
              int overSpeedStrategy = 0, int speedPercent = 10);
    int moveLWithJoints(const double joints[6], const double descPos[6],
                        int tool, int user, float vel, float acc, float ovl,
                        float blendR = -1.0f, uint8_t search = 0,
                        uint8_t offsetFlag = 0, const double* offsetPos = nullptr,
                        int velAccParamMode = 0, float oacc = 100.0f,
                        int overSpeedStrategy = 0, int speedPercent = 10);
    int stopMotion();
    int emergencyStop();
    int startJog(int ref, int nb, int dir, float vel, float acc, float maxDis);
    int stopJog(int ref);
    int immStopJog();
    int setToolPoint(int toolNum);
    int setUserPoint(int userNum);
    int setSpeed(float speed);
    int setWeldingCurrentRelation(double currentMin, double currentMax, double voltageMin, double voltageMax, int aoIndex);
    int setWeldingVoltageRelation(double weldVoltageMin, double weldVoltageMax, double voltageMin, double voltageMax, int aoIndex);
    int arcStart(int ioType, int arcNum, int timeout);
    int arcEnd(int ioType, int arcNum, int timeout);
    int setWeldingCurrent(int ioType, float current, int aoIndex, int blend);
    int setWeldingVoltage(int ioType, float voltage, int aoIndex, int blend);
    int setWeaveParams(int weaveNum, int weaveType, float freq, float range,
                       float leftRange, float rightRange,
                       float leftStayTime, float rightStayTime,
                       float circleRadio, float yawAngle, float rotAngle);
    int weaveStart(int weaveNum);
    int weaveEnd(int weaveNum);
    int wireSearchStart(int refPos, float searchVel, float searchDis,
                        int autoBackFlag, float autoBackVel, float autoBackDis,
                        int offsetFlag);
    int wireSearchEnd(int refPos, float searchVel, float searchDis,
                      int autoBackFlag, float autoBackVel, float autoBackDis,
                      int offsetFlag);
    int getForwardKin(const double joints[6], double descPos[6]);
    int getInverseKin(const double descPos[6], const double refJoints[6], double jointResult[6]);
    int moveC(const double jointsP[6], const double tcpP[6], int toolP, int userP, float velP,
              const double jointsT[6], const double tcpT[6], int toolT, int userT, float velT,
              float ovl, float blendR, float oacc = 100.0f, int velAccParamMode = 0);
    int getMotionDone(int* motionDone);
    int resetError();
    int setAspirated(int ioType, int airControl);
    int forwardWireFeed(int ioType, int wireFeed);
    int reverseWireFeed(int ioType, int wireFeed);
    void setStateCallback(StateCallback callback);
    void setErrorCallback(ErrorCallback callback);
    void startStateMonitor(int intervalMs = 50);
    void stopStateMonitor();
    void setAutoReconnect(bool enabled) { m_autoReconnect = enabled; }
    bool isAutoReconnectEnabled() const { return m_autoReconnect; }
    using ReconnectCallback = std::function<void(bool connected, const std::string& ip)>;
    void setReconnectCallback(ReconnectCallback callback) { m_reconnectCallback = callback; }
private:
    FRRobot m_robot;
    std::atomic<bool> m_connected{false};
    std::mutex m_mutex;
    std::string m_lastIp;
    std::atomic<bool> m_autoReconnect{true};
    std::atomic<int> m_reconnectAttempts{0};
    int m_currentReconnectDelayMs{3000};
    static const int BASE_RECONNECT_DELAY_MS = 3000;
    static const int MAX_RECONNECT_DELAY_MS = 60000;
    static constexpr double RECONNECT_BACKOFF_MULTIPLIER = 2.0;
    ReconnectCallback m_reconnectCallback;
    void resetReconnectBackoff();
    int getNextReconnectDelay();
    std::thread m_monitorThread;
    std::atomic<bool> m_monitorRunning{false};
    StateCallback m_stateCallback;
    ErrorCallback m_errorCallback;
    void monitorLoop(int intervalMs);
    bool checkConnection();
    bool tryReconnect();
};
#endif
#ifndef HTTP_SERVER_H
#define HTTP_SERVER_H
#include <string>
#include <thread>
#include <atomic>
#include <memory>
class RobotService;
class DatabaseService;
class HttpServer {
public:
    HttpServer(RobotService& robotService, DatabaseService* dbService = nullptr);
    ~HttpServer();
    bool start(int port = 8080);
    void stop();
    bool isRunning() const { return m_running; }
    int getPort() const { return m_port; }
    void setWebRoot(const std::string& path);
    std::string getWebRoot() const { return m_webRoot; }
private:
    class Impl;
    std::unique_ptr<Impl> m_impl;
    RobotService& m_robotService;
    DatabaseService* m_dbService;
    std::thread m_serverThread;
    std::atomic<bool> m_running{false};
    int m_port{8080};
    std::string m_webRoot;
    class EmergencyServerImpl;
    std::unique_ptr<EmergencyServerImpl> m_emergencyImpl;
    std::thread m_emergencyServerThread;
    std::atomic<bool> m_emergencyRunning{false};
    void startEmergencyServer();
    void stopEmergencyServer();
};
#endif
#ifndef MANAGEMENT_DIALOG_H
#define MANAGEMENT_DIALOG_H
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <windows.h>
#include <string>
#include <functional>
class ManagementDialog {
public:
    ManagementDialog();
    ~ManagementDialog();
    void show(HINSTANCE hInstance);
    void close();
    bool isVisible() const;
    void processMessages();
    void setRobotStatus(bool connected, const std::string& ip);
    void setHttpPort(int port);
    using Callback = std::function<void()>;
    void setRestartCoreCallback(Callback cb) { m_restartCoreCallback = cb; }
    void setExitCallback(Callback cb) { m_exitCallback = cb; }
private:
    HWND m_hwnd = nullptr;
    HINSTANCE m_hInstance = nullptr;
    HFONT m_hFont = nullptr;
    HBRUSH m_bgBrush = nullptr;
    bool m_robotConnected = false;
    std::string m_robotIp;
    int m_httpPort = 8080;
    bool m_httpRunning = false;
    bool m_dbRunning = false;
    bool m_frontRunning = false;
    bool m_gitInstalled = false;
    bool m_nodeInstalled = false;
    bool m_mariaInstalled = false;
    std::string m_gitVersion;
    std::string m_nodeVersion;
    std::string m_mariaVersion;
    std::string m_gitLatest;
    std::string m_nodeLatest;
    std::string m_mariaLatest;
    bool m_gitUpdateAvail = false;
    bool m_nodeUpdateAvail = false;
    bool m_mariaUpdateAvail = false;
    bool m_coreChecked = false;
    bool m_coreUpdateAvail = false;
    std::string m_coreVersion;
    std::string m_projectPath;
    Callback m_restartCoreCallback;
    Callback m_exitCallback;
    void createWindow();
    void createControls();
    void updateServiceStatus();
    void refreshInstallStatus();
    void updateButtonStates();
    void runHiddenCommand(const std::wstring& cmd, bool wait = true);
    std::string runWithProgress(const std::wstring& cmd, const std::wstring& statusText, int timeoutMs = 300000, bool capture = false);
    void handlePackageAction(int pkgId);
    void handleCoreUpdate();
    void refreshVersions();
    void doStartFrontend();
    void doStopFrontend();
    void doRestartFrontend();
    void toggleAutoStart();
    static bool checkMariaDBRunning();
    static bool checkPortListening(int port);
    static bool checkGitInstalled();
    static bool checkNodeInstalled();
    static bool checkMariaDBInstalled();
    static bool checkAutoStartEnabled();
    static bool checkCommandAvailable(const wchar_t* cmd);
    static std::string captureCommand(const std::wstring& cmd, int timeoutMs = 10000);
    static std::string normalizeVersion(const std::string& ver);
    static bool isNewerVersion(const std::string& installed, const std::string& latest);
    static std::wstring toWide(const std::string& s);
    static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);
    static ManagementDialog* s_instance;
};
#endif
#endif
#ifndef AUTH_SERVICE_H
#define AUTH_SERVICE_H
#include <string>
#include <map>
#include <mutex>
#include <ctime>
#include <nlohmann/json.hpp>
class AuthService {
public:
    static AuthService& instance();
    std::string createSession(int userId, const std::string& username, const std::string& role);
    nlohmann::json validateSession(const std::string& token);
    void removeSession(const std::string& token);
    void cleanExpiredSessions();
    void setSessionTimeout(int seconds) { m_sessionTimeout = seconds; }
    int getSessionTimeout() const { return m_sessionTimeout; }
    int getActiveSessionCount();
private:
    AuthService() = default;
    AuthService(const AuthService&) = delete;
    AuthService& operator=(const AuthService&) = delete;
    struct Session {
        int userId;
        std::string username;
        std::string role;
        std::time_t createdAt;
        std::time_t lastAccessAt;
    };
    std::map<std::string, Session> m_sessions;
    std::mutex m_mutex;
    int m_sessionTimeout = 28800;
    std::string generateToken();
};
#endif
#ifndef COMMAND_HANDLER_H
#define COMMAND_HANDLER_H
#include <nlohmann/json.hpp>
#include <string>
class RobotService;
using json = nlohmann::json;
class CommandHandler {
public:
    CommandHandler(RobotService& robotService);
    std::string handleCommand(const std::string& jsonRequest);
private:
    RobotService& m_robotService;
    json handleConnect(const json& params);
    json handleDisconnect(const json& params);
    json handleEnable(const json& params);
    json handleDisable(const json& params);
    json handleSetMode(const json& params);
    json handleGetState(const json& params);
    json handleMoveJ(const json& params);
    json handleMoveL(const json& params);
    json handleStop(const json& params);
    json handleEmergencyStop(const json& params);
    json handleSetSpeed(const json& params);
    json handleGetMotionDone(const json& params);
    json handleArcStart(const json& params);
    json handleArcEnd(const json& params);
    json handleSetWeldingCurrent(const json& params);
    json handleSetWeldingVoltage(const json& params);
    json handleSetWeaveParams(const json& params);
    json handleWeaveStart(const json& params);
    json handleWeaveEnd(const json& params);
    json handleWireSearchStart(const json& params);
    json handleWireSearchEnd(const json& params);
    json makeResponse(const std::string& status, int code,
                      const json& data = nullptr,
                      const std::string& message = "");
    json makeError(int code, const std::string& message);
    json makeSuccess(const json& data = nullptr);
};
#endif
#ifndef CONFIG_SERVICE_H
#define CONFIG_SERVICE_H
#include <string>
#include <map>
class ConfigService {
public:
    static ConfigService& instance();
    bool loadFromFile(const std::string& filePath = "");
    std::string get(const std::string& key, const std::string& defaultValue = "") const;
    int getInt(const std::string& key, int defaultValue = 0) const;
    std::string getDbHost() const;
    std::string getDbUser() const;
    std::string getDbPassword() const;
    std::string getDbName() const;
    unsigned int getDbPort() const;
private:
    ConfigService() = default;
    ConfigService(const ConfigService&) = delete;
    ConfigService& operator=(const ConfigService&) = delete;
    std::map<std::string, std::string> m_values;
    std::string getEnv(const std::string& envName) const;
    void parseLine(const std::string& line);
};
#endif
#ifndef DATABASE_SERVICE_H
#define DATABASE_SERVICE_H
#include <string>
#include <vector>
#include <mutex>
#include <memory>
#include <ctime>
#include <mysql.h>
#include <nlohmann/json.hpp>
using json = nlohmann::json;
struct TeachingJob {
    int id = 0;
    std::string name;
    std::string description;
    std::string status = "pending";
    int current_point_index = 0;
    int total_points = 0;
    std::string cell_type;
    int cell_id = 0;
    std::string cell_name;
    int width = 0;
    int height = 0;
    std::string created_at;
    std::string updated_at;
    std::string started_at;
    std::string completed_at;
};
struct TeachingPoint {
    int id = 0;
    int job_id = 0;
    std::string point_id;
    std::string name;
    int order = 0;
    double tcp_x = 0;
    double tcp_y = 0;
    double tcp_z = 0;
    double tcp_rx = 0;
    double tcp_ry = 0;
    double tcp_rz = 0;
    std::vector<double> joints;
    int tool_num = 0;
    int user_num = 0;
    double move_speed = 30.0;
    int vel_mode = 1;
    double weld_voltage = 0;
    double weld_current = 0;
    std::string weaving_type;
    json weave_params;
    bool is_saved = false;
    bool is_completed = false;
    std::string completed_at;
};
struct RobotSettings {
    int tool_num = 0;
    int user_num = 0;
    int default_vel = 20;
    int default_acc = 100;
    int default_ovl = 100;
    bool auto_clear_error = true;
    int min_weaving_distance = 50;
    std::string updated_at;
};
struct WeldingConfig {
    bool touch_sensing_enabled = true;
    double touch_speed = 10.0;
    double touch_distance = 100.0;
    double touch_offset_depth = 5.0;
    double touch_approach_angle = 20.0;
    double touch_sensing_velocity = 1.0;
    double touch_sensing_acceleration = 3.0;
    double touch_sensing_step_size = 5.0;
    double touch_sensing_retract_distance = 10.0;
    double touch_sensing_approach_offset = 100.0;
    double touch_sensing_move_distance = 0.5;
    double touch_sensing_point_speed = 50.0;
    double touch_sensing_search_speed = 3.0;
    bool p1_touch_center = true;
    bool p1_touch_left = true;
    bool p1_touch_right = true;
    bool p1_touch_bottom = false;
    bool p2_touch_center = true;
    bool p2_touch_left = true;
    bool p2_touch_right = true;
    bool p3_touch_center = true;
    bool p3_touch_left = true;
    bool p3_touch_right = true;
    bool p3_touch_bottom = true;
    bool p4_touch_center = true;
    bool p4_touch_top = true;
    bool p4_touch_bottom = true;
    bool p4_touch_side = true;
    bool p5_touch_center = true;
    bool p5_touch_top = true;
    bool p5_touch_bottom = true;
    bool p6_touch_center = true;
    bool p6_touch_top = true;
    bool p6_touch_bottom = true;
    bool p7_touch_center = true;
    bool p7_touch_left = true;
    bool p7_touch_right = true;
    bool p8_touch_center = true;
    bool p8_touch_left = true;
    bool p8_touch_right = true;
    bool p9_touch_center = true;
    bool p9_touch_left = true;
    bool p9_touch_right = true;
    bool p9_touch_bottom = true;
    bool p10_touch_center = true;
    bool p10_touch_top = true;
    bool p10_touch_bottom = true;
    bool p10_touch_side = true;
    bool p11_touch_center = true;
    bool p11_touch_top = true;
    bool p11_touch_bottom = true;
    bool p12_touch_center = true;
    bool p12_touch_top = true;
    bool p12_touch_bottom = true;
    bool arc_tracking_enabled = false;
    bool arc_tracking_left_right = true;
    bool arc_tracking_up_down = true;
    double arc_tracking_klr = 0.06;
    double arc_tracking_kud = 0.06;
    double arc_tracking_step_max_lr = 5.0;
    double arc_tracking_step_max_ud = 5.0;
    double arc_tracking_sum_max_lr = 30.0;
    double arc_tracking_sum_max_ud = 30.0;
    std::string updated_at;
};
struct WeldingLog {
    int id = 0;
    int job_id = 0;
    std::string job_name;
    std::string user_id;
    std::string operation_type;
    std::string start_type = "start";
    std::string started_at;
    std::string completed_at;
    double total_distance_mm = 0;
    double cpm = 0;
    double expected_duration_sec = 0;
    double actual_duration_sec = 0;
    json segments;
    int total_points = 0;
    int completed_points = 0;
    double weld_voltage = 0;
    double weld_current = 0;
    std::string weaving_type;
    json weave_params;
    json points_snapshot;
    std::string result_status = "pending";
    std::string error_message;
    std::string created_at;
};
class DatabaseService {
public:
    DatabaseService();
    ~DatabaseService();
    bool connect(const std::string& host = "",
                 const std::string& user = "",
                 const std::string& password = "",
                 const std::string& database = "",
                 unsigned int port = 0);
    void disconnect();
    bool isConnected() const { return m_connected; }
    bool reconnect();
    std::vector<TeachingJob> getJobs(int limit = 100, int offset = 0);
    TeachingJob getJob(int id);
    int createJob(const TeachingJob& job);
    bool updateJob(const TeachingJob& job);
    bool deleteJob(int id);
    std::vector<TeachingPoint> getPoints(int jobId);
    TeachingPoint getPoint(int id);
    int createPoint(const TeachingPoint& point);
    bool updatePoint(const TeachingPoint& point);
    bool deletePoint(int id);
    bool savePoints(int jobId, const std::vector<TeachingPoint>& points);
    RobotSettings getRobotSettings();
    bool updateRobotSettings(const RobotSettings& settings);
    static json settingsToJson(const RobotSettings& settings);
    static RobotSettings jsonToSettings(const json& j);
    WeldingConfig getWeldingConfig();
    bool updateWeldingConfig(const WeldingConfig& config);
    static json weldingConfigToJson(const WeldingConfig& config);
    static WeldingConfig jsonToWeldingConfig(const json& j);
    json getWeldingPartOrder();
    bool updateWeldingPartOrder(const json& orderArray);
    std::vector<WeldingLog> getWeldingLogs(int limit = 100, int offset = 0, int jobId = -1);
    int getWeldingLogsCount(int jobId = -1);
    WeldingLog getWeldingLog(int id);
    int createWeldingLog(const WeldingLog& log);
    bool updateWeldingLog(const WeldingLog& log);
    bool deleteWeldingLogs(const std::vector<int>& ids);
    static json weldingLogToJson(const WeldingLog& log);
    static WeldingLog jsonToWeldingLog(const json& j);
    std::string getLastError() const { return m_lastError; }
    json getErrorMessage(int mainCode, int subCode);
    bool logDebug(const std::string& source, const std::string& action, const std::string& details);
    json getDebugLogs(int limit = 100);
    bool clearDebugLogs();
    bool logApp(const std::string& level, const std::string& source, const std::string& page,
                const std::string& action, const std::string& message, const json& data = nullptr,
                double duration_ms = -1, const std::string& error_code = "", const std::string& error_stack = "");
    bool logAppBatch(const json& logs);
    json getAppLogs(int limit = 100, const std::string& level = "", const std::string& source = "");
    json getUsers();
    int createUser(const std::string& username, const std::string& password,
                   const std::string& name, const std::string& email, const std::string& role);
    bool updateUser(int userId, const json& data);
    bool deleteUser(int userId);
    json authenticateUser(const std::string& username, const std::string& password);
    static json jobToJson(const TeachingJob& job);
    static TeachingJob jsonToJob(const json& j);
    static json pointToJson(const TeachingPoint& point);
    static TeachingPoint jsonToPoint(const json& j);
private:
    MYSQL* m_conn = nullptr;
    bool m_connected = false;
    std::mutex m_mutex;
    std::string m_lastError;
    std::string m_host;
    std::string m_user;
    std::string m_password;
    std::string m_database;
    unsigned int m_port;
    std::string escapeString(const std::string& str);
    std::string getCurrentTimestamp();
    std::string convertIso8601ToDatetime(const std::string& iso8601);
    bool executeQuery(const std::string& query);
    MYSQL_RES* executeSelect(const std::string& query);
};
#endif
#ifndef FILE_LOGGER_H
#define FILE_LOGGER_H
#include <string>
#include <fstream>
#include <mutex>
#include <ctime>
enum class LogLevel {
    LOG_DEBUG = 0,
    LOG_INFO  = 1,
    LOG_WARN  = 2,
    LOG_ERROR = 3,
    LOG_FATAL = 4
};
class FileLogger {
public:
    static FileLogger& instance();
    void init(const std::string& logDir = "",
              int maxFileSizeMB = 50,
              int maxDaysToKeep = 30,
              LogLevel minLevel = LogLevel::LOG_DEBUG);
    void log(LogLevel level, const std::string& component, const std::string& message);
    void debug(const std::string& component, const std::string& message);
    void info(const std::string& component, const std::string& message);
    void warn(const std::string& component, const std::string& message);
    void error(const std::string& component, const std::string& message);
    void fatal(const std::string& component, const std::string& message);
    void robotSdkError(const std::string& sdkFunction, int resultCode,
                       const std::string& detail = "");
    void shutdown();
    std::string getLogDir() const { return m_logDir; }
private:
    FileLogger() = default;
    ~FileLogger();
    FileLogger(const FileLogger&) = delete;
    FileLogger& operator=(const FileLogger&) = delete;
    void rotateIfNeeded();
    void cleanOldLogs();
    std::string currentDateString() const;
    std::string currentTimestamp() const;
    static const char* levelToString(LogLevel level);
    std::mutex m_mutex;
    std::ofstream m_file;
    std::string m_logDir;
    std::string m_currentDate;
    std::string m_currentFilePath;
    int m_maxFileSizeBytes = 50 * 1024 * 1024;
    int m_maxDaysToKeep = 30;
    LogLevel m_minLevel = LogLevel::LOG_DEBUG;
    bool m_initialized = false;
    int m_fileIndex = 0;
};
#define FLOG_DEBUG(component, msg) FileLogger::instance().debug(component, msg)
#define FLOG_INFO(component, msg)  FileLogger::instance().info(component, msg)
#define FLOG_WARN(component, msg)  FileLogger::instance().warn(component, msg)
#define FLOG_ERROR(component, msg) FileLogger::instance().error(component, msg)
#define FLOG_FATAL(component, msg) FileLogger::instance().fatal(component, msg)
#define FLOG_SDK_ERROR(func, code, detail) \
    FileLogger::instance().robotSdkError(func, code, detail)
#endif
#ifndef TRAY_ICON_H
#define TRAY_ICON_H
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <string>
#include <functional>
#include <atomic>
#include <thread>
#define ID_TRAY_ICON            1001
#define ID_TRAY_STATUS_ROBOT    2001
#define ID_TRAY_STATUS_MARIADB  2002
#define ID_TRAY_SVC_START       2010
#define ID_TRAY_SVC_STOP        2011
#define ID_TRAY_SVC_RESTART     2012
#define ID_TRAY_SVC_MONITOR     2013
#define ID_TRAY_SVC_FRONT_START   2014
#define ID_TRAY_SVC_FRONT_STOP    2015
#define ID_TRAY_SVC_FRONT_RESTART 2016
#define ID_TRAY_SVC_CORE_RESTART  2017
#define ID_TRAY_INST_ALL        2020
#define ID_TRAY_INST_UPDATE     2021
#define ID_TRAY_INST_GIT        2022
#define ID_TRAY_INST_NODE       2023
#define ID_TRAY_INST_PM2        2024
#define ID_TRAY_INST_MARIADB    2025
#define ID_TRAY_AUTO_ENABLE     2030
#define ID_TRAY_AUTO_DISABLE    2031
#define ID_TRAY_BROWSER         2040
#define ID_TRAY_RESTART         2041
#define ID_TRAY_EXIT            2042
#define ID_TRAY_MAINWINDOW      2043
#define WM_TRAYICON         (WM_USER + 1)
class TrayIcon {
public:
    using Callback = std::function<void()>;
    TrayIcon();
    ~TrayIcon();
    bool initialize(const std::string& tooltip);
    void shutdown();
    void setTooltip(const std::string& tooltip);
    void setConnectionStatus(bool connected, const std::string& robotIp = "");
    void setRestartCallback(Callback cb) { m_restartCallback = cb; }
    void setExitCallback(Callback cb) { m_exitCallback = cb; }
    void setShowWindowCallback(Callback cb) { m_showWindowCallback = cb; }
    bool isRunning() const { return m_running; }
    void processMessages();
private:
    static LRESULT CALLBACK WindowProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);
    void createContextMenu();
    void showContextMenu();
    void onMenuCommand(int cmdId);
    bool isMariaDBRunning();
    bool isAutoStartEnabled();
    bool isGitInstalled();
    bool isNodeInstalled();
    bool isPm2Installed();
    bool isMariaDBInstalled();
    void runCommand(const std::wstring& cmd, bool show = false, bool wait = true);
    void startServices();
    void stopServices();
    void restartServices();
    void pm2Monitor();
    void startFrontend();
    void stopFrontend();
    void restartFrontend();
    void restartCore();
    bool isFrontendRunning();
    bool isCoreRunning();
    void installAll();
    void gitPull();
    void installGit();
    void installNode();
    void installPm2();
    void installMariaDB();
    void enableAutoStart();
    void disableAutoStart();
    void showMainWindow();
    HWND m_hwnd;
    NOTIFYICONDATAW m_nid;
    HICON m_hIcon;
    std::atomic<bool> m_running;
    bool m_connected;
    std::string m_robotIp;
    std::string m_projectPath;
    Callback m_restartCallback;
    Callback m_exitCallback;
    Callback m_showWindowCallback;
    static TrayIcon* s_instance;
};
#endif
#endif
#ifndef ZMQ_SERVER_H
#define ZMQ_SERVER_H
#include <zmq.hpp>
#include <string>
#include <thread>
#include <atomic>
#include <functional>
#include <memory>
class RobotService;
class ZmqServer {
public:
    ZmqServer(RobotService& robotService);
    ~ZmqServer();
    bool start(int cmdPort = 5555, int pubPort = 5556);
    void stop();
    bool isRunning() const { return m_running; }
    void publishState(const std::string& stateJson);
private:
    RobotService& m_robotService;
    std::unique_ptr<zmq::context_t> m_context;
    std::unique_ptr<zmq::socket_t> m_repSocket;
    std::unique_ptr<zmq::socket_t> m_pubSocket;
    std::thread m_cmdThread;
    std::atomic<bool> m_running{false};
    void commandLoop();
    std::string handleCommand(const std::string& request);
};
#endif
#ifndef HTTP_ROUTES_H
#define HTTP_ROUTES_H
#include "httplib.h"
#include <nlohmann/json.hpp>
#include <string>
class RobotService;
class DatabaseService;
namespace HttpRouteHelpers {
    void setCorsHeaders(httplib::Response& res);
    std::string makeSuccessResponse(const std::string& data = "null");
    std::string makeErrorResponse(int code, const std::string& message);
    nlohmann::json makeStatusResponse(int statusCode, const nlohmann::json& data = nullptr);
}
void registerRobotRoutes(
    httplib::Server& server,
    RobotService& robotService,
    int& port
);
void registerWeldingRoutes(
    httplib::Server& server,
    RobotService& robotService,
    DatabaseService* dbService
);
void registerTeachingRoutes(
    httplib::Server& server,
    RobotService& robotService,
    DatabaseService* dbService
);
void registerSdkRoutes(
    httplib::Server& server,
    RobotService& robotService,
    DatabaseService* dbService
);
void registerSdkMotionRoutes(
    httplib::Server& server,
    RobotService& robotService,
    DatabaseService* dbService
);
void registerWeldingBatchRoutes(
    httplib::Server& server,
    RobotService& robotService,
    DatabaseService* dbService
);
void requestBatchStop();
void resetBatchStop();
bool isBatchStopped();
void registerSystemRoutes(
    httplib::Server& server,
    DatabaseService* dbService
);
void registerUpdaterRoutes(
    httplib::Server& server,
    RobotService& robotService
);
#endif
#ifndef ERROR_RECOVERY_H
#define ERROR_RECOVERY_H
#include <string>
#include <functional>
#include <atomic>
#include <chrono>
class DatabaseService;
class SafeShutdownManager {
public:
    explicit SafeShutdownManager(RobotService& robotService);
    void emergencyWeldingShutdown();
    void setWeldingActive(bool active) { m_weldingActive = active; }
    bool isWeldingActive() const { return m_weldingActive; }
private:
    RobotService& m_robotService;
    std::atomic<bool> m_weldingActive{false};
};
class ReconnectBackoff {
public:
    ReconnectBackoff(int baseMs = 3000, int maxMs = 60000, double multiplier = 2.0);
    int getNextDelay();
    void reset();
    int attempts() const { return m_attempts; }
private:
    int m_baseMs;
    int m_maxMs;
    double m_multiplier;
    int m_attempts{0};
};
namespace ProcessStability {
    void installCrashHandlers(SafeShutdownManager* shutdownMgr);
    void uninstallCrashHandlers();
}
#endif
#ifndef MANAGEMENT_DIALOG_INTERNAL_H
#define MANAGEMENT_DIALOG_INTERNAL_H
#ifdef _WIN32
#include <shellapi.h>
#include <commctrl.h>
#include <iostream>
#include <sstream>
#include <vector>
#include <thread>
#include <atomic>
extern RobotService* g_robotService;
extern HttpServer* g_httpServer;
extern int g_httpPort;
extern std::string g_robotIp;
extern bool g_packagedMode;
enum {
    IDC_STATUS_HTTP = 1001,
    IDC_STATUS_SDK,
    IDC_STATUS_DB,
    IDC_STATUS_FRONT,
    IDC_HTTP_INFO,
    IDC_SDK_INFO,
    IDC_DB_INFO,
    IDC_FRONT_INFO,
    IDC_GIT_LABEL = 1010,
    IDC_NODE_LABEL,
    IDC_MARIA_LABEL,
    IDC_CORE_LABEL,
    IDC_BTN_GIT = 1030,
    IDC_BTN_NODE,
    IDC_BTN_MARIA,
    IDC_BTN_CORE_UPDATE,
    IDC_BTN_REFRESH = 1100,
    IDC_BTN_FRONT_START,
    IDC_BTN_FRONT_STOP,
    IDC_BTN_FRONT_RESTART,
    IDC_BTN_CORE_RESTART,
    IDC_BTN_BROWSER,
    IDC_CHK_AUTOSTART,
    IDC_CHK_AUTO_RECONNECT,
    IDC_BTN_CLOSE,
    IDC_BTN_EXIT,
};
#define TIMER_REFRESH 1
static inline HWND mkCtrl(HWND parent, LPCWSTR cls, LPCWSTR text, DWORD style,
                    int x, int y, int w, int h, int id, HFONT font) {
    HWND hwnd = CreateWindowW(cls, text, WS_CHILD | WS_VISIBLE | style,
                               x, y, w, h, parent, (HMENU)(intptr_t)id,
                               GetModuleHandle(NULL), nullptr);
    if (font) SendMessage(hwnd, WM_SETFONT, (WPARAM)font, TRUE);
    return hwnd;
}
#endif
#endif
#endif
