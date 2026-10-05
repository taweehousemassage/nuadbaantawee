// line.js — LINE OA ของพี่หนึ่ง
// reply = ตอบตอนลูกค้าทักมา (ไม่นับโควตา) · push = ส่งเอง (นับโควตา)
import crypto from 'crypto';

const secret = () => process.env.LINE_CHANNEL_SECRET || process.env.NUAD_LINE_CHANNEL_SECRET || '';
const token = () => process.env.LINE_CHANNEL_ACCESS_TOKEN || process.env.NUAD_LINE_CHANNEL_ACCESS_TOKEN || '';
export const enabled = () => !!token();
export const canVerify = () => !!secret();

export function verify(raw, signature) {
  if (!secret() || !raw || !signature) return false;
  const a = Buffer.from(crypto.createHmac('sha256', secret()).update(raw).digest('base64'));
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function call(kind, body) {
  const r = await fetch('https://api.line.me/v2/bot/message/' + kind, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`LINE ${kind} ${r.status}: ${await r.text()}`);
  return true;
}
export async function reply(replyToken, text) {
  if (!enabled() || !replyToken) return false;
  try { return await call('reply', { replyToken, messages: [{ type: 'text', text }] }); } catch (e) { console.error('จองนวด:', e.message); return false; }
}
export async function push(to, text) {
  if (!enabled() || !to) return false;
  try { return await call('push', { to, messages: [{ type: 'text', text }] }); } catch (e) { console.error('จองนวด:', e.message); return false; }
}
// อ่านข้อมูลจาก LINE (ใช้ตรวจระบบ) — บอกว่า access token เป็นของ OA ไหนจริง ๆ
async function getJson(path) {
  if (!enabled()) return { error: 'ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN' };
  try {
    const r = await fetch('https://api.line.me/v2/bot/' + path, { headers: { Authorization: 'Bearer ' + token() } });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { httpStatus: r.status, ...j };
  } catch (e) { return { error: e.message }; }
}
export const botInfo = () => getJson('info');
export const webhookInfo = () => getJson('channel/webhook/endpoint');

// การ์ดสวย (Flex) — f = { altText, contents }  ·  ถ้าส่ง flex ไม่ได้จะ fallback เป็นข้อความ altText
export async function replyFlex(replyToken, f) {
  if (!enabled() || !replyToken) return false;
  try { return await call('reply', { replyToken, messages: [{ type: 'flex', altText: f.altText, contents: f.contents }] }); }
  catch (e) { console.error('จองนวด flex:', e.message); return reply(replyToken, f.altText); }
}
export async function pushFlex(to, f) {
  if (!enabled() || !to) return false;
  try { return await call('push', { to, messages: [{ type: 'flex', altText: f.altText, contents: f.contents }] }); }
  catch (e) { console.error('จองนวด flex:', e.message); return push(to, f.altText); }
}
