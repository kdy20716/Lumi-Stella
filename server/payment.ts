import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  BM_ALL_TOTAL_KRW,
  BM_CASH_PACK_MAP,
  BM_CASH_PACKS,
  BM_PRODUCT_MAP,
  BM_PRODUCTS,
  formatCash,
  formatUsd,
  isBmUnlocked,
  remainingBmCostKrw,
  type BmCashPack,
} from '../shared/bmShop';
import { firebaseConfig } from '../shared/firebaseConfig';
import type { FarmSimulation } from '../shared/sim/FarmSimulation';
import { verifyIdToken } from './auth';
import { DEV_AUTH, PORT, isAdminEmail } from './config';
import type { Storage } from './storage';

export type PgMode = 'paypal' | 'paypal-link' | 'unconfigured';

interface PayPalCfg {
  clientId: string;
  clientSecret: string;
  env: 'sandbox' | 'live';
  currency: 'USD' | 'KRW';
  apiBase: string;
  meUrl: string;
}

interface PendingCashOrder {
  orderId: string;
  paypalOrderId: string;
  uid: string;
  packId: string;
  orderName: string;
  currency: 'USD' | 'KRW';
  expectedValue: string;
  cashAmount: number;
  returnOrigin?: string;
  createdAt: number;
}

interface CashOrderRecord {
  uid: string;
  status: 'paid' | 'failed';
  cashAmount: number;
  provider?: string;
  returnOrigin?: string;
  error?: string;
  updatedAt: number;
}

interface Actor {
  uid: string;
  isAdmin: boolean;
}

const pendingCashOrders = new Map<string, PendingCashOrder>();
const finishedCashOrders = new Map<string, CashOrderRecord>();
const ORDER_TTL_MS = 30 * 60_000;
let tokenCache: { key: string; token: string; until: number } | null = null;

function readPayPalConfig(): PayPalCfg {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim() ?? '';
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim() ?? '';
  const env = process.env.PAYPAL_ENV?.trim().toLowerCase() === 'live' ? 'live' : 'sandbox';
  const currency = process.env.PAYPAL_CURRENCY?.trim().toUpperCase() === 'KRW' ? 'KRW' : 'USD';
  const meUrl = process.env.PAYPAL_ME_URL?.trim() ?? '';
  const apiBase = env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  return { clientId, clientSecret, env, currency, apiBase, meUrl };
}

function isSafePayPalUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && /^([a-z0-9-]+\.)*paypal\.(com|me)$/i.test(u.hostname);
  } catch {
    return false;
  }
}

function directPackPayPalUrl(pack: BmCashPack, cfg: PayPalCfg): string | null {
  const perPackKey = `PAYPAL_LINK_${pack.id.toUpperCase()}`;
  const explicit = process.env[perPackKey]?.trim() ?? '';
  if (explicit && isSafePayPalUrl(explicit)) return explicit;
  if (cfg.meUrl && isSafePayPalUrl(cfg.meUrl)) {
    const base = cfg.meUrl.replace(/\/+$/, '');
    const amt = cfg.currency === 'KRW' ? `${pack.priceKrw}KRW` : `${pack.priceUsd.toFixed(2)}USD`;
    return `${base}/${amt}`;
  }
  return null;
}

export function pgMode(): PgMode {
  const cfg = readPayPalConfig();
  if (cfg.clientId && cfg.clientSecret) return 'paypal';
  if (BM_CASH_PACKS.some((pk) => !!directPackPayPalUrl(pk, cfg))) return 'paypal-link';
  return 'unconfigured';
}

const escHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function sendHtml(res: ServerResponse, status: number, html: string) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
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

