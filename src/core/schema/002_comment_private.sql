-- 비밀 댓글: 글쓴이 · 댓글 쓴 사람 · 운영자만 본문을 본다(다른 사람에게는 "비밀 댓글" 한 줄만)
ALTER TABLE board.comment ADD COLUMN private INTEGER NOT NULL DEFAULT 0;
