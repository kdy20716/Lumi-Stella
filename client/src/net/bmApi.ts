import type { BmProduct } from '@shared/bmShop';
import type { Authority } from './Authority';

export interface ShopConfigInfo {
  mode: 'portone' | 'toss' | 'sandbox';
  storeId?: string;
  channelKey?: string;
  tossClientKey?: string;
}

export interface CardCheckoutPayload {
  cardLast4: string;
  expiry: string;
  cvc: string;
  pin2: string;
  cardHolder?: string;
}

/** 서버에서 PG 설정 조회 (오프라인 혼자하기에서는 내장 카드 결제 모드) */
export async function fetchShopConfig(auth: Authority): Promise<ShopConfigInfo> {
  const base = auth.shopServerUrl();
  if (!base) return { mode: 'sandbox' };
  try {
    const res = await fetch(`${base}/api/shop/config`);
    if (!res.ok) return { mode: 'sandbox' };
    return (await res.json()) as ShopConfigInfo;
  } catch {
    return { mode: 'sandbox' };
  }
}

/** 웹 카드 결제 실행 (멀티: /api/shop/orders -> /api/shop/confirm, 혼자하기: 카드 검증 후 즉시 우편함 배송) */
export async function checkoutCardPurchase(
  auth: Authority,
  product: BmProduct,
  card: CardCheckoutPayload,
): Promise<{ ok: boolean; orderId?: string; error?: string }> {
  const base = auth.shopServerUrl();
  if (!auth.online || !base) {
    const orderId = `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const r = await auth.request({ kind: 'bmDeliver', productId: product.id, orderId, provider: 'web-card-sandbox' });
    return r.ok ? { ok: true, orderId } : { ok: false, error: r.reason === 'locked' ? product.unlock.label : '배송에 실패했어요' };
  }

  try {
    const headers = { 'Content-Type': 'application/json', ...(await auth.shopHeaders()) };
    const ordRes = await fetch(`${base}/api/shop/orders`, {
      method: 'POST', headers, body: JSON.stringify({ productId: product.id }),
    });
    const ord = (await ordRes.json()) as { orderId?: string; error?: string };
    if (!ordRes.ok || !ord.orderId) return { ok: false, error: ord.error ?? '주문 생성에 실패했어요' };

    const confRes = await fetch(`${base}/api/shop/confirm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId: ord.orderId, ...card }),
    });
    const conf = (await confRes.json()) as { ok?: boolean; error?: string };
    if (!confRes.ok || !conf.ok) return { ok: false, error: conf.error ?? '카드 결제 승인에 실패했어요' };
    return { ok: true, orderId: ord.orderId };
  } catch (e) {
    return { ok: false, error: (e as Error).message || '결제 서버 통신 오류' };
  }
}
