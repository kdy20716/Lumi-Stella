import { formatCash, formatUsd, type BmCashPack } from '@shared/bmShop';
import { createCashTopupOrder, fetchCashOrderStatus } from '../net/bmApi';
import type { Authority } from '../net/Authority';
import { sfx } from '../audio/Sfx';

const root = () => document.getElementById('ui')!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * 실제 PayPal 결제 링크(checkoutnow / PayPal Payment Link) 연결 및 승인 대기 모달.
 * 자체 가짜 결제창을 띄우지 않고 실제 PayPal URL로 바로 연결합니다.
 */
export const pgCheckoutModal = {
  node: null as HTMLDivElement | null,
  timer: 0 as number,
  onMsg: null as ((ev: MessageEvent) => void) | null,
  openSeq: 0,
  get open() { return !!this.node || !!document.querySelector('[data-pg-modal]'); },

  async openCashPack(auth: Authority, pack: BmCashPack, onComplete: () => void) {
    const seq = ++this.openSeq;
    this.close();

    // 비동기 주문 생성 중에도 즉시 모달을 띄워 중복 클릭을 막고 닫기 동작을 보장
    const n = document.createElement('div');
    n.dataset.pgModal = '1';
    n.className = 'fixed inset-0 flex items-center justify-center bg-[#0b0d18]/75 pointer-events-auto';
    n.style.zIndex = '999';
    n.innerHTML = `<div class="px-panel bm-pay-box w-[min(450px,95cqw)] text-center">
      <div class="text-xl text-[#8a5a32] font-bold">🅿️ PayPal 결제</div>
      <div class="text-sm mt-3">PayPal 결제 링크를 준비하고 있어요…</div>
      <div class="flex justify-end mt-4">
        <button data-pg="close" type="button" class="ph-btn ghost">창 닫기</button>
      </div>
    </div>`;

    const bindClose = () => {
      n.querySelectorAll<HTMLElement>('[data-pg="close"], [data-pg="done"]').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const shouldComplete = btn.dataset.pg === 'done' && btn.dataset.pgSuccess === '1';
          this.close();
          try { sfx.play('tap'); } catch { /* 무시 */ }
          if (shouldComplete) onComplete();
        });
      });
    };

    // 백드롭 클릭이나 모달 내부 이벤트가 뒤쪽 캔버스/휴대폰으로 새지 않도록 차단
    n.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    n.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (ev.target === n) {
        sfx.play('tap');
        this.close();
      }
    });
    bindClose();
    root().style.zIndex = '60';
    root().appendChild(n);
    this.node = n;

    const res = await createCashTopupOrder(auth, pack);
    if (seq !== this.openSeq || !this.node || this.node !== n) return;

    if (!res.ok || !res.checkoutUrl) {
      sfx.play('error');
      const setupHint = res.code === 'PAYPAL_NOT_CONFIGURED'
        ? `<div class="mt-3 p-2.5 rounded-lg bg-[#fff8ec] border-2 border-[#d8b67c] text-left text-xs leading-relaxed">
            <b>📌 PayPal 실결제 링크 연결 방법 (.env)</b><br>
            1) <b>자동 승인·즉시 지급</b>: PayPal Developer Dashboard에서 발급받은 <code>PAYPAL_CLIENT_ID</code>, <code>PAYPAL_CLIENT_SECRET</code> 입력<br>
            2) <b>직접 결제 링크</b>: <code>PAYPAL_ME_URL</code> 또는 <code>PAYPAL_LINK_${esc(pack.id.toUpperCase())}</code> 입력 후 서버 재시작
          </div>`
        : '';
      n.innerHTML = `<div class="px-panel bm-pay-box w-[min(450px,94cqw)] text-center">
        <div class="text-xl text-[#8a5a32] font-bold">🅿️ PayPal 결제 연결 안내</div>
        <div class="text-sm mt-2 leading-relaxed">${esc(res.error ?? 'PayPal 결제 링크를 열 수 없어요.')}</div>
        ${setupHint}
        <div class="flex justify-end mt-4">
          <button data-pg="close" type="button" class="ph-btn ghost">창 닫기</button>
        </div>
      </div>`;
      bindClose();
      return;
    }

    const checkoutUrl = res.checkoutUrl;
    const isDirectLink = res.mode === 'paypal-link';
    const orderId = res.orderId ?? '';
    const ppLabel = isDirectLink ? 'PayPal 직접 결제 링크' : 'PayPal 결제';

    // 실제 PayPal 공식 URL(paypal.com) 새 창으로 바로 열기
    const popup = window.open(checkoutUrl, 'lumi_paypal_checkout', 'width=520,height=760');

    n.innerHTML = `<div class="px-panel bm-pay-box w-[min(450px,95cqw)]">
      <div class="text-xl text-[#8a5a32] font-bold">🅿️ ${esc(ppLabel)}</div>
      <div class="bm-pay-summary mt-2">
        <div>
          <div class="text-sm font-bold">${esc(pack.name)}</div>
          <div class="text-xs opacity-75">지급 예정: <b>${formatCash(pack.totalCash)}</b></div>
        </div>
        <div class="text-xl font-bold text-[#0070ba]">${esc(formatUsd(pack.priceUsd))}</div>
      </div>

      <div class="mt-3 p-3 rounded-lg bg-[#f3f6ff] border-2 border-[#8ca2d8] text-xs leading-relaxed">
        <div>${popup ? '새 창으로 실제 PayPal 결제 페이지로 이동했어요.' : '브라우저 팝업 차단 시 아래 버튼을 눌러 PayPal 결제 링크로 이동해 주세요.'}</div>
        <div class="opacity-75 mt-1">${isDirectLink
          ? '직접 PayPal 결제 링크로 이동합니다. 결제를 마치신 뒤 확인해 주세요.'
          : 'PayPal 결제를 승인하시면 이 화면에 자동으로 캐쉬가 즉시 지급됩니다.'}</div>
      </div>

      <div class="flex flex-col gap-2 mt-3">
        <a data-pg="open" href="${esc(checkoutUrl)}" target="lumi_paypal_checkout" class="px-btn green text-center text-sm no-underline">↗ PayPal 결제 링크 바로 열기</a>
        <div class="flex gap-2 justify-end mt-1">
          <button data-pg="close" type="button" class="ph-btn ghost">창 닫기</button>
        </div>
      </div>
    </div>`;
    bindClose();

    const finishSuccess = (newCash: number) => {
      if (seq !== this.openSeq) return;
      this.cleanupWatchers();
      if (newCash > 0) auth.me.cash = newCash;
      sfx.play('confirm');
      const box = n.querySelector<HTMLDivElement>('.bm-pay-box');
      if (!box) return;
      box.innerHTML = `<div class="text-center py-3">
        <div class="text-3xl mb-1">💎</div>
        <div class="text-xl text-[#2f7a3a] font-bold">PayPal 캐쉬 충전 완료!</div>
        <div class="text-sm mt-2"><b>+${formatCash(pack.totalCash)}</b> (${formatUsd(pack.priceUsd)})</div>
        <div class="text-xs opacity-75 mt-1">현재 보유 캐쉬: <b>${formatCash(auth.me.cash ?? newCash)}</b></div>
        <button data-pg="done" data-pg-success="1" type="button" class="px-btn green text-base mt-4">상점으로 돌아가기</button>
      </div>`;
      bindClose();
    };

    const finishFail = (msg: string) => {
      if (seq !== this.openSeq) return;
      this.cleanupWatchers();
      sfx.play('error');
      const box = n.querySelector<HTMLDivElement>('.bm-pay-box');
      if (!box) return;
      box.innerHTML = `<div class="text-center py-3">
        <div class="text-3xl mb-1">⚠️</div>
        <div class="text-xl text-[#c8453c] font-bold">결제가 취소되었어요</div>
        <div class="text-xs opacity-80 mt-2">${esc(msg)}</div>
        <button data-pg="done" type="button" class="ph-btn mt-4">닫기</button>
      </div>`;
      bindClose();
    };

    if (!isDirectLink && orderId) {
      this.onMsg = (ev: MessageEvent) => {
        const d = ev.data as { type?: string; ok?: boolean; orderId?: string; cash?: number; reason?: string } | null;
        if (!d || d.type !== 'lumi-pg-done' || d.orderId !== orderId) return;
        if (d.ok) finishSuccess(d.cash ?? 0);
        else finishFail(d.reason || 'PayPal 결제가 완료되지 않았습니다.');
      };
      window.addEventListener('message', this.onMsg);

      this.timer = window.setInterval(() => {
        void fetchCashOrderStatus(auth, orderId).then((st) => {
          if (!st || seq !== this.openSeq) return;
          if (st.status === 'paid') finishSuccess(st.cash ?? 0);
          else if (st.status === 'failed') finishFail(st.error ?? 'PayPal 결제가 취소되었습니다.');
        });
      }, 1000);
    }
  },

  cleanupWatchers() {
    if (this.timer) { clearInterval(this.timer); this.timer = 0; }
    if (this.onMsg) { window.removeEventListener('message', this.onMsg); this.onMsg = null; }
  },

  close() {
    this.openSeq++;
    this.cleanupWatchers();
    this.node?.remove();
    this.node = null;
    root().style.zIndex = '';
    document.querySelectorAll('[data-pg-modal]').forEach((el) => el.remove());
  },
};
