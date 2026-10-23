// 빌드 뒤 SQL 마이그레이션 파일을 dist 로 — tsc 는 .sql 을 옮기지 않는다
import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('dist/core/schema', { recursive: true });
cpSync('src/core/schema', 'dist/core/schema', { recursive: true });
