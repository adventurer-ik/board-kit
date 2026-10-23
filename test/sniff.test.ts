import { describe, expect, it } from 'vitest';
import { sniff } from '../src/core/sniff';

describe('매직 바이트 판정', () => {
  it('그림 · 압축 · pcap', () => {
    expect(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe('png');
    expect(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(sniff(Buffer.from('GIF89a'))).toBe('gif');
    expect(sniff(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]))).toBe('webp');
    expect(sniff(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe('zip');
    expect(sniff(Buffer.from([0x1f, 0x8b, 0x08]))).toBe('gzip');
    expect(sniff(Buffer.from([0xd4, 0xc3, 0xb2, 0xa1]))).toBe('pcap');
    expect(sniff(Buffer.from([0x0a, 0x0d, 0x0d, 0x0a]))).toBe('pcapng');
  });
  it('글자 파일 — svg 는 따로, json 은 첫 글자로, 제어 문자가 있으면 binary', () => {
    expect(sniff(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'))).toBe('svg');
    expect(sniff(Buffer.from('<?xml version="1.0"?>\n<svg></svg>'))).toBe('svg');
    expect(sniff(Buffer.from(' {"a":1}'))).toBe('json');
    expect(sniff(Buffer.from('2026-10-23 INFO 로그 한 줄\n'))).toBe('text');
    expect(sniff(Buffer.from('<html><script>alert(1)</script>'))).toBe('text');
    expect(sniff(Buffer.from([0x41, 0x00, 0x42]))).toBe('binary');
  });
});
