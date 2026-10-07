# 미사용 코드 조사 (robot-front, 2026-10-01)

v1.1.216 시점의 `robot-front/src` 118개 .ts/.tsx 파일을 대상으로
import 관계를 기계적으로 훑은 결과다. 아직 **아무것도 지우지 않았다.**

정리는 210~216이 현장에서 며칠 돌아 문제없는 게 확인되고,
새 기능 작업이 없는 구간에 단독 릴리즈로 하는 것을 전제로 한다.

## 1. 파일 통째로 죽은 것

| 파일 | 크기 | 상태 |
|---|---|---|
| `lib/mockApi/index.ts` | 12.4KB | export 17개 전부 미사용 |
| `pages/UcellSelect/components/unifiedCanvas/index.ts` | 0.7KB | 배럴인데 아무도 안 씀 |

`mockApi`는 import 그래프상 도달은 된다. `lib/index.ts`와 `lib/api/index.ts`가
`export * from './mockApi/index'` 로 재수출만 하고 있기 때문이다.
실제로 호출하는 곳은 없다. 지울 때 그 두 줄도 같이 지워야 한다.

`unifiedCanvas/index.ts`는 레이어들을 모아 내보내는 배럴인데,
`UnifiedWorkspaceCanvas.tsx`가 각 레이어를 개별 경로로 직접 import한다.

영향 범위가 가장 명확해서 1단계 후보다.

## 2. 모듈 안에서 안 쓰이는 export (총 220개)

많은 순이다.

### `lib/robotApi/index.ts` — 32개

실제 함수가 많다.

```
runUcellTestSequence, touchSearch,
wireSearchStart, wireSearchWait, getWireSearchOffset,
moveRobotToLocation, moveRobotWithBoth, moveRobotWithJoints, moveRobotWithTCF,
addPathRecord, getPathRecords, clearPathRecords,
waitForMoveComplete, updateTeachingJobStatus, getWeldingLog,
arcTraceOn, arcTraceOff
```

**주의 두 가지.**

- `arcTraceOn` / `arcTraceOff` 는 미사용으로 잡히지만, 아크 트래킹에 실제로 쓰는
  함수는 `arcTraceControl` 이다. 이름이 비슷하니 확인하고 지울 것.
- `wireSearch*` 는 와이어 터치서치 기능이다. 쓸 계획이 있으면 남긴다.

나머지는 타입 정의다(`ArcTraceParams`, `BatchMoveResult`, `TouchSearchResult` 등).

### `components/common/index.tsx` — 22개

Select 컴포넌트 세트 전체가 미사용이다.

```
Select, SelectTrigger, SelectContent, SelectItem, SelectGroup, SelectLabel,
SelectValue, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton,
Tabs, Tab, TextInput, TextInput_TextInput, Modal_Modal,
PageLayout_PageLayout, PageHeader, PageHeader_PageHeader,
FormInput_FormInput, LoadingScreen_LoadingScreen,
SettingsToggleRow_SettingsToggleRow, ButtonProps
```

### `utils/index.ts` — 21개

개발용 디버그 도구다.

```
DevDebugHelper, DevDebugConfig, destroyDevDebugHelper,
createTooltip, showTooltip, hideTooltip, removeTooltip,
getElementInfo, getReactSourceInfo, ElementInfo,
isAuditEnabled, setAuditEnabled, toggleAudit, toggleDebugMode,
getStatusLabel, getStatusBadgeClasses, getFullStatusConfig,
formatTime, formatRelativeTime, showCopyNotification, withRetry
```

### `pages/UcellSelect/index.tsx` — 15개

예전 시각화 자산으로 보인다.

```
UCellNormal3View, UCellSimpleView, UCellVisualization,
CollarPlateSvg, DefaultUCellSvg, ucell_images,
UCellColorPresets, UNIFIED_COLOR,
HORIZONTAL_LEFT_WEAVE_PARAMS, HORIZONTAL_RIGHT_WEAVE_PARAMS,
VERTICAL_WEAVE_PARAMS, DEFAULT_WELDING_PARTS, getWeldingParts,
PartBoundaryInfo, CellSelectionCore_CellSelectionCore
```

### 그 외

`hooks/index.ts` 10개, `lib/audio/index.ts` 7개, `lib/gapApi/index.ts` 7개,
`lib/updater/index.ts` 6개. 나머지는 파일당 1~5개씩이고 대부분 타입이다.

`lib/audio/index.ts`는 두 곳(`useCellSelectionHandlers.ts`, `pages/pendant`)이
import하므로 모듈 자체는 살아 있다. 어떤 함수를 쓰는지 확인하고 나머지만 정리한다.

## 3. 지우면 안 되는 것

**`global.d.ts`** — 어디서도 import되지 않지만 tsconfig가 읽는 앰비언트 선언이다.

**`__tests__/index.ts` 세 개 (52KB)** — 테스트가 202개 들어 있다.
테스트는 다른 코드가 import하지 않고 jest가 파일명 규칙으로 직접 찾아 실행하므로,
미사용 분석기에 "도달 안 됨"으로 잡힌다. 죽은 코드가 아니다.

