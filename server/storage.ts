// 진행상황 저장소
//  - Firestore: server/serviceAccountKey.json (Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키) 이 있으면 사용
//  - 없으면 server/saves/*.json 로컬 파일 (키를 넣으면 다음 실행부터 Firestore)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SaveData, WorldTime } from '../shared/types';

export interface Storage {
  readonly kind: string;
  load(uid: string): Promise<SaveData | null>;
  save(uid: string, data: SaveData): Promise<void>;
  loadWorld(): Promise<{ time: WorldTime } | null>;
  saveWorld(w: { time: WorldTime }): Promise<void>;
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
}

interface DocRef { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(d: Record<string, unknown>, o?: { merge: boolean }): Promise<unknown> }
interface Db { collection(name: string): { doc(id: string): DocRef } }

class FirestoreStorage implements Storage {
  readonly kind = 'Firebase Firestore';
  constructor(private db: Db) {}
  // Firestore 는 중첩 배열을 못 담아서 게임 데이터는 JSON 문자열로 저장 (+ 검색용 필드)
  async load(uid: string) { const s = await this.db.collection('players').doc(uid).get(); const d = s.exists ? s.data() : undefined; return d?.data ? (JSON.parse(String(d.data)) as SaveData) : null; }
  async save(uid: string, data: SaveData) { await this.db.collection('players').doc(uid).set({ data: JSON.stringify(data), name: data.name, look: data.look, gold: data.gold, updatedAt: new Date() }, { merge: true }); }
  async loadWorld() { const s = await this.db.collection('world').doc('state').get(); const d = s.exists ? s.data() : undefined; return d?.time ? { time: d.time as WorldTime } : null; }
  async saveWorld(w: { time: WorldTime }) { await this.db.collection('world').doc('state').set({ time: w.time, updatedAt: new Date() }, { merge: true }); }
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
