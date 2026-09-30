// server.js — เว็บจองคิวนวดพี่หนึ่ง (เว็บของตัวเอง ไม่ได้อยู่ใต้เว็บอื่น)
// หน้าลูกค้า /  ·  บัตรคิวหน้าร้าน /?walk=1  ·  หน้าพี่หนึ่ง /admin  ·  LINE webhook /api/line/webhook
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { mountNuad } from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// อ่านไฟล์ .env ตอนรันในเครื่อง (บน Render ใช้ Environment ของ Render)
(function loadEnv() {
  const p = path.join(__dirname, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();

const app = express();
const PORT = process.env.PORT || 3000;

// เก็บ raw body ไว้ตรวจลายเซ็นของ LINE webhook
app.use(express.json({ limit: '100kb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.static(path.join(__dirname, 'public')));

// cron-job.org ยิงมาที่นี่เพื่อไม่ให้เว็บหลับ (ตั้งช่วงเวลาตาม README)
app.get('/health', (req, res) => res.type('text').send('ok'));

mountNuad(app);

app.listen(PORT, () => {
  console.log(`\n💆 นวดเส้นบ้านทวี — http://localhost:${PORT}`);
});