| 파일 | 테스트 수 |
|---|---|
| `lib/robotApi/__tests__/index.ts` | 79 |
| `pages/UcellSelect/__tests__/index.ts` | 60 |
| `pages/UcellSelect/hooks/weldingCore/__tests__/index.ts` | 63 |

### 실제로 돌려본 결과 (2026-10-06)

`npm test -- --watchAll=false` 실행. **3개 스위트 전부 실행 실패, 통과한 테스트 0개.**
이전 판에 적어둔 "안 돌리고 있는 테스트"는 낙관적인 표현이었다.
정확히는 **코드가 테스트를 앞질러 간 뒤 아무도 손대지 않은 테스트**다.

| 파일 | 실패 원인 | 성격 |
|---|---|---|
| `lib/robotApi/__tests__` | `jest.mock('../client')` — `lib/robotApi/client`가 없다. 지금은 `lib/http.ts`의 `Axios`를 쓴다 | 구조 변경 미반영 |
| `weldingCore/__tests__` | `jest.mock('.../lib/logger')` — `lib/logger`가 없다. `createLogger`는 `lib/index.ts`에 있다 | 구조 변경 미반영 |
| `UcellSelect/__tests__` | axios v1이 ESM이라 jest가 변환 못 함 (`Cannot use import statement outside a module`) | 설정 문제 |

세 번째는 `package.json`의 jest 설정에 `transformIgnorePatterns`로 axios를 넣으면 풀린다.
앞의 두 개는 mock 경로를 고치면 일단 실행은 된다. 다만 모듈 경로가 저만큼 틀어져 있으면
함수 시그니처도 같이 틀어졌을 가능성이 크다. 경로만 고친 뒤 몇 개가 실제로 통과하는지는
돌려봐야 알 수 있고, 내용까지 낡았으면 테스트를 다시 쓰는 작업이 된다.

**결론: 지우지는 말고, 되살리는 것도 현장 검증이 끝난 뒤에 한다.**
이 테스트들은 지금 안전망 역할을 못 한다. 되살릴 때까지는 없는 셈 치고 작업할 것.
(2026-10-06 시점에 찾은 버그 세 건 — robot/error의 mutex 점유, 상태 폴링 연결 고갈,
 펜던트 Dry Run의 simMode 누락 — 은 모두 로그와 코드 읽기로 나왔다.)

**타입 / 인터페이스 export** (`...Props`, `...Return`) — 미사용으로 잡히지만
지워도 용량만 줄고 위험만 생긴다.

## 4. 라우트

`router/index.tsx`에 정의됐지만 코드 어디에서도 이동하지 않는 경로다.
URL을 직접 쳐야만 들어간다.

```
/gap/gap-input
gap/login
```

나머지는 `pages/main/Main.tsx`의 카드 배열(`path:` 필드)이나
`components/layout/index.tsx`에서 이동한다.

## 5. 범위

프런트만이다. `robot-core`와 `robot-back`은 아직 안 봤다.

## 6. 다시 돌리는 법

파일을 컨테이너나 로컬에 받아 `robot-front/src`에서 실행한다.
`index.tsx`에서 도달 안 되는 파일과, 다른 파일에서 한 번도 안 쓰이는 export를 뽑는다.

```python
import os, re, collections
files=[]
for dp,dn,fn in os.walk('.'):
    for f in fn:
        if f.endswith(('.ts','.tsx')):
            files.append(os.path.normpath(os.path.join(dp,f)))
files=sorted(files); fileset=set(files)
texts={f:open(f,encoding='utf-8',errors='replace').read() for f in files}
imp=re.compile(r"""(?:from\s+|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]""")
def resolve(src,spec):
    if not spec.startswith('.'): return None
    base=os.path.normpath(os.path.join(os.path.dirname(src),spec))
    for c in [base+'.ts',base+'.tsx',os.path.join(base,'index.ts'),os.path.join(base,'index.tsx')]:
        c=os.path.normpath(c)
        if c in fileset: return c
    return None
graph={f:{r for m in imp.finditer(texts[f]) if (r:=resolve(f,m.group(1)))} for f in files}
seen=set(); stack=['index.tsx']
while stack:
    cur=stack.pop()
    if cur in seen: continue
    seen.add(cur); stack.extend(graph.get(cur,()))
print('도달 안 됨:', [f for f in files if f not in seen])

exp=re.compile(r'export\s+(?:default\s+)?(?:async\s+)?(?:const|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)')
for f in files:
    for n in sorted(exp.findall(texts[f])):
        if not any(re.search(r'\b'+re.escape(n)+r'\b', texts[g]) for g in files if g!=f):
            print('미사용 export:', f, n)
```

배럴(`export *`)로 재수출되는 모듈은 "도달 안 됨"에 안 잡힌다.
mockApi가 그 경우였으니, 도달 목록만 믿지 말고 export 사용 여부를 같이 볼 것.
