import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseIntPipe, Patch, Post, Put, Query, Req, Res, UseFilters } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import type { AttachDisplay, ListQuery } from '../shared/types';
import { BoardError } from '../core/errors';
import type { Actor, BoardHost } from '../core/host';
import { BoardService, LIMITS, type PostInput } from '../core/service';
import { BoardErrorFilter, SqliteFaultFilter } from './errors.filter';

export const BOARD_HOST = Symbol('BOARD_HOST');

/**
 * HTTP 어댑터 — 요청에서 actor · context 를 뽑아 BoardService 에 넘기고, 결과를 JSON 으로.
 * 경로 접두어는 호스트가 정하므로 `boardController(prefix)` 가 이 클래스를 상속해 @Controller(prefix) 를 붙인다.
 * 본문 검사는 손으로(의존성 0) — 길이 · 종류만 보고 나머지는 service 가 거른다.
 */
@UseFilters(BoardErrorFilter, SqliteFaultFilter)
export class BoardControllerBase {
  constructor(
    protected readonly svc: BoardService,
    @Inject(BOARD_HOST) protected readonly host: BoardHost<Request>,
  ) {}

  protected actor(req: Request): Actor {
    this.svc.assertEnabled();
    this.svc.assertAvailable();
    const a = this.host.actor(req);
    if (!a) throw new BoardError('BOARD_UNAUTHORIZED');
    return a;
  }

  protected moderator(req: Request): Actor {
    const a = this.actor(req);
    if (!a.moderator) throw new BoardError('BOARD_FORBIDDEN');
    return a;
  }

  @Get('config')
  config(@Req() req: Request) {
    // 꺼져 있어도 · 파일을 못 열었어도 config 는 준다 — 화면이 "꺼짐" · "사용 불가" 를 그릴 수 있게
    return this.svc.config(this.host.actor(req));
  }

  /** 파일을 고친 뒤 [다시 시도] — 운영자. 간격을 기다리지 않고 바로 다시 연다 */
  @Post('retry')
  @HttpCode(200)
  retry(@Req() req: Request) {
    this.svc.assertEnabled();
    const a = this.host.actor(req);
    if (!a) throw new BoardError('BOARD_UNAUTHORIZED');
    if (!a.moderator) throw new BoardError('BOARD_FORBIDDEN');
    this.svc.recover(true);
    return this.svc.config(a);
  }

  /** [새로 시작] — 운영자. 고장 상태에서만: 깨진 파일 · 첨부 폴더를 옆으로 옮기고 빈 게시판으로 */
  @Post('reset')
  @HttpCode(200)
  reset(@Req() req: Request) {
    this.svc.assertEnabled();
    const a = this.host.actor(req);
    if (!a) throw new BoardError('BOARD_UNAUTHORIZED');
    if (!a.moderator) throw new BoardError('BOARD_FORBIDDEN');
    const r = this.svc.startFresh(a);
    return { ...this.svc.config(a), movedTo: r.movedTo };
  }

  @Get('posts')
  list(@Req() req: Request, @Query() q: Record<string, string | undefined>) {
    this.actor(req);
    const lq: ListQuery = {
      category: str(q['category']),
      contextKey: str(q['contextKey']),
      contextValue: q['contextKey'] ? (q['contextValue'] ?? '') : undefined,
      author: str(q['author']),
      q: str(q['q'])?.slice(0, 200),
      closed: q['closed'] === 'closed' || q['closed'] === 'all' ? q['closed'] : 'open',
      before: num(q['before']),
      limit: num(q['limit']),
    };
    return this.svc.list(lq);
  }

  @Get('posts/facets')
  facets(@Req() req: Request, @Query('key') key: string | undefined) {
    this.actor(req);
    return this.svc.facets(key ?? 'path');
  }

  @Get('stats')
  stats(@Req() req: Request) {
    this.actor(req);
    return this.svc.stats();
  }

  @Post('posts')
  create(@Req() req: Request, @Body() body: unknown) {
    const a = this.actor(req);
    return this.svc.create(postInput(body), a, this.host.context?.(req) ?? {});
  }

  @Get('posts/:id')
  get(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    return this.svc.get(id, this.actor(req));
  }

  @Put('posts/:id')
  update(@Req() req: Request, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.svc.update(id, postInput(body), this.actor(req));
  }

  @Post('posts/:id/close')
  close(@Req() req: Request, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const closed = (body as { closed?: unknown } | undefined)?.closed !== false;
    return this.svc.close(id, this.actor(req), closed);
  }

  @Delete('posts/:id')
  @HttpCode(204)
  remove(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    this.svc.remove(id, this.actor(req));
  }

  @Post('posts/:id/comments')
  comment(@Req() req: Request, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const b = (body as { body?: unknown } | undefined)?.body;
    if (typeof b !== 'string') throw new BoardError('BOARD_INVALID', { field: 'body', max: LIMITS.comment });
    return this.svc.addComment(id, b, this.actor(req), (body as { private?: unknown })?.private === true);
  }

