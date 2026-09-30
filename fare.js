// fare.js — ระยะทาง + ค่าเดินทางตามมิเตอร์แท็กซี่ไทย
// ระยะทาง: ถามเส้นทางถนนจริงจาก OSRM (ฟรี ไม่ต้องมีคีย์) · ถ้าเรียกไม่ได้ ใช้เส้นตรง × 1.35 แล้วทำเครื่องหมายว่าเป็นค่าประมาณ

const R = 6371; // รัศมีโลก กม.
export function haversineKm(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function roadKm(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
  try {
    const ctl = AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined;
    const r = await fetch(url, { signal: ctl, headers: { 'User-Agent': 'nuad-baantawee/1.0' } });
    if (!r.ok) throw new Error('OSRM ' + r.status);
    const j = await r.json();
    const m = j?.routes?.[0]?.distance;
    if (!m) throw new Error('ไม่มีเส้นทาง');
    return { km: Math.round((m / 1000) * 10) / 10, estimated: false };
  } catch {
    return { km: Math.round(haversineKm(from, to) * 1.35 * 10) / 10, estimated: true };
  }
}

// ค่ามิเตอร์เที่ยวเดียว
export function meterFare(km, taxi) {
  const t = taxi || {};
  const start = Number(t.start) || 35, startKm = Number(t.startKm) || 1;
  const tiers = (t.tiers || []).slice().sort((a, b) => a.upto - b.upto);
  if (!(km > startKm)) return start;
  let fare = start, prev = startKm;
  for (const tier of tiers) {
    const end = Math.min(km, tier.upto);
    if (end > prev) { fare += (end - prev) * Number(tier.rate || 0); prev = end; }
    if (km <= tier.upto) break;
  }
  return Math.round(fare);
}

// ค่าเดินทางที่เรียกเก็บ (ไป-กลับถ้าตั้งไว้)
export function travelFare(km, settings) {
  const one = meterFare(km, settings.taxi);
  return settings.roundTrip === false ? one : one * 2;
}
