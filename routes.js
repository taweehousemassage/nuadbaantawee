// routes.js — API ทั้งหมดของเว็บนวดเส้นบ้านทวี
// ลูกค้า: /  (โดม + นอกสถานที่ + บัตรคิวหน้าร้าน)   พี่หนึ่ง: /admin   LINE webhook: /api/line/webhook
import path from 'path';
import { fileURLToPath } from 'url';
import * as store from './store.js';
import * as L from './logic.js';
import * as line from './line.js';
import { roadKm, travelFare } from './fare.js';
import { TEMPLATES, REPLY, OWNER } from './public/messages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES = path.join(__dirname, 'public');
const env = (k) => process.env[k] || process.env['NUAD_' + k] || '';
const S = () => ({ ...store.data().settings, siteUrl: env('PUBLIC_BASE_URL').replace(/\/$/, '') });
const owner = () => store.data().settings.ownerUserId;
const notifyOwner = (text) => (store.data().settings.notifyOwner && owner() ? line.push(owner(), text) : Promise.resolve(false));
const find = (id) => store.data().bookings.find((b) => b.id === String(id || '').toUpperCase());

// ---------------------------------------------------------------- LINE webhook
async function handleLineWebhook(req) {
  if (!store.data()) return;
  if (!line.verify(req.rawBody, req.get('x-line-signature'))) return;   // ตรวจลายเซ็นก่อนเสมอ
  for (const ev of req.body?.events || []) await handleEvent(ev).catch((e) => console.error('webhook:', e.message));
}

async function handleEvent(ev) {
  const uid = ev.source?.userId;
  if (!uid || ev.type !== 'message') return;
  const d = store.data(), s = S(), m = ev.message;

  if (m.type === 'text') {
    const txt = m.text.trim(); let r;

    if ((r = /^ผูกหมอนวด\s+(\S+)/.exec(txt))) {
      if (!env('OWNER_CODE') || r[1] !== env('OWNER_CODE')) return;
      d.settings.ownerUserId = uid; store.save();
      return line.reply(ev.replyToken, `ตั้งบัญชีนี้เป็นของ${s.therapist}แล้วค่ะ จะแจ้งงานใหม่และสลิปที่นี่`);
    }

    // คำสั่งของพี่หนึ่ง: รับงาน / เจรจา / ไม่รับ + รหัส
    if ((r = /^(รับงาน|เจรจา|ไม่รับ)\s*([A-Z0-9]{5})/i.exec(txt))) {
      if (uid !== owner()) return;
      const b = find(r[2]);
      if (!b || b.kind !== 'outcall') return line.reply(ev.replyToken, REPLY.notFound());
      const act = { 'รับงาน': 'accept', 'เจรจา': 'negotiate', 'ไม่รับ': 'decline' }[r[1]];
      const res = await decideOutcall(b, act);
      return line.reply(ev.replyToken, res.ownerText);
    }

    if ((r = /นัดนวด\s*([A-Z0-9]{5})\b/i.exec(txt))) {
      const b = find(r[1]);
      if (!b) return line.reply(ev.replyToken, REPLY.notFound());
      b.lineUserId = uid; store.save();
      return line.reply(ev.replyToken, bookingReply(s, b));
    }
    if ((r = /บัตรคิวนวด\s*(\d+)/.exec(txt))) {
      const q = L.todayQueue().find((x) => x.no === Number(r[1]));
      if (!q) return line.reply(ev.replyToken, REPLY.notFound());
      q.lineUserId = uid; store.save();
      return line.reply(ev.replyToken, REPLY.linkQueue(s, q, L.ticketInfo(q).ahead));
    }
    if (/^ดูนัดของฉัน/.test(txt)) return line.reply(ev.replyToken, REPLY.howMyBooking(s));
    if (/^แจ้งโอน/.test(txt)) return line.reply(ev.replyToken, REPLY.howSlip(s));
    if (/^สอบถาม/.test(txt)) return line.reply(ev.replyToken, REPLY.ask({ ...s, open: s.dome.open, close: s.outcall.close }));
    return;  // ข้อความอื่น พี่หนึ่งตอบเองในแอป LINE OA
  }

  if (m.type === 'image') {
    // สลิป = งานนอกสถานที่ที่รับงานแล้วและยังไม่จ่าย
    const b = d.bookings.filter((x) => x.kind === 'outcall' && x.lineUserId === uid && ['accepted', 'negotiate'].includes(x.status))
      .sort((a, z) => z.createdAt - a.createdAt)[0];
    if (b) {
      b.status = 'slip'; b.slipAt = Date.now(); store.save();
      await line.reply(ev.replyToken, REPLY.slip(s, b));
      return notifyOwner(OWNER.slip(b));
    }
    const q = L.todayQueue().filter((x) => x.lineUserId === uid && !x.paid && !x.slipAt).pop();
    if (q) {
      q.slipAt = Date.now(); store.save();
      await line.reply(ev.replyToken, REPLY.slip(s, q));
      return notifyOwner(OWNER.slip(q));
    }
  }
}

