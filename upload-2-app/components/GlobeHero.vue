<template>
  <div
    ref="box"
    class="mo-globe"
    role="img"
    aria-label="A rotating dotted globe. Glowing arcs link crypto hubs and fiat banking hubs around the world, with the sun lighting one side and night on the other."
  >
    <canvas ref="cv" class="mo-globe-canvas" aria-hidden="true"></canvas>
  </div>
</template>

<script setup lang="ts">
// A rotating dot-matrix globe drawn on a canvas: land is a field of small
// dots, lit on the sun side and dim on the night side, with glowing arcs that
// travel between crypto hubs (cool blue) and fiat hubs (warm orange). No 3D
// library. The routes are illustrative, they are not live payment data.
// Only the landing page uses this component.

const box = ref<HTMLElement | null>(null)
const cv = ref<HTMLCanvasElement | null>(null)

const TILT = (20 * Math.PI) / 180
const SPIN_SPEED = (2 * Math.PI) / 70000 // one turn every 70 seconds
const DOT_STEP = 1.5 // degrees between dots

// Cool blue for crypto nodes, warm orange for fiat nodes. Each mode has its own
// strength so the routes stay clear on a dark sky and on a light page.
const PALETTE = {
  dark: { crypto: [56, 214, 255], fiat: [255, 104, 70] },
  light: { crypto: [0, 140, 214], fiat: [236, 62, 32] },
}

type NodeKind = 'crypto' | 'fiat'
interface GlobeNode {
  name: string
  lat: number
  lon: number
  kind: NodeKind
}

const GLOBE_NODES: GlobeNode[] = [
  { name: 'New York', lat: 40.7, lon: -74.0, kind: 'fiat' },
  { name: 'London', lat: 51.5, lon: -0.1, kind: 'fiat' },
  { name: 'Frankfurt', lat: 50.1, lon: 8.7, kind: 'fiat' },
  { name: 'Tokyo', lat: 35.7, lon: 139.7, kind: 'fiat' },
  { name: 'Sydney', lat: -33.9, lon: 151.2, kind: 'fiat' },
  { name: 'Mumbai', lat: 19.1, lon: 72.9, kind: 'fiat' },
  { name: 'Lagos', lat: 6.5, lon: 3.4, kind: 'fiat' },
  { name: 'Sao Paulo', lat: -23.5, lon: -46.6, kind: 'fiat' },
  { name: 'Nairobi', lat: -1.3, lon: 36.8, kind: 'fiat' },
  { name: 'Toronto', lat: 43.7, lon: -79.4, kind: 'fiat' },
  { name: 'Zug', lat: 47.2, lon: 8.5, kind: 'crypto' },
  { name: 'Singapore', lat: 1.35, lon: 103.8, kind: 'crypto' },
  { name: 'Dubai', lat: 25.2, lon: 55.3, kind: 'crypto' },
  { name: 'Miami', lat: 25.8, lon: -80.2, kind: 'crypto' },
  { name: 'Lisbon', lat: 38.7, lon: -9.1, kind: 'crypto' },
  { name: 'Seoul', lat: 37.6, lon: 127.0, kind: 'crypto' },
  { name: 'Buenos Aires', lat: -34.6, lon: -58.4, kind: 'crypto' },
  { name: 'Cape Town', lat: -33.9, lon: 18.4, kind: 'crypto' },
  { name: 'Hong Kong', lat: 22.3, lon: 114.2, kind: 'crypto' },
]

