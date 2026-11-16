import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { BM_PRODUCT_MAP, BM_PRODUCTS, isBmUnlocked } from '../shared/bmShop';
import { firebaseConfig } from '../shared/firebaseConfig';
import type { FarmSimulation } from '../shared/sim/FarmSimulation';
import { verifyIdToken } from './auth';
import { DEV_AUTH } from './config';
import type { Storage } from './storage';

const PORTONE_STORE_ID = process.env.PORTONE_STORE_ID?.trim() ?? '';
const PORTONE_CHANNEL_KEY = process.env.PORTONE_CHANNEL_KEY?.trim() ?? '';
const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET?.trim() ?? '';
const TOSS_CLIENT_KEY = process.env.TOSS_CLIENT_KEY?.trim() ?? '';
const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY?.trim() ?? '';

export type PgMode = 'portone' | 'toss' | 'sandbox';

interface PendingOrder {
  orderId: string;
  uid: string;
  productId: string;
  amountKrw: number;
  createdAt: number;
}

const pendingOrders = new Map<string, PendingOrder>();
const ORDER_TTL_MS = 15 * 60_000;

export function pgMode(): PgMode {
  if (PORTONE_STORE_ID && PORTONE_API_SECRET) return 'portone';
  if (TOSS_CLIENT_KEY && TOSS_SECRET_KEY) return 'toss';
  return 'sandbox';
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const c of req) {
    const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
    total += buf.length;
    if (total > 16 * 1024) throw new Error('요청 본문이 너무 큽니다');
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

async function resolveUid(req: IncomingMessage): Promise<string> {
  const auth = String(req.headers.authorization ?? '');
  if (auth.startsWith('Bearer ')) {
    const u = await verifyIdToken(auth.slice(7).trim(), firebaseConfig.projectId);
    return u.uid;
  }
  const dev = String(req.headers['x-dev-user'] ?? '').trim();
  if (DEV_AUTH && dev) return `dev-${dev.replace(/[^a-zA-Z0-9가-힣]/g, '').slice(0, 12)}`;
  throw new Error('로그인이 필요합니다');
}

function pruneOrders(now = Date.now()) {
  for (const [k, v] of pendingOrders) if (now - v.createdAt > ORDER_TTL_MS) pendingOrders.delete(k);
}

/** PG 결제 검증 어댑터 (PortOne V2 · TossPayments · 내장 카드 테스트 모드) */
async function verifyPgPayment(order: PendingOrder, body: Record<string, unknown>): Promise<string> {
  const mode = pgMode();
  if (mode === 'portone') {
    const paymentId = String(body.paymentId ?? order.orderId);
    const resp = await fetch(`https://api.portone.io/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `PortOne ${PORTONE_API_SECRET}` },
    });
    if (!resp.ok) throw new Error('PortOne 결제 조회 실패');
    const data = (await resp.json()) as { status?: string; amount?: { total?: number } };
    if (data.status !== 'PAID' || data.amount?.total !== order.amountKrw) throw new Error('결제 금액/상태가 일치하지 않습니다');
    return 'portone';
  }
  if (mode === 'toss') {
    const paymentKey = String(body.paymentKey ?? '');
    if (!paymentKey) throw new Error('결제 키가 없습니다');
    const token = Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');
    const resp = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentKey, orderId: order.orderId, amount: order.amountKrw }),
    });
    if (!resp.ok) throw new Error('토스페이먼츠 승인 실패');
    return 'toss';
  }
  const last4 = String(body.cardLast4 ?? '').replace(/\D/g, '');
  const expiry = String(body.expiry ?? '');
  const cvc = String(body.cvc ?? '');
  const pin2 = String(body.pin2 ?? '');
  if (last4.length !== 4 || !/^\d{2}\/\d{2}$/.test(expiry) || !/^\d{3,4}$/.test(cvc) || !/^\d{2}$/.test(pin2)) {
    throw new Error('카드 정보를 정확히 입력해 주세요');
  }
  return 'web-card';
}

/**
 * `/api/shop/*` 캐쉬 상점 웹 카드 결제 HTTP 핸들러.
 * @returns 요청을 처리했으면 `true`, 다른 경로면 `false`
 */
export async function handleShopHttp(
  req: IncomingMessage,
  res: ServerResponse,
  sim: FarmSimulation,
  storage: Storage,
): Promise<boolean> {
  const url = (req.url ?? '').split('?')[0];
  if (!url.startsWith('/api/shop/')) return false;

  try {
    if (req.method === 'GET' && url === '/api/shop/config') {
      sendJson(res, 200, {
        mode: pgMode(),
        storeId: PORTONE_STORE_ID || undefined,
        channelKey: PORTONE_CHANNEL_KEY || undefined,
        tossClientKey: TOSS_CLIENT_KEY || undefined,
        products: BM_PRODUCTS,
      });
      return true;
    }

    if (req.method === 'POST' && url === '/api/shop/orders') {
      pruneOrders();
      const uid = await resolveUid(req);
      const p = sim.players.get(uid);
      if (!p) { sendJson(res, 404, { error: '접속 중인 캐릭터를 찾을 수 없습니다' }); return true; }
      const body = await readJsonBody(req);
      const productId = String(body.productId ?? '');
      const prod = BM_PRODUCT_MAP[productId];
      if (!prod) { sendJson(res, 404, { error: '존재하지 않는 상품입니다' }); return true; }
      const unlock = isBmUnlocked(prod, p);
      if (!unlock.unlocked) { sendJson(res, 403, { error: unlock.reason }); return true; }
      const owned =
        (p.ownedThemes?.includes(productId) ?? false) ||
        (p.ownedOutfits?.includes(productId) ?? false) ||
        (p.ownedLumiCoords?.includes(productId) ?? false) ||
        (p.mailItems?.some((g) => g.productId === productId) ?? false);
      if (owned) { sendJson(res, 409, { error: '이미 보유하거나 우편함으로 배송된 상품입니다' }); return true; }

      const orderId = `ord_${randomUUID()}`;
      pendingOrders.set(orderId, { orderId, uid, productId, amountKrw: prod.priceKrw, createdAt: Date.now() });
      sendJson(res, 200, { orderId, productId: prod.id, name: prod.name, amountKrw: prod.priceKrw, mode: pgMode() });
      return true;
    }

    if (req.method === 'POST' && url === '/api/shop/confirm') {
      const uid = await resolveUid(req);
      const body = await readJsonBody(req);
      const orderId = String(body.orderId ?? '');
      const order = pendingOrders.get(orderId);
      if (!order || order.uid !== uid) { sendJson(res, 404, { error: '유효한 결제 주문을 찾을 수 없습니다' }); return true; }
      const provider = await verifyPgPayment(order, body);
      pendingOrders.delete(orderId);
      const r = sim.deliverBmOrder(uid, order.productId, order.orderId, provider);
      if (!r.ok) { sendJson(res, 400, { error: r.reason ?? '배송 실패' }); return true; }
      const save = sim.exportSave(uid);
      if (save) await storage.save(uid, save);
      sendJson(res, 200, { ok: true, orderId: order.orderId, productId: order.productId, provider });
      return true;
    }

    sendJson(res, 404, { error: 'Not found' });
    return true;
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message || '결제 요청 오류' });
    return true;
  }
}
