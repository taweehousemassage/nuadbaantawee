// logic.js — เวลาไทย ช่องเวลาโดม หน้าต่างนอกสถานที่ และคิวหน้าร้าน
import * as db from './store.js';
export { toT } from './public/messages.js';

export const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const pad = (n) => String(n).padStart(2, '0');
export const fmt = (m) => pad(Math.floor(m / 60)) + ':' + pad(m % 60);

export function nowBKK() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, min: (Number(g('hour')) % 24) * 60 + Number(g('minute')) };
}
export function addDays(date, n) { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export const weekday = (date) => new Date(date + 'T00:00:00Z').getUTCDay();
const S = () => db.data().settings;

export const DOME_ACTIVE = ['booked', 'slip', 'paid', 'done'];
export const OUTCALL_ACTIVE = ['requested', 'accepted', 'negotiate', 'slip', 'paid', 'done'];
export const isActive = (b) => (b.kind === 'dome' ? DOME_ACTIVE : OUTCALL_ACTIVE).includes(b.status);

export const domeOpenOn = (date) => { const d = S().dome; return !!d.on && d.days.includes(weekday(date)); };
export const outcallOpenOn = (date) => { const o = S().outcall; return !!o.on && o.days.includes(weekday(date)); };

// ช่องเวลาโดม (ฟรี จองแล้วมาเลย) — คืน [{t, ok}]
export const domeDur = () => { const d = S().dome; return Math.max(5, Number(d.durationMin) || Number(d.slotMin) || 30); };

export function domeSlots(date) {
  const d = S().dome, now = nowBKK(), out = [];
  if (!domeOpenOn(date) || date < now.date) return out;
  const step = Math.max(5, Number(d.slotMin) || 15), seats = Math.max(1, Number(d.seats) || 1);
  const dur = domeDur();
  const taken = db.data().bookings.filter((b) => b.kind === 'dome' && b.date === date && isActive(b));
  for (let t = toMin(d.open); t + dur <= toMin(d.close); t += step) {
    if (date === now.date && t < now.min) continue;
    // คิวที่จองไว้กินเวลา dur นาที — ช่องไหนทับกันถือว่าเต็ม (จอง 9:30 → 9:45 หายไปด้วย)
    const busy = taken.filter((b) => {
      const bs = Number(b.time), be = bs + (Number(b.durationMin) || dur);
      return bs < t + dur && t < be;
    }).length;
    out.push({ t, ok: busy < seats });
  }
  return out;
}

// หน้าต่างเวลานอกสถานที่ของวันนั้น (ลูกค้าเลือกช่วงกว้าง ๆ ได้)
export function outcallWindow(date) {
  const o = S().outcall;
  if (!outcallOpenOn(date)) return null;
  return { open: toMin(o.open), close: toMin(o.close) };
}

export function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c; do { c = Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join(''); }
  while (db.data().bookings.some((b) => b.id === c));
  return c;
}

// ---------------------------------------------------------------- บัตรคิวหน้าร้าน
export const queueLen = () => Math.max(15, Number(S().queue.slotMin) || 60);
export const todayQueue = () => { const d = nowBKK().date; return db.data().queue.filter((q) => q.date === d).sort((a, b) => a.order - b.order); };

export function estimate() {
  const n = nowBKK(), len = queueLen(), q = todayQueue(), out = {};
  const sv = q.find((x) => x.status === 'serving');
  let cur = sv ? Math.max(n.min, (sv.startedMin || n.min) + len) : n.min;
  for (const x of q.filter((x) => x.status === 'waiting')) { out[x.no] = cur; cur += len; }
  return out;
}

export function ticketInfo(q) {
  const list = todayQueue(), sv = list.find((x) => x.status === 'serving');
  const waiting = list.filter((x) => x.status === 'waiting');
  const idx = waiting.findIndex((x) => x.no === q.no);
  return { no: q.no, status: q.status, paid: !!q.paid, linked: !!q.lineUserId,
    ahead: idx < 0 ? 0 : idx + (sv ? 1 : 0), est: estimate()[q.no] ?? null, serving: sv ? sv.no : null };
}
