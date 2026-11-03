// 한국어 조사 자동 보정: "민규은(는)" → "민규는", "경험치 45을(를)" → "경험치 45를"
const DIGIT_BATCHIM = [true, true, false, true, false, false, true, true, true, false]; // 영 일 이 삼 사 오 육 칠 팔 구
const DIGIT_RIEUL = [false, true, false, false, false, false, false, true, true, false]; // 일 칠 팔 → ㄹ 받침
const finalOf = (ch: string): { has: boolean; rieul: boolean } | null => {
  const c = ch.charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) { const jong = (c - 0xac00) % 28; return { has: jong !== 0, rieul: jong === 8 }; }
  if (ch >= '0' && ch <= '9') { const d = +ch; return { has: DIGIT_BATCHIM[d], rieul: DIGIT_RIEUL[d] }; }
  return null;
};
const PAIRS: Record<string, [string, string]> = { '이(가)': ['이', '가'], '은(는)': ['은', '는'], '을(를)': ['을', '를'], '과(와)': ['과', '와'], '아(야)': ['아', '야'] };

export function josa(text: string): string {
  return text
    .replace(/([가-힣0-9])(이\(가\)|은\(는\)|을\(를\)|과\(와\)|아\(야\))/g, (_m, ch: string, pair: string) => {
      const f = finalOf(ch); const [a, b] = PAIRS[pair];
      return ch + (f ? (f.has ? a : b) : a);
    })
    .replace(/([가-힣0-9])\(으\)로/g, (_m, ch: string) => { const f = finalOf(ch); return ch + (f && f.has && !f.rieul ? '으로' : '로'); });
}
