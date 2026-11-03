// Firebase 구글 로그인 (클라이언트). 받은 ID 토큰을 게임 서버로 보내면 서버가 검증하고 진행상황을 불러옴.
// 이 모듈은 '구글 로그인' 버튼을 누를 때만 동적으로 불러옵니다 (혼자 연습하기는 Firebase 없이 동작).
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { firebaseConfig } from '@shared/firebaseConfig';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// 애널리틱스는 지원되는 환경(https 등)에서만
void import('firebase/analytics').then(({ getAnalytics, isSupported }) => isSupported().then((ok) => { if (ok) getAnalytics(app); })).catch(() => {});

/** 이미 로그인된 사용자 (새로고침 후 자동 복원) */
export function currentUser(): Promise<User | null> {
  return new Promise((res) => { const off = onAuthStateChanged(auth, (u) => { off(); res(u); }); });
}
export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return (await signInWithPopup(auth, provider)).user;
}
export const idToken = (u: User) => u.getIdToken(true);
export const logout = () => signOut(auth);
export type { User };
