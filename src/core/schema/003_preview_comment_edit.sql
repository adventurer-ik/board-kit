-- 그림 첨부의 미리보기(화면이 줄여 올린 작은 그림 — 본문에는 이것을 보이고 누르면 원본)
ALTER TABLE board.attachment ADD COLUMN preview_path TEXT;
ALTER TABLE board.attachment ADD COLUMN preview_bytes INTEGER;
-- 댓글 고치기
ALTER TABLE board.comment ADD COLUMN updated_at TEXT;
