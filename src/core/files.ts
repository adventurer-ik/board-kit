import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import type { AttachKind } from '../shared/types';
import { EXT, sniff } from './sniff';
import { BoardError } from './errors';

export interface Stored {
  kind: AttachKind;
  bytes: number;
  sha256: string;
  /** 첨부 폴더 기준 상대 경로 — 내용 주소(ab/abcdef….png) 라 같은 파일은 한 번만 놓인다 */
  path: string;
}

/**
 * 첨부 파일 보관 — 스트림을 받아 크기 상한을 지키며 임시 파일에 쓰고, 끝나면 sha256 이름으로 옮긴다.
 * 종류는 첫 4KB 의 매직 바이트로 판정한다(올린 사람이 준 이름 · MIME 은 믿지 않는다).
 */
export class AttachStore {
  constructor(readonly dir: string) {
    mkdirSync(join(dir, 'tmp'), { recursive: true });
  }

  abs(rel: string): string {
    const p = resolve(this.dir, rel);
    if (!p.startsWith(resolve(this.dir) + '/')) throw new BoardError('BOARD_INVALID', { field: 'path' });
    return p;
  }

  exists(rel: string): boolean {
    return existsSync(this.abs(rel));
  }

  async save(input: Readable, maxBytes: number, allowed: readonly AttachKind[]): Promise<Stored> {
    const tmp = join(this.dir, 'tmp', `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const hash = createHash('sha256');
    const head: Buffer[] = [];
    let headLen = 0;
    let bytes = 0;
    const out = createWriteStream(tmp);
    try {
      await new Promise<void>((ok, fail) => {
        input.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > maxBytes) {
            input.destroy();
            fail(new BoardError('BOARD_ATTACH_TOO_BIG', { max: maxBytes }));
            return;
          }
          hash.update(chunk);
          if (headLen < 4096) {
            head.push(chunk);
            headLen += chunk.length;
          }
          out.write(chunk);
        });
        input.on('error', fail);
        input.on('end', () => out.end(() => ok()));
      });
      const kind = sniff(Buffer.concat(head).subarray(0, 4096));
      if (!allowed.includes(kind)) throw new BoardError('BOARD_ATTACH_KIND', { kind, allowed });
      const sha256 = hash.digest('hex');
      const rel = `${sha256.slice(0, 2)}/${sha256}.${EXT[kind]}`;
      const dest = this.abs(rel);
      mkdirSync(join(this.dir, sha256.slice(0, 2)), { recursive: true });
      if (existsSync(dest)) unlinkSync(tmp);
      else renameSync(tmp, dest);
      return { kind, bytes, sha256, path: rel };
    } catch (e) {
      try {
        out.destroy();
        if (existsSync(tmp)) unlinkSync(tmp);
      } catch {
        /* 정리 실패는 무시 */
      }
      throw e;
    }
  }

  remove(rel: string): void {
    try {
      unlinkSync(this.abs(rel));
    } catch {
      /* 이미 없음 */
    }
  }

  size(rel: string): number {
    try {
      return statSync(this.abs(rel)).size;
    } catch {
      return 0;
    }
  }
}
