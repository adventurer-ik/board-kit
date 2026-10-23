-- 게시판 첫 표. 모든 표는 board. 스키마(붙인 파일) 안에 있고 호스트 표와 외래키가 없다.
CREATE TABLE board.post (
  id          INTEGER PRIMARY KEY,
  category    TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  body_format TEXT NOT NULL DEFAULT 'text',
  author      TEXT NOT NULL,
  context     TEXT,                       -- JSON, 호스트가 정하는 내용
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  updated_at  TEXT,
  closed_at   TEXT,
  closed_by   TEXT,
  deleted_at  TEXT,
  deleted_by  TEXT
);
CREATE INDEX board.post_live ON post (deleted_at, id DESC);
CREATE INDEX board.post_cat  ON post (category, id DESC);

CREATE TABLE board.comment (
  id          INTEGER PRIMARY KEY,
  post_id     INTEGER NOT NULL REFERENCES post(id),
  body        TEXT NOT NULL,
  body_format TEXT NOT NULL DEFAULT 'text',
  author      TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  deleted_at  TEXT,
  deleted_by  TEXT
);
CREATE INDEX board.comment_post ON comment (post_id, id);

CREATE TABLE board.reaction (
  post_id     INTEGER NOT NULL REFERENCES post(id),
  author      TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'up',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  PRIMARY KEY (post_id, author, kind)
);

CREATE TABLE board.attachment (
  id          INTEGER PRIMARY KEY,
  owner_kind  TEXT NOT NULL,              -- post | comment
  owner_id    INTEGER NOT NULL,
  name        TEXT NOT NULL,              -- 올린 사람이 준 이름(화면용) — 디스크 이름은 path
  kind        TEXT NOT NULL,              -- 매직 바이트 판정(png · pcap …)
  mime        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  sha256      TEXT NOT NULL,
  display     TEXT NOT NULL DEFAULT 'file', -- inline | file
  path        TEXT NOT NULL,              -- 첨부 폴더 기준 상대 경로(내용 주소: ab/abcdef….png)
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  deleted_at  TEXT
);
CREATE INDEX board.attachment_owner ON attachment (owner_kind, owner_id, id);
CREATE INDEX board.attachment_sha ON attachment (sha256);
