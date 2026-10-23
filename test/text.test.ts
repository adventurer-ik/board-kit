import { describe, expect, it } from 'vitest';
import { linkify, parseBody, prettyJson } from '../src/shared/text';

describe('본문 해석(text)', () => {
  it('평문 · 링크 · json 울타리를 조각으로 나눈다', () => {
    const seg = parseBody('첫 줄 https://example.com/a. 끝\n```json\n{"b":2,"a":[1,2]}\n```\n뒤 글');
    expect(seg).toHaveLength(3);
    expect(seg[0]).toEqual({ kind: 'text', parts: [{ kind: 'plain', text: '첫 줄 ' }, { kind: 'link', href: 'https://example.com/a' }, { kind: 'plain', text: '. 끝' }] });
    expect(seg[1]).toEqual({ kind: 'fence', lang: 'json', code: '{\n  "b": 2,\n  "a": [\n    1,\n    2\n  ]\n}', pretty: true });
    expect(seg[2]).toEqual({ kind: 'text', parts: [{ kind: 'plain', text: '뒤 글' }] });
  });
  it('json 이 아니면 그대로 두고 pretty=false', () => {
    const seg = parseBody('```json\n{broken\n```');
    expect(seg[0]).toEqual({ kind: 'fence', lang: 'json', code: '{broken', pretty: false });
  });
  it('언어 없는 울타리 · 닫히지 않은 울타리', () => {
    expect(parseBody('```\nabc\n  def\n```')[0]).toEqual({ kind: 'fence', lang: null, code: 'abc\n  def', pretty: false });
    expect(parseBody('글\n```\n쓰다 만')).toEqual([{ kind: 'text', parts: [{ kind: 'plain', text: '글' }] }, { kind: 'fence', lang: null, code: '쓰다 만', pretty: false }]);
  });
  it('http(s) 만 링크, 꼬리 문장 부호는 뺀다', () => {
    expect(linkify('ftp://x http://a.b/c), 끝')).toEqual([{ kind: 'plain', text: 'ftp://x ' }, { kind: 'link', href: 'http://a.b/c' }, { kind: 'plain', text: '), 끝' }]);
  });
  it('prettyJson', () => {
    expect(prettyJson(' [1,2] ')).toBe('[\n  1,\n  2\n]');
    expect(prettyJson('x')).toBeNull();
    expect(prettyJson('')).toBeNull();
  });
});