const bookingReply = (s, b) => (b.kind === 'dome'
  ? `ผูกคิวโดมรหัส ${b.id} กับไลน์นี้แล้วค่ะ 🗓️ ${new Date(b.date + 'T00:00:00Z').toLocaleDateString('th-TH', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' })} เวลา ${L.fmt(b.time)} น.`
  : TEMPLATES[b.status === 'accepted' || b.status === 'slip' ? 'outAccepted' : 'outNegotiate'].text(s, b));

// ---------------------------------------------------------------- ตัดสินใจงานนอกสถานที่ (ใช้ทั้งจากไลน์และหน้า /admin)
async function decideOutcall(b, action, patch = {}) {
  const s = S();
  if (patch.km != null && Number(patch.km) > 0) { b.km = Math.round(Number(patch.km) * 10) / 10; b.estimated = false; b.travel = travelFare(b.km, s); }
  if (patch.travel != null && Number(patch.travel) >= 0) b.travel = Math.round(Number(patch.travel));
  if (patch.note) b.ownerNote = String(patch.note).slice(0, 200);
  b.decidedAt = Date.now();
  const kinds = { accept: ['accepted', 'outAccepted'], negotiate: ['negotiate', 'outNegotiate'], decline: ['declined', 'outDeclined'] };
  if (!kinds[action]) return { ownerText: 'คำสั่งไม่ถูกต้องค่ะ' };
  b.status = kinds[action][0];
  store.save();
  const text = TEMPLATES[kinds[action][1]].text(s, b);
  const sent = b.lineUserId ? await line.push(b.lineUserId, text) : false;
  const done = { accept: 'รับงาน', negotiate: 'ขอเจรจา', decline: 'ไม่รับงาน' }[action];
  return { ok: true, sent, text,
    ownerText: `บันทึกว่า "${done}" ${b.id} แล้วค่ะ${sent ? ' · แจ้งลูกค้าทางไลน์แล้ว' : b.lineUserId ? '' : ' · ลูกค้ายังไม่ได้ผูกไลน์ ต้องโทรบอกเอง'}` };
}

