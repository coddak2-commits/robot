// [v1.1.304] 로봇 컨트롤러 알람(주코드-부코드)의 쉬운 이름과 작업자용 조치 방법.
// 펜던트 알람 목록, 대시보드 시스템 알림, 화면 위쪽 빨간 오류 줄에서 같이 쓴다.
// 새 알람을 겪으면 아래 RULES 에 한 줄 추가하면 된다 (위에서부터 먼저 맞는 것을 쓴다).
// seen: 실제로 겪은 코드(1-23: 2026-11-10 P7 홈 복귀, 4-4: 2026-10-26 홈 -> P10). 나머지 이름은 업체 표 기준(공식 문서 미확인).

export interface AlarmGuide {
  name: string;
  action: string;
  seen: boolean;
}

interface Rule {
  main: number;
  sub?: [number, number];  // 부코드 범위(양끝 포함). 없으면 그 주코드 전부
  name: (sub: number) => string;
  action: string;
  seen?: boolean;
}

const RULES: Rule[] = [
  { main: 1, sub: [21, 38], name: s => `${Math.floor((s - 21) / 3) + 1}번 축 속도 초과`, seen: true,
    action: '에러 리셋 → 홈 버튼. 같은 자리에서 반복되면 관리자에게 연락 (교시 각도 문제)' },
  { main: 1, sub: [1, 6], name: s => `${s}번 축 움직임 한계 초과`,
    action: '에러 리셋 → 조그로 반대 방향으로 조금 이동 → 홈' },
  { main: 1, sub: [11, 16], name: s => `${s - 10}번 축 움직임 한계 초과`,
    action: '에러 리셋 → 조그로 반대 방향으로 조금 이동 → 홈' },
  { main: 4, sub: [1, 6], name: s => `${s}번 축 충돌 감지`, seen: true,
    action: '주변 확인 → 에러 리셋 → 조그로 부딪힌 곳에서 천천히 빼기 → 홈' },
  { main: 7, sub: [1, 2], name: s => (s === 1 ? '비상정지 버튼 눌림' : '외부 비상정지 신호'),
    action: '비상정지 버튼을 돌려서 해제 → 에러 리셋' },
  { main: 7, sub: [14, 15], name: () => '와이어 터치 실패',
    action: '와이어 길이(25mm)·끝 상태·모재 위치 확인 → 다시 터치센싱' },
  { main: 3, name: () => '특이 자세',
    action: '에러 리셋 → 홈. 반복되면 관리자에게 연락' },
  { main: 2, name: () => '도달할 수 없는 위치',
    action: '에러 리셋 → 홈. 그 포인트 다시 교시' },
  { main: 10, name: () => '도달할 수 없는 위치',
    action: '에러 리셋 → 홈. 그 포인트 다시 교시' },
  { main: 5, name: () => '통신 오류',
    action: '프로그램 종료 → 제어기 전원 껐다 켜기. 반복되면 관리자에게 연락' },
  { main: 6, name: () => '드라이버 오류',
    action: '프로그램 종료 → 제어기 전원 껐다 켜기. 반복되면 관리자에게 연락' },
];

export function getAlarmGuide(mainCode: number, subCode: number): AlarmGuide {
  for (const r of RULES) {
    if (r.main !== mainCode) continue;
    if (r.sub && (subCode < r.sub[0] || subCode > r.sub[1])) continue;
    return { name: r.name(subCode), action: r.action, seen: !!r.seen };
  }
  return { name: '알 수 없는 알람', action: '에러 리셋 → 안 되면 관리자에게 연락', seen: false };
}
