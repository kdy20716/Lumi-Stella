import { formatKrw, type BmProduct } from '@shared/bmShop';
import { checkoutCardPurchase, fetchShopConfig, type CardCheckoutPayload } from '../net/bmApi';
import type { Authority } from '../net/Authority';
import { sfx } from '../audio/Sfx';

const root = () => document.getElementById('ui')!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const formatCardNum = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 16);
  return d.replace(/(.{4})/g, '$1-').replace(/-$/, '');
};

const formatExpiry = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`;
};

function detectBrand(digits: string): string {
  if (digits.startsWith('4')) return 'VISA';
  if (digits.startsWith('5')) return 'Mastercard';
  if (digits.startsWith('94')) return '국내전용 KB/신한';
  if (digits.startsWith('3')) return 'AMEX / JCB';
  return '국내/해외 신용·체크카드';
}

/**
 * 웹 카드 결제 모달 (신용/체크카드 정보 입력 → PG/샌드박스 승인 → 공유 우편함 배송).
 */
export const cardCheckoutModal = {
  node: null as HTMLDivElement | null,
  get open() { return !!this.node; },

  async show(auth: Authority, prod: BmProduct, onComplete: () => void) {
    this.close();
    const cfg = await fetchShopConfig(auth);
    const n = document.createElement('div');
    n.className = 'fixed inset-0 z-50 flex items-center justify-center bg-[#0b0d18]/75 pointer-events-auto toast-in';
    const pgLabel =
      cfg.mode === 'portone' ? 'PortOne V2 실결제 연동' :
      cfg.mode === 'toss' ? '토스페이먼츠 실결제 연동' :
      '웹 신용·체크카드 결제 (테스트 결제 지원)';

    n.innerHTML = `<div class="px-panel bm-pay-box w-[min(460px,95cqw)]">
      <div class="flex items-center justify-between mb-2">
        <div>
          <div class="text-xl text-[#8a5a32] font-bold">💳 웹 카드 결제</div>
          <div class="text-xs opacity-75">${pgLabel}</div>
        </div>
        <button data-pay="fill" class="ph-btn sm ghost" type="button">테스트 카드 자동입력</button>
      </div>

      <div class="bm-pay-summary">
        <div>
          <div class="text-sm font-bold">${esc(prod.name)}</div>
          <div class="text-xs opacity-75">${esc(prod.town)} 스페셜 · 결제 시 모든 마을 밭 우편함 배송</div>
        </div>
        <div class="text-xl font-bold text-[#c8453c]">${formatKrw(prod.priceKrw)}</div>
      </div>

      <form data-pay="form" class="flex flex-col gap-2.5 mt-3">
        <div>
          <div class="flex justify-between text-xs mb-1"><span>카드 번호</span><span data-pay="brand" class="text-[#8a5a32]">국내/해외 신용·체크카드</span></div>
          <input data-f="num" inputmode="numeric" maxlength="19" placeholder="4242-4242-4242-4242" class="ph-input !mt-0" required />
        </div>
        <div class="grid grid-cols-3 gap-2">
          <div>
            <div class="text-xs mb-1">유효기간 (MM/YY)</div>
            <input data-f="exp" inputmode="numeric" maxlength="5" placeholder="12/29" class="ph-input !mt-0 text-center" required />
          </div>
          <div>
            <div class="text-xs mb-1">CVC (뒤 3자리)</div>
            <input data-f="cvc" type="password" inputmode="numeric" maxlength="4" placeholder="123" class="ph-input !mt-0 text-center" required />
          </div>
          <div>
            <div class="text-xs mb-1">비밀번호 앞 2자리</div>
            <input data-f="pin" type="password" inputmode="numeric" maxlength="2" placeholder="12" class="ph-input !mt-0 text-center" required />
          </div>
        </div>
        <div>
          <div class="text-xs mb-1">카드 소유자명 (선택)</div>
          <input data-f="holder" maxlength="24" placeholder="홍길동 / KIM" class="ph-input !mt-0" />
        </div>
        <label class="flex items-center gap-2 text-xs mt-0.5 cursor-pointer select-none">
          <input data-f="agree" type="checkbox" checked />
          <span>상품 해금 내역 및 우편함 배송(계정 귀속)을 확인했습니다.</span>
        </label>
        <div data-pay="err" class="text-xs text-[#c8453c] min-h-[16px]"></div>
        <div class="flex gap-2 justify-end mt-1">
          <button data-pay="cancel" type="button" class="ph-btn ghost">취소</button>
          <button data-pay="submit" type="submit" class="ph-btn">💳 ${formatKrw(prod.priceKrw)} 결제하기</button>
        </div>
      </form>
    </div>`;

    const numIn = n.querySelector<HTMLInputElement>('[data-f=num]')!;
    const expIn = n.querySelector<HTMLInputElement>('[data-f=exp]')!;
    const cvcIn = n.querySelector<HTMLInputElement>('[data-f=cvc]')!;
    const pinIn = n.querySelector<HTMLInputElement>('[data-f=pin]')!;
    const holderIn = n.querySelector<HTMLInputElement>('[data-f=holder]')!;
    const agreeIn = n.querySelector<HTMLInputElement>('[data-f=agree]')!;
    const brandEl = n.querySelector<HTMLSpanElement>('[data-pay=brand]')!;
    const errEl = n.querySelector<HTMLDivElement>('[data-pay=err]')!;
    const subBtn = n.querySelector<HTMLButtonElement>('[data-pay=submit]')!;

    n.querySelectorAll('input').forEach((inp) => inp.addEventListener('keydown', (e) => e.stopPropagation()));
    numIn.oninput = () => {
      numIn.value = formatCardNum(numIn.value);
      brandEl.textContent = detectBrand(numIn.value.replace(/\D/g, ''));
    };
    expIn.oninput = () => { expIn.value = formatExpiry(expIn.value); };

    n.querySelector<HTMLButtonElement>('[data-pay=fill]')!.onclick = () => {
      sfx.play('tap');
      numIn.value = '4242-4242-4242-4242';
      expIn.value = '12/29';
      cvcIn.value = '777';
      pinIn.value = '12';
      holderIn.value = auth.me.name || '트레이너';
      brandEl.textContent = 'VISA';
      errEl.textContent = '';
    };

    n.querySelector<HTMLButtonElement>('[data-pay=cancel]')!.onclick = () => { sfx.play('tap'); this.close(); };

    n.querySelector<HTMLFormElement>('[data-pay=form]')!.onsubmit = async (ev) => {
      ev.preventDefault();
      errEl.textContent = '';
      const digits = numIn.value.replace(/\D/g, '');
      const exp = expIn.value.trim();
      const cvc = cvcIn.value.trim();
      const pin2 = pinIn.value.trim();

      if (digits.length < 15) { errEl.textContent = '카드 번호 15~16자리를 정확히 입력해 주세요.'; return; }
      const m = /^(\d{2})\/(\d{2})$/.exec(exp);
      if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) { errEl.textContent = '유효기간(MM/YY)을 확인해 주세요.'; return; }
      if (!/^\d{3,4}$/.test(cvc)) { errEl.textContent = 'CVC 번호 3~4자리를 입력해 주세요.'; return; }
      if (!/^\d{2}$/.test(pin2)) { errEl.textContent = '카드 비밀번호 앞 2자리를 입력해 주세요.'; return; }
      if (!agreeIn.checked) { errEl.textContent = '결제 안내에 동의해 주세요.'; return; }

      subBtn.disabled = true;
      subBtn.textContent = '카드 승인 중…';

      const payload: CardCheckoutPayload = {
        cardLast4: digits.slice(-4),
        expiry: exp,
        cvc,
        pin2,
        cardHolder: holderIn.value.trim() || undefined,
      };
      const res = await checkoutCardPurchase(auth, prod, payload);
      if (!res.ok) {
        sfx.play('error');
        errEl.textContent = res.error ?? '카드 결제에 실패했어요.';
        subBtn.disabled = false;
        subBtn.textContent = `💳 ${formatKrw(prod.priceKrw)} 결제하기`;
        return;
      }

      sfx.play('confirm');
      const box = n.querySelector<HTMLDivElement>('.bm-pay-box')!;
      box.innerHTML = `<div class="text-center py-3">
        <div class="text-3xl mb-1">🎉</div>
        <div class="text-xl text-[#2f7a3a] font-bold">카드 결제 승인 완료!</div>
        <div class="text-sm mt-2"><b>${esc(prod.name)}</b> (${formatKrw(prod.priceKrw)})</div>
        <div class="text-xs opacity-75 mt-1">승인 번호: ${esc(res.orderId ?? '')}</div>
        <div class="mt-3 p-2.5 rounded-lg bg-[#fff8ec] border-2 border-[#d8b67c] text-xs leading-relaxed">
          📮 <b>모든 마을 밭 우편함으로 배송되었어요!</b><br>
          시작 농장 또는 어느 마을 밭의 우편함에서든 꺼내 바로 착용·적용할 수 있습니다.
        </div>
        <button data-pay="done" class="px-btn green text-base mt-4">확인</button>
      </div>`;
      box.querySelector<HTMLButtonElement>('[data-pay=done]')!.onclick = () => { this.close(); onComplete(); };
    };

    root().appendChild(n);
    this.node = n;
  },

  close() { this.node?.remove(); this.node = null; },
};
