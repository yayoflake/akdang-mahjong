# 🀄 넷마작 — 브라우저 온라인 리치마작

▶ **플레이: https://yayoflake.github.io/akdang-mahjong/**

서버 없이 **GitHub Pages 정적 호스팅만으로** 동작하는 온라인 4인 리치마작 게임입니다.
방장의 브라우저가 게임 마스터 역할을 하고, 참가자는 PeerJS(WebRTC P2P)로 연결됩니다.

## 플레이 방법

1. **방 만들기** — 닉네임을 입력하고 방을 만들면 6자리 방 코드가 생성됩니다.
2. **참가** — 친구는 방 코드(또는 초대 링크)로 같은 페이지에서 참가합니다.
3. 사람이 부족하면 방장이 **🤖 AI 추가** 버튼으로 빈 자리를 채울 수 있습니다.
   대국 시작 시 남은 빈 자리는 자동으로 AI가 채웁니다.
   (AI는 쯔모기리만 합니다 — 뽑은 패를 그대로 버리며, 울지도 화료하지도 않습니다)
4. **연습 대국** — 네트워크 없이 혼자 AI 3인과 연습할 수 있습니다.

조작: 버릴 패를 **두 번 클릭**(선택 → 확정)합니다. 론/퐁/치/깡/리치 등은 버튼으로 선택합니다.

대국 중 참가자의 접속이 끊기면 해당 자리는 쯔모기리 AI가 이어받아 대국이 끊기지 않습니다.

## 룰 (천봉/작혼 계열 표준 룰)

- 4인 반장전(동·남) 또는 동풍전, 시작 25,000점, 순위 우마 +20/+10/−10/−20
- 적도라 3장(5만·5통·5삭 각 1장), 쿠이탕 허용, 일발·우라도라·깡도라·깡우라 있음
- 더블론 허용(트리플론은 유국), 도중유국 있음(구종구패·사풍연타·4인 리치·사개깡), 나가시 만관 있음
- 토비(0점 미만) 종료, 오라스 1위 어가리야메, 동점 시 연장전(서든데스)
- 역만 책임지불(파오) 있음, 헤아림 역만 있음

진행·역·점수 계산은 [電脳麻将(@kobalab/majiang-core)](https://github.com/kobalab/majiang-core) 엔진을 사용합니다.

## GitHub Pages 배포

GitHub Pages는 `gh-pages` 브랜치(루트)에서 서빙됩니다. 빌드 산출물 `dist/app.js`가
저장소에 포함되어 있으므로, 변경 후에는 빌드하고 두 브랜치에 푸시하면 끝입니다.

```bash
npm run build
git push origin main           # 소스
git push origin main:gh-pages  # 배포 (Pages 서빙 브랜치)
```

## 개발

```bash
npm install          # 의존성 설치
npm run build        # src/ → dist/app.js 번들 (esbuild)
npm test             # 헤드리스 통합 테스트 (AI 수백 대국 시뮬레이션)
node test/browser.js # Playwright 브라우저 테스트 (솔로 + 실제 P2P 멀티)
```

| 경로 | 내용 |
|---|---|
| `src/main.js` | 화면 전환, 방(로비) 관리, 게임 시작/종료 오케스트레이션 |
| `src/net.js` | PeerJS 호스트/게스트 연결, 하트비트, 끊김 감지 |
| `src/players.js` | 쯔모기리 AI, 원격 플레이어 프록시(이탈 시 AI 대타) |
| `src/uiplayer.js` | 사람 플레이어의 합법 행동 계산(리치/론/퐁/치/깡/창깡 등) |
| `src/ui.js` | 탁자·손패·버림패·부로·결과창 렌더링 |
| `src/tiles.js`, `src/yaku.js` | 패 표기 파싱·타일 DOM, 역 이름 한국어화 |

## 크레딧

- 마작 엔진: [@kobalab/majiang-core](https://github.com/kobalab/majiang-core) (MIT, 小林聡 님)
- 타일 이미지: [FluffyStuff/riichi-mahjong-tiles](https://github.com/FluffyStuff/riichi-mahjong-tiles) (CC BY 4.0)
- P2P 통신: [PeerJS](https://peerjs.com/) (MIT)
