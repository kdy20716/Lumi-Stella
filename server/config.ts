// 서버 설정 (환경 변수로 바꿀 수 있는 값은 여기 한곳에)
import { DEFAULT_PORT } from '../shared/protocol';

export const PORT = Number(process.env.PORT ?? DEFAULT_PORT);   // Azure App Service 는 PORT 를 넣어 줌
/** 접속을 허용할 프론트엔드 주소 (CORS). 예: CLIENT_ORIGIN=https://lumi.vercel.app,http://localhost:5173 — 비우면 모두 허용(개발용) */
export const CLIENT_ORIGINS: string[] = (process.env.CLIENT_ORIGIN ?? '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
/** 테스트용: 토큰 없이 { dev: '이름' } 으로 접속 허용 (이렇게 들어온 사람은 절대 관리자가 될 수 없음) */
export const DEV_AUTH = process.env.DEV_AUTH === '1';
/** 이동 속도 상한 px/s (달리기 108 + 여유) — 이보다 빠르면 서버가 위치를 되돌림 */
export const MAX_SPEED = 130;
/**
 * 관리자 계정: 구글이 확인한(email_verified) 이 이메일로 로그인한 사람만.
 * 클라이언트가 보내는 값은 전혀 믿지 않고, 서버가 Firebase ID 토큰의 서명 · 만료 · 이메일 인증을 직접 검증한 결과로만 정함.
 */
export const ADMIN_EMAILS: readonly string[] = ['kdy20716@gmail.com'];
export const isAdminEmail = (email: string | undefined, verified: boolean) => verified && !!email && ADMIN_EMAILS.includes(email.trim().toLowerCase());
/** 버그 신고: 한 사람당 간격 · 길이 제한 */
export const REPORT_COOLDOWN_MS = 30_000;
export const REPORT_MAX_LEN = 500;
