import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { BoardError } from '../core/errors';

/** BoardError → HTTP 상태 + `{ code, ...detail }`. 화면은 code 로 문구를 고른다 */
@Catch(BoardError)
export class BoardErrorFilter implements ExceptionFilter<BoardError> {
  catch(e: BoardError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(e.status).json(e.toJSON());
  }
}
