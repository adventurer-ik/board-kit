# board-kit

작은 소통 게시판. 어떤 관리 화면에도 붙여 쓰는 **독립 모듈** — 서버는 SQLite 파일 하나(`ATTACH`), 화면은 React 부품 묶음.

- 글(갈래 · 제목 · 본문 · 맥락) · 댓글 · 👍 · 닫기 · 소프트 삭제
- 본문은 평문 + 줄바꿈 + 자동 링크 + ``` 울타리(```json 은 정렬해 보임)
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
