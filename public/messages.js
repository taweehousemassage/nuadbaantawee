// ข้อความทั้งหมดของระบบจองนวด — ใช้ร่วมกันทั้งเซิร์ฟเวอร์ (ส่งผ่าน LINE OA ของพี่หนึ่ง) และหน้าพี่หนึ่ง (ปุ่มส่งเอง)
// s = settings (มี s.siteUrl = ที่อยู่เว็บจองนวด)  ·  แก้ถ้อยคำได้ที่ไฟล์นี้ไฟล์เดียว
// โทน: อบอุ่น สุภาพ ค่ะ/นะคะ  ·  การ์ดสวย (Flex) อยู่ท้ายไฟล์ (FLEX)

export const toT = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
export function thDate(date) {
  return new Date(date + 'T00:00:00Z').toLocaleDateString('th-TH', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' });
}
export function clock(epoch) {
  return new Date(epoch).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false });
}
// ลูกค้าบางคนพิมพ์ชื่อมาว่า "คุณ..." อยู่แล้ว กันไม่ให้ได้ "คุณคุณ..."
const nm = (x) => 'คุณ' + String(x.name || '').replace(/^คุณ\s*/, '');
const sig = (s) => `\n— ${s.therapist || s.name || ''}${s.shopName ? ' · ' + s.shopName : ''}`;

// kind → { label, for: (b = นัดวันนี้, bt = นัดวันอื่น, q = บัตรคิว), text(s, x) }
export const TEMPLATES = {
  turn:    { label: 'ถึงคิวแล้ว', for: ['q', 'b'], text: (s, x) => `ถึงคิว${nm(x)}แล้วค่ะ 🙏 เชิญเข้ามาได้เลยนะคะ${sig(s)}` },
  next:    { label: 'อีกคิวเดียว', for: ['q'], text: (s, x) => `อีกแป๊บถึงคิว${nm(x)}แล้วค่ะ (บัตรคิวที่ ${x.no}) เตรียมตัวเข้ามาได้เลยนะคะ 🌿${sig(s)}` },
  late:    { label: 'คิวช้ากว่ากำหนด 15 นาที', for: ['q', 'b'], text: (s, x) => `ขออภัยนะคะ${nm(x)} วันนี้คิวช้ากว่ากำหนดราว 15 นาที ${s.therapist || 'พี่หนึ่ง'}จะรีบดูแลให้เร็วที่สุดค่ะ 🙏${sig(s)}` },
  confirm: { label: 'ยืนยันการจอง', for: ['b', 'bt'], text: (s, x) => `ยืนยันนัดนวดแล้วค่ะ 🗓️ ${thDate(x.date)} เวลา ${toT(x.time)} น. รหัส ${x.id}${sig(s)}` },
  paid:    { label: 'ได้รับเงินแล้ว ขอบคุณค่ะ', for: ['b', 'bt', 'q'], text: (s, x) => `ได้รับยอดโอนเรียบร้อยแล้วค่ะ ขอบคุณมากนะคะ 🙏 ${x.id ? 'รหัส ' + x.id : 'บัตรคิวที่ ' + x.no}${sig(s)}` },
  remind:  { label: 'เตือนนัดพรุ่งนี้', for: ['bt'], text: (s, x) => `พรุ่งนี้มีนัดนวดนะคะ 🗓️ ${thDate(x.date)} เวลา ${toT(x.time)} น. ถ้าติดธุระทักในแชทนี้ได้เลยค่ะ${sig(s)}` },
  domeConfirm: { label: 'ยืนยันคิวโดม', for: ['b', 'bt'], text: (s, x) => `ยืนยันคิวโดมผู้สูงอายุแล้วค่ะ 🗓️ ${thDate(x.date)} เวลา ${toT(x.time)} น. รหัส ${x.id}\nคิวนี้ไม่มีค่าใช้จ่าย มาตามเวลาได้เลยนะคะ${sig(s)}` },
  outAccepted: { label: 'รับงานนอกสถานที่ + ยอดโอน', for: ['b', 'bt'], text: (s, x) => `${s.therapist || 'พี่หนึ่ง'}รับงานนอกสถานที่แล้วค่ะ 🚗\n🗓️ ${thDate(x.date)} ${timeRange(x)}\n📍 ${x.place?.text || '-'}\n\n${fareLines(s, x)}\n\nโอนแล้วส่งรูปสลิปในแชทนี้ได้เลยนะคะ 🧾 รหัส ${x.id}${sig(s)}` },
  outNegotiate: { label: 'ขอคุยเรื่องเวลา/ค่าเดินทาง', for: ['b', 'bt'], text: (s, x) => `ขอคุยรายละเอียดงานวันที่ ${thDate(x.date)} สักนิดนะคะ 🙏 (รหัส ${x.id})\nระยะทางที่ระบบคำนวณได้ ${x.km} กม. ค่าเดินทาง ${baht(x.travel)} บาท ถ้าเวลาหรือเส้นทางปรับได้ พิมพ์คุยในแชทนี้ได้เลยค่ะ${sig(s)}` },
  outDeclined: { label: 'รับงานวันนั้นไม่ได้', for: ['b', 'bt'], text: (s, x) => `ขออภัยนะคะ 🙏 วันที่ ${thDate(x.date)} ${timeRange(x)} ${s.therapist || 'พี่หนึ่ง'}ติดคิวอื่นอยู่ค่ะ ถ้าเลื่อนวันได้ ทักบอกวันที่สะดวกในแชทนี้ได้เลยนะคะ (รหัส ${x.id})${sig(s)}` },
  thanks:  { label: 'ขอบคุณหลังนวดเสร็จ', for: ['b', 'q'], text: (s, x) => `ขอบคุณ${nm(x)}ที่มานวดวันนี้นะคะ 🌿 ดื่มน้ำเยอะ ๆ พักผ่อนสบาย ๆ ค่ะ${sig(s)}` },
};

