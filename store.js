// store.js — ข้อมูลทั้งร้านเก็บเป็นเอกสารเดียว
// MongoDB: database ตาม MONGODB_DB (ค่าเริ่มต้น nuadbaantawee) collection shop · ไม่มี MONGODB_URI → data/shop.json (ทดสอบในเครื่อง)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, 'data');
const FILE = path.join(DIR, 'shop.json');

let cache = null, col = null, useMongo = false, chain = Promise.resolve();

export const DEFAULT_SETTINGS = {
  shopName: 'นวดเส้นบ้านทวี',
  therapist: 'พี่หนึ่ง',
  pp: '',                          // พร้อมเพย์ (เบอร์หรือเลขบัตร)

  // จุดเริ่มต้นเดินทาง — ใส่พิกัดจากลิงก์ Google Maps ในหน้า /admin
  origin: { label: 'บ้านโนนขี้ตุ่น', lat: null, lng: null },

  // มิเตอร์แท็กซี่ไทย (แก้ได้ในหน้าตั้งค่า)
  taxi: { start: 35, startKm: 1, tiers: [
    { upto: 10, rate: 6.5 }, { upto: 20, rate: 7 }, { upto: 40, rate: 8 },
    { upto: 60, rate: 8.5 }, { upto: 80, rate: 9 }, { upto: 99999, rate: 10.5 },
  ] },
  roundTrip: true,                 // คิดไป-กลับ (×2)
  teacherMin: 100,                 // ค่าครูขั้นต่ำ

  // โดมผู้สูงอายุ — จองฟรี ไม่ต้องโอน
  // slotMin = ระยะห่างของช่องเวลาที่ให้เลือก · durationMin = นวดจริงนานเท่าไร (กันคิวทับ)
  // payMin = ยอดโอนขั้นต่ำก่อนยืนยันคิว · holdMin = กันคิวไว้กี่นาทีระหว่างรอโอน
  dome: { on: true, days: [1, 2, 3, 4, 5], open: '09:00', close: '12:00', slotMin: 15, durationMin: 30, payMin: 100, holdMin: 30, seats: 1 },
  // นวดนอกสถานที่ — ลูกค้าขอ พี่หนึ่งกดรับงาน/เจรจา
  outcall: { on: true, days: [1, 2, 3, 4, 5], open: '13:00', close: '17:00' },
  // บัตรคิวหน้าร้าน (ปุ่มมุมขวาบน)
  queue: { on: true, slotMin: 60 },

  notices: [
    'จ.–ศ. โดมผู้สูงอายุ 9:00–12:00',
    'จ.–ศ. จองนวดนอกสถานที่ 13:00–17:00',
    'ส.–อา. ตลาดคุณปู่ อาสาชาวนามหานคร',
  ],

  notifyOwner: true,
  autoRemind: true,
  ownerUserId: '',
};

const seed = () => ({ settings: { ...DEFAULT_SETTINGS }, bookings: [], queue: [] });

function normalize(d) {
  const s = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  s.origin = { ...DEFAULT_SETTINGS.origin, ...(s.origin || {}) };
  s.taxi = { ...DEFAULT_SETTINGS.taxi, ...(s.taxi || {}) };
  for (const k of ['dome', 'outcall', 'queue']) s[k] = { ...DEFAULT_SETTINGS[k], ...(s[k] || {}) };
  if (!Array.isArray(s.notices) || !s.notices.length) s.notices = [...DEFAULT_SETTINGS.notices];
  d.settings = s;
  d.bookings = d.bookings || [];
  d.queue = d.queue || [];
  const cut = Date.now() - 90 * 864e5;                    // เก็บย้อนหลัง 90 วัน
  const cutDate = new Date(cut).toISOString().slice(0, 10);
  d.bookings = d.bookings.filter((b) => (b.date || '') >= cutDate);
  d.queue = d.queue.filter((q) => (q.createdAt || 0) > cut);
  return d;
}

export async function init() {
  const URI = process.env.MONGODB_URI || '';
  if (URI) {
    try {
      const { MongoClient } = await import('mongodb');
      const client = new MongoClient(URI, { serverSelectionTimeoutMS: 8000 });
      await client.connect();
      col = client.db(process.env.MONGODB_DB || 'nuadbaantawee').collection(process.env.MONGODB_COLLECTION || 'shop');
      const doc = await col.findOne({ _id: 'main' });
      const { _id, ...rest } = doc || seed();
      cache = normalize(rest); useMongo = true; save();
      console.log('   ฐานข้อมูล:  MongoDB ✓');
      return;
    } catch (e) { console.error('   ต่อ MongoDB ไม่ได้ —', e.message); }
  }
  try { cache = normalize(JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch { cache = normalize(seed()); }
  save();
  console.log('   ฐานข้อมูล:  ไฟล์ data/shop.json (ข้อมูลรีเซ็ตเมื่ออัปเดตเว็บ)');
}

export const data = () => cache;
export const storageMode = () => (useMongo ? 'mongodb' : 'file');
export function save() {
  if (!cache) return;
  if (useMongo) {
    const snap = JSON.parse(JSON.stringify(cache));
    chain = chain.then(() => col.replaceOne({ _id: 'main' }, { _id: 'main', ...snap }, { upsert: true }))
      .catch((e) => console.error('บันทึก Mongo ไม่สำเร็จ:', e.message));
  } else {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(cache, null, 2));
  }
}