// ---------------------------------------------------------------- ติดตั้ง
export function mountNuad(app) {
  const ready = store.init();
  app.use('/api', (req, res, next) => ready.then(() => next(), next));
  app.post('/api/line/webhook', (req, res) => {
    res.status(200).end();
    handleLineWebhook(req).catch((e) => console.error('webhook:', e.message));
  });

  // งานตามเวลา: เตือนนัดพรุ่งนี้หลัง 18:00
  async function tick() {
    const s = S(), n = L.nowBKK();
    if (!s.autoRemind || !line.enabled() || n.min < 18 * 60) return;
    const tomorrow = L.addDays(n.date, 1);
    for (const b of store.data().bookings) {
      if (b.date !== tomorrow || !b.lineUserId || b.remindedAt) continue;
      if (!(b.kind === 'dome' ? b.status === 'booked' : ['accepted', 'slip', 'paid'].includes(b.status))) continue;
      b.remindedAt = Date.now(); store.save();
      await line.push(b.lineUserId, b.kind === 'dome' ? TEMPLATES.remind.text(s, b)
        : `พรุ่งนี้มีงานนวดนอกสถานที่นะคะ 🚗 ${L.fmt(b.from)}–${L.fmt(b.to)} น. ที่ ${b.place?.text || '-'} (รหัส ${b.id})`);
    }
  }
  setInterval(() => tick().catch(() => {}), 60_000);
  app.get('/api/tick', (req, res) => { tick().catch(() => {}); res.json({ ok: true }); });

  // ---------- หน้าเว็บ
  app.get('/', (req, res) => res.sendFile(path.join(PAGES, 'index.html')));
  app.get('/admin', (req, res) => res.sendFile(path.join(PAGES, 'admin.html')));

  // ---------- ข้อมูลสาธารณะ
  const lineInfo = () => ({ on: line.enabled() && line.canVerify(), oaId: env('LINE_OA_ID'), addFriend: env('LINE_ADD_FRIEND_URL') });
  app.get('/api/public', (req, res) => {
    const s = S(), n = L.nowBKK();
    const days = Array.from({ length: 14 }, (_, i) => {
      const date = L.addDays(n.date, i);
      return { date, wd: L.weekday(date), dome: L.domeOpenOn(date), outcall: L.outcallOpenOn(date) };
    });
    const q = L.todayQueue(), sv = q.find((x) => x.status === 'serving');
    res.json({
      settings: {
        shopName: s.shopName, therapist: s.therapist, pp: s.pp, notices: s.notices,
        dome: s.dome, outcall: s.outcall, queue: { on: s.queue.on, slotMin: L.queueLen() },
        teacherMin: s.teacherMin, roundTrip: s.roundTrip !== false,
        origin: { label: s.origin.label, set: !!(s.origin.lat && s.origin.lng) },
      },
      line: lineInfo(), today: n.date, days,
      live: { serving: sv ? sv.no : null, waiting: q.filter((x) => x.status === 'waiting').length },
    });
  });

  app.get('/api/dome/slots', (req, res) => {
    const date = String(req.query.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'วันที่ไม่ถูกต้อง' });
    res.json(L.domeSlots(date));
  });

  const pub = (b) => (b.kind === 'dome'
    ? { id: b.id, kind: 'dome', date: b.date, time: b.time, status: b.status, linked: !!b.lineUserId }
    : { id: b.id, kind: 'outcall', date: b.date, from: b.from, to: b.to, place: b.place, km: b.km, estimated: b.estimated,
        travel: b.travel, teacherMin: b.teacherMin, status: b.status, linked: !!b.lineUserId, ownerNote: b.ownerNote || '' });

  const checkPerson = (body) => {
    const name = String(body?.name || '').trim().slice(0, 40);
    const phone = String(body?.phone || '').replace(/[^\d]/g, '').slice(0, 12);
    if (!name || phone.length < 9) return { error: 'กรอกชื่อและเบอร์โทรให้ครบก่อนนะคะ' };
    if (!body?.consent) return { error: 'ติ๊กช่องยินยอมก่อนกดยืนยันค่ะ' };
    return { name, phone };
  };

  // ---------- จองคิวโดม (ฟรี)
  app.post('/api/dome/bookings', (req, res) => {
    const { date, time } = req.body || {};
    const t = Number(time);
    const p = checkPerson(req.body);
    if (p.error) return res.status(400).json(p);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(t)) return res.status(400).json({ error: 'เลือกวันและเวลาก่อนนะคะ' });
    if (!L.domeSlots(date).some((x) => x.t === t && x.ok)) return res.status(409).json({ error: 'เวลานี้เพิ่งมีคนจองไป เลือกเวลาอื่นนะคะ' });
    const dup = store.data().bookings.find((b) => b.kind === 'dome' && b.phone === p.phone && b.date === date && b.status === 'booked');
    if (dup) return res.status(409).json({ error: `เบอร์นี้จองวันนี้ไว้แล้ว (รหัส ${dup.id})`, booking: pub(dup) });
    const b = { id: L.newCode(), kind: 'dome', date, time: t, name: p.name, phone: p.phone, status: 'booked', createdAt: Date.now() };
    store.data().bookings.push(b); store.save();
    notifyOwner(OWNER.booking(b));
    res.json(pub(b));
  });

  // ---------- นวดนอกสถานที่
  const validPoint = (o) => o && Number.isFinite(Number(o.lat)) && Number.isFinite(Number(o.lng)) && Math.abs(o.lat) <= 90 && Math.abs(o.lng) <= 180;

  // คิดค่าเดินทางให้ดูก่อนกดส่งคำขอ
  app.post('/api/outcall/quote', async (req, res) => {
    const s = S();
    const to = { lat: Number(req.body?.lat), lng: Number(req.body?.lng) };
    if (!validPoint(to)) return res.status(400).json({ error: 'ปักหมุดตำแหน่งก่อนนะคะ' });
    if (!validPoint(s.origin)) return res.json({ needOrigin: true, teacherMin: s.teacherMin });
    const { km, estimated } = await roadKm(s.origin, to);
    const travel = travelFare(km, s);
    res.json({ km, estimated, travel, teacherMin: s.teacherMin, total: travel + s.teacherMin, roundTrip: s.roundTrip !== false });
  });

  app.post('/api/outcall/requests', async (req, res) => {
    const s = S();
    const { date, from, to, place, note } = req.body || {};
    const p = checkPerson(req.body);
    if (p.error) return res.status(400).json(p);
    const f = Number(from), t2 = Number(to), w = L.outcallWindow(date || '');
    if (!w) return res.status(400).json({ error: 'วันนี้ไม่เปิดรับงานนอกสถานที่ค่ะ' });
    if (!Number.isFinite(f) || !Number.isFinite(t2) || f < w.open || t2 > w.close || t2 - f < 60) {
      return res.status(400).json({ error: `เลือกช่วงเวลาในกรอบ ${s.outcall.open}–${s.outcall.close} น. และกว้างอย่างน้อย 1 ชั่วโมงนะคะ` });
    }
    const n = L.nowBKK();
    if (date < n.date) return res.status(400).json({ error: 'เลือกวันในอนาคตนะคะ' });
    const pt = { text: String(place?.text || '').trim().slice(0, 200), lat: Number(place?.lat), lng: Number(place?.lng) };
    if (!pt.text) return res.status(400).json({ error: 'ใส่สถานที่ให้ด้วยนะคะ' });
    const pending = store.data().bookings.find((b) => b.kind === 'outcall' && b.phone === p.phone && ['requested', 'negotiate'].includes(b.status));
    if (pending) return res.status(409).json({ error: `เบอร์นี้มีคำขอที่ยังรอคำตอบอยู่ (รหัส ${pending.id})`, booking: pub(pending) });

    let km = null, estimated = true, travel = null;
    if (validPoint(pt) && validPoint(s.origin)) {
      const d = await roadKm(s.origin, pt); km = d.km; estimated = d.estimated; travel = travelFare(km, s);
    }
    const b = { id: L.newCode(), kind: 'outcall', date, from: f, to: t2, place: pt, km, estimated,
      travel: travel ?? 0, teacherMin: s.teacherMin, name: p.name, phone: p.phone,
      note: String(note || '').trim().slice(0, 300), status: 'requested', createdAt: Date.now() };
    store.data().bookings.push(b); store.save();
    if (owner()) await line.push(owner(), OWNER.outcall(s, b));
    res.json(pub(b));
  });

  app.get('/api/bookings/:id', (req, res) => {
    const b = find(req.params.id);
    if (!b) return res.status(404).json({ error: 'ไม่พบรายการนี้' });
    res.json(pub(b));
  });

  app.post('/api/my', (req, res) => {
    const ph = String(req.body?.phone || '').replace(/\D/g, '');
    if (ph.length < 9) return res.status(400).json({ error: 'ใส่เบอร์โทรให้ครบนะคะ' });
    const today = L.nowBKK().date;
    res.json(store.data().bookings.filter((b) => b.phone === ph && b.date >= today && L.isActive(b))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map(pub));
  });

  // ---------- บัตรคิวหน้าร้าน
  app.post('/api/queue', (req, res) => {
    if (!S().queue.on) return res.status(409).json({ error: 'วันนี้ยังไม่เปิดรับบัตรคิวหน้าร้านค่ะ' });
    const nm = String(req.body?.name || '').trim().slice(0, 40);
    if (!nm) return res.status(400).json({ error: 'ใส่ชื่อที่ให้เรียกด้วยนะคะ' });
    const n = L.nowBKK(), list = L.todayQueue();
    if (list.filter((x) => x.status === 'waiting').length >= 30) return res.status(409).json({ error: 'คิววันนี้เต็มแล้วค่ะ' });
    const q = { no: list.reduce((m, x) => Math.max(m, x.no), 0) + 1, date: n.date, name: nm, status: 'waiting',
      order: list.reduce((m, x) => Math.max(m, x.order), 0) + 1, createdAt: Date.now() };
    store.data().queue.push(q); store.save();
    res.json(L.ticketInfo(q));
  });
  app.get('/api/queue/:no', (req, res) => {
    const q = L.todayQueue().find((x) => x.no === Number(req.params.no));
    if (!q) return res.status(404).json({ error: 'ไม่พบบัตรคิวนี้ของวันนี้' });
    res.json(L.ticketInfo(q));
  });

  // ---------- หน้าพี่หนึ่ง
  const adminPass = () => env('ADMIN_PASSWORD');
  function requireAdmin(req, res, next) {
    if (!adminPass()) return res.status(500).json({ error: 'ยังไม่ได้ตั้ง ADMIN_PASSWORD' });
    if ((req.get('x-nuad-password') || '') !== adminPass()) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
    next();
  }
  app.post('/api/admin/login', (req, res) => {
    if (!adminPass()) return res.status(500).json({ error: 'ยังไม่ได้ตั้ง ADMIN_PASSWORD' });
    if ((req.body?.password || '') !== adminPass()) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
    res.json({ ok: true });
  });

  async function sendTemplate(key, kind) {
    const [k, v] = String(key || '').split(':');
    const rec = k === 'q' ? L.todayQueue().find((x) => x.no === Number(v)) : find(v);
    const tpl = TEMPLATES[kind];
    if (!rec || !tpl) return { key, kind, ok: false };
    const text = tpl.text(S(), rec);
    const sent = rec.lineUserId ? await line.push(rec.lineUserId, text) : false;
    return { key, kind, name: rec.name, sent, text };
  }

  app.get('/api/admin/today', requireAdmin, (req, res) => {
    const n = L.nowBKK(), d = store.data(), est = L.estimate();
    const strip = (b) => { const { lineUserId, ...r } = b; return { ...r, linked: !!lineUserId }; };
    const { ownerUserId, ...settings } = S();
    const bk = d.bookings.map(strip);
    res.json({
      now: n, settings: { ...settings, ownerLinked: !!ownerUserId }, storage: store.storageMode(),
      line: { ...lineInfo(), ownerCodeSet: !!env('OWNER_CODE') },
      pending: bk.filter((b) => b.kind === 'outcall' && ['requested', 'negotiate'].includes(b.status)).sort((a, b) => a.createdAt - b.createdAt),
      dome: bk.filter((b) => b.kind === 'dome' && b.date >= n.date).sort((a, b) => (a.date + L.fmt(a.time)).localeCompare(b.date + L.fmt(b.time))),
      outcall: bk.filter((b) => b.kind === 'outcall' && !['requested', 'negotiate'].includes(b.status) && b.date >= n.date).sort((a, b) => a.date.localeCompare(b.date)),
      past: bk.filter((b) => b.date < n.date).slice(-20).reverse(),
      queue: L.todayQueue().map((q) => ({ ...strip(q), est: est[q.no] ?? null })),
    });
  });

  // รับงาน / เจรจา / ไม่รับ (+ แก้ระยะทางหรือค่าเดินทางได้)
  app.post('/api/admin/outcall/:id/:action', requireAdmin, async (req, res) => {
    const b = find(req.params.id);
    if (!b || b.kind !== 'outcall') return res.status(404).json({ error: 'ไม่พบงานนี้' });
    const a = req.params.action;
    if (['accept', 'negotiate', 'decline'].includes(a)) {
      const r = await decideOutcall(b, a, req.body || {});
      return res.json({ results: [{ key: 'b:' + b.id, kind: 'out' + a, name: b.name, sent: r.sent, text: r.text }] });
    }
    if (a === 'paid') { b.status = 'paid'; b.paidAt = Date.now(); store.save(); return res.json({ results: [await sendTemplate('b:' + b.id, 'paid')] }); }
    if (['done', 'cancelled'].includes(a)) { b.status = a; store.save(); return res.json({ results: [] }); }
    res.status(400).json({ error: 'คำสั่งไม่ถูกต้อง' });
  });

  app.post('/api/admin/dome/:id/:action', requireAdmin, async (req, res) => {
    const b = find(req.params.id);
    if (!b || b.kind !== 'dome') return res.status(404).json({ error: 'ไม่พบคิวนี้' });
    const a = req.params.action;
    if (!['done', 'noshow', 'cancelled'].includes(a)) return res.status(400).json({ error: 'คำสั่งไม่ถูกต้อง' });
    b.status = a; store.save();
    res.json({ results: [] });
  });

  app.post('/api/admin/queue/:no/:action', requireAdmin, async (req, res) => {
    const q = L.todayQueue().find((x) => x.no === Number(req.params.no));
    if (!q) return res.status(404).json({ error: 'ไม่พบบัตรคิว' });
    const a = req.params.action, results = [];
    if (a === 'done') { q.status = 'done'; q.doneAt = Date.now(); }
    else if (a === 'noshow') q.status = 'noshow';
    else if (a === 'back') q.status = 'waiting';
    else if (a === 'skip') q.order = L.todayQueue().reduce((m, x) => Math.max(m, x.order), 0) + 1;
    else if (a === 'paid') q.paid = true;
    else return res.status(400).json({ error: 'คำสั่งไม่ถูกต้อง' });
    store.save();
    if (a === 'paid') results.push(await sendTemplate('q:' + q.no, 'paid'));
    res.json({ results });
  });

  app.post('/api/admin/call-next', requireAdmin, async (req, res) => {
    const list = L.todayQueue(), n = L.nowBKK(), results = [];
    const sv = list.find((x) => x.status === 'serving');
    if (sv) { sv.status = 'done'; sv.doneAt = Date.now(); }
    const waiting = list.filter((x) => x.status === 'waiting');
    if (waiting[0]) { waiting[0].status = 'serving'; waiting[0].startedMin = n.min; }
    store.save();
    if (waiting[0]) results.push(await sendTemplate('q:' + waiting[0].no, 'turn'));
    if (waiting[1]) results.push(await sendTemplate('q:' + waiting[1].no, 'next'));
    res.json({ results });
  });

  app.post('/api/admin/send', requireAdmin, async (req, res) => {
    res.json({ results: [await sendTemplate(req.body?.target, req.body?.kind)] });
  });

  const TIME = /^\d{2}:\d{2}$/;
  // รับพิกัดจากลิงก์ Google Maps ได้เลย เช่น .../@14.9799,102.0977,17z  หรือ  ?q=14.98,102.09
  function parseLatLng(text) {
    const t = String(text || '');
    const m = /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/.exec(t) || /[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/.exec(t) || /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/.exec(t);
    return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
  }
  app.put('/api/admin/settings', requireAdmin, (req, res) => {
    const p = req.body || {}, s = store.data().settings;
    for (const k of ['shopName', 'therapist', 'pp']) if (typeof p[k] === 'string') s[k] = p[k].trim().slice(0, 60);
    if (Array.isArray(p.notices)) s.notices = p.notices.map((x) => String(x).slice(0, 120)).filter(Boolean).slice(0, 5);
    if (typeof p.originLabel === 'string') s.origin.label = p.originLabel.trim().slice(0, 80);
    if (typeof p.originLink === 'string' && p.originLink.trim()) {
      const ll = parseLatLng(p.originLink);
      if (!ll) return res.status(400).json({ error: 'อ่านพิกัดจากลิงก์ไม่ได้ — ใช้ลิงก์ Google Maps ที่มี @lat,lng หรือพิมพ์ 14.98, 102.09' });
      s.origin.lat = ll.lat; s.origin.lng = ll.lng;
    }
    if (p.teacherMin != null) s.teacherMin = Math.max(0, Math.round(Number(p.teacherMin) || 0));
    if (typeof p.roundTrip === 'boolean') s.roundTrip = p.roundTrip;
    if (p.taxiStart != null) s.taxi.start = Math.max(0, Number(p.taxiStart) || 35);
    for (const g of ['dome', 'outcall']) {
      const o = p[g]; if (!o) continue;
      if (typeof o.on === 'boolean') s[g].on = o.on;
      for (const k of ['open', 'close']) if (typeof o[k] === 'string' && TIME.test(o[k])) s[g][k] = o[k];
      if (Array.isArray(o.days)) s[g].days = o.days.map(Number).filter((x) => x >= 0 && x <= 6);
      if (g === 'dome' && o.slotMin != null) s.dome.slotMin = Math.min(120, Math.max(5, Number(o.slotMin) || 15));
    }
    if (p.queue) {
      if (typeof p.queue.on === 'boolean') s.queue.on = p.queue.on;
      if (p.queue.slotMin != null) s.queue.slotMin = Math.min(240, Math.max(15, Number(p.queue.slotMin) || 60));
    }
    for (const k of ['notifyOwner', 'autoRemind']) if (typeof p[k] === 'boolean') s[k] = p[k];
    store.save();
    res.json({ ok: true });
  });

  console.log('   หน้าลูกค้า /  ·  หน้าพี่หนึ่ง /admin' + (line.enabled() && line.canVerify() ? '  (LINE อัตโนมัติ ✓)' : '  (LINE แบบกดส่งเอง)'));
}
