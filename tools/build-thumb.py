#!/usr/bin/env python3
"""킹수학 등재 썸네일(400×250 WebP RGB) — 2026-10-10 리마스터판(사용자 「킹수학 썸네일도 교체하자. 리마스터로」).
그림 = GPT 웹앱(dist-kingsmath/v2/art-a.png: 길 따라 오는 몬스터 → 성 위 마법사의 주문 · 길가 탑). 글자는 여기서 얹는다(AI 한글은 뭉개진다).
200px 목록 크기에서 읽혀야 한다 → 두 줄만, 위쪽 하늘에.
"""
import os
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'dist-kingsmath')
W, H = 400, 250
F = lambda s, i=16: ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc', s, index=i)
im = Image.open(os.path.join(OUT, 'v2', 'art-a.png')).convert('RGB')
r = max(W / im.width, H / im.height); im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
x, y = (im.width - W) // 2, 0; img = im.crop((x, y, x + W, y + H))
band = Image.new('L', (1, H)); bd = ImageDraw.Draw(band)
for yy in range(H): bd.point((0, yy), fill=int(200 * max(0.0, 1 - yy / (H * 0.36)) ** 1.4))
img.paste(Image.new('RGB', (W, H), (10, 14, 30)), (0, 0), band.resize((W, H)))
d = ImageDraw.Draw(img)
def centered(cx, yy, text, f, fill, ow):
    w = d.textbbox((0, 0), text, font=f)[2]
    for dx in range(-ow, ow + 1):
        for dy in range(-ow, ow + 1):
            if dx * dx + dy * dy <= ow * ow: d.text((cx - w // 2 + dx, yy + dy), text, font=f, fill=(8, 10, 22))
    d.text((cx - w // 2, yy), text, font=f, fill=fill)
centered(W // 2 + 40, 6, '수학 성 수호자', F(42), (255, 255, 255), 4)
centered(W // 2 + 40, 56, '문제 풀어 마법으로 막아라!', F(21), (255, 214, 102), 3)
img.save(os.path.join(OUT, 'thumb-remaster.png'))
q = 92
while q >= 55:
    img.save(os.path.join(OUT, 'thumb-remaster.webp'), 'WEBP', quality=q, method=6)
    if os.path.getsize(os.path.join(OUT, 'thumb-remaster.webp')) <= 60 * 1024: break
    q -= 6
img.resize((200, 125), Image.LANCZOS).save(os.path.join(OUT, 'thumb-remaster-preview.png'))
print('✅ thumb-remaster.webp', img.size, os.path.getsize(os.path.join(OUT, 'thumb-remaster.webp')) // 1024, 'KB')
