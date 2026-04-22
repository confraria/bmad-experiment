import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = 'public/icons';
const BG = '#18181b';

function svg(size: number, padding = 0): Buffer {
  const inner = size - padding * 2;
  const checkSize = Math.floor(inner * 0.5);
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = Math.max(8, Math.round(size / 24));
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" fill="${BG}"/>
      <path d="M ${cx - checkSize / 2} ${cy} l ${checkSize / 3} ${checkSize / 3} l ${(checkSize * 2) / 3} ${-(checkSize * 2) / 3}"
            stroke="white" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  );
}

async function run() {
  await mkdir(OUT, { recursive: true });
  await sharp(svg(192)).png().toFile(path.join(OUT, 'icon-192.png'));
  await sharp(svg(512)).png().toFile(path.join(OUT, 'icon-512.png'));
  await sharp(svg(512, 100)).png().toFile(path.join(OUT, 'icon-maskable-512.png'));
  console.log('icons generated at', OUT);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