const GLOBE_ROUTES: Array<[string, string]> = [
  ['New York', 'London'],
  ['New York', 'Miami'],
  ['London', 'Zug'],
  ['Frankfurt', 'Dubai'],
  ['Dubai', 'Singapore'],
  ['Singapore', 'Tokyo'],
  ['Tokyo', 'Seoul'],
  ['Mumbai', 'Dubai'],
  ['Lagos', 'London'],
  ['Nairobi', 'Mumbai'],
  ['Sao Paulo', 'Lisbon'],
  ['Miami', 'Sao Paulo'],
  ['Sydney', 'Singapore'],
  ['Hong Kong', 'Sydney'],
  ['Seoul', 'New York'],
  ['Zug', 'Singapore'],
  ['Lisbon', 'New York'],
  ['Toronto', 'Frankfurt'],
  ['Cape Town', 'Lagos'],
  ['Buenos Aires', 'Cape Town'],
  ['Hong Kong', 'Tokyo'],
  ['Nairobi', 'Cape Town'],
]

// ---------- small helpers ----------

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t
}

// The dots: a grid of points over the whole sphere, kept where there is land.
function buildDots(rings: number[][]): Float32Array {
  const MW = 1440
  const MH = 720
  const mask = document.createElement('canvas')
  mask.width = MW
  mask.height = MH
  const mctx = mask.getContext('2d')!
  mctx.fillStyle = '#fff'
  mctx.beginPath()
  for (const r of rings) {
    for (let i = 0; i < r.length; i += 2) {
      const x = ((r[i] / 20 + 180) / 360) * MW
      const y = ((90 - r[i + 1] / 20) / 180) * MH
      if (i === 0) {
        mctx.moveTo(x, y)
      } else {
        mctx.lineTo(x, y)
      }
    }
    mctx.closePath()
  }
  mctx.fill()
  const alpha = mctx.getImageData(0, 0, MW, MH).data

  const out: number[] = []
  let row = 0
  for (let lat = -88; lat <= 88; lat += DOT_STEP) {
    const la = (lat * Math.PI) / 180
    const count = Math.max(1, Math.round((360 * Math.cos(la)) / DOT_STEP))
    // Every other row is shifted half a step so the dots pack like a honeycomb.
    const shift = row % 2 === 0 ? 0 : 0.5
    for (let k = 0; k < count; k++) {
      const lon = -180 + ((k + shift) / count) * 360
      const px = Math.min(MW - 1, Math.max(0, Math.floor(((lon + 180) / 360) * MW)))
      const py = Math.min(MH - 1, Math.max(0, Math.floor(((90 - lat) / 180) * MH)))
      if (alpha[(py * MW + px) * 4 + 3] > 110) {
        const lo = (lon * Math.PI) / 180
        out.push(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo))
      }
    }
    row++
  }
  return Float32Array.from(out)
}

// ---------- the component ----------

let cleanup: (() => void) | null = null

