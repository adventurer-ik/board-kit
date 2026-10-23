import { type DynamicModule, Module, type ModuleMetadata, type Provider } from '@nestjs/common';
import type { BoardHost } from '../core/host';
import { BoardService } from '../core/service';
import { BOARD_HOST, boardController } from './board.controller';

export interface BoardModuleOptions {
  /** 라우트 접두어 — 예: 'api/admin/board' */
  prefix: string;
  /** 호스트 계약을 만드는 팩토리 — inject 로 호스트 서비스를 받는다 */
  useFactory: (...deps: never[]) => BoardHost<never> | BoardHost;
  inject?: Provider[] | unknown[];
  imports?: ModuleMetadata['imports'];
}

/**
 * NestJS 어댑터 — 호스트는 register() 하나로 붙인다.
 *
 *   BoardModule.register({
 *     prefix: 'api/admin/board',
 *     imports: [StorageModule, AdminModule],
 *     inject: [Db, Security, Events],
 *     useFactory: (db, sec, ev) => ({ db: db.handle, file: …, enabled: () => sec.boardEnabled, actor: (req) => …, onEvent: (e) => ev.emit(…) }),
 *   })
 *
 * BoardService 를 export 하므로 호스트의 CLI · 초기화 · 백업이 같은 인스턴스를 쓸 수 있다.
 */
@Module({})
export class BoardModule {
  static register(o: BoardModuleOptions): DynamicModule {
    return {
      module: BoardModule,
      imports: o.imports ?? [],
      controllers: [boardController(o.prefix)],
      providers: [
        { provide: BOARD_HOST, useFactory: o.useFactory as (...a: unknown[]) => BoardHost, inject: (o.inject ?? []) as never[] },
        { provide: BoardService, useFactory: (host: BoardHost) => new BoardService(host), inject: [BOARD_HOST] },
      ],
      exports: [BoardService, BOARD_HOST],
    };
  }
}
