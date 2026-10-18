# 또병이 앱 (ttobyoung)

기병·와이프가 함께 보는 보기 전용 PWA. 빌드 없는 정적 사이트(Vercel 자동 배포).
데이터는 `data/*.json`만 고치면 되고, 앱 코드는 건드릴 필요 없음.

## 데이터 파일
- `data/events.json` — 일정 탭
  - `dueDate`: 출산 예정일. 날짜가 정해지면 `date: "YYYY-MM-DD"` 입력 (홈 상단 D-day가 바뀜), `events`의 `birth` 항목 `start`도 같이 수정하고 `tentative` 삭제
  - `events[]`: `id, title, start, end?, type, place?, note?`
    - `type`: `birth`(출산) `hospital`(병원검사) `anniv`(기념일) `trip`(여행) `shopping`(쇼핑·박람회)
    - `start`가 `YYYY-MM`이면 달력에 안 찍히고 "○월 예정"으로만 표시
  - `todos[]`: `id, title, due(YYYY-MM-DD|null), done, link?` (`link: "gear:<품목id>"`면 준비물 상세로 이동)
- `data/gear.json` — 준비물 탭
  - `status`는 `statuses` 중 하나: 조사 전 → 조사 중 → 조사 완료 → 매장 확인 → 구매 완료
  - 조사 끝나면: `pick`, `onlinePrice`(원 단위 숫자), `note`, `detail{summary, options[{name,price,pros,cons}], checks[], doc}` 채우고 status를 "조사 완료"로
  - 매장 다녀오면: `storePrice`, `storeNote` 채우고 "매장 확인"
  - 사면: "구매 완료", 구매처·금액은 `storeNote`에
  - 새 품목은 같은 형식으로 `items`에 추가 (`category`: 이동/수면/의류/수유/위생/건강/생활 등)
- `data/finance.json` — 경제 탭. 출생 후 `active: true`로 바꾸고 `sections[].items[{name,value}]` 채움
  - **계좌번호·카드번호·주민번호 등 식별번호는 절대 넣지 않음** (링크만 알면 누구나 볼 수 있는 페이지)

## 반영
각 파일 상단 `updated` 날짜를 바꾸고 main에 커밋·푸시 → Vercel이 1~2분 내 배포.
