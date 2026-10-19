<template>
  <div
    ref="box"
    class="mo-globe"
    role="img"
    aria-label="A rotating Earth, half in daylight and half in night. Glowing routes link crypto hubs and fiat banking hubs around the world."
  >
    <canvas ref="cv" class="mo-globe-canvas" aria-hidden="true"></canvas>
  </div>
</template>

<script setup lang="ts">
// A rotating Earth drawn on a canvas: day side, night side with city lights,
// clouds, and glowing routes between crypto hubs (cool blue) and fiat hubs
// (warm orange). No 3D library: the sphere is shaded pixel by pixel. The routes
// are illustrative, they are not live payment data.
// Only the landing page uses this component.

const box = ref<HTMLElement | null>(null)
const cv = ref<HTMLCanvasElement | null>(null)

const TW = 2048
const TH = 1024
const CW = 1024
const CH = 512
const TMASK = TW - 1
const CMASK = CW - 1
const TILT = (18 * Math.PI) / 180
const SPIN_SPEED = (2 * Math.PI) / 80000 // one turn every 80 seconds
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

function hash2(ix: number, iy: number, seed: number) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + seed) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// Value noise that repeats every `px` cells sideways, so the map has no seam.
function vnoise(x: number, y: number, px: number, seed: number) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const xa = ((x0 % px) + px) % px
  const xb = (xa + 1) % px
  const a = hash2(xa, y0, seed)
  const b = hash2(xb, y0, seed)
  const c = hash2(xa, y0 + 1, seed)
  const d = hash2(xb, y0 + 1, seed)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

function fbm(
  u: number,
  v: number,
  baseX: number,
  baseY: number,
  octaves: number,
  seed: number,
) {
  let amp = 0.5
  let sum = 0
  let norm = 0
  let px = baseX
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(u * px, v * baseY * (px / baseX), px, seed + o * 101)
    norm += amp
    amp *= 0.5
    px *= 2
  }
  return sum / norm
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t
}

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

// ---------- textures (built once) ----------

interface Textures {
  day: Uint32Array
  night: Uint8Array
  cloud: Uint8Array
}

