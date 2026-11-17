// [v1.1.307] 용접·터치센싱·아크 테스트 중 화면 이탈 막기.
// 용접 순서(아크 ON -> 이동 -> 아크 OFF)는 화면이 돌린다. 도중에 화면을 나가면 남은 명령(아크 OFF 등)을
// 보낼 곳이 없어진다. 펜던트 화면·용접부 선택 화면이 상태를 알리고, 메뉴·로그아웃·관리자 버튼과
// 자동 로그아웃이 이 값을 보고 막는다. 새로고침 등으로 페이지를 떠날 때는 브라우저 경고 창을 띄운다.
import { useSyncExternalStore } from 'react';

export const OPERATION_BUSY_MESSAGE = '용접·터치센싱 중에는 화면을 나갈 수 없습니다. 비상정지 후 이동하세요.';

let busy = false;
const listeners = new Set<() => void>();

export function setOperationBusy(value: boolean): void {
  if (busy === value) return;
  busy = value;
  listeners.forEach(l => l());
}
export function isOperationBusy(): boolean {
  return busy;
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function useOperationBusy(): boolean {
  return useSyncExternalStore(subscribe, isOperationBusy);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', e => {
    if (!busy) return;
    e.preventDefault();
    e.returnValue = '';
  });
}