async function resolveActor(req: IncomingMessage, isAdminOnline?: (uid: string) => boolean): Promise<Actor> {
  const auth = String(req.headers.authorization ?? '');
  if (auth.startsWith('Bearer ')) {
    const u = await verifyIdToken(auth.slice(7).trim(), firebaseConfig.projectId);
    return {
      uid: u.uid,
      isAdmin: isAdminEmail(u.email, u.emailVerified) || (isAdminOnline?.(u.uid) ?? false),
    };
  }
  let dev = String(req.headers['x-dev-user'] ?? '').trim();
  try { dev = decodeURIComponent(dev); } catch { /* 잘못된 인코딩 무시 */ }
  // DEV_AUTH 테스트 계정은 절대 관리자 권한을 가질 수 없음
  if (DEV_AUTH && dev) return { uid: `dev-${dev.replace(/[^a-zA-Z0-9가-힣]/g, '').slice(0, 12)}`, isAdmin: false };
  throw new Error('구글 로그인이 필요합니다');
}

function pruneOrders(now = Date.now()) {
  for (const [k, v] of pendingCashOrders) if (now - v.createdAt > ORDER_TTL_MS) pendingCashOrders.delete(k);
  for (const [k, v] of finishedCashOrders) if (now - v.updatedAt > ORDER_TTL_MS) finishedCashOrders.delete(k);
}

function publicOrigin(req: IncomingMessage): string {
  const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() || 'http';
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim() || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function isOwnedOrPending(
  p: { ownedThemes?: string[]; ownedOutfits?: string[]; ownedLumiCoords?: string[]; mailItems?: { productId: string }[] },
  productId: string,
): boolean {
  return (
    (p.ownedThemes?.includes(productId) ?? false) ||
    (p.ownedOutfits?.includes(productId) ?? false) ||
    (p.ownedLumiCoords?.includes(productId) ?? false) ||
    (p.mailItems?.some((g) => g.productId === productId) ?? false)
  );
}

/** PayPal OAuth2 Access Token 발급 (서버 메모리에 만료 전까지 캐시) */
async function fetchPayPalToken(cfg: PayPalCfg): Promise<string> {
  const key = `${cfg.env}:${cfg.clientId}`;
  if (tokenCache && tokenCache.key === key && Date.now() < tokenCache.until) return tokenCache.token;
  const cred = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const res = await fetch(`${cfg.apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${cred}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`PayPal 인증 실패: ${data.error_description ?? res.statusText}`);
  }
  tokenCache = {
    key,
    token: data.access_token,
    until: Date.now() + Math.max(60, (data.expires_in ?? 300) - 30) * 1000,
  };
  return data.access_token;
}

/** PayPal REST Orders v2 주문 생성 → 실제 PayPal checkoutnow 승인 링크 반환 */
async function createPayPalOrder(
  cfg: PayPalCfg,
  orderId: string,
  pack: BmCashPack,
  uid: string,
  origin: string,
): Promise<{ paypalOrderId: string; approveUrl: string; expectedValue: string }> {
  const token = await fetchPayPalToken(cfg);
  const expectedValue = cfg.currency === 'KRW' ? String(Math.round(pack.priceKrw)) : pack.priceUsd.toFixed(2);
  const res = await fetch(`${cfg.apiBase}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: pack.id,
          custom_id: `${orderId}|${uid}`,
          description: `${pack.name} (+${pack.totalCash.toLocaleString('en-US')} Starlight Cash)`,
          amount: {
            currency_code: cfg.currency,
            value: expectedValue,
          },
        },
      ],
      application_context: {
        brand_name: 'Lumi Stella',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
        return_url: `${origin}/pg-success?orderId=${encodeURIComponent(orderId)}`,
        cancel_url: `${origin}/pg-fail?orderId=${encodeURIComponent(orderId)}`,
      },
    }),
  });
  const data = (await res.json()) as {
    id?: string;
    links?: { href: string; rel: string }[];
    message?: string;
    details?: { issue?: string; description?: string }[];
  };
  const approve = data.links?.find((l) => l.rel === 'approve' || l.rel === 'payer-action')?.href;
  if (!res.ok || !data.id || !approve || !isSafePayPalUrl(approve)) {
    const detail = data.details?.[0]?.description ?? data.message ?? res.statusText;
    throw new Error(`PayPal 결제 링크 생성 실패: ${detail}`);
  }
  return { paypalOrderId: data.id, approveUrl: approve, expectedValue };
}

