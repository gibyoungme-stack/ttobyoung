// Firestore 연결. 모든 데이터는 families/{가족코드}/ 아래에 저장됩니다.
// 가족 코드를 모르면 경로를 알 수 없고, 보안 규칙(firestore.rules)이 목록 조회를 막습니다.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDRBAH-pv2ewVjlgVDplNDbv3tsGG4QS4A',
  authDomain: 'ttobyoung.firebaseapp.com',
  projectId: 'ttobyoung',
  storageBucket: 'ttobyoung.firebasestorage.app',
  messagingSenderId: '1030340882579',
  appId: '1:1030340882579:web:ef86c67a12c0f833ea5d66',
};

const app = initializeApp(firebaseConfig);
let fs;
try {
  // 오프라인에서도 마지막 데이터가 보이고, 쓴 내용은 연결되면 자동 전송
  fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch {
  fs = getFirestore(app);
}

export const LISTS = ['events', 'todos', 'gear'];
const base = (code) => `families/${code}`;
const metaRef = (code, name) => doc(fs, base(code), 'meta', name);
const strip = (o) => { const { id, ...rest } = o || {}; return rest; };
const safeId = (id) => String(id).replace(/[\/\s]/g, '-').slice(0, 100);

export async function familyExists(code) {
  const snap = await getDoc(metaRef(code, 'settings'));
  return snap.exists();
}

export function createFamily(code) {
  return setDoc(metaRef(code, 'settings'), { createdAt: new Date().toISOString(), lastBackupAt: null });
}

export function subscribe(code, h) {
  const onErr = (e) => h.error?.(e);
  const offs = [
    onSnapshot(metaRef(code, 'settings'), (s) => h.meta('settings', s.exists() ? s.data() : null), onErr),
    onSnapshot(metaRef(code, 'finance'), (s) => h.meta('finance', s.exists() ? s.data() : null), onErr),
    ...LISTS.map((col) => onSnapshot(collection(fs, base(code), col),
      (qs) => h.list(col, qs.docs.map((d) => ({ ...d.data(), id: d.id }))), onErr)),
  ];
  return () => offs.forEach((off) => off());
}

/** 저장. id가 없으면 새로 만들고 id를 돌려줌. merge=true면 일부 필드만 바꿈 */
export async function saveItem(code, col, id, data, merge = false) {
  const ref = id ? doc(fs, base(code), col, safeId(id)) : doc(collection(fs, base(code), col));
  await setDoc(ref, strip(data), { merge });
  return ref.id;
}

export function removeItem(code, col, id) {
  return deleteDoc(doc(fs, base(code), col, safeId(id)));
}

export function saveMeta(code, name, data, merge = true) {
  return setDoc(metaRef(code, name), data, { merge });
}

async function commitOps(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(fs);
    ops.slice(i, i + 400).forEach((op) => op(b));
    await b.commit();
  }
}

/** 백업 복구: 일정·할 일·준비물·경제를 백업 내용으로 통째로 바꿈 */
export async function replaceAll(code, data) {
  const ops = [];
  for (const col of LISTS) {
    const existing = await getDocs(collection(fs, base(code), col));
    existing.docs.forEach((d) => ops.push((b) => b.delete(d.ref)));
    (data[col] || []).forEach((item) => {
      const ref = item.id ? doc(fs, base(code), col, safeId(item.id)) : doc(collection(fs, base(code), col));
      ops.push((b) => b.set(ref, strip(item)));
    });
  }
  if (data.finance) ops.push((b) => b.set(metaRef(code, 'finance'), data.finance));
  await commitOps(ops);
}

/** 업데이트 파일: 같은 id는 덮어쓰고 새 id는 추가 (나머지는 그대로) */
export async function upsertMany(code, data) {
  const ops = [];
  const count = {};
  for (const col of LISTS) {
    const items = data[col] || [];
    count[col] = items.length;
    items.forEach((item) => {
      const ref = item.id ? doc(fs, base(code), col, safeId(item.id)) : doc(collection(fs, base(code), col));
      ops.push((b) => b.set(ref, strip(item), { merge: true }));
    });
  }
  (data.remove || []).forEach(({ col, id }) => {
    if (LISTS.includes(col) && id) ops.push((b) => b.delete(doc(fs, base(code), col, safeId(id))));
  });
  if (data.finance) ops.push((b) => b.set(metaRef(code, 'finance'), data.finance, { merge: true }));
  await commitOps(ops);
  return count;
}