  @Put('comments/:id')
  updateComment(@Req() req: Request, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const b = (body as { body?: unknown } | undefined)?.body;
    if (typeof b !== 'string') throw new BoardError('BOARD_INVALID', { field: 'body', max: LIMITS.comment });
    return this.svc.updateComment(id, b, this.actor(req));
  }

  @Delete('comments/:id')
  @HttpCode(204)
  removeComment(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    this.svc.removeComment(id, this.actor(req));
  }

  @Post('posts/:id/react')
  react(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    return this.svc.react(id, this.actor(req));
  }

  // ── 첨부 — 본문은 파일 바이트 그대로(application/octet-stream), 이름 · 보이기 방식은 질의 글자로 ──
  @Post('posts/:id/attachments')
  async attachToPost(@Req() req: Request, @Param('id', ParseIntPipe) id: number, @Query('name') name: string | undefined, @Query('display') display: string | undefined) {
    return this.upload(req, { kind: 'post', id }, name, display);
  }

  @Post('comments/:id/attachments')
  async attachToComment(@Req() req: Request, @Param('id', ParseIntPipe) id: number, @Query('name') name: string | undefined, @Query('display') display: string | undefined) {
    return this.upload(req, { kind: 'comment', id }, name, display);
  }

  private async upload(req: Request, owner: { kind: 'post' | 'comment'; id: number }, name: string | undefined, display: string | undefined) {
    let a: Actor;
    try {
      a = this.actor(req);
    } catch (e) {
      req.resume();
      throw e;
    }
    const max = this.host.attach?.maxBytes ?? 0;
    const len = Number(req.headers['content-length'] ?? 0);
    if (max && len > max) {
      req.resume(); // 본문을 버리고 바로 거절
      throw new BoardError('BOARD_ATTACH_TOO_BIG', { max });
    }
    return this.svc.addAttachment(owner, req, { name: name ?? 'file', display: display === 'inline' ? 'inline' : 'file' }, a);
  }

  /** 미리보기 올리기 — 화면이 줄인 그림(webp · jpeg · png ≤2MB), 본문은 파일 그대로 */
  @Post('attachments/:id/preview')
  async preview(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    let a: Actor;
    try {
      a = this.actor(req);
    } catch (e) {
      req.resume();
      throw e;
    }
    return this.svc.addPreview(id, req, a);
  }

  @Patch('attachments/:id')
  setDisplay(@Req() req: Request, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const d = (body as { display?: unknown } | undefined)?.display;
    return this.svc.setAttachmentDisplay(id, d === 'inline' ? 'inline' : 'file', this.actor(req));
  }

  @Get('attachments/:id')
  download(@Req() req: Request, @Param('id', ParseIntPipe) id: number, @Query('preview') preview: string | undefined, @Res() res: Response) {
    const { abs, row, mime, bytes, disposition } = this.svc.openAttachment(id, this.actor(req), preview === '1');
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', String(bytes));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(row.name)}`);
    // 열고 나서 파일이 사라지는 경쟁(지우기와 겹침) — 스트림 오류가 프로세스로 튀지 않게 응답만 끊는다
    const stream = createReadStream(abs);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  @Delete('attachments/:id')
  @HttpCode(204)
  removeAttachment(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    this.svc.removeAttachment(id, this.actor(req));
  }

  // ── 내보내기 · 가져오기(운영자) ──
  @Get('export')
  export(@Req() req: Request, @Res() res: Response) {
    this.moderator(req);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="board-${new Date().toISOString().slice(0, 10)}.jsonl"`);
    Readable.from(lines(this.svc.exportJsonl())).pipe(res);
  }

  @Post('import')
  async import(@Req() req: Request) {
    let a: Actor;
    try {
      a = this.moderator(req);
    } catch (e) {
      req.resume();
      throw e;
    }
    const collected: string[] = [];
    const rl = createInterface({ input: req, crlfDelay: Infinity });
    for await (const line of rl) {
      collected.push(line);
      if (collected.length > 100_000) throw new BoardError('BOARD_IMPORT_FORMAT', { reason: 'too-many-lines' });
    }
    return this.svc.importJsonl(collected, a);
  }
}

/** 호스트가 정한 경로 접두어로 컨트롤러를 만든다 — Nest 는 상속한 메서드 · 메타데이터를 그대로 읽는다 */
export function boardController(prefix: string): typeof BoardControllerBase {
  @Controller(prefix)
  class BoardController extends BoardControllerBase {}
  return BoardController;
}

function* lines(it: Iterable<string>): Generator<string> {
  for (const l of it) yield l + '\n';
}

function str(v: string | undefined): string | undefined {
  return v === undefined || v === '' ? undefined : v;
}
function num(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function postInput(body: unknown): PostInput {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b['title'] !== 'string' || typeof b['body'] !== 'string' || typeof b['category'] !== 'string') throw new BoardError('BOARD_INVALID', { field: 'title' });
  const ctx = b['context'];
  return {
    title: b['title'],
    body: b['body'],
    category: b['category'],
    context: ctx && typeof ctx === 'object' && !Array.isArray(ctx) ? (ctx as Record<string, unknown>) : undefined,
  };
}
