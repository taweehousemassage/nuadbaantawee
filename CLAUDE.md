# CLAUDE.md — บริบทสำหรับ AI (อ่านก่อนแก้โค้ด)

เว็บ "นวดเส้นบ้านทวี" (หมอนวด: พี่หนึ่ง) · 3 ช่องทาง: คิวโดมผู้สูงอายุ (ฟรี 15 นาที) · นวดนอกสถานที่ (ปักหมุด คิดค่าเดินทางมิเตอร์แท็กซี่ ×2 พี่หนึ่งกดรับงาน) · บัตรคิวหน้าร้าน
แยกออกจากเว็บ BARNBARN เมื่อ 26 ก.ย. 2569

## แผนผัง
- `server.js` — express + static + อ่าน .env + `/health` + เรียก `mountNuad(app)`
- `routes.js` — LINE webhook (`/api/line/webhook`, ตรวจลายเซ็นก่อนเสมอ · คำสั่งพี่หนึ่ง: รับงาน/เจรจา/ไม่รับ + รหัส) + API ลูกค้า (`/api/*`) + API หน้าพี่หนึ่ง (`/api/admin/*`, header `x-nuad-password`)
- `fare.js` — ระยะทางถนนจริงจาก OSRM (fallback เส้นตรง ×1.35) + สูตรมิเตอร์แท็กซี่
- `store.js` — เอกสารเดียว `{settings, bookings[], queue[]}` ใน Mongo `MONGODB_DB(nuadbaantawee).shop` · fallback `data/shop.json`
  `bookings[]` มี 2 ชนิด: `kind:'dome'` (date,time,status booked/done/noshow/cancelled) และ `kind:'outcall'` (date,from,to,place{text,lat,lng},km,travel,teacherMin,status requested/accepted/negotiate/declined/slip/paid/done)
- `logic.js` — เวลาไทย `nowBKK()` · ช่องว่าง `slots()/isFree()` · คิว `estimate()/ticketInfo()`
- `public/messages.js` — **ถ้อยคำทุกข้อความ + การ์ด Flex** ใช้ร่วมกันทั้ง server และหน้าเว็บ

## กติกาที่ห้ามพัง
1. คีย์/รหัสอยู่ใน env เท่านั้น
2. เวลาใช้ `nowBKK()` เสมอ (เซิร์ฟเวอร์อยู่คนละโซนเวลา)
3. ห้ามส่ง `lineUserId` ออกหน้าเว็บ (ใช้ `linked: true/false`)
4. push นับโควตา — เพิ่ม push ใหม่ต้องมีสวิตช์ปิดในหน้าตั้งค่า
5. นับช่องว่างจาก bookings จริงเสมอ ห้ามเก็บตัวเลข "ที่ว่าง" แยก
6. ค่าเดินทางคิดจาก `fare.travelFare()` เท่านั้น อย่าคิดซ้ำในที่อื่น · พี่หนึ่งแก้ กม. ได้ตอนรับงาน (`decideOutcall` patch.km)
7. จุดเริ่มต้นเดินทางอยู่ใน settings.origin — รับลิงก์ Google Maps แล้วดึง @lat,lng เอง

## ยังไม่ได้ทำ
- ตรวจสลิปอัตโนมัติ (SlipOK) — ต่อได้ที่ `handleEvent` ส่วน `m.type === 'image'`
- เว็บเดิม `/nuad` ยังเปิดอยู่ ควรเปลี่ยนเป็น redirect หลังเว็บใหม่นิ่ง
