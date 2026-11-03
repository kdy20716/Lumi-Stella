// Firebase 웹 앱 설정 (Firebase 콘솔 → 프로젝트 설정 → 내 앱). 웹 API 키는 공개용이라 코드에 넣어도 됩니다.
// 보안은 Firebase Authentication 승인 도메인 + 서버의 ID 토큰 검증 + 보안 규칙으로 지킵니다.
export const firebaseConfig = {
  apiKey: 'AIzaSyCj7x7_ED3A1ucVviWKB95VCEFaUK4xpXY',
  authDomain: 'farmar-simulater.firebaseapp.com',
  projectId: 'farmar-simulater',
  storageBucket: 'farmar-simulater.firebasestorage.app',
  messagingSenderId: '863949257608',
  appId: '1:863949257608:web:4467f18c339506a797183d',
  measurementId: 'G-JMLTVHLJXH',
};
