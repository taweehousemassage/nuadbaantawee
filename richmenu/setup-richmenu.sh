#!/usr/bin/env bash
# ตั้ง Rich Menu ให้ LINE OA ของพี่หนึ่ง (รันหลังมี LINE OA + Channel access token แล้ว)
# วิธีใช้:  NUAD_LINE_CHANNEL_ACCESS_TOKEN=xxxxx bash setup-richmenu.sh
set -e
TOKEN="${NUAD_LINE_CHANNEL_ACCESS_TOKEN:?ต้องตั้ง NUAD_LINE_CHANNEL_ACCESS_TOKEN ก่อน}"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "1) สร้าง Rich Menu..."
RID=$(curl -s -X POST https://api.line.me/v2/bot/richmenu \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d @"$DIR/richmenu.json" | python3 -c "import sys,json;print(json.load(sys.stdin)['richMenuId'])")
echo "   richMenuId = $RID"

echo "2) อัปโหลดรูปเมนู..."
curl -s -X POST "https://api-data.line.me/v2/bot/richmenu/$RID/content" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: image/png" \
  --data-binary @"$DIR/richmenu.png" >/dev/null && echo "   อัปโหลดรูปแล้ว"

echo "3) ตั้งเป็นเมนูเริ่มต้นของทุกคน..."
curl -s -X POST "https://api.line.me/v2/bot/user/all/richmenu/$RID" \
  -H "Authorization: Bearer $TOKEN" >/dev/null && echo "   ตั้งเมนูเริ่มต้นแล้ว"

echo "เสร็จเรียบร้อย — เปิดแชท OA พี่หนึ่งจะเห็นเมนูล่าง 4 ปุ่ม"