/** PayPal 결제 승인 후 서버 최종 Capture 및 금액 검증 */
async function capturePayPalOrder(cfg: PayPalCfg, order: PendingCashOrder): Promise<void> {
  const token = await fetchPayPalToken(cfg);
  const res = await fetch(`${cfg.apiBase}/v2/checkout/orders/${encodeURIComponent(order.paypalOrderId)}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const data = (await res.json()) as {
    status?: string;
    message?: string;
    purchase_units?: { payments?: { captures?: { status?: string; amount?: { currency_code?: string; value?: string } }[] } }[];
  };
  if (!res.ok || data.status !== 'COMPLETED') {
    throw new Error(`PayPal 결제 승인 실패: ${data.message ?? data.status ?? res.statusText}`);
  }
  const cap = data.purchase_units?.[0]?.payments?.captures?.[0];
  if (
    cap?.amount?.currency_code !== order.currency ||
    Math.abs(Number(cap?.amount?.value) - Number(order.expectedValue)) > 0.001
  ) {
    throw new Error('PayPal 결제 금액/통화가 주문과 일치하지 않습니다');
  }
}

function safeClientOrigin(req: IncomingMessage): string | undefined {
  const raw = String(req.headers.origin ?? req.headers.referer ?? '').trim();
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : undefined;
  } catch {
    return undefined;
  }
}

function renderPgResultHtml(opts: {
  ok: boolean;
  title: string;
  subtitle: string;
  orderId?: string;
  cashAdded?: number;
  newBalance?: number;
  returnOrigin?: string;
}): string {
  const payload = JSON.stringify({
    type: 'lumi-pg-done',
    ok: opts.ok,
    orderId: opts.orderId ?? '',
    cashAmount: opts.cashAdded ?? 0,
    cash: opts.newBalance ?? 0,
    reason: opts.ok ? '' : opts.subtitle,
  });
  const backHref = opts.returnOrigin ? escHtml(opts.returnOrigin) : '';
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escHtml(opts.title)}</title>
  <style>
    body { margin: 0; min-height: 100vh; background: #f2f4f6; font-family: -apple-system, BlinkMacSystemFont, "Pretendard", sans-serif; display: flex; align-items: center; justify-content: center; padding: 20px; color: #191f28; }
    .card { width: 100%; max-width: 400px; background: #fff; border-radius: 20px; padding: 28px 24px; text-align: center; box-shadow: 0 12px 32px rgba(0, 27, 55, .1); }
    .ico { font-size: 48px; margin-bottom: 10px; }
    h1 { font-size: 22px; margin: 0 0 8px; color: ${opts.ok ? '#0070ba' : '#d8473b'}; }
    p { font-size: 14px; color: #4e5968; margin: 0 0 16px; line-height: 1.5; }
    .stat { background: #f9fafb; border: 1px solid #e5e8eb; border-radius: 12px; padding: 12px; font-size: 13px; margin-bottom: 18px; }
    .hint { font-size: 12px; color: #6b7684; margin-top: 10px; line-height: 1.45; }
    button, a.btn { display: block; width: 100%; box-sizing: border-box; text-decoration: none; border: 0; border-radius: 12px; padding: 14px; background: #0070ba; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <div class="ico">${opts.ok ? '💎' : '⚠️'}</div>
    <h1>${escHtml(opts.title)}</h1>
    <p>${escHtml(opts.subtitle)}</p>
    ${opts.ok
      ? `<div class="stat">충전 캐쉬: <b>+${escHtml(formatCash(opts.cashAdded ?? 0))}</b><br>보유 캐쉬: <b>${escHtml(formatCash(opts.newBalance ?? 0))}</b></div>`
      : ''}
    <button id="closeBtn" type="button" onclick="tryClose()">창 닫고 게임으로 돌아가기</button>
    ${backHref ? `<a id="backLink" href="${backHref}" style="display:none;margin-top:8px;background:#4f9a45" class="btn">게임 화면으로 이동하기</a>` : ''}
    <div id="closeHint" class="hint" style="display:none">브라우저 보안 설정으로 창이 자동으로 닫히지 않을 때는 현재 탭을 직접 닫고 기존 게임 창으로 돌아가 주세요.</div>
  </div>
  <script>
    try { window.opener && window.opener.postMessage(${payload}, '*'); } catch {}
    function tryClose() {
      try { window.close(); } catch {}
      setTimeout(function () {
        if (!window.closed) {
          var hint = document.getElementById('closeHint');
          var link = document.getElementById('backLink');
          if (hint) hint.style.display = 'block';
          if (link) link.style.display = 'block';
        }
      }, 50);
    }
  </script>
</body>
</html>`;
}

/**
 * `/api/shop/*` 및 PayPal return/cancel 콜백(`/pg-success`, `/pg-fail`) HTTP 핸들러.
 * 가짜 자체 결제창을 띄우지 않고 실제 PayPal 결제 링크로 연결합니다.
 */
export async function handleShopHttp(
  req: IncomingMessage,
  res: ServerResponse,
  sim: FarmSimulation,
  storage: Storage,
  isAdminOnline?: (uid: string) => boolean,
): Promise<boolean> {
  const fullUrl = req.url ?? '';
  const qIdx = fullUrl.indexOf('?');
  const url = qIdx >= 0 ? fullUrl.slice(0, qIdx) : fullUrl;
  const query = new URLSearchParams(qIdx >= 0 ? fullUrl.slice(qIdx + 1) : '');

  if (!url.startsWith('/api/shop/') && !url.startsWith('/pg-')) return false;

  try {
    // ── PayPal 결제 승인 복귀 콜백 (return_url / cancel_url) ─────────────────
    if (req.method === 'GET' && url === '/pg-success') {
      pruneOrders();
      const orderId = query.get('orderId') ?? '';
      const paypalToken = query.get('token') ?? '';
      const done = finishedCashOrders.get(orderId);
      if (done?.status === 'paid') {
        const cur = sim.players.get(done.uid)?.cash ?? 0;
        sendHtml(res, 200, renderPgResultHtml({
          ok: true, title: 'PayPal 결제 및 캐쉬 충전 완료!',
          subtitle: '이미 반영된 주문입니다. 창을 닫고 게임 상점에서 확인해 주세요.',
          orderId, cashAdded: done.cashAmount, newBalance: cur, returnOrigin: done.returnOrigin,
        }));
        return true;
      }
      const order = pendingCashOrders.get(orderId);
      if (!order || !paypalToken || order.paypalOrderId !== paypalToken) {
        sendHtml(res, 400, renderPgResultHtml({
          ok: false, title: 'PayPal 주문 검증 실패',
          subtitle: '주문 정보가 일치하지 않거나 만료되었습니다.',
          orderId,
          returnOrigin: order?.returnOrigin,
        }));
        return true;
      }
      try {
        const cfg = readPayPalConfig();
        await capturePayPalOrder(cfg, order);
        pendingCashOrders.delete(orderId);
        const cr = sim.creditCashOrder(order.uid, order.orderId, order.cashAmount, `paypal:${cfg.env}`);
        if (!cr.ok) throw new Error('캐쉬 지급 실패');
        const p = sim.players.get(order.uid);
        const save = sim.exportSave(order.uid);
        if (save) await storage.save(order.uid, save);
        finishedCashOrders.set(orderId, {
          uid: order.uid, status: 'paid', cashAmount: order.cashAmount, provider: `paypal:${cfg.env}`, returnOrigin: order.returnOrigin, updatedAt: Date.now(),
        });
        sendHtml(res, 200, renderPgResultHtml({
          ok: true, title: 'PayPal 결제 및 캐쉬 충전 완료!',
          subtitle: '게임 내 보유 캐쉬가 즉시 충전되었습니다. 창을 닫고 게임으로 돌아가세요.',
          orderId, cashAdded: order.cashAmount, newBalance: p?.cash ?? order.cashAmount, returnOrigin: order.returnOrigin,
        }));
      } catch (err) {
        const msg = (err as Error).message || 'PayPal 결제 승인 실패';
        finishedCashOrders.set(orderId, { uid: order.uid, status: 'failed', cashAmount: 0, returnOrigin: order.returnOrigin, error: msg, updatedAt: Date.now() });
        sendHtml(res, 400, renderPgResultHtml({ ok: false, title: 'PayPal 결제 승인 실패', subtitle: msg, orderId, returnOrigin: order.returnOrigin }));
      }
      return true;
    }

    if (req.method === 'GET' && url === '/pg-fail') {
      const orderId = query.get('orderId') ?? '';
      const order = pendingCashOrders.get(orderId);
      const returnOrigin = order?.returnOrigin;
      if (order) {
        pendingCashOrders.delete(orderId);
        finishedCashOrders.set(orderId, {
          uid: order.uid, status: 'failed', cashAmount: 0, returnOrigin, error: 'PayPal 결제가 취소되었습니다.', updatedAt: Date.now(),
        });
      }
      sendHtml(res, 200, renderPgResultHtml({
        ok: false,
        title: 'PayPal 결제가 취소되었습니다',
        subtitle: '결제가 완료되지 않았습니다. 창을 닫고 게임으로 돌아가세요.',
        orderId,
        returnOrigin,
      }));
      return true;
    }

    // ── 상점 REST API ───────────────────────────────────────────────────────
    if (req.method === 'GET' && url === '/api/shop/config') {
      const cfg = readPayPalConfig();
      sendJson(res, 200, {
        mode: pgMode(),
        paypalEnv: cfg.env,
        currency: cfg.currency,
        totalCatalogKrw: BM_ALL_TOTAL_KRW,
        cashPacks: BM_CASH_PACKS,
        products: BM_PRODUCTS,
      });
      return true;
    }

    if (req.method === 'POST' && url === '/api/shop/cash-orders') {
      pruneOrders();
      const actor = await resolveActor(req, isAdminOnline);
      const p = sim.players.get(actor.uid);
      if (!p) { sendJson(res, 404, { error: '접속 중인 캐릭터를 찾을 수 없습니다' }); return true; }
      const body = await readJsonBody(req);
      const packId = String(body.packId ?? '');
      const pack = BM_CASH_PACK_MAP[packId];
      if (!pack) { sendJson(res, 404, { error: '존재하지 않는 캐쉬 패키지입니다' }); return true; }

      const cfg = readPayPalConfig();
      const mode = pgMode();

      if (mode === 'paypal') {
        const orderId = `pp_${randomUUID().slice(0, 16)}`;
        const origin = publicOrigin(req);
        const returnOrigin = safeClientOrigin(req);
        const created = await createPayPalOrder(cfg, orderId, pack, actor.uid, origin);
        pendingCashOrders.set(orderId, {
          orderId,
          paypalOrderId: created.paypalOrderId,
          uid: actor.uid,
          packId: pack.id,
          orderName: pack.name,
          currency: cfg.currency,
          expectedValue: created.expectedValue,
          cashAmount: pack.totalCash,
          returnOrigin,
          createdAt: Date.now(),
        });
        sendJson(res, 200, {
          ok: true,
          mode: 'paypal',
          paypalEnv: cfg.env,
          orderId,
          paypalOrderId: created.paypalOrderId,
          packId: pack.id,
          orderName: pack.name,
          currency: cfg.currency,
          amountValue: created.expectedValue,
          cashAmount: pack.totalCash,
          checkoutUrl: created.approveUrl,
        });
        return true;
      }

      if (mode === 'paypal-link') {
        const directUrl = directPackPayPalUrl(pack, cfg);
        if (!directUrl) {
          sendJson(res, 400, { error: `${pack.name}에 연결된 PayPal 링크(.env)를 찾을 수 없어요.` });
          return true;
        }
        const orderId = `pplk_${randomUUID().slice(0, 14)}`;
        sendJson(res, 200, {
          ok: true,
          mode: 'paypal-link',
          orderId,
          packId: pack.id,
          orderName: pack.name,
          currency: cfg.currency,
          amountValue: cfg.currency === 'KRW' ? String(pack.priceKrw) : pack.priceUsd.toFixed(2),
          cashAmount: pack.totalCash,
          checkoutUrl: directUrl,
        });
        return true;
      }

      sendJson(res, 503, {
        code: 'PAYPAL_NOT_CONFIGURED',
        error: 'PayPal 실결제 링크가 아직 .env에 설정되지 않았어요. PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET (또는 PAYPAL_ME_URL / PAYPAL_LINK_CASH_*)를 설정해 주세요.',
      });
      return true;
    }

    if (req.method === 'GET' && url === '/api/shop/cash-order-status') {
      pruneOrders();
      const actor = await resolveActor(req, isAdminOnline);
      const orderId = query.get('orderId') ?? '';
      const done = finishedCashOrders.get(orderId);
      if (done && done.uid === actor.uid) {
        const curCash = sim.players.get(actor.uid)?.cash ?? 0;
        sendJson(res, 200, { status: done.status, cash: curCash, cashAdded: done.cashAmount, error: done.error });
        return true;
      }
      const pend = pendingCashOrders.get(orderId);
      if (pend && pend.uid === actor.uid) {
        sendJson(res, 200, { status: 'pending' });
        return true;
      }
      sendJson(res, 404, { error: '주문을 찾을 수 없습니다' });
      return true;
    }

    if (req.method === 'POST' && url === '/api/shop/cash-buy') {
      const actor = await resolveActor(req, isAdminOnline);
      const p = sim.players.get(actor.uid);
      if (!p) { sendJson(res, 404, { error: '접속 중인 캐릭터를 찾을 수 없습니다' }); return true; }
      const body = await readJsonBody(req);
      const productId = String(body.productId ?? '');
      const prod = BM_PRODUCT_MAP[productId];
      if (!prod) { sendJson(res, 404, { error: '존재하지 않는 상품입니다' }); return true; }
      const unlock = isBmUnlocked(prod, p, actor.isAdmin);
      if (!unlock.unlocked) { sendJson(res, 403, { error: unlock.reason }); return true; }
      if (isOwnedOrPending(p, productId)) { sendJson(res, 409, { error: '이미 보유하거나 우편함으로 배송된 상품입니다' }); return true; }

      const orderId = `cash_${randomUUID().slice(0, 12)}`;
      const r = sim.deliverBmOrder(actor.uid, prod.id, orderId, 'cash-shop', {
        admin: actor.isAdmin,
        deductCash: true,
      });
      if (!r.ok) {
        sendJson(res, 400, { error: r.reason === 'no-cash' ? '보유 캐쉬가 부족합니다. 먼저 캐쉬를 충전해 주세요!' : r.reason ?? '구매 실패' });
        return true;
      }
      const save = sim.exportSave(actor.uid);
      if (save) await storage.save(actor.uid, save);
      sendJson(res, 200, { ok: true, orderId, productId: prod.id, cashRemaining: p.cash ?? 0 });
      return true;
    }

    if (req.method === 'POST' && url === '/api/shop/cash-buy-all') {
      const actor = await resolveActor(req, isAdminOnline);
      if (!actor.isAdmin) { sendJson(res, 403, { error: '관리자 계정 전용 기능입니다' }); return true; }
      const p = sim.players.get(actor.uid);
      if (!p) { sendJson(res, 404, { error: '접속 중인 캐릭터를 찾을 수 없습니다' }); return true; }
      const unowned = BM_PRODUCTS.filter((prod) => !isOwnedOrPending(p, prod.id));
      if (!unowned.length) { sendJson(res, 409, { error: '이미 모든 상점 상품을 보유 중입니다' }); return true; }
      const totalNeeded = unowned.reduce((s, prod) => s + prod.priceKrw, 0);
      if ((p.cash ?? 0) < totalNeeded) {
        sendJson(res, 400, { error: `미보유 전 품목 합계(${formatCash(totalNeeded)})보다 보유 캐쉬(${formatCash(p.cash ?? 0)})가 부족합니다` });
        return true;
      }
      for (const prod of unowned) {
        const orderId = `cash_all_${randomUUID().slice(0, 10)}`;
        sim.deliverBmOrder(actor.uid, prod.id, orderId, 'cash-shop', { admin: true, deductCash: true, silentToast: true });
      }
      const save = sim.exportSave(actor.uid);
      if (save) await storage.save(actor.uid, save);
      sendJson(res, 200, { ok: true, boughtCount: unowned.length, totalSpent: totalNeeded, cashRemaining: p.cash ?? 0 });
      return true;
    }

    if (req.method === 'POST' && url === '/api/shop/test-connection') {
      const actor = await resolveActor(req, isAdminOnline);
      const p = sim.players.get(actor.uid);
      if (!p) { sendJson(res, 404, { error: '접속 중인 캐릭터를 찾을 수 없습니다' }); return true; }
      const cfg = readPayPalConfig();
      const mode = pgMode();
      const remCost = remainingBmCostKrw(p);
      const origin = publicOrigin(req);
      const steps: { name: string; ok: boolean; detail: string }[] = [];

      if (mode === 'paypal') {
        try {
          await fetchPayPalToken(cfg);
          steps.push({
            name: '1. PayPal OAuth 인증 점검',
            ok: true,
            detail: `PayPal API 인증 정상 (통화 ${cfg.currency})`,
          });
        } catch (e) {
          steps.push({
            name: '1. PayPal OAuth 인증 점검',
            ok: false,
            detail: (e as Error).message,
          });
        }
      } else if (mode === 'paypal-link') {
        const sample = directPackPayPalUrl(BM_CASH_PACKS[2], cfg) ?? directPackPayPalUrl(BM_CASH_PACKS[0], cfg);
        steps.push({
          name: '1. PayPal 직접 결제 링크 상태',
          ok: !!sample,
          detail: `직접 PayPal 링크 연결됨 (${sample ?? '설정 확인'}). 자동 즉시 충전까지 쓰려면 PAYPAL_CLIENT_ID·SECRET을 추가하세요.`,
        });
      } else {
        steps.push({
          name: '1. PayPal 결제 링크 미설정',
          ok: false,
          detail: '.env 에 PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET (또는 PAYPAL_ME_URL / PAYPAL_LINK_CASH_*)이 비어 있습니다.',
        });
      }

      const hasCash = (p.cash ?? 0) >= remCost;
      steps.push({
        name: '2. 관리자 계정 · 전 품목 캐쉬 잔액 검증',
        ok: actor.isAdmin && hasCash,
        detail: `관리자=${actor.isAdmin ? '확인됨' : '일반'} · 보유 ${formatCash(p.cash ?? 0)} / 미보유 전체(${BM_PRODUCTS.length}종) 필요 ${formatCash(remCost)}`,
      });

      const dryProd = BM_PRODUCTS[0];
      const dryUnlock = dryProd ? isBmUnlocked(dryProd, p, actor.isAdmin) : { unlocked: false, reason: 'none' };
      steps.push({
        name: '3. PayPal 콜백 · 우편함 배송 파이프라인',
        ok: !!dryProd && dryUnlock.unlocked,
        detail: `콜백 주소=${origin}/pg-success · 어드민 해금=${dryUnlock.unlocked} · ${BM_CASH_PACKS[2]?.name ?? ''} (${formatUsd(BM_CASH_PACKS[2]?.priceUsd ?? 0)})`,
      });

      steps.push({
        name: '4. 저장소 영속성 상태',
        ok: true,
        detail: storage.kind,
      });

      sendJson(res, 200, {
        ok: steps.every((s) => s.ok),
        mode,
        paypalEnv: cfg.env,
        isAdmin: actor.isAdmin,
        cash: p.cash ?? 0,
        allCatalogKrw: BM_ALL_TOTAL_KRW,
        remainingCostKrw: remCost,
        steps,
        checkedAt: Date.now(),
      });
      return true;
    }

    sendJson(res, 404, { error: 'Not found' });
    return true;
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message || '결제 요청 오류' });
    return true;
  }
}
