import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import Database from 'better-sqlite3';
import type { Response } from 'express';
import { BoardError } from '../core/errors';
import { BoardService } from '../core/service';

type SqliteErr = InstanceType<typeof Database.SqliteError>;

/** BoardError → HTTP 상태 + `{ code, ...detail }`. 화면은 code 로 문구를 고른다 */
@Catch(BoardError)
export class BoardErrorFilter implements ExceptionFilter<BoardError> {
  catch(e: BoardError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(e.status).json(e.toJSON());
  }
}

/** 요청 도중 SQLite 가 알리는 손상 — 이 코드들이면 게시판을 사용 불가로 돌린다(다음 요청부터 503, 간격마다 다시 열어 봄) */
const CORRUPT = new Set(['SQLITE_CORRUPT', 'SQLITE_NOTADB', 'SQLITE_IOERR', 'SQLITE_CANTOPEN', 'SQLITE_READONLY_DBMOVED']);

/**
 * 게시판 라우트 안의 SQLite 오류 — 손상이면 BoardService.markFault 로 격리하고 503 BOARD_UNAVAILABLE,
 * 그 밖(제약 위반 같은 버그)은 500 BOARD_INTERNAL. 호스트 서버의 다른 기능은 어느 쪽이든 영향이 없다.
 */
@Catch(Database.SqliteError)
export class SqliteFaultFilter implements ExceptionFilter<SqliteErr> {
  constructor(private readonly svc: BoardService) {}
  catch(e: SqliteErr, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const code = String(e.code ?? '').split('_').slice(0, 2).join('_'); // SQLITE_IOERR_READ → SQLITE_IOERR
    if (CORRUPT.has(code) || CORRUPT.has(String(e.code ?? ''))) {
      this.svc.markFault(`${e.code}: ${e.message}`);
      const f = this.svc.status().fault;
      res.status(503).json({ code: 'BOARD_UNAVAILABLE', since: f?.since, message: f?.message });
      return;
    }
    res.status(500).json({ code: 'BOARD_INTERNAL', sqlite: e.code });
  }
}
