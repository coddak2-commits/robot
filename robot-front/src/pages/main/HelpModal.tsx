// [v1.1.305] 작업자용 도움말. 메뉴 화면 위쪽 '도움말' 버튼으로 연다.
// 내용을 바꾸려면 아래 SECTIONS 만 고치면 된다.
import React from 'react';

interface HelpSection {
  title: string;
  steps?: string[];   // 번호 붙는 순서
  items?: string[];   // 점 목록
}

const SECTIONS: HelpSection[] = [
  {
    title: '1. 용접 순서 (펜던트 화면)',
    steps: [
      "화면 위 '작업:' 이름을 확인합니다. 마지막으로 쓴 작업이 자동으로 불러와지며, 다른 작업이면 '작업 불러오기'로 고릅니다.",
      '터치센싱을 합니다.',
      'gap 크기를 입력합니다.',
      "'작업 저장'을 누릅니다. 입력한 gap 에 맞춰 전압·전류·속도·위빙이 자동으로 바뀝니다.",
      '체크박스로 용접할 곳을 고릅니다.',
      '용접을 시작합니다.',
    ],
  },
  {
    // [v1.1.316] 네 점 방식(1.1.314~) 사용법
    title: '2. 새 작업 포인트 찍기 (네 점)',
    steps: [
      '새 작업을 만들고 홈을 저장합니다.',
      'P1(왼쪽 위), P3(왼쪽 아래 코너), P7(오른쪽 위), P9(오른쪽 아래 코너)를 같은 툴로, 판에서 15~25mm 떨어지게 찍어 저장합니다.',
      "'나머지 포인트 만들기'를 누릅니다 (로봇 연결 필요).",
      '기울기 경고가 뜨면: P1·P7 을 잘못 찍었으면 취소하고 다시 찍습니다. 판이 휜 거라면 계속을 누르고 P2·P8 만 다시 찍습니다.',
      "'관절값 계산 실패' 알림이 뜬 포인트는 직접 찍습니다.",
      "'작업 저장'을 누른 뒤, 1번 용접 순서(터치센싱부터)대로 진행합니다.",
    ],
  },
  {
    title: '3. 끄기',
    items: [
      "메뉴에서 '프로그램 종료'를 누릅니다.",
      "'종료 완료, 제어기 전원을 꺼도 됩니다'가 뜬 뒤에 제어기 전원을 끕니다.",
      '그 문구가 뜨기 전에 전원을 끄면 안 됩니다.',
    ],
  },
  {
    title: '4. 이상이 생겼을 때',
    items: [
      "위험하면 바로 비상정지를 누릅니다 (화면의 '비상 정지' 또는 실제 버튼).",
      "알람 목록에 나온 노란 '조치' 문구를 따릅니다.",
      "해결되면 '에러 리셋'을 누르고 '홈으로 이동'으로 돌아갑니다.",
      '해결이 안 되거나 용접 불량이 나오면, 화면을 사진으로 찍어 관리자에게 알립니다.',
    ],
  },
  {
    title: '5. 하면 안 되는 것',
    items: [
      '로봇이 움직이는 동안 작업 반경 안에 들어가지 않습니다.',
      '프로그램 종료 전에 전원을 끄지 않습니다.',
      '설정은 관리자만 바꿉니다. 업데이트·백업·로그 내보내기도 관리자가 합니다.',
    ],
  },
  {
    title: '6. 상태 확인',
    items: [
      '대시보드의 시스템 점검에 빨간 칸이 있으면 사진을 찍어 관리자에게 알립니다.',
    ],
  },
];

interface HelpModalProps {
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
    <div
      className="w-[760px] max-w-[94vw] max-h-[90vh] flex flex-col rounded-2xl border border-gray-700 bg-gray-900"
      onClick={e => e.stopPropagation()}
    >
      <div className="px-6 pt-5 pb-3 border-b border-gray-700 text-2xl font-bold text-white">도움말</div>
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        {SECTIONS.map(sec => (
          <div key={sec.title}>
            <div className="text-lg font-bold text-cyan-300 mb-2">{sec.title}</div>
            {sec.steps && (
              <ol className="list-decimal pl-6 space-y-1 text-gray-200">
                {sec.steps.map(s => <li key={s}>{s}</li>)}
              </ol>
            )}
            {sec.items && (
              <ul className="list-disc pl-6 space-y-1 text-gray-200">
                {sec.items.map(s => <li key={s}>{s}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={onClose}
          className="w-full py-4 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-lg font-bold"
        >
          닫기
        </button>
      </div>
    </div>
  </div>
);
