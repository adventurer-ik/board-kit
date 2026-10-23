# board-kit 설계

## 1. 무엇을 위해
운영 · 시험 중인 어떤 관리 화면 안에서 "이렇게 하는 건 어때?" · "이렇게 하니 이렇게 되더라" 를 **그 화면 그 자리에서** 적고 나누는 작은 게시판. 외부 도구(위키 · 메신저)가 없는 폐쇄망에서도 쓰이고, 호스트 제품이 바뀌어도 글은 파일 하나로 따라간다.

## 2. 원칙
1. **호스트를 모른다.** 게시판은 `BoardHost` 계약(DB 커넥션 · 파일 경로 · 첨부 규칙 · 켬 여부 · 요청의 주체 · 맥락 · 사건 알림 · 갈래)만 받는다. 로그인 · 권한 · 알림 통로 · 감사 로그는 호스트 몫.
2. **파일 하나.** 자기 SQLite 파일을 호스트 커넥션에 `ATTACH` 한다(커넥션은 그대로 하나). 호스트 표와 외래키 없음. 작성자는 이름 글자. 그래서 호스트를 초기화해도 남고, 다른 호스트로 옮겨도 그대로 열린다.
3. **한 트랜잭션은 한 파일.** WAL 에서는 여러 파일에 걸친 트랜잭션이 원자적이지 않다 — 게시판은 호스트 메인 DB 를 쓰지 않는다.
4. **의존성 0.** 서버 본체는 `better-sqlite3`(peer)만. 화면은 react · react-query · lucide(peer). 검증 · 본문 해석 · 매직 바이트 모두 손으로.
5. **지우지 않는다.** 글 · 댓글은 `deleted_at`. 비우기(`wipe`)는 호스트가 명시적으로 부를 때만.
6. **올린 것을 믿지 않는다.** 종류는 첫 4KB 매직 바이트로. 그림(png · jpeg · gif · webp)만 `inline`, svg 는 스크립트가 들어갈 수 있어 늘 파일. 내려줄 때 `nosniff` + inline 그림 외에는 `attachment`.

## 3. 표 (`board.` 스키마)
| 표 | 열 | 메모 |
|---|---|---|
| post | id · category · title · body · body_format('text') · author · context(JSON) · created_at · updated_at · closed_at/by · deleted_at/by | 맥락은 호스트가 정한 JSON — 목록 거르기는 `json_extract` |
| comment | id · post_id → post · body · body_format · author · created_at · deleted_at/by | |
| reaction | post_id · author · kind('up') · created_at | PK (post_id, author, kind) — 토글 |
| attachment | id · owner_kind(post/comment) · owner_id · name · kind · mime · bytes · sha256 · display(inline/file) · path · created_at · deleted_at | path 는 내용 주소 `ab/abcdef….ext` — 같은 파일은 디스크에 하나 |
| schema_migration | version · name · sha256 · applied_at | 패키지 자기 마이그레이션 |

시각은 UTC `YYYY-MM-DD HH:MM:SS`. 보는 쪽이 시간대를 바꾼다(`formatTime`).

## 4. 규칙
- 글 고치기: 글쓴이만, 열린 글만. 닫기 · 다시 열기 · 지우기: 글쓴이 또는 운영자(`moderator`). 댓글 지우기도 같다. 운영자라도 남의 글 본문은 못 고친다.
- 목록 기본은 열린 글. 닫힌 글은 골라서. keyset(`before=id`) 로 넘긴다.
- 첨부는 글 · 댓글 `id` 가 생긴 뒤 붙인다(새 글 = 만들기 → 올리기). 하나가 실패해도 글은 남고 그 줄에 이유가 남는다.
- 맥락은 화면이 보낸 것 위에 호스트 `context(req)` 가 덮인다(버전 같은 값을 화면이 속일 수 없게).
- 사건(`onEvent`)은 글쓰기를 막지 않는다 — 호스트 콜백이 던져도 삼킨다.

## 5. 본문 형식 `text`
평문 + 줄바꿈 + `http(s)://` 자동 링크 + 울타리 블록(```` ``` ```` 또는 ```` ```lang ````). `json` 울타리는 파싱되면 2칸 들여쓰기로 정렬해 보이고(원문은 그대로 저장), 안 되면 "JSON 아님" 표시. 닫히지 않은 울타리도 상자로. markdown 은 넣지 않는다 — `body_format` 열에 자리만.

## 6. 내보내기 · 가져오기
JSONL — 첫 줄 머리(`kind: board-kit`), 그 뒤 글 한 줄(댓글 · 반응 · 첨부 메타 포함, 지운 글은 지운 채로). 첨부 파일은 첨부 폴더를 그대로 복사하면 내용 주소로 맞는다. 가져오기는 새 id 로 붙이고 원래 id 는 `context._importedId` 에 남긴다. 파일이 없는 첨부는 건너뛰고 수를 돌려준다.

## 7. 호스트가 할 일 (체크리스트)
- [ ] `BoardModule.register` — prefix · useFactory(host)
- [ ] 기능 스위치(기본 끔) · 메뉴 한 줄 · 화면 머리의 `WriteAboutButton`
- [ ] `onEvent` → 실시간 알림 · 감사 로그(지우기만 권함)
- [ ] 백업에 `board.sqlite`(`db.backup(dest, { attached: 'board' })`), 첨부 폴더는 선택
- [ ] 초기화 범위에서 **빼기** — 지우려면 `BoardService.wipe()` 를 명시적 옵션으로
- [ ] 상태 화면에 파일 크기 한 줄(선택) · CLI 내보내기/가져오기(선택)
- [ ] Tailwind `@source` 한 줄 · 토큰 이름 맞추기
- [ ] 호스트에 **본문을 미리 읽는 미들웨어**(JSON 파서)가 있으면 첨부 올리기(`POST …/posts/:id/attachments` · `…/comments/:id/attachments`)와 `POST …/import` 를 **제외** — 패키지는 요청 스트림을 그대로 읽는다