export const baht = (n) => Number(n || 0).toLocaleString('th-TH');
export const timeRange = (b) => `${toT(b.from)}–${toT(b.to)} น.`;
// สรุปยอดที่ลูกค้าต้องโอนหลังพี่หนึ่งรับงาน
export const fareLines = (s, b) => [
  `ระยะทาง ${b.km} กม.${b.estimated ? ' (ประมาณ)' : ''}${s.roundTrip === false ? '' : ' × 2 เที่ยว'}`,
  `ค่าเดินทาง ${baht(b.travel)} บาท`,
  `ค่าครูขั้นต่ำ ${baht(b.teacherMin)} บาท (โอนมากกว่านี้ได้ตามกำลังศรัทธา)`,
  `รวมขั้นต่ำ ${baht(b.travel + b.teacherMin)} บาท`,
].join('\n');

// ตอบกลับอัตโนมัติ (reply — ไม่นับโควตา)
export const REPLY = {
  linkBooking: (s, b) => b.status === 'hold'
    ? `รับนัดนวดรหัส ${b.id} แล้วค่ะ 🗓️\n${thDate(b.date)} เวลา ${toT(b.time)} น.\nกันคิวไว้ถึง ${clock(b.holdUntil)} น. โอนแล้วส่งรูปสลิปในแชทนี้ได้เลยนะคะ${sig(s)}`
    : `ผูกนัดนวดรหัส ${b.id} กับไลน์นี้แล้วค่ะ 🗓️ ${thDate(b.date)} เวลา ${toT(b.time)} น. มีอัปเดตจะแจ้งในแชทนี้นะคะ${sig(s)}`,
  linkQueue: (s, q, ahead) => `รับบัตรคิวนวดที่ ${q.no} แล้วค่ะ 🎫 ตอนนี้รออีก ${ahead} คิว ใกล้ถึงคิวจะทักในแชทนี้ ไปเดินเล่นสบาย ๆ ได้เลยนะคะ${sig(s)}`,
  slip: (s, x) => `ได้รับสลิป${x.id ? 'ของรหัส ' + x.id : 'ของบัตรคิวที่ ' + x.no}แล้วค่ะ 🧾 ${s.therapist || 'พี่หนึ่ง'}จะตรวจแล้วแจ้งกลับในแชทนี้นะคะ`,
  slipLate: (s, b) => `ได้รับสลิปของรหัส ${b.id} แล้วค่ะ 🙏 แต่พอดีเวลา ${toT(b.time)} น. มีคนจองไปก่อนหลังหมดเวลากันคิว ${s.therapist || 'พี่หนึ่ง'}จะติดต่อกลับในแชทนี้เพื่อหาเวลาใหม่ให้นะคะ`,
  notFound: () => 'ไม่พบรหัสนี้ค่ะ 🙏 ลองเช็กรหัสอีกครั้งนะคะ',
  // ปุ่มเมนูล่าง (Rich Menu) — ตอบอัตโนมัติเมื่อลูกค้าแตะปุ่ม
  howMyBooking: (s) => `เช็กนัด/คิวของคุณได้เลยค่ะ 🌿\n· จองล่วงหน้า: พิมพ์  นัดนวด ตามด้วยรหัส เช่น  นัดนวด YGPF4\n· มาหน้าร้าน: พิมพ์  บัตรคิวนวด ตามด้วยเลขคิว เช่น  บัตรคิวนวด 7`,
  howSlip: (s) => `โอนแล้วส่งรูปสลิปเข้ามาในแชทนี้ได้เลยค่ะ 🧾 ระบบจะจับคู่กับนัดของคุณให้อัตโนมัติ แล้วพี่หนึ่งจะตรวจและยืนยันให้นะคะ 🙏`,
  ask: (s) => `พิมพ์คำถามทิ้งไว้ได้เลยค่ะ เดี๋ยว${s.therapist || 'พี่หนึ่ง'}มาตอบให้นะคะ 🌿\nเวลาทำการ ${s.open}–${s.close} น.${s.closedText ? ' (หยุด' + s.closedText + ')' : ''}`,
};

