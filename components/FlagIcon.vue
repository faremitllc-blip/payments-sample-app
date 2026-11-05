<template>
  <span class="mo-flag" :style="{ width: size + 'px', height: size + 'px' }" role="img" :aria-label="`${code} flag`">
    <svg viewBox="10 0 40 40" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g v-html="markup"></g>
    </svg>
  </span>
</template>

<script setup lang="ts">
// Round flag icons drawn in code (so there is nothing to download and no licence
// to buy). Each flag is painted on a 60x40 canvas; the round icon shows its middle.
const props = withDefaults(defineProps<{ code: string; size?: number }>(), { size: 40 })

function star(cx: number, cy: number, R: number, fill: string, points = 5): string {
  const r = R * (points === 5 ? 0.382 : 0.5)
  const pts: string[] = []
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? R : r
    const a = (Math.PI / points) * i - Math.PI / 2
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`)
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`
}
function rect(x: number, y: number, w: number, h: number, fill: string): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`
}
function hbands(colors: string[]): string {
  const h = 40 / colors.length
  return colors.map((c, i) => rect(0, i * h, 60, h + 0.2, c)).join('')
}
function vbands(colors: string[]): string {
  const w = 60 / colors.length
  return colors.map((c, i) => rect(i * w, 0, w + 0.2, 40, c)).join('')
}
function jack(): string {
  return (
    rect(0, 0, 60, 40, '#012169') +
    '<path d="M0,0 L60,40 M60,0 L0,40" stroke="#fff" stroke-width="8"/>' +
    '<path d="M0,0 L60,40 M60,0 L0,40" stroke="#C8102E" stroke-width="3"/>' +
    rect(25, 0, 10, 40, '#fff') +
    rect(0, 15, 60, 10, '#fff') +
    rect(27, 0, 6, 40, '#C8102E') +
    rect(0, 17, 60, 6, '#C8102E')
  )
}

const FLAGS: Record<string, string> = {
  GBP: jack(),
  EUR:
    rect(0, 0, 60, 40, '#003399') +
    Array.from({ length: 12 }, (_, i) => {
      const a = (Math.PI / 6) * i
      return star(30 + 11 * Math.sin(a), 20 - 11 * Math.cos(a), 2.4, '#FFCC00')
    }).join(''),
  AUD:
    rect(0, 0, 60, 40, '#00008B') +
    `<g transform="scale(0.5)">${jack()}</g>` +
    star(15, 30, 5, '#fff', 7) +
    star(44, 8, 2.6, '#fff', 7) +
    star(36, 17, 2.6, '#fff', 7) +
    star(52, 17, 2.6, '#fff', 7) +
    star(44, 33, 2.6, '#fff', 7) +
    star(47, 22, 1.6, '#fff', 5),
  CAD:
    rect(0, 0, 60, 40, '#D52B1E') +
    rect(15, 0, 30, 40, '#fff') +
    '<polygon fill="#D52B1E" points="30,7 32,12.5 35.5,10.5 34.5,17 39.5,14.5 38,20 42,21 36.5,25.5 37.5,28 31,27 31,33 29,33 29,27 22.5,28 23.5,25.5 18,21 22,20 20.5,14.5 25.5,17 24.5,10.5 28,12.5"/>',
  COP: rect(0, 0, 60, 20, '#FCD116') + rect(0, 20, 60, 10, '#003893') + rect(0, 30, 60, 10, '#CE1126'),
  INR:
    hbands(['#FF9933', '#FFFFFF', '#138808']) +
    '<circle cx="30" cy="20" r="5" fill="none" stroke="#000080" stroke-width="0.9"/><circle cx="30" cy="20" r="1" fill="#000080"/>' +
    Array.from({ length: 8 }, (_, i) => {
      const a = (Math.PI / 4) * i
      return `<line x1="30" y1="20" x2="${(30 + 5 * Math.cos(a)).toFixed(2)}" y2="${(20 + 5 * Math.sin(a)).toFixed(2)}" stroke="#000080" stroke-width="0.5"/>`
    }).join(''),
  TRY:
    rect(0, 0, 60, 40, '#E30A17') +
    '<circle cx="25" cy="20" r="10" fill="#fff"/><circle cx="28" cy="20" r="8" fill="#E30A17"/>' +
    star(37.5, 20, 4, '#fff'),
  AED: rect(0, 0, 60, 40, '#fff') + rect(15, 0, 45, 13.4, '#00732F') + rect(15, 26.6, 45, 13.4, '#000') + rect(0, 0, 15, 40, '#FF0000'),
  ZAR:
    rect(0, 0, 60, 20, '#E03C31') +
    rect(0, 20, 60, 20, '#001489') +
    '<path d="M-2,2 L22,20 L62,20 M-2,38 L22,20" fill="none" stroke="#fff" stroke-width="10"/>' +
    '<path d="M-2,2 L22,20 L62,20 M-2,38 L22,20" fill="none" stroke="#007749" stroke-width="5.5"/>' +
    '<polygon points="0,4 19,20 0,36" fill="#FFB612"/><polygon points="0,9 13,20 0,31" fill="#000"/>',
  NGN: vbands(['#008751', '#FFFFFF', '#008751']),
  GHS: hbands(['#CE1126', '#FCD116', '#006B3F']) + star(30, 20, 7, '#000'),
  KES:
    rect(0, 0, 60, 12.5, '#000') +
    rect(0, 12.5, 60, 15, '#BB0000') +
    rect(0, 27.5, 60, 12.5, '#006600') +
    rect(0, 12.5, 60, 2, '#fff') +
    rect(0, 25.5, 60, 2, '#fff') +
    '<ellipse cx="30" cy="20" rx="6.5" ry="10.5" fill="#BB0000" stroke="#fff" stroke-width="0.8"/>' +
    '<ellipse cx="30" cy="20" rx="2.6" ry="6" fill="#000"/><line x1="30" y1="8" x2="30" y2="32" stroke="#fff" stroke-width="1"/>',
  TZS:
    rect(0, 0, 60, 40, '#1EB53A') +
    '<polygon points="60,0 60,40 0,40" fill="#00A3DD"/>' +
    '<path d="M-3,43 L63,-3" stroke="#FCD116" stroke-width="12" fill="none"/>' +
    '<path d="M-3,43 L63,-3" stroke="#000" stroke-width="8.5" fill="none"/>',
  UGX:
    hbands(['#000', '#FCDC04', '#D90000', '#000', '#FCDC04', '#D90000']) +
    '<circle cx="30" cy="20" r="7" fill="#fff"/><circle cx="30" cy="20" r="3.6" fill="#4a4a4a"/>',
  ETB:
    hbands(['#078930', '#FCDD09', '#DA121A']) +
    '<circle cx="30" cy="20" r="8.5" fill="#0F47AF"/>' +
    star(30, 20, 6, '#FCDD09'),
  SOS: rect(0, 0, 60, 40, '#4189DD') + star(30, 20.5, 10, '#fff'),
}

const markup = computed(() => FLAGS[props.code] || rect(0, 0, 60, 40, '#9aa0a6'))
</script>

<style scoped>
.mo-flag {
  position: relative;
  display: inline-block;
  flex: 0 0 auto;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}
.mo-flag svg {
  display: block;
  width: 100%;
  height: 100%;
}
/* The glossy look: a soft highlight on the top left and a faint shade at the bottom. */
.mo-flag::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background:
    radial-gradient(ellipse 70% 45% at 35% 18%, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 70%),
    linear-gradient(180deg, rgba(255, 255, 255, 0) 55%, rgba(0, 0, 0, 0.18) 100%);
  pointer-events: none;
}
</style>
