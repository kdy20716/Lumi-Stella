// 게임 서버(Socket.io) 주소 정하기
//  1. 주소창 ?server=https://... (테스트용으로 바꿔 끼우기)
//  2. 환경 변수 VITE_SERVER_URL (Vercel 배포: 프로젝트 설정 › Environment Variables 에 Azure 주소를 넣고 다시 배포)
//  3. 없으면 지금 페이지와 같은 PC의 2567 포트 (로컬 개발 · 같은 와이파이 친구)
// ws:// · wss:// 로 적어도 Socket.io 가 쓰는 http(s):// 로 바꿔 줌. 끝의 / 는 뺌
export function serverUrl(): string {
  const qs = new URLSearchParams(location.search).get('server');
  const env = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();
  const raw = qs || env || `${location.protocol === 'https:' ? 'https' : 'http'}://${location.hostname || 'localhost'}:2567`;
  return raw.replace(/^ws(s?):\/\//i, 'http$1://').replace(/\/+$/, '');
}
/** 배포된 페이지(https)에서 http 서버를 부르면 브라우저가 막음 → 알기 쉬운 안내 */
export function mixedContentProblem(url: string) {
  return location.protocol === 'https:' && url.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(url);
}
