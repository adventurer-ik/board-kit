import type { AttachKind } from '../shared/types';

/**
 * 첨부 종류 판정 — 확장자가 아니라 **첫 바이트(매직 바이트)** 로.
 * 올린 사람이 .png 라고 해도 안이 HTML 이면 text 로 보고, 그림으로 펼치지 않는다.
 */
export function sniff(head: Buffer): AttachKind {
  const h = head;
  const starts = (...b: number[]) => b.every((v, i) => h[i] === v);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (starts(0xff, 0xd8, 0xff)) return 'jpeg';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'gif';
  if (starts(0x52, 0x49, 0x46, 0x46) && h.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (starts(0x25, 0x50, 0x44, 0x46)) return 'pdf';
  if (starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06)) return 'zip';
  if (starts(0x1f, 0x8b)) return 'gzip';
  if (starts(0xd4, 0xc3, 0xb2, 0xa1) || starts(0xa1, 0xb2, 0xc3, 0xd4) || starts(0x4d, 0x3c, 0xb2, 0xa1) || starts(0xa1, 0xb2, 0x3c, 0x4d)) return 'pcap';
  if (starts(0x0a, 0x0d, 0x0d, 0x0a)) return 'pcapng';

  // 글자 파일인가 — 앞부분에 제어 문자가 없고 UTF-8 로 읽히면
  const sample = h.subarray(0, Math.min(h.length, 4096));
  if (sample.length === 0) return 'text';
  let control = 0;
  for (const b of sample) if (b < 0x09 || (b > 0x0d && b < 0x20)) control++;
  if (control > 0) return 'binary';
  const text = sample.toString('utf8');
  if (text.includes('�')) return 'binary';
  const t = text.trimStart();
  if (/^<\?xml[^>]*>\s*<svg|^<svg[\s>]/i.test(t)) return 'svg';
  if (/^[\[{]/.test(t)) {
    // 앞부분만으로는 JSON 인지 확실치 않다 — 첫 글자가 { [ 면 json 으로 둔다(화면에서 정렬이 안 되면 그대로 보임)
    return 'json';
  }
  return 'text';
}

export const MIME: Record<AttachKind, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  zip: 'application/zip',
  gzip: 'application/gzip',
  pcap: 'application/vnd.tcpdump.pcap',
  pcapng: 'application/octet-stream',
  text: 'text/plain; charset=utf-8',
  json: 'application/json',
  binary: 'application/octet-stream',
};

/** 디스크 파일 이름에 붙일 확장자 */
export const EXT: Record<AttachKind, string> = {
  png: 'png', jpeg: 'jpg', gif: 'gif', webp: 'webp', svg: 'svg', pdf: 'pdf', zip: 'zip', gzip: 'gz', pcap: 'pcap', pcapng: 'pcapng', text: 'txt', json: 'json', binary: 'bin',
};