function tracePath(
  ctx: CanvasRenderingContext2D,
  rings: number[][],
  w: number,
  h: number,
) {
  ctx.beginPath()
  for (const r of rings) {
    for (let i = 0; i < r.length; i += 2) {
      const x = ((r[i] / 20 + 180) / 360) * w
      const y = ((90 - r[i + 1] / 20) / 180) * h
      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.closePath()
  }
}

async function buildTextures(
  rings: number[][],
  cities: number[][],
): Promise<Textures> {
  const mk = () => {
    const c = document.createElement('canvas')
    c.width = TW
    c.height = TH
    return c
  }

  // Land mask and a soft shallow-water ring around the coasts.
  const landCanvas = mk()
  const lctx = landCanvas.getContext('2d')!
  lctx.fillStyle = '#fff'
  tracePath(lctx, rings, TW, TH)
  lctx.fill()
  const landA = lctx.getImageData(0, 0, TW, TH).data

  const shelfCanvas = mk()
  const sctx = shelfCanvas.getContext('2d')!
  sctx.lineJoin = 'round'
  sctx.strokeStyle = 'rgba(255,255,255,0.3)'
  tracePath(sctx, rings, TW, TH)
  for (const width of [22, 13, 6]) {
    sctx.lineWidth = width
    sctx.stroke()
  }
  const shelfA = sctx.getImageData(0, 0, TW, TH).data
  await pause()

  // Noise for land colour variety and for clouds.
  const biome = new Float32Array(CW * CH)
  const cloud = new Uint8Array(CW * CH)
  for (let y = 0; y < CH; y++) {
    const v = (y + 0.5) / CH
    const alat = Math.abs(90 - v * 180)
    const band = 1 - 0.55 * Math.exp(-(((alat - 25) / 9) ** 2))
    for (let x = 0; x < CW; x++) {
      const u = (x + 0.5) / CW
      biome[y * CW + x] = fbm(u, v, 8, 4, 4, 11)
      const f = fbm(u, v, 6, 3, 5, 77)
      cloud[y * CW + x] = Math.round(smooth(0.55, 0.74, f) * band * 255)
    }
  }
  await pause()

  // Daytime colours.
  const day = new Uint32Array(TW * TH)
  for (let y = 0; y < TH; y++) {
    const lat = 90 - ((y + 0.5) / TH) * 180
    const alat = Math.abs(lat)
    const dry = Math.exp(-(((alat - 26) / 9) ** 2))
    for (let x = 0; x < TW; x++) {
      const i = y * TW + x
      const n = biome[(y >> 1) * CW + (x >> 1)]
      const land = landA[i * 4 + 3] / 255
      const shelf = Math.min(1, shelfA[i * 4 + 3] / 150)

      // Ocean: deep blue, lighter near coasts, pale near the poles.
      let or = mix(8, 14, n)
      let og = mix(52, 82, n)
      let ob = mix(114, 156, n)
      or = mix(or, 48, shelf * shelf)
      og = mix(og, 152, shelf * shelf)
      ob = mix(ob, 192, shelf * shelf)
      const ice = smooth(74, 84, alat)
      or = mix(or, 205, ice * 0.75)
      og = mix(og, 224, ice * 0.75)
      ob = mix(ob, 236, ice * 0.75)

      let r = or
      let g = og
      let b = ob
      if (land > 0.01) {
        // Land: green where it is wet, sandy in the dry belts, white near the poles.
        const dryness = Math.min(1, Math.max(0, dry * 1.3 + (n - 0.5) * 1.1))
        let gr: number
        let gg: number
        let gb: number
        if (alat < 14) {
          gr = 30
          gg = 94
          gb = 42
        } else if (alat < 42) {
          const t = (alat - 14) / 28
          gr = mix(30, 70, t)
          gg = mix(94, 116, t)
          gb = mix(42, 52, t)
        } else if (alat < 60) {
          const t = (alat - 42) / 18
          gr = mix(70, 44, t)
          gg = mix(116, 82, t)
          gb = mix(52, 60, t)
        } else {
          const t = Math.min(1, (alat - 60) / 12)
          gr = mix(44, 124, t)
          gg = mix(82, 122, t)
          gb = mix(60, 102, t)
        }
        const lr = mix(gr, 196, dryness * 0.9)
        const lg = mix(gg, 164, dryness * 0.9)
        const lb = mix(gb, 102, dryness * 0.9)
        const relief = 0.8 + 0.4 * n
        const snow = smooth(62, 76, alat)
        r = mix(lr * relief, 238, snow)
        g = mix(lg * relief, 243, snow)
        b = mix(lb * relief, 248, snow)
        r = mix(or, r, land)
        g = mix(og, g, land)
        b = mix(ob, b, land)
      }
      day[i] =
        ((land < 0.5 ? 254 : 255) << 24) |
        (Math.round(b) << 16) |
        (Math.round(g) << 8) |
        Math.round(r)
    }
    if (y % 128 === 127) {
      await pause()
    }
  }

  // City lights for the night side.
  const nightCanvas = mk()
  const nctx = nightCanvas.getContext('2d')!
  nctx.globalCompositeOperation = 'lighter'
  const rand = rng(5)
  for (const c of cities) {
    const x = ((c[0] / 20 + 180) / 360) * TW
    const y = ((90 - c[1] / 20) / 180) * TH
    const base = Math.max(0, c[2] / 10 - 5.3)
    const rad = 0.8 + base * 0.7
    const grad = nctx.createRadialGradient(x, y, 0, x, y, rad * 2.2)
    grad.addColorStop(0, `rgba(255,255,255,${0.4 + base * 0.1})`)
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    nctx.fillStyle = grad
    nctx.fillRect(x - rad * 2.2, y - rad * 2.2, rad * 4.4, rad * 4.4)
    const sprawl = Math.round(base * 4)
    for (let k = 0; k < sprawl; k++) {
      const a = rand() * 6.283
      const d = (rand() + rand()) * rad * 2.4
      nctx.fillStyle = 'rgba(255,255,255,0.3)'
      nctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, 0.9, 0.9)
    }
  }
  const nd = nctx.getImageData(0, 0, TW, TH).data
  const night = new Uint8Array(TW * TH)
  for (let i = 0; i < TW * TH; i++) {
    night[i] = landA[i * 4 + 3] > 130 ? nd[i * 4] : 0
  }

  return { day, night, cloud }
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
  const sl = Math.hypot(-0.78, 0.22, 0.3)
  const sunX = -0.78 / sl
  const sunY = 0.22 / sl
  const sunZ = 0.3 / sl

  let W = 0
  let H = 0
  let dpr = 1
  let cx = 0
  let cy = 0
  let R = 0

  // Per-pixel values that never change while the Earth spins.
  let M = 0
  let baseU = new Float32Array(0)
  let baseUc = new Float32Array(0)
  let rowOff = new Int32Array(0)
  let cRow = new Int32Array(0)
  let dayf = new Float32Array(0)
  let shade = new Float32Array(0)
  let spec = new Float32Array(0)
  let rim = new Float32Array(0)
  let twi = new Float32Array(0)
  let pixIndex = new Int32Array(0)
  let edge = new Uint8Array(0)
  let D = 0
  let discCanvas: HTMLCanvasElement | null = null
  let discCtx: CanvasRenderingContext2D | null = null
  let discImage: ImageData | null = null
  let disc32: Uint32Array | null = null

  let tex: Textures | null = null
  // The page decides the mode. The globe follows it so both share one background.
  let isDark = document.documentElement.dataset.moTheme !== 'light'
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
    const k1 = nodeByName.get(from)!.kind
    const k2 = nodeByName.get(to)!.kind
    return {
      a,
      b,
      ca,
      cb,
      alt,
      k1,
      k2,
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

    // The Earth itself is shaded at a lower resolution than the canvas.
    const q = Math.min(dpr, 1.25)
    D = Math.max(80, Math.round((2 * R * q) / dpr))
    const half = D / 2
    const idx: number[] = []
    const bu: number[] = []
    const bc: number[] = []
    const ro: number[] = []
    const cr: number[] = []
    const df: number[] = []
    const sh: number[] = []
    const sp: number[] = []
    const rm: number[] = []
    const tw: number[] = []
    const ed: number[] = []

    // Half way between the sun and the viewer, for the sun glint on the sea.
    const hx = sunX
    const hy = sunY
    const hz = sunZ + 1
    const hl = Math.hypot(hx, hy, hz)

    for (let py = 0; py < D; py++) {
      for (let px = 0; px < D; px++) {
        const nx = (px + 0.5 - half) / half
        const ny = -(py + 0.5 - half) / half
        const r2 = nx * nx + ny * ny
        if (r2 > 1) {
          continue
        }
        const nz = Math.sqrt(1 - r2)
        const rr = Math.sqrt(r2)
        // Into the Earth's own frame (north pole tilted towards the viewer).
        const gy = ny * ct + nz * st
        const gz = -ny * st + nz * ct
        const lat = Math.asin(Math.max(-1, Math.min(1, gy)))
        const lonBase = Math.atan2(nx, gz)
        const u = (lonBase / (2 * Math.PI) + 0.5) * TW
        const v = Math.min(TH - 1, Math.max(0, Math.floor((0.5 - lat / Math.PI) * TH)))

        const L = nx * sunX + ny * sunY + nz * sunZ
        idx.push(py * D + px)
        bu.push(u)
        bc.push(u * (CW / TW))
        ro.push(v * TW)
        cr.push((v >> 1) * CW)
        const dayFactor = smooth(-0.1, 0.22, L)
        df.push(dayFactor)
        sh.push((0.14 + 0.86 * Math.pow(Math.max(L, 0), 0.55)) * (0.72 + 0.28 * nz))
        sp.push(Math.pow(Math.max((nx * hx + ny * hy + nz * hz) / hl, 0), 150))
        const lightBias = Math.min(1, Math.max(0, L * 1.3 + 0.45))
        rm.push(Math.pow(1 - nz, 2.8) * (0.2 + 0.8 * lightBias))
        tw.push(Math.exp(-(((L - 0.02) / 0.1) ** 2)))
        ed.push(Math.round(Math.min(1, Math.max(0, (1 - rr) * half * 0.9)) * 255))
      }
    }
    M = idx.length
    pixIndex = Int32Array.from(idx)
    baseU = Float32Array.from(bu)
    baseUc = Float32Array.from(bc)
    rowOff = Int32Array.from(ro)
    cRow = Int32Array.from(cr)
    dayf = Float32Array.from(df)
    shade = Float32Array.from(sh)
    spec = Float32Array.from(sp)
    rim = Float32Array.from(rm)
    twi = Float32Array.from(tw)
    edge = Uint8Array.from(ed)

    discCanvas = document.createElement('canvas')
    discCanvas.width = D
    discCanvas.height = D
    discCtx = discCanvas.getContext('2d')
    discImage = discCtx ? discCtx.createImageData(D, D) : null
    disc32 = discImage ? new Uint32Array(discImage.data.buffer) : null

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

  function shadeEarth(spin: number) {
    if (!tex || !disc32) {
      return
    }
    const { day, night, cloud } = tex
    const spinTex = (spin / (2 * Math.PI)) * TW
    const spinCloud = ((spin * 0.94) / (2 * Math.PI)) * CW
    const out = disc32
    for (let j = 0; j < M; j++) {
      const ti = rowOff[j] + (((baseU[j] + spinTex) | 0) & TMASK)
      const ci = cRow[j] + (((baseUc[j] + spinCloud) | 0) & CMASK)
      const dc = day[ti]
      let r = dc & 255
      let g = (dc >>> 8) & 255
      let b = (dc >>> 16) & 255
      const ocean = dc >>> 24 === 254
      const cl = cloud[ci] * 0.00392157
      const ca = cl * 0.78
      r += (244 - r) * ca
      g += (246 - g) * ca
      b += (250 - b) * ca

      const sh = shade[j]
      const df = dayf[j]
      const nr = r * 0.045 + 3
      const ng = g * 0.06 + 7
      const nb = b * 0.12 + 20
      let R2 = nr + (r * sh - nr) * df
      let G2 = ng + (g * sh - ng) * df
      let B2 = nb + (b * sh - nb) * df

      const nl = night[ti]
      if (nl > 0) {
        const k = nl * 0.00392157 * (1 - df) * (1 - df) * (1 - cl * 0.75)
        R2 += 255 * k * 0.9
        G2 += 184 * k * 0.9
        B2 += 96 * k * 0.9
      }
      const t = twi[j]
      R2 += 40 * t
      G2 += 18 * t
      B2 += 8 * t
      if (ocean) {
        const s = spec[j] * df * (1 - cl) * 110
        R2 += s
        G2 += s * 0.95
        B2 += s * 0.85
      }
      const rm = rim[j]
      R2 += 60 * rm
      G2 += 120 * rm
      B2 += 255 * rm

      const rr = R2 > 255 ? 255 : R2 | 0
      const gg = G2 > 255 ? 255 : G2 | 0
      const bb = B2 > 255 ? 255 : B2 | 0
      out[pixIndex[j]] = (edge[j] << 24) | (bb << 16) | (gg << 8) | rr
    }
    discCtx!.putImageData(discImage!, 0, 0)
  }

  function rgba(c: number[], a: number) {
    return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`
  }

  function blend(c1: number[], c2: number[], t: number) {
    return [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)]
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

    // Soft glow of the atmosphere around the planet.
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

    if (discCanvas && tex) {
      shadeEarth(spin)
      g.imageSmoothingEnabled = true
      g.drawImage(discCanvas, cx - R, cy - R, R * 2, R * 2)
    } else {
      g.fillStyle = '#0b1c4a'
      g.beginPath()
      g.arc(cx, cy, R, 0, Math.PI * 2)
      g.fill()
    }

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
        g.strokeStyle = (isDark ? 'rgba(4,10,34,' : 'rgba(255,255,255,') + (0.35 * f).toFixed(3) + ')'
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

    // Nodes.
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
      const ph = animated ? ((now / 2200 + i * 0.19) % 1) : 0.2
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

  // The map data is a separate download, so it does not slow the first paint.
  import('~/utils/globeData').then(async (data) => {
    if (disposed) {
      return
    }
    tex = await buildTextures(data.LAND_RINGS, data.CITIES)
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
