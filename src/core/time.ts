/** DB 시각 꼴(UTC, `YYYY-MM-DD HH:MM:SS`) — 보는 쪽이 자기 시간대로 바꾼다 */
export function now(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}
