import type { BmCashPack, BmProduct } from '@shared/bmShop';
import type { Authority } from './Authority';

export type ShopPgMode = 'paypal' | 'paypal-link' | 'unconfigured';

export interface ShopConfigInfo {
  mode: ShopPgMode;
  paypalEnv?: 'sandbox' | 'live';
  currency?: 'USD' | 'KRW';
  totalCatalogKrw?: number;
  cashPacks?: BmCashPack[];
}

export interface CashOrderCreated {
  ok: boolean;
  mode?: ShopPgMode;
  paypalEnv?: 'sandbox' | 'live';
  orderId?: string;
  paypalOrderId?: string;
  packId?: string;
  orderName?: string;
  currency?: 'USD' | 'KRW';
  amountValue?: string;
  cashAmount?: number;
  checkoutUrl?: string;
  code?: string;
  error?: string;
}

export interface CashOrderStatus {
  status: 'pending' | 'paid' | 'failed';
  cash?: number;
  cashAdded?: number;
  error?: string;
}

export interface PgSystemTestStep {
  name: string;
  ok: boolean;
  detail: string;
}

export interface PgSystemTestResult {
  ok: boolean;
  mode: ShopPgMode;
  paypalEnv?: 'sandbox' | 'live';
  isAdmin: boolean;
  cash: number;
  allCatalogKrw: number;
  remainingCostKrw?: number;
  steps: PgSystemTestStep[];
  checkedAt?: number;
  error?: string;
}

/** 서버에서 PayPal / PG 연결 상태 조회 */
export async function fetchShopConfig(auth: Authority): Promise<ShopConfigInfo> {
  const base = auth.shopServerUrl();
  if (!base) return { mode: 'unconfigured' };
  try {
    const res = await fetch(`${base}/api/shop/config`);
    if (!res.ok) return { mode: 'unconfigured' };
    return (await res.json()) as ShopConfigInfo;
  } catch {
    return { mode: 'unconfigured' };
  }
}

/** PayPal 실결제 주문 생성 → 실제 PayPal 결제 링크(checkoutUrl) 반환 */
export async function createCashTopupOrder(
  auth: Authority,
  pack: BmCashPack,
): Promise<CashOrderCreated> {
  const base = auth.shopServerUrl();
  if (!auth.online || !base) {
    return { ok: false, error: 'PayPal 결제는 게임 서버에 접속한 상태에서 이용할 수 있어요.' };
  }
  try {
    const res = await fetch(`${base}/api/shop/cash-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await auth.shopHeaders()) },
      body: JSON.stringify({ packId: pack.id }),
    });
    const data = (await res.json()) as CashOrderCreated & { error?: string; code?: string };
    if (!res.ok || !data.checkoutUrl) {
      return {
        ok: false,
        code: data.code,
        error: data.error ?? 'PayPal 결제 링크를 생성하지 못했어요.',
      };
    }
    return { ...data, ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message || '결제 서버와 통신할 수 없어요.' };
  }
}

/** PayPal 결제 승인 완료 여부 폴링 조회 */
export async function fetchCashOrderStatus(
  auth: Authority,
  orderId: string,
): Promise<CashOrderStatus | null> {
  const base = auth.shopServerUrl();
  if (!auth.online || !base) return null;
  try {
    const res = await fetch(`${base}/api/shop/cash-order-status?orderId=${encodeURIComponent(orderId)}`, {
      headers: await auth.shopHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as CashOrderStatus;
  } catch {
    return null;
  }
}

/** 보유 캐쉬로 상점 상품(UI·의상·루미 코디) 구매 → 모든 마을 밭 우편함 배송 */
export async function purchaseBmItemWithCash(
  auth: Authority,
  product: BmProduct,
): Promise<{ ok: boolean; orderId?: string; cashRemaining?: number; error?: string }> {
  const base = auth.shopServerUrl();
  if (!auth.online || !base) {
    const orderId = `local_cash_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const r = await auth.request({ kind: 'bmDeliver', productId: product.id, orderId, provider: 'cash-shop', useCash: true });
    return r.ok
      ? { ok: true, orderId, cashRemaining: auth.me.cash ?? 0 }
      : { ok: false, error: r.reason === 'no-cash' ? '보유 캐쉬가 부족해요!' : r.reason === 'locked' ? product.unlock.label : '구매 실패' };
  }
  try {
    const headers = { 'Content-Type': 'application/json', ...(await auth.shopHeaders()) };
    const res = await fetch(`${base}/api/shop/cash-buy`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ productId: product.id }),
    });
    const data = (await res.json()) as { ok?: boolean; orderId?: string; cashRemaining?: number; error?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? '캐쉬 구매에 실패했어요.' };
    if (typeof data.cashRemaining === 'number') auth.me.cash = data.cashRemaining;
    return { ok: true, orderId: data.orderId, cashRemaining: data.cashRemaining };
  } catch (e) {
    return { ok: false, error: (e as Error).message || '상점 서버 통신 오류' };
  }
}

/** 어드민 테스트용: 미보유 전 품목 보유 캐쉬로 일괄 구매 */
export async function purchaseAllWithAdminCash(
  auth: Authority,
): Promise<{ ok: boolean; boughtCount?: number; totalSpent?: number; cashRemaining?: number; error?: string }> {
  const base = auth.shopServerUrl();
  if (!auth.online || !base) return { ok: false, error: '관리자 계정으로 서버 접속 중일 때만 사용할 수 있어요.' };
  try {
    const res = await fetch(`${base}/api/shop/cash-buy-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await auth.shopHeaders()) },
      body: '{}',
    });
    const data = (await res.json()) as { ok?: boolean; boughtCount?: number; totalSpent?: number; cashRemaining?: number; error?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? '일괄 구매에 실패했어요.' };
    if (typeof data.cashRemaining === 'number') auth.me.cash = data.cashRemaining;
    return { ok: true, boughtCount: data.boughtCount, totalSpent: data.totalSpent, cashRemaining: data.cashRemaining };
  } catch (e) {
    return { ok: false, error: (e as Error).message || '결제 서버 통신 오류' };
  }
}

/** PayPal 실결제 연동 · 어드민 캐쉬 진단 점검 */
export async function runPgSystemTest(auth: Authority): Promise<PgSystemTestResult> {
  const base = auth.shopServerUrl();
  if (!auth.online || !base) {
    return {
      ok: false, mode: 'unconfigured', isAdmin: false, cash: 0, allCatalogKrw: 0,
      steps: [{ name: '서버 연결 확인', ok: false, detail: '구글 로그인으로 게임 서버(2567)에 접속해야 PayPal 연동을 점검할 수 있어요.' }],
      error: '오프라인 상태입니다.',
    };
  }
  try {
    const res = await fetch(`${base}/api/shop/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await auth.shopHeaders()) },
      body: '{}',
    });
    const data = (await res.json()) as PgSystemTestResult;
    if (!res.ok) return { ...data, ok: false, steps: data.steps ?? [{ name: '요청 실패', ok: false, detail: data.error ?? '점검 실패' }] };
    return data;
  } catch (e) {
    return {
      ok: false, mode: 'unconfigured', isAdmin: false, cash: 0, allCatalogKrw: 0,
      steps: [{ name: '네트워크 오류', ok: false, detail: (e as Error).message || '결제 서버와 통신할 수 없어요.' }],
      error: (e as Error).message,
    };
  }
}
