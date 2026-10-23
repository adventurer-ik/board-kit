# board-kit

작은 소통 게시판. 어떤 관리 화면에도 붙여 쓰는 **독립 모듈** — 서버는 SQLite 파일 하나(`ATTACH`), 화면은 React 부품 묶음.

- 글(갈래 · 제목 · 본문 · 맥락) · 댓글 · 👍 · 닫기 · 소프트 삭제
- 글의 "완료" 는 목록 거르기용 표시일 뿐 — 완료 뒤에도 보기 · 댓글 · 글쓴이의 고치기는 그대로, 다시 열기 가능
- 비밀 댓글(글쓴이에게만): 글쓴이 · 쓴 사람 · 운영자만 본문 · 첨부를 보고, 남에게는 있다는 것과 쓴 사람만
- 첨부: 큰 그림은 화면이 줄인 미리보기(1600px webp)를 따로 올려 본문에 보이고 누르면 원본 · 붙인 뒤에도 "본문에 보이기 ↔ 파일로만" · 댓글 고치기(쓴 사람)
- 본문은 평문 + 줄바꿈 + 자동 링크 + ``` 울타리 — ```json ```py ```php ```node ```html 처럼 포맷을 적으면 색을 입혀 보임(26종, highlight.js 를 늦게 불러), json 은 정렬. 쓰기 창의 "코드 넣기…" 로 포맷을 골라 넣음
- 첨부 여러 개 — 그림은 **본문에 보이기 / 파일로만** 선택, 종류는 매직 바이트로 판정, svg 는 늘 파일
- JSONL 내보내기 · 가져오기(첨부 폴더를 함께 복사하면 그대로 돌아온다)
- 호스트 표와 외래키 없음 — 호스트를 바꿔도 게시판 파일은 그대로 옮겨 쓴다

## 쓰는 법 (NestJS + React)

서버:
```ts
import { BoardModule } from 'board-kit';

BoardModule.register({
  prefix: 'api/admin/board',
  imports: [StorageModule, AuthModule],
  inject: [Db, Settings, Notifier],
  useFactory: (db, settings, notifier) => ({
    db: db.handle,                                  // better-sqlite3 커넥션(프로세스당 하나)
    file: 'data/board.sqlite',
    attach: { dir: 'data/board', maxFiles: 5, maxBytes: 5 * 1024 * 1024, kinds: ['png', 'jpeg', 'gif', 'webp', 'text', 'json', 'pdf', 'zip', 'gzip', 'pcap', 'pcapng'] },
    enabled: () => settings.boardEnabled,
    actor: (req) => { const u = req.user; return u ? { name: u.username, moderator: u.isAdmin } : null; },
    context: () => ({ version: APP_VERSION }),      // 글마다 자동으로 붙는 맥락
    onEvent: (e) => notifier.emit('board', e),      // 실시간 알림 · 감사 로그는 호스트가
  }),
})
```

화면:
```tsx
import { Board, BoardProvider, WriteAboutButton } from 'board-kit/web';

<BoardProvider baseUrl="/api/admin/board" fetcher={api} lang="ko" formatTime={toLocal} context={() => ({ path: location.pathname })}>
  <Board postId={id} onNavigate={(id) => navigate(id ? `/board/${id}` : '/board')} />
  <WriteAboutButton onCreated={(id) => navigate(`/board/${id}`)} />   {/* 어느 화면 머리에든 */}
</BoardProvider>
```
첨부 올리기 · 가져오기는 요청 본문을 **스트림으로 그대로** 읽는다 — 호스트에 JSON 본문 파서가 먼저 돌면 그 두 경로는 제외한다(NestJS 기본 body-parser 는 `application/octet-stream` 을 건너뛰므로 보통 그대로 된다).

Tailwind 가 이 패키지의 소스를 읽어야 한다 — 호스트 CSS 에 `@source "../../node_modules/board-kit/src/web";` 한 줄. 색은 shadcn 식 토큰(`bg-background` · `text-muted-foreground` · `border` · `bg-primary` …)만 쓴다.

## 구조
```
src/shared   서버 · 화면이 같이 쓰는 모양 + 본문 해석(순수 함수)
src/core     틀 없는 본체 — 호스트 계약(host.ts) · 서비스 · SQL · 첨부 보관 · 매직 바이트
src/nest     NestJS 어댑터 — BoardModule.register(prefix, useFactory)
src/web      React — BoardProvider · Board · WriteAboutButton · 자체 ko/en 사전
```
설계는 `docs/DESIGN.md`.

## 개발
```bash
pnpm install && pnpm test && pnpm typecheck && pnpm build
```

MIT © adventurer-ik
