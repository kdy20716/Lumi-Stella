// 진행상황 저장소
//  - Firestore: server/serviceAccountKey.json (Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키) 이 있으면 사용
//  - 없으면 server/saves/*.json 로컬 파일 (키를 넣으면 다음 실행부터 Firestore)
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SaveData, WorldTime } from '../shared/types';
import type { BugReport } from '../shared/protocol';

export type BanList = Record<string, { name: string; reason: string; at: number }>;

export interface Storage {
  readonly kind: string;
  load(uid: string): Promise<SaveData | null>;
  save(uid: string, data: SaveData): Promise<void>;
  loadWorld(): Promise<{ time: WorldTime } | null>;
  saveWorld(w: { time: WorldTime }): Promise<void>;
  // 관리 · 신고 (서버만 읽고 씀 — 클라이언트는 직접 접근 불가)
  bans(): Promise<BanList>;
  ban(uid: string, name: string, reason: string): Promise<void>;
  unban(uid: string): Promise<void>;
  reports(): Promise<BugReport[]>;
  addReport(r: BugReport): Promise<void>;
  resolveReport(id: string): Promise<void>;
  audit?(line: string): Promise<void>;
}

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const safe = (uid: string) => uid.replace(/[^a-zA-Z0-9_-]/g, '_');

class FileStorage implements Storage {
  readonly kind = '로컬 파일 (server/saves)';
  private dir = here('./saves/');
  constructor() { mkdirSync(this.dir, { recursive: true }); }
  async load(uid: string) { const f = `${this.dir}${safe(uid)}.json`; return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as SaveData) : null; }
  async save(uid: string, data: SaveData) { writeFileSync(`${this.dir}${safe(uid)}.json`, JSON.stringify(data)); }
  async loadWorld() { const f = `${this.dir}_world.json`; return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as { time: WorldTime }) : null; }
  async saveWorld(w: { time: WorldTime }) { writeFileSync(`${this.dir}_world.json`, JSON.stringify(w)); }
  private readJ<T>(name: string, def: T): T { const f = `${this.dir}${name}`; try { return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as T) : def; } catch { return def; } }
  private writeJ(name: string, v: unknown) { writeFileSync(`${this.dir}${name}`, JSON.stringify(v)); }
  async bans() { return this.readJ<BanList>('_bans.json', {}); }
  async ban(uid: string, name: string, reason: string) { const b = await this.bans(); b[uid] = { name, reason, at: Date.now() }; this.writeJ('_bans.json', b); }
  async unban(uid: string) { const b = await this.bans(); delete b[uid]; this.writeJ('_bans.json', b); }
  async reports() { return this.readJ<BugReport[]>('_reports.json', []); }
  async addReport(r: BugReport) { const l = await this.reports(); l.push(r); this.writeJ('_reports.json', l.slice(-500)); }
  async resolveReport(id: string) { const l = await this.reports(); const r = l.find((x) => x.id === id); if (r) r.resolved = true; this.writeJ('_reports.json', l); }
  async audit(line: string) { appendFileSync(`${this.dir}_admin.log`, `${new Date().toISOString()} ${line}\n`); }
}

interface DocRef { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(d: Record<string, unknown>, o?: { merge: boolean }): Promise<unknown> }
interface Db { collection(name: string): { doc(id: string): DocRef; add?(d: Record<string, unknown>): Promise<unknown> } }

class FirestoreStorage implements Storage {
  readonly kind = 'Firebase Firestore';
  constructor(private db: Db) {}
  // Firestore 는 중첩 배열을 못 담아서 게임 데이터는 JSON 문자열로 저장 (+ 검색용 필드)
  async load(uid: string) { const s = await this.db.collection('players').doc(uid).get(); const d = s.exists ? s.data() : undefined; return d?.data ? (JSON.parse(String(d.data)) as SaveData) : null; }
  async save(uid: string, data: SaveData) { await this.db.collection('players').doc(uid).set({ data: JSON.stringify(data), name: data.name, look: data.look, gold: data.gold, updatedAt: new Date() }, { merge: true }); }
  async loadWorld() { const s = await this.db.collection('world').doc('state').get(); const d = s.exists ? s.data() : undefined; return d?.time ? { time: d.time as WorldTime } : null; }
  async saveWorld(w: { time: WorldTime }) { await this.db.collection('world').doc('state').set({ time: w.time, updatedAt: new Date() }, { merge: true }); }
  // 관리 데이터: admin 컬렉션 (Firestore 규칙에서 클라이언트 접근은 막혀 있음 — 서버의 서비스 계정만 씀)
  private async getJ<T>(doc: string, def: T): Promise<T> { const s = await this.db.collection('admin').doc(doc).get(); const d = s.exists ? s.data() : undefined; try { return d?.json ? (JSON.parse(String(d.json)) as T) : def; } catch { return def; } }
  private async setJ(doc: string, v: unknown) { await this.db.collection('admin').doc(doc).set({ json: JSON.stringify(v), updatedAt: new Date() }); }
  async bans() { return this.getJ<BanList>('bans', {}); }
  async ban(uid: string, name: string, reason: string) { const b = await this.bans(); b[uid] = { name, reason, at: Date.now() }; await this.setJ('bans', b); }
  async unban(uid: string) { const b = await this.bans(); delete b[uid]; await this.setJ('bans', b); }
  async reports() { return this.getJ<BugReport[]>('reports', []); }
  async addReport(r: BugReport) { const l = await this.reports(); l.push(r); await this.setJ('reports', l.slice(-500)); }
  async resolveReport(id: string) { const l = await this.reports(); const r = l.find((x) => x.id === id); if (r) r.resolved = true; await this.setJ('reports', l); }
}

export async function createStorage(): Promise<Storage> {
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT ?? here('./serviceAccountKey.json');
  if (existsSync(keyPath)) {
    try {
      const { initializeApp, cert } = await import('firebase-admin/app');
      const { getFirestore } = await import('firebase-admin/firestore');
      const app = initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
      return new FirestoreStorage(getFirestore(app) as unknown as Db);
    } catch (e) {
      console.warn('⚠ Firestore 연결 실패 → 로컬 파일로 저장합니다:', (e as Error).message);
    }
  }
  return new FileStorage();
}
