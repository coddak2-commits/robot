#define MyAppName "Robot Welding Control"
#define MyAppVersion "1.1.52"
#define MyAppPublisher "Robot Welding"
#define MyAppExeName "robot_core.exe"

[Setup]
AppId={{6F1E2C6E-6E6F-4C1B-9C5A-7B7E9B3E0A11}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={pf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=.\dist
OutputBaseFilename=RobotWeldingControl_Setup_{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
SetupIconFile=robot-core\resources\app.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
ArchitecturesAllowed=x64

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"

[Files]
; robot_core 실행파일 + DLL
Source: "robot-core\build-unity\robot_core.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "robot-core\build-unity\fairino.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "robot-core\build-unity\libmariadb.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "robot-core\build-unity\libzmq-mt-4_3_5.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "robot-core\runtime-deps\msvcp140.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "robot-core\runtime-deps\vcruntime140.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "robot-core\runtime-deps\vcruntime140_1.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "robot-core\runtime-deps\zlib1.dll"; DestDir: "{app}"; Flags: ignoreversion

; config.ini: 기존 설정 파일이 있으면 절대 덮어쓰지 않음 (실제 필드 DB 정보 보존)
Source: "robot-core\config.ini.example"; DestDir: "{app}"; DestName: "config.ini"; Flags: onlyifdoesntexist
Source: "robot-core\config.ini.example"; DestDir: "{app}"; Flags: ignoreversion

; robot-back (갭 파라미터 백엔드, Python->exe)
Source: "robot-back\dist\robot-back.exe"; DestDir: "{app}"; Flags: ignoreversion
; .env: 기존 설정 파일이 있으면 절대 덮어쓰지 않음 (DB 계정 정보 보존)
Source: "robot-back\env.deploy.ini"; DestDir: "{app}"; DestName: ".env"; Flags: onlyifdoesntexist

; 두 백엔드를 함께 띄우는 런처
Source: "launcher.bat"; DestDir: "{app}"; Flags: ignoreversion

; 프론트엔드 빌드 결과물 (robot-model, sound 포함)
Source: "robot-front\build\*"; DestDir: "{app}\www"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\launcher.bat"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\launcher.bat"; IconFilename: "{app}\{#MyAppExeName}"

[Run]
Filename: "{app}\launcher.bat"; Description: "지금 실행"; Flags: nowait postinstall skipifsilent