onMounted(() => {
  const boxEl = box.value
  const canvas = cv.value
  if (!boxEl || !canvas) {
    return
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return
  }

  const reduced =
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches

  const ct = Math.cos(TILT)
  const st = Math.sin(TILT)

  // The sun stays in one place in the view, so the Earth turns through it.
  const sl = Math.hypot(-0.72, 0.3, 0.42)
  const sunX = -0.72 / sl
  const sunY = 0.3 / sl
  const sunZ = 0.42 / sl

  let W = 0
  let H = 0
  let dpr = 1
  let cx = 0
  let cy = 0
  let R = 0

  // The page decides the mode. The globe follows it so both share one background.
  let isDark = document.documentElement.dataset.moTheme !== 'light'
  let dots = new Float32Array(0)
  let stars: Array<{ x: number; y: number; r: number; a: number; p: number }> = []

  const nodeByName = new Map<string, GlobeNode>()
  for (const n of GLOBE_NODES) {
    nodeByName.set(n.name, n)
  }

  function unit(lat: number, lon: number) {
    const la = (lat * Math.PI) / 180
    const lo = (lon * Math.PI) / 180
    return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)]
  }

  const STEPS = 44
  const nodeVec = GLOBE_NODES.map((n) => unit(n.lat, n.lon))
  const routes = GLOBE_ROUTES.map(([from, to], i) => {
    const a = nodeVec[GLOBE_NODES.indexOf(nodeByName.get(from)!)]
    const b = nodeVec[GLOBE_NODES.indexOf(nodeByName.get(to)!)]
    const cosw = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
    const w = Math.acos(cosw)
    const sinw = Math.sin(w) || 1
    const peak = 0.07 + 0.24 * (w / Math.PI)
    const ca: number[] = []
    const cb: number[] = []
    const alt: number[] = []
    for (let k = 0; k <= STEPS; k++) {
      const t = k / STEPS
      ca.push(Math.sin((1 - t) * w) / sinw)
      cb.push(Math.sin(t * w) / sinw)
      alt.push(peak * Math.sin(Math.PI * t))
    }
    return {
      a,
      b,
      ca,
      cb,
      alt,
      k1: nodeByName.get(from)!.kind,
      k2: nodeByName.get(to)!.kind,
      period: 5200 + ((i * 937) % 2600),
      offset: (i * 0.37) % 1,
    }
  })

  // Projection scratch values.
  let pX = 0
  let pY = 0
  let pZ = 0
  let pVis = false
  function project(
    x: number,
    y: number,
    z: number,
    spinCos: number,
    spinSin: number,
    k: number,
  ) {
    const gx = x * spinCos - z * spinSin
    const gz = z * spinCos + x * spinSin
    const ny = y * ct - gz * st
    const nz = y * st + gz * ct
    pX = cx + R * k * gx
    pY = cy - R * k * ny
    pZ = nz * k
    pVis = nz >= 0 || (gx * gx + ny * ny) * k * k > 1
  }

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = boxEl!.clientWidth
    const h = boxEl!.clientHeight
    if (w < 40 || h < 40) {
      return
    }
    W = Math.round(w * dpr)
    H = Math.round(h * dpr)
    canvas!.width = W
    canvas!.height = H
    cx = W / 2
    cy = H * 0.48
    R = Math.min(W, H * 0.96) * 0.35

    const rand = rng(99)
    stars = []
    for (let i = 0; i < 90; i++) {
      stars.push({
        x: rand() * W,
        y: rand() * H,
        r: (0.4 + rand() * 1.1) * dpr,
        a: 0.25 + rand() * 0.6,
        p: rand() * 6.28,
      })
    }
  }

  function rgba(c: number[], a: number) {
    return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`
  }

  function blend(c1: number[], c2: number[], t: number) {
    return [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)]
  }

  // Land dots, brighter on the sunny side and dim on the night side.
  const LEVELS = 10
  function drawDots(g: CanvasRenderingContext2D, spin: number) {
    const sc = Math.cos(spin)
    const ss = Math.sin(spin)
    const baseR = Math.max(0.7 * dpr, R * 0.0046)
    const day = isDark ? [190, 220, 255] : [24, 64, 210]
    const night = isDark ? [110, 150, 250] : [90, 120, 200]
    const buckets: number[][] = []
    for (let i = 0; i < LEVELS; i++) {
      buckets.push([])
    }
    for (let i = 0; i < dots.length; i += 3) {
      const x = dots[i]
      const y = dots[i + 1]
      const z = dots[i + 2]
      const gx = x * sc - z * ss
      const gz = z * sc + x * ss
      const ny = y * ct - gz * st
      const nz = y * st + gz * ct
      if (nz <= 0.03) {
        continue
      }
      const L = gx * sunX + ny * sunY + nz * sunZ
      const lit = smooth(-0.15, 0.35, L)
      const edge = smooth(0.03, 0.3, nz)
      const a = (0.34 + 0.66 * lit) * edge
      const level = Math.min(LEVELS - 1, Math.floor(a * LEVELS))
      const size = baseR * (0.55 + 0.45 * nz)
      buckets[level].push(cx + R * gx, cy - R * ny, size, lit)
    }
    for (let lv = 0; lv < LEVELS; lv++) {
      const list = buckets[lv]
      if (list.length === 0) {
        continue
      }
      // One colour per level: mostly the sunny colour, shifted toward the night
      // colour for the dim levels.
      const f = (lv + 0.5) / LEVELS
      const col = blend(night, day, smooth(0.15, 0.85, f))
      g.fillStyle = rgba(col, Math.min(1, 0.26 + f * 0.85))
      g.beginPath()
      for (let j = 0; j < list.length; j += 4) {
        g.moveTo(list[j] + list[j + 2], list[j + 1])
        g.arc(list[j], list[j + 1], list[j + 2], 0, Math.PI * 2)
      }
      g.fill()
    }
  }

  function drawSphere(g: CanvasRenderingContext2D) {
    // The ocean: a smooth glassy ball lit from the sun side.
    const hx = cx + sunX * R * 0.42
    const hy = cy - sunY * R * 0.42
    const body = g.createRadialGradient(hx, hy, R * 0.05, cx, cy, R * 1.02)
    if (isDark) {
      body.addColorStop(0, '#1d44b8')
      body.addColorStop(0.5, '#0c1f66')
      body.addColorStop(1, '#050b2a')
    } else {
      body.addColorStop(0, '#ffffff')
      body.addColorStop(0.55, '#e4ecff')
      body.addColorStop(1, '#a9bef5')
    }
    g.fillStyle = body
    g.beginPath()
    g.arc(cx, cy, R, 0, Math.PI * 2)
    g.fill()

    // Night side: a soft shadow sweeping across from the far edge.
    g.save()
    g.beginPath()
    g.arc(cx, cy, R, 0, Math.PI * 2)
    g.clip()
    const sx = cx - sunX * R
    const sy = cy + sunY * R
    const shadow = g.createLinearGradient(sx, sy, cx + sunX * R, cy - sunY * R)
    if (isDark) {
      shadow.addColorStop(0, 'rgba(2,5,22,0.78)')
      shadow.addColorStop(0.5, 'rgba(2,5,22,0.28)')
      shadow.addColorStop(1, 'rgba(2,5,22,0)')
    } else {
      shadow.addColorStop(0, 'rgba(24,44,120,0.5)')
      shadow.addColorStop(0.5, 'rgba(24,44,120,0.16)')
      shadow.addColorStop(1, 'rgba(24,44,120,0)')
    }
    g.fillStyle = shadow
    g.fillRect(cx - R, cy - R, R * 2, R * 2)
    g.restore()
  }

  function render(now: number, spin: number, animated: boolean) {
    if (W === 0) {
      return
    }
    const g = ctx!
    g.clearRect(0, 0, W, H)
    const pal = isDark ? PALETTE.dark : PALETTE.light

    // Stars (dark mode only).
    for (const s of isDark ? stars : []) {
      const tw = animated ? 0.75 + 0.25 * Math.sin(now / 900 + s.p) : 1
      g.fillStyle = `rgba(210,225,255,${(s.a * tw).toFixed(3)})`
      g.fillRect(s.x, s.y, s.r, s.r)
    }

    // Soft glow of the atmosphere around the globe.
    const glow = g.createRadialGradient(cx, cy, R * 0.94, cx, cy, R * 1.3)
    if (isDark) {
      glow.addColorStop(0, 'rgba(90,150,255,0.5)')
      glow.addColorStop(0.35, 'rgba(70,120,240,0.18)')
      glow.addColorStop(1, 'rgba(60,100,230,0)')
    } else {
      glow.addColorStop(0, 'rgba(70,120,255,0.38)')
      glow.addColorStop(0.35, 'rgba(90,140,255,0.13)')
      glow.addColorStop(1, 'rgba(90,140,255,0)')
    }
    g.fillStyle = glow
    g.beginPath()
    g.arc(cx, cy, R * 1.3, 0, Math.PI * 2)
    g.fill()

    drawSphere(g)
    drawDots(g, spin)

    // A thin bright rim on the sunny edge.
    const rim = g.createLinearGradient(
      cx + sunX * R,
      cy - sunY * R,
      cx - sunX * R,
      cy + sunY * R,
    )
    rim.addColorStop(0, isDark ? 'rgba(150,190,255,0.75)' : 'rgba(60,100,240,0.55)')
    rim.addColorStop(0.6, isDark ? 'rgba(110,150,255,0.12)' : 'rgba(60,100,240,0.1)')
    rim.addColorStop(1, 'rgba(110,150,255,0)')
    g.strokeStyle = rim
    g.lineWidth = 1.4 * dpr
    g.beginPath()
    g.arc(cx, cy, R, 0, Math.PI * 2)
    g.stroke()

    const sc = Math.cos(spin)
    const ss = Math.sin(spin)

    // Routes.
    g.lineCap = 'round'
    g.lineJoin = 'round'
    const sx = new Float32Array(STEPS + 1)
    const sy = new Float32Array(STEPS + 1)
    const sv = new Uint8Array(STEPS + 1)
    for (const rt of routes) {
      const c1 = rt.k1 === 'crypto' ? pal.crypto : pal.fiat
      const c2 = rt.k2 === 'crypto' ? pal.crypto : pal.fiat
      for (let k = 0; k <= STEPS; k++) {
        const x = rt.ca[k] * rt.a[0] + rt.cb[k] * rt.b[0]
        const y = rt.ca[k] * rt.a[1] + rt.cb[k] * rt.b[1]
        const z = rt.ca[k] * rt.a[2] + rt.cb[k] * rt.b[2]
        project(x, y, z, sc, ss, 1 + rt.alt[k])
        sx[k] = pX
        sy[k] = pY
        sv[k] = pVis ? 1 : 0
      }
      // The whole route, faint.
      g.lineWidth = 1.1 * dpr
      for (let k = 0; k < STEPS; k++) {
        if (!sv[k] || !sv[k + 1]) {
          continue
        }
        g.strokeStyle = rgba(blend(c1, c2, k / STEPS), 0.5)
        g.beginPath()
        g.moveTo(sx[k], sy[k])
        g.lineTo(sx[k + 1], sy[k + 1])
        g.stroke()
      }
      // A bright pulse that travels from one end to the other.
      let head = 0.5
      if (animated) {
        head = ((now / rt.period + rt.offset) % 1.4) - 0.05
      }
      const tail = 0.2
      const wash = isDark ? 0.45 : 0.12
      for (let k = 0; k < STEPS; k++) {
        const t = (k + 0.5) / STEPS
        if (!sv[k] || !sv[k + 1] || t > head || t < head - tail) {
          continue
        }
        const f = (t - (head - tail)) / tail
        const col = blend(c1, c2, t)
        g.lineWidth = 3.6 * dpr
        g.strokeStyle =
          (isDark ? 'rgba(4,10,34,' : 'rgba(255,255,255,') + (0.35 * f).toFixed(3) + ')'
        g.beginPath()
        g.moveTo(sx[k], sy[k])
        g.lineTo(sx[k + 1], sy[k + 1])
        g.stroke()
        g.lineWidth = 2.2 * dpr
        g.strokeStyle = rgba(
          [mix(col[0], 255, f * wash), mix(col[1], 255, f * wash), mix(col[2], 255, f * wash)],
          0.25 + 0.75 * f * f,
        )
        g.beginPath()
        g.moveTo(sx[k], sy[k])
        g.lineTo(sx[k + 1], sy[k + 1])
        g.stroke()
      }
      const hk = Math.round(head * STEPS)
      if (animated && hk > 0 && hk <= STEPS && sv[hk]) {
        const col = blend(c1, c2, head)
        const halo = g.createRadialGradient(sx[hk], sy[hk], 0, sx[hk], sy[hk], 7 * dpr)
        halo.addColorStop(0, rgba(col, 0.9))
        halo.addColorStop(1, rgba(col, 0))
        g.fillStyle = halo
        g.beginPath()
        g.arc(sx[hk], sy[hk], 7 * dpr, 0, Math.PI * 2)
        g.fill()
      }
    }

    // Nodes, each with a ripple that spreads out and fades.
    for (let i = 0; i < GLOBE_NODES.length; i++) {
      const n = GLOBE_NODES[i]
      const v = nodeVec[i]
      project(v[0], v[1], v[2], sc, ss, 1.003)
      if (!pVis) {
        continue
      }
      const fade = Math.min(1, Math.max(0, (pZ + 0.03) / 0.22))
      if (fade <= 0) {
        continue
      }
      const col = n.kind === 'crypto' ? pal.crypto : pal.fiat
      const ph = animated ? (now / 2200 + i * 0.19) % 1 : 0.2
      g.strokeStyle = rgba(col, (1 - ph) * 0.6 * fade)
      g.lineWidth = 1.2 * dpr
      g.beginPath()
      g.arc(pX, pY, (3 + ph * 11) * dpr, 0, Math.PI * 2)
      g.stroke()
      const halo = g.createRadialGradient(pX, pY, 0, pX, pY, 9 * dpr)
      halo.addColorStop(0, rgba(col, 0.55 * fade))
      halo.addColorStop(1, rgba(col, 0))
      g.fillStyle = halo
      g.beginPath()
      g.arc(pX, pY, 9 * dpr, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = rgba(col, fade)
      g.beginPath()
      g.arc(pX, pY, 3.1 * dpr, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = `rgba(255,255,255,${(0.9 * fade).toFixed(3)})`
      g.beginPath()
      g.arc(pX, pY, 1.2 * dpr, 0, Math.PI * 2)
      g.fill()
    }
  }

  // ---------- run ----------

  const spinStart = (20 * Math.PI) / 180
  let startTime = performance.now()
  let rafId = 0
  let lastFrame = 0
  let running = false
  let visible = true
  let disposed = false

  function spinAt(now: number) {
    return reduced ? spinStart : spinStart - (now - startTime) * SPIN_SPEED
  }

  function tick(now: number) {
    if (!running) {
      return
    }
    rafId = requestAnimationFrame(tick)
    if (now - lastFrame < 32) {
      return
    }
    lastFrame = now
    render(now, spinAt(now), true)
  }

  function sync() {
    const shouldRun = visible && !document.hidden && !reduced && !disposed
    if (shouldRun && !running) {
      running = true
      rafId = requestAnimationFrame(tick)
    } else if (!shouldRun && running) {
      running = false
      cancelAnimationFrame(rafId)
    }
  }

  layout()
  render(performance.now(), spinStart, false)

  // The map outline is a separate download, so it does not slow the first paint.
  import('~/utils/globeData').then((data) => {
    if (disposed) {
      return
    }
    dots = buildDots(data.LAND_RINGS)
    startTime = performance.now()
    render(performance.now(), spinAt(performance.now()), false)
    sync()
  })

  const resizer =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          layout()
          render(performance.now(), spinAt(performance.now()), false)
        })
      : null
  if (resizer) {
    resizer.observe(boxEl)
  }

  const watcher =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((entries) => {
          visible = entries.some((e) => e.isIntersecting)
          sync()
        })
      : null
  if (watcher) {
    watcher.observe(boxEl)
  }
  const modeWatcher = new MutationObserver(() => {
    isDark = document.documentElement.dataset.moTheme !== 'light'
    render(performance.now(), spinAt(performance.now()), !reduced)
  })
  modeWatcher.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-mo-theme'],
  })
  const onVisibility = () => sync()
  document.addEventListener('visibilitychange', onVisibility)

  cleanup = () => {
    disposed = true
    running = false
    cancelAnimationFrame(rafId)
    document.removeEventListener('visibilitychange', onVisibility)
    modeWatcher.disconnect()
    if (resizer) {
      resizer.disconnect()
    }
    if (watcher) {
      watcher.disconnect()
    }
  }
})

onBeforeUnmount(() => {
  if (cleanup) {
    cleanup()
  }
})
</script>
