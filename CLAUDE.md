# 또병이 앱 (ttobyoung)

기병·와이프가 함께 쓰는 PWA. 빌드 없는 정적 사이트(Vercel 자동 배포) + Firebase Firestore(프로젝트 `ttobyoung`).

## 구조
- `index.html` `styles.css` `app.js`(화면) `db.js`(Firestore 연결) `sw.js` `manifest.webmanifest`
- 데이터는 저장소가 아니라 Firestore `families/{가족코드}/` 아래에 있음
  - `meta/settings` (`createdAt`, `lastBackupAt`), `meta/finance`
  - `events/{id}`, `todos/{id}`, `gear/{id}`
- `firestore.rules`: 가족 코드(4자 이상)를 아는 기기만 읽기·쓰기. 바꾸면 Firebase 콘솔 → Firestore → 규칙에 붙여넣고 게시해야 반영됨
- **가족 코드는 저장소·커밋·이 파일에 절대 쓰지 않음** (코드가 유일한 잠금장치)

## 앱에서 직접 하는 것
일정·할 일 추가/수정/삭제, 할 일 체크, 준비물 상태·매장가·매장 메모, 설정에서 백업 받기·파일 불러오기

## Claude가 데이터를 바꾸는 방법
이 환경에서는 Firestore에 직접 접속할 수 없음. 대신 **업데이트 파일**을 만들어 사용자에게 보내고, 사용자가 앱 설정 → 파일 불러오기로 적용.

```json
{
  "type": "ttobyoung-update",
  "note": "젖병 조사 결과",
  "gear":   [ { "id": "bottle", "status": "조사 완료", "pick": "...", "onlinePrice": 30000, "note": "...",
               "detail": { "summary": "...", "options": [ { "name": "...", "price": "...", "pros": "...", "cons": "..." } ],
                           "checks": ["..."], "doc": "https://..." } } ],
  "events": [ { "id": "...", "title": "...", "type": "hospital", "start": "2026-11-20", "end": null, "place": "...", "note": "..." } ],
  "todos":  [ { "id": "...", "title": "...", "due": "2026-11-20", "done": false } ],
  "remove": [ { "col": "todos", "id": "t4" } ],
  "finance": { "active": true, "sections": [ ... ] }
}
```
- 같은 id는 **필드 단위로 병합**(merge), 새 id는 추가. 보낸 필드만 바뀌고 앱에서 입력한 `storePrice`·`storeNote` 등은 유지됨
- 기존 준비물 id: carseat stroller carrier crib bedding swaddle clothes outerwrap bottle sterilizer formula-pot pump nursing-pillow diaper wipes tub nail thermometer humidifier bouncer monitor
- 새 준비물은 `category`(이동/수면/의류/수유/위생/건강/생활), `name`, `when`(출산 전/후), `order`(정렬, 기존 0~20) 포함
- `status`: 조사 전 → 조사 중 → 조사 완료 → 매장 확인 → 구매 완료
- 일정 `type`: birth hospital anniv trip shopping etc. `start`가 `YYYY-MM`이면 월만 표시
- 사용자가 앱에서 이미 고쳤을 수 있으니, 바꿀 필요 없는 필드는 보내지 않기
- 파일명 예: `ttobyoung-update-2026-11-01-bottle.json`

**백업 파일**(`"type": "ttobyoung-backup"`)은 불러오면 전체를 교체하므로, Claude는 업데이트 파일만 만든다.

## 경제 탭
`meta/finance` = `{ active, intro, sections: [{ id, title, items: [{ name, value }] }] }`.
**계좌번호·카드번호·주민번호 등 식별번호는 절대 넣지 않음.** 은행명·용도·금액 정도만.