// แจ้งพี่หนึ่ง (push — นับโควตา ปิดได้ในหน้าตั้งค่า)
export const OWNER = {
  booking: (b) => `💆 คิวโดมใหม่ ${b.id}\n${b.name} ${b.phone}\n${thDate(b.date)} ${toT(b.time)} น.`,
  outcall: (s, b) => `🚗 งานนอกสถานที่ใหม่ ${b.id}\n${b.name} ${b.phone}\n🗓️ ${thDate(b.date)} ${timeRange(b)}\n📍 ${b.place?.text || '-'}\n${fareLines(s, b)}\n${b.note ? '📝 ' + b.note + '\n' : ''}\nตอบกลับ: รับงาน ${b.id} · เจรจา ${b.id} · ไม่รับ ${b.id}`,
  slip: (x) => `🧾 สลิปใหม่ ${x.id ? 'รหัส ' + x.id : 'บัตรคิว ' + x.no} · ${x.name} — เปิดหน้าพี่หนึ่งเพื่อกดรับเงิน`,
};

// ---------------------------------------------------------------- การ์ดสวย (Flex Message)
// คืน { altText, contents } พร้อมส่งผ่าน line.replyFlex/pushFlex  ·  ถ้าไม่มี siteUrl จะไม่ใส่ปุ่มลิงก์
const G = '#0F6E56', GBG = '#E1F5EE', INK = '#2C2C2A', SOFT = '#5F5E5A';
const row = (k, v) => ({ type: 'box', layout: 'horizontal', contents: [
  { type: 'text', text: k, size: 'sm', color: SOFT, flex: 2 },
  { type: 'text', text: v, size: 'sm', color: INK, weight: 'bold', flex: 5, align: 'end', wrap: true },
] });
const linkBtn = (s, label, path) => (s.siteUrl ? [{ type: 'button', style: 'link', height: 'sm',
  action: { type: 'uri', label, uri: `${s.siteUrl}${path}` } }] : []);
const msgBtn = (label, text) => ({ type: 'button', style: 'link', height: 'sm', action: { type: 'message', label, text } });

export const FLEX = {
  // การ์ดยืนยันจอง (ใช้ตอนลูกค้าผูกนัดที่ยังกันคิวรอโอน)
  confirm: (s, b) => ({
    altText: REPLY.linkBooking(s, b),
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'vertical', backgroundColor: G, paddingAll: '14px',
        contents: [{ type: 'text', text: '✓ ยืนยันนัดนวดแล้ว', color: '#FFFFFF', weight: 'bold', size: 'md' }] },
      body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
        row('วันที่', thDate(b.date)),
        row('เวลา', toT(b.time) + ' น.'),
        row('รหัสนัด', b.id),
        ...(b.status === 'hold' ? [{ type: 'box', layout: 'vertical', backgroundColor: GBG, cornerRadius: '8px', paddingAll: '10px', margin: 'md',
          contents: [{ type: 'text', wrap: true, size: 'xs', color: G, text: `⏱ กันคิวไว้ถึง ${clock(b.holdUntil)} น. โอนแล้วส่งรูปสลิปในแชทนี้ได้เลยนะคะ` }] }] : []),
      ] },
      footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
        msgBtn('โอนแล้ว · แจ้งสลิป', 'แจ้งโอน'),
        ...linkBtn(s, 'ดูพร้อมเพย์ / รายละเอียด', '/'),
      ] },
    },
  }),
  // การ์ดบัตรคิว (ใช้ตอนลูกค้าผูกบัตรคิวหน้าร้าน)
  queue: (s, q, ahead) => ({
    altText: REPLY.linkQueue(s, q, ahead),
    contents: {
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
        { type: 'text', text: 'บัตรคิววันนี้', size: 'xs', color: SOFT, align: 'center' },
        { type: 'text', text: String(q.no), size: '5xl', weight: 'bold', color: G, align: 'center' },
        { type: 'text', text: `รออีก ${ahead} คิว`, size: 'sm', color: INK, align: 'center' },
        { type: 'text', text: `— ${s.therapist || s.name || ''}`, size: 'xxs', color: SOFT, align: 'center', margin: 'md' },
      ] },
      footer: { type: 'box', layout: 'vertical', contents: [
        ...(s.siteUrl ? [{ type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'เช็คคิวตอนนี้', uri: s.siteUrl } }]
          : [msgBtn('เช็คคิวตอนนี้', 'ดูนัดของฉัน')]),
      ] },
    },
  }),
};
