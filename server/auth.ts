// Firebase ID 토큰 검증 (firebase-admin 없이): Google 공개 인증서로 RS256 서명·만료·발급자·대상 확인
import { createVerify, X509Certificate } from 'node:crypto';

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let cache: { certs: Record<string, string>; until: number } | null = null;

async function certs() {
  if (cache && Date.now() < cache.until) return cache.certs;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error(`인증서 다운로드 실패 (${res.status})`);
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  cache = { certs: (await res.json()) as Record<string, string>, until: Date.now() + maxAge * 1000 };
  return cache.certs;
}
const b64json = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as Record<string, unknown>;

export interface VerifiedUser { uid: string; name: string; email?: string }

export async function verifyIdToken(token: string, projectId: string): Promise<VerifiedUser> {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('잘못된 토큰');
  const [h, p, sig] = parts;
  const header = b64json(h), payload = b64json(p);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('토큰 헤더 오류');
  const pem = (await certs())[header.kid];
  if (!pem) throw new Error('알 수 없는 서명 키');
  const v = createVerify('RSA-SHA256'); v.update(`${h}.${p}`);
  if (!v.verify(new X509Certificate(pem).publicKey, Buffer.from(sig, 'base64url'))) throw new Error('서명 불일치');
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('다른 프로젝트의 토큰');
  if (typeof payload.exp !== 'number' || payload.exp < now - 30) throw new Error('토큰 만료 — 다시 로그인하세요');
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('사용자 정보 없음');
  return { uid: payload.sub, name: String(payload.name ?? payload.email ?? '농부').split('@')[0].slice(0, 10), email: payload.email as string | undefined };
}
