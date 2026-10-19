/**
 * The rotating Earth on the landing page.
 *
 * Plain canvas code with no libraries. The Earth is drawn pixel by pixel from
 * real coastline data (Natural Earth, public domain), so it has a lit day side,
 * a dark night side with city lights, a soft sunset band, clouds and an
 * atmosphere glow. Money routes are drawn on top as arcs that leave one
 * jurisdiction and land in another. Crypto hubs are cool blue, fiat hubs are
 * warm orange.
 *
 * Everything that does not change from frame to frame (the lighting, the
 * sphere geometry) is worked out once, so each frame is only texture lookups.
 */

export type NodeKind = 'fiat' | 'crypto'

export interface GlobeNode {
  id: string
  name: string
  code: string
  kind: NodeKind
  lon: number
  lat: number
}

export const FIAT_RGB: [number, number, number] = [255, 106, 61]
export const CRYPTO_RGB: [number, number, number] = [53, 215, 255]

export const NODES: GlobeNode[] = [
  { id: 'ny', name: 'New York', code: 'USD', kind: 'fiat', lon: -74.0, lat: 40.7 },
  { id: 'london', name: 'London', code: 'GBP', kind: 'fiat', lon: -0.13, lat: 51.5 },
  { id: 'frankfurt', name: 'Frankfurt', code: 'EUR', kind: 'fiat', lon: 8.68, lat: 50.1 },
  { id: 'tokyo', name: 'Tokyo', code: 'JPY', kind: 'fiat', lon: 139.7, lat: 35.7 },
  { id: 'mumbai', name: 'Mumbai', code: 'INR', kind: 'fiat', lon: 72.9, lat: 19.1 },
  { id: 'saopaulo', name: 'São Paulo', code: 'BRL', kind: 'fiat', lon: -46.6, lat: -23.5 },
  { id: 'sydney', name: 'Sydney', code: 'AUD', kind: 'fiat', lon: 151.2, lat: -33.9 },
  { id: 'nairobi', name: 'Nairobi', code: 'KES', kind: 'fiat', lon: 36.8, lat: -1.3 },
  { id: 'mexico', name: 'Mexico City', code: 'MXN', kind: 'fiat', lon: -99.1, lat: 19.4 },
  { id: 'jhb', name: 'Johannesburg', code: 'ZAR', kind: 'fiat', lon: 28.0, lat: -26.2 },
  { id: 'toronto', name: 'Toronto', code: 'CAD', kind: 'fiat', lon: -79.4, lat: 43.7 },
  { id: 'mogadishu', name: 'Mogadishu', code: 'USD', kind: 'fiat', lon: 45.3, lat: 2.05 },

  { id: 'sf', name: 'San Francisco', code: 'USDC', kind: 'crypto', lon: -122.4, lat: 37.8 },
  { id: 'zug', name: 'Zug', code: 'USDC', kind: 'crypto', lon: 8.52, lat: 47.2 },
  { id: 'sg', name: 'Singapore', code: 'USDC', kind: 'crypto', lon: 103.8, lat: 1.35 },
  { id: 'dubai', name: 'Dubai', code: 'USDC', kind: 'crypto', lon: 55.3, lat: 25.2 },
  { id: 'lisbon', name: 'Lisbon', code: 'USDC', kind: 'crypto', lon: -9.14, lat: 38.7 },
  { id: 'seoul', name: 'Seoul', code: 'USDC', kind: 'crypto', lon: 127.0, lat: 37.6 },
  { id: 'lagos', name: 'Lagos', code: 'USDC', kind: 'crypto', lon: 3.4, lat: 6.5 },
  { id: 'ba', name: 'Buenos Aires', code: 'USDC', kind: 'crypto', lon: -58.4, lat: -34.6 },
  { id: 'hk', name: 'Hong Kong', code: 'USDC', kind: 'crypto', lon: 114.2, lat: 22.3 },
  { id: 'miami', name: 'Miami', code: 'USDC', kind: 'crypto', lon: -80.2, lat: 25.8 },
  { id: 'istanbul', name: 'Istanbul', code: 'USDC', kind: 'crypto', lon: 29.0, lat: 41.0 },
]

// Each route is money leaving one jurisdiction for another, in a mix of
// fiat to crypto, crypto to fiat and fiat to fiat across the crypto rail.
export const ROUTES: Array<[string, string]> = [
  ['ny', 'zug'],
  ['dubai', 'mumbai'],
  ['sf', 'tokyo'],
  ['london', 'lagos'],
  ['sg', 'sydney'],
  ['saopaulo', 'miami'],
  ['frankfurt', 'seoul'],
  ['nairobi', 'dubai'],
  ['mexico', 'sf'],
  ['zug', 'london'],
  ['hk', 'tokyo'],
  ['lisbon', 'ny'],
  ['istanbul', 'frankfurt'],
  ['ba', 'saopaulo'],
  ['jhb', 'lagos'],
  ['toronto', 'miami'],
  ['mogadishu', 'dubai'],
  ['london', 'nairobi'],
  ['frankfurt', 'sg'],
  ['ny', 'sf'],
]

// ---------------------------------------------------------------------------
// Small helpers

const TEX_W = 1280
const TEX_H = 640
const DEG = Math.PI / 180

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function smoothstep(a: number, b: number, v: number): number {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

// Value noise that wraps sideways, so the texture has no seam at 180 degrees.
function noise2(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const x0 = ((xi % period) + period) % period
  const x1 = (x0 + 1) % period
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash2(x0, yi, seed)
  const b = hash2(x1, yi, seed)
  const c = hash2(x0, yi + 1, seed)
  const d = hash2(x1, yi + 1, seed)
  return mix(mix(a, b, u), mix(c, d, u), v)
}

function fbm(u: number, v: number, fx: number, octaves: number, seed: number): number {
  let sum = 0
  let amp = 0.5
  let norm = 0
  let freq = fx
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(u * freq, v * freq * 0.5, freq, seed + o * 17)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

function boxBlur(src: Float32Array, radius: number): Float32Array {
  const w = TEX_W
  const h = TEX_H
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  const size = radius * 2 + 1
  for (let y = 0; y < h; y++) {
    const row = y * w
    let sum = 0
    for (let k = -radius; k <= radius; k++) {
      sum += src[row + ((k + w) % w)]
    }
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / size
      sum += src[row + ((x + radius + 1) % w)] - src[row + ((x - radius + w) % w)]
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0
    for (let k = -radius; k <= radius; k++) {
      sum += tmp[Math.min(h - 1, Math.max(0, k)) * w + x]
    }
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / size
      const add = Math.min(h - 1, y + radius + 1)
      const drop = Math.max(0, y - radius)
      sum += tmp[add * w + x] - tmp[drop * w + x]
    }
  }
  return out
}

function gauss(lat: number, lon: number, cLat: number, cLon: number, sLat: number, sLon: number): number {
  let dLon = Math.abs(lon - cLon)
  if (dLon > 180) {
    dLon = 360 - dLon
  }
  const a = (lat - cLat) / sLat
  const b = dLon / sLon
  return Math.exp(-(a * a + b * b))
}

// Rough regions that give the land its colours: [lat, lon, spreadLat, spreadLon, strength]
const DESERTS = [
  [23, 13, 8, 24, 0.7],
  [24, 45, 7, 10, 0.65],
  [42, 103, 5, 12, 0.4],
  [-25, 134, 8, 12, 0.6],
  [-24, 22, 6, 7, 0.35],
  [34, -111, 5, 7, 0.3],
  [-45, -69, 6, 5, 0.25],
  [35, 58, 5, 10, 0.35],
  [27, 71, 3, 4, 0.35],
  [-22, -69, 5, 3, 0.4],
]
const FORESTS = [
  [-4, -62, 8, 12, 0.9],
  [0, 22, 6, 9, 0.85],
  [0, 110, 9, 16, 0.8],
  [12, 100, 6, 6, 0.5],
  [7, -5, 4, 8, 0.45],
  [37, -85, 8, 10, 0.35],
  [28, 112, 6, 9, 0.4],
]
const MOUNTAINS = [
  [32, 87, 5, 14, 1],
  [-15, -70, 22, 3, 0.8],
  [45, -112, 12, 6, 0.6],
  [46, 10, 2, 6, 0.55],
  [43, 45, 3, 8, 0.5],
  [0, 36, 8, 4, 0.2],
  [64, 105, 8, 20, 0.15],
]

export interface EarthData {
  land: number[][]
  cities: number[][]
}

interface Textures {
  albedo: Uint8ClampedArray
  lights: Uint8Array
  clouds: Uint8Array
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function buildTextures(data: EarthData): Promise<Textures> {
  const w = TEX_W
  const h = TEX_H

  // 1. Draw the land into a flat map, then read it back as a mask.
  const flat = document.createElement('canvas')
  flat.width = w
  flat.height = h
  const fctx = flat.getContext('2d') as CanvasRenderingContext2D
  fctx.fillStyle = '#000'
  fctx.fillRect(0, 0, w, h)
  fctx.fillStyle = '#fff'
  fctx.beginPath()
  for (const ring of data.land) {
    let lon = ring[0]
    let lat = ring[1]
    fctx.moveTo(((lon / 10 + 180) / 360) * w, ((90 - lat / 10) / 180) * h)
    for (let i = 2; i < ring.length; i += 2) {
      lon += ring[i]
      lat += ring[i + 1]
      fctx.lineTo(((lon / 10 + 180) / 360) * w, ((90 - lat / 10) / 180) * h)
    }
    fctx.closePath()
  }
  fctx.fill('evenodd')
  const px = fctx.getImageData(0, 0, w, h).data
  const mask = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    mask[i] = px[i * 4] / 255
  }
  await nextTick()

  // 2. A blurred copy tells us how close to a coast each spot is.
  const near = boxBlur(boxBlur(mask, 5), 5)
  await nextTick()

  // 3. Colour every spot of the map: ocean depth, land type, ice.
  const albedo = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h
    const lat = 90 - v * 180
    const absLat = Math.abs(lat)
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w
      const lon = u * 360 - 180
      const i = y * w + x
      const m = mask[i]
      let r: number
      let g: number
      let b: number

      if (m < 0.5) {
        const wob = fbm(u, v, 6, 3, 5)
        const shallow = smoothstep(0.04, 0.32, near[i])
        r = mix(mix(5, 14, wob), 38, shallow)
        g = mix(mix(28, 68, wob), 150, shallow)
        b = mix(mix(74, 128, wob), 178, shallow)
        // Sea ice near the poles.
        const ice = smoothstep(72, 80, absLat + (fbm(u, v, 10, 3, 9) - 0.5) * 10)
        r = mix(r, 205, ice * 0.85)
        g = mix(g, 220, ice * 0.85)
        b = mix(b, 232, ice * 0.85)
      } else {
        const n1 = fbm(u, v, 8, 4, 1)
        const n2 = fbm(u, v, 24, 4, 2)
        const rough = fbm(u, v, 48, 3, 3)

        // Base grass and woodland.
        r = mix(70, 98, n2)
        g = mix(108, 128, n2)
        b = mix(52, 66, n2)

        // Boreal forest and tundra in the north.
        const boreal = smoothstep(48, 58, absLat) * (1 - smoothstep(62, 70, absLat))
        r = mix(r, 44, boreal * 0.7)
        g = mix(g, 74, boreal * 0.7)
        b = mix(b, 54, boreal * 0.7)
        const tundra = smoothstep(63, 72, absLat)
        r = mix(r, 122, tundra)
        g = mix(g, 128, tundra)
        b = mix(b, 112, tundra)

        // Deserts and dry land.
        let dry = 0
        for (const d of DESERTS) {
          dry += d[4] * gauss(lat, lon, d[0], d[1], d[2], d[3])
        }
        dry = smoothstep(0.22, 0.7, dry * (0.55 + n1 * 0.9))
        r = mix(r, mix(186, 214, n2), dry)
        g = mix(g, mix(150, 176, n2), dry)
        b = mix(b, mix(96, 120, n2), dry)

        // Rainforest.
        let wet = 0
        for (const f of FORESTS) {
          wet += f[4] * gauss(lat, lon, f[0], f[1], f[2], f[3])
        }
        wet = smoothstep(0.2, 0.75, wet * (0.6 + n1 * 0.7))
        r = mix(r, 22, wet * 0.8)
        g = mix(g, 76, wet * 0.8)
        b = mix(b, 38, wet * 0.8)

        // Mountains and snow caps.
        let high = 0
        for (const mt of MOUNTAINS) {
          high += mt[4] * gauss(lat, lon, mt[0], mt[1], mt[2], mt[3])
        }
        high = clamp01(high) * smoothstep(0.35, 0.7, rough)
        r = mix(r, 124, high * 0.75)
        g = mix(g, 106, high * 0.75)
        b = mix(b, 88, high * 0.75)
        const snow = smoothstep(0.55, 0.85, high * (0.7 + rough * 0.6))
        r = mix(r, 236, snow)
        g = mix(g, 240, snow)
        b = mix(b, 245, snow)

        // Ice sheets: Antarctica, Greenland and the far north.
        let ice = smoothstep(62, 70, absLat + (n1 - 0.5) * 8)
        if (lat < -60) {
          ice = 1
        }
        ice = Math.max(ice, 0.95 * gauss(lat, lon, 73, -40, 9, 20))
        r = mix(r, 238, ice)
        g = mix(g, 243, ice)
        b = mix(b, 248, ice)

        // Coast line: a thin pale edge where land meets the sea.
        const edge = smoothstep(0.55, 0.95, near[i])
        r *= mix(1.1, 1, edge)
        g *= mix(1.1, 1, edge)
        b *= mix(1.05, 1, edge)
      }

      albedo[i * 4] = r
      albedo[i * 4 + 1] = g
      albedo[i * 4 + 2] = b
      albedo[i * 4 + 3] = m * 255
    }
    if (y % 160 === 159) {
      await nextTick()
    }
  }

  // 4. City lights, only on land.
  const glow = new Float32Array(w * h)
  for (const c of data.cities) {
    const lonD = c[0] / 10
    const latD = c[1] / 10
    const power = clamp01((c[2] - 40) / 35)
    const cx = ((lonD + 180) / 360) * w
    const cy = ((90 - latD) / 180) * h
    const sigma = 0.7 + power * 1.7
    const reach = Math.ceil(sigma * 3)
    const amp = 0.28 + power * 0.9
    for (let dy = -reach; dy <= reach; dy++) {
      const yy = Math.round(cy) + dy
      if (yy < 0 || yy >= h) {
        continue
      }
      for (let dx = -reach; dx <= reach; dx++) {
        const xx = (((Math.round(cx) + dx) % w) + w) % w
        const d2 = dx * dx + dy * dy
        glow[yy * w + xx] += amp * Math.exp(-d2 / (2 * sigma * sigma))
      }
    }
  }
  const lights = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    lights[i] = Math.min(255, glow[i] * 255 * smoothstep(0.02, 0.2, near[i]))
  }
  await nextTick()

  // 5. Clouds: drifting noise with more cover in storm belts and near the equator.
  const clouds = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h
    const lat = 90 - v * 180
    const absLat = Math.abs(lat)
    const bias =
      0.1 * Math.exp(-Math.pow(lat / 12, 2)) +
      0.08 * Math.exp(-Math.pow((absLat - 48) / 10, 2)) -
      0.13 * Math.exp(-Math.pow((absLat - 25) / 9, 2))
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w
      const n = fbm(u, v, 5, 5, 7) + bias
      clouds[y * w + x] = smoothstep(0.5, 0.72, n) * 255
    }
    if (y % 160 === 159) {
      await nextTick()
    }
  }

  return { albedo, lights, clouds }
}

// ---------------------------------------------------------------------------
// The globe

export interface GlobeOptions {
  /** Called when a new route starts, with the two ends. */
  onRoute?: (from: GlobeNode, to: GlobeNode) => void
  /** Draw one still picture instead of moving. */
  reducedMotion?: boolean
}

export interface GlobeHandle {
  destroy: () => void
}

interface RouteGeometry {
  from: GlobeNode
  to: GlobeNode
  ex: Float32Array
  ey: Float32Array
  ez: Float32Array
  rho: Float32Array
  offset: number
}

const TILT = 0.4
const SUN: [number, number, number] = (() => {
  const x = -0.78
  const y = 0.24
  const z = 0.58
  const len = Math.hypot(x, y, z)
  return [x / len, y / len, z / len]
})()
const ARC_STEPS = 46
const CYCLE = 11
const LIFE = 5.6
const GROW = 0.5

function unitVector(lon: number, lat: number): [number, number, number] {
  const phi = lat * DEG
  const lam = lon * DEG
  return [Math.cos(phi) * Math.sin(lam), Math.sin(phi), Math.cos(phi) * Math.cos(lam)]
}

function buildRoutes(): RouteGeometry[] {
  const byId: Record<string, GlobeNode> = {}
  for (const n of NODES) {
    byId[n.id] = n
  }
  const list: RouteGeometry[] = []
  ROUTES.forEach((pair, index) => {
    const from = byId[pair[0]]
    const to = byId[pair[1]]
    const a = unitVector(from.lon, from.lat)
    const b = unitVector(to.lon, to.lat)
    const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
    const omega = Math.acos(dot)
    const sinO = Math.sin(omega) || 1
    const lift = 0.05 + 0.3 * (omega / Math.PI)
    const ex = new Float32Array(ARC_STEPS + 1)
    const ey = new Float32Array(ARC_STEPS + 1)
    const ez = new Float32Array(ARC_STEPS + 1)
    const rho = new Float32Array(ARC_STEPS + 1)
    for (let i = 0; i <= ARC_STEPS; i++) {
      const t = i / ARC_STEPS
      const ka = Math.sin((1 - t) * omega) / sinO
      const kb = Math.sin(t * omega) / sinO
      ex[i] = ka * a[0] + kb * b[0]
      ey[i] = ka * a[1] + kb * b[1]
      ez[i] = ka * a[2] + kb * b[2]
      rho[i] = 1.004 + lift * Math.sin(Math.PI * t)
    }
    list.push({ from, to, ex, ey, ez, rho, offset: (index * CYCLE) / ROUTES.length })
  })
  return list
}

function rgba(c: number[], a: number): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`
}

export async function createGlobe(
  canvas: HTMLCanvasElement,
  options: GlobeOptions = {},
): Promise<GlobeHandle> {
  const response = await fetch('/globe/earth.json')
  if (!response.ok) {
    throw new Error('Could not load the map')
  }
  const data = (await response.json()) as EarthData
  const tex = await buildTextures(data)

  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  const routes = buildRoutes()
  const sin = Math.sin(TILT)
  const cos = Math.cos(TILT)

  // Slowly turning Earth, east to the right. Start with the Atlantic facing us.
  let rotation = 0.35
  let spinSpeed = options.reducedMotion ? 0 : (Math.PI * 2) / 80
  let clock = 0
  let cloudDrift = 0

  // Per size state.
  let size = 0
  let radius = 0
  let disc = 0
  let count = 0
  let pixIndex = new Int32Array(0)
  let baseX = new Float32Array(0)
  let rowOff = new Int32Array(0)
  let diffuse = new Float32Array(0)
  let dayMix = new Float32Array(0)
  let spec = new Float32Array(0)
  let twilight = new Float32Array(0)
  let rim = new Float32Array(0)
  let edgeAlpha = new Float32Array(0)
  let buffer = document.createElement('canvas')
  let bctx = buffer.getContext('2d') as CanvasRenderingContext2D
  let image: ImageData | null = null

  function layout() {
    const rect = canvas.getBoundingClientRect()
    const css = Math.max(120, Math.round(rect.width))
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    size = Math.round(css * dpr)
    canvas.width = size
    canvas.height = size
    radius = size * 0.4
    disc = Math.ceil(radius * 2) + 2
    buffer.width = disc
    buffer.height = disc
    image = bctx.createImageData(disc, disc)

    const total = disc * disc
    const idx = new Int32Array(total)
    const bx = new Float32Array(total)
    const ro = new Int32Array(total)
    const df = new Float32Array(total)
    const dm = new Float32Array(total)
    const sp = new Float32Array(total)
    const tw = new Float32Array(total)
    const rm = new Float32Array(total)
    const ea = new Float32Array(total)
    const half = (disc - 1) / 2
    let n = 0
    // Half-way vector for the sun glint on the sea.
    const hx = SUN[0]
    const hy = SUN[1]
    const hz = SUN[2] + 1
    const hl = Math.hypot(hx, hy, hz)
    for (let py = 0; py < disc; py++) {
      for (let px = 0; px < disc; px++) {
        const x = (px - half) / radius
        const y = (half - py) / radius
        const rr = x * x + y * y
        if (rr >= 1) {
          continue
        }
        const z = Math.sqrt(1 - rr)
        // Undo the tilt to find the point on the Earth.
        const ey = y * cos + z * sin
        const ez = -y * sin + z * cos
        const lat = Math.asin(Math.max(-1, Math.min(1, ey)))
        const lon = Math.atan2(x, ez)
        const dot = x * SUN[0] + y * SUN[1] + z * SUN[2]
        const r = Math.sqrt(rr)

        idx[n] = (py * disc + px) * 4
        bx[n] = ((lon + Math.PI) / (Math.PI * 2)) * TEX_W
        ro[n] = Math.min(TEX_H - 1, Math.max(0, Math.floor((0.5 - lat / Math.PI) * TEX_H))) * TEX_W
        df[n] = Math.max(0, dot)
        dm[n] = smoothstep(-0.1, 0.22, dot)
        tw[n] = Math.exp(-Math.pow((dot - 0.02) / 0.09, 2))
        sp[n] = Math.pow(Math.max(0, (x * hx + y * hy + z * hz) / hl), 70)
        rm[n] = Math.pow(1 - z, 2.6)
        ea[n] = r > 0.985 ? Math.max(0, (1 - r) / 0.015) : 1
        n++
      }
    }
    count = n
    pixIndex = idx
    baseX = bx
    rowOff = ro
    diffuse = df
    dayMix = dm
    spec = sp
    twilight = tw
    rim = rm
    edgeAlpha = ea
  }

  function paintEarth() {
    if (!image) {
      return
    }
    const out = image.data
    const A = tex.albedo
    const L = tex.lights
    const C = tex.clouds
    const shift = (rotation / (Math.PI * 2)) * TEX_W
    const cshift = shift - cloudDrift
    for (let k = 0; k < count; k++) {
      let x = baseX[k] - shift
      x -= Math.floor(x / TEX_W) * TEX_W
      const x0 = x | 0
      const fx = x - x0
      const x1 = x0 + 1 === TEX_W ? 0 : x0 + 1
      const row = rowOff[k]
      const i0 = (row + x0) * 4
      const i1 = (row + x1) * 4
      const gx = 1 - fx
      const aR = A[i0] * gx + A[i1] * fx
      const aG = A[i0 + 1] * gx + A[i1 + 1] * fx
      const aB = A[i0 + 2] * gx + A[i1 + 2] * fx
      const land = (A[i0 + 3] * gx + A[i1 + 3] * fx) / 255
      const lit = (L[row + x0] * gx + L[row + x1] * fx) / 255

      let cx = baseX[k] - cshift
      cx -= Math.floor(cx / TEX_W) * TEX_W
      const c0 = cx | 0
      const cf = cx - c0
      const c1 = c0 + 1 === TEX_W ? 0 : c0 + 1
      const cloud = ((C[row + c0] * (1 - cf) + C[row + c1] * cf) / 255) * 0.86

      const d = diffuse[k]
      const dm = dayMix[k]
      // Light on the surface: warm sun by day, faint blue moonlight by night.
      const dayLight = 0.3 + 0.82 * d
      const lr = mix(0.05, dayLight * 1.0, dm)
      const lg = mix(0.07, dayLight * 0.98, dm)
      const lb = mix(0.14, dayLight * 0.94, dm)
      let r = aR * lr
      let g = aG * lg
      let b = aB * lb

      // Clouds: white by day, dark grey-blue by night.
      const cd = 0.3 + 0.85 * d
      const cr = mix(16, 246 * cd, dm)
      const cg = mix(22, 248 * cd, dm)
      const cb = mix(40, 255 * cd, dm)
      r = r * (1 - cloud) + cr * cloud
      g = g * (1 - cloud) + cg * cloud
      b = b * (1 - cloud) + cb * cloud

      // Sun glint on open water.
      const glint = spec[k] * (1 - land) * (1 - cloud) * dm * 190
      r += glint * 0.95
      g += glint
      b += glint

      // Warm band where day turns into night.
      const tw = twilight[k] * 0.2
      r += 255 * tw * 0.8
      g += 110 * tw * 0.6
      b += 60 * tw * 0.3

      // City lights on the dark side.
      const glow = lit * (1 - dm) * (1 - cloud * 0.8)
      r += 255 * glow
      g += 196 * glow
      b += 110 * glow

      // Thin blue air along the edge, stronger on the day side.
      const air = rim[k] * (0.25 + 0.95 * dm)
      r += 70 * air
      g += 140 * air
      b += 255 * air * 0.9

      const o = pixIndex[k]
      out[o] = r
      out[o + 1] = g
      out[o + 2] = b
      out[o + 3] = 255 * edgeAlpha[k]
    }
    bctx.putImageData(image, 0, 0)
  }

  // Point on the Earth to a spot on the screen. Returns [x, y, depth].
  const proj: [number, number, number] = [0, 0, 0]
  const cr = Math.cos(0)
  void cr
  function project(ex: number, ey: number, ez: number, rho: number) {
    const rc = Math.cos(rotation)
    const rs = Math.sin(rotation)
    const x = ex * rc + ez * rs
    const z0 = ez * rc - ex * rs
    const vy = ey * cos - z0 * sin
    const vz = ey * sin + z0 * cos
    const half = size / 2
    proj[0] = half + x * rho * radius
    proj[1] = half - vy * rho * radius
    // In front of the Earth, or far enough out to be seen around its edge.
    const sees = vz * rho > 0 || rho * rho * (x * x + vy * vy) > 1
    proj[2] = sees ? vz : -1
  }

  const nodeVec = new Map<string, [number, number, number]>()
  for (const n of NODES) {
    nodeVec.set(n.id, unitVector(n.lon, n.lat))
  }

  let lastRouteIndex = -1

  function drawArcs(still: boolean) {
    for (let ri = 0; ri < routes.length; ri++) {
      const route = routes[ri]
      let u: number
      if (still) {
        if (ri >= 9) {
          continue
        }
        u = GROW + 0.02
      } else {
        const t = (clock + route.offset) % CYCLE
        u = t / LIFE
        if (u >= 1) {
          continue
        }
      }

      if (!still && u < 0.02 && lastRouteIndex !== ri) {
        lastRouteIndex = ri
        if (options.onRoute) {
          options.onRoute(route.from, route.to)
        }
      }

      const grow = clamp01(u / GROW)
      const eased = 1 - Math.pow(1 - grow, 2.2)
      const fade = u < 0.72 ? 1 : 1 - (u - 0.72) / 0.28
      const reach = eased * ARC_STEPS
      const fromC = route.from.kind === 'fiat' ? FIAT_RGB : CRYPTO_RGB
      const toC = route.to.kind === 'fiat' ? FIAT_RGB : CRYPTO_RGB
      const last = Math.floor(reach)

      let prevX = 0
      let prevY = 0
      let prevOk = false
      for (let i = 0; i <= last + 1 && i <= ARC_STEPS; i++) {
        let frac = 1
        let ex = route.ex[i]
        let ey = route.ey[i]
        let ez = route.ez[i]
        let rho = route.rho[i]
        if (i === last + 1) {
          if (last >= ARC_STEPS) {
            break
          }
          // The growing tip sits part way between two samples.
          frac = reach - last
          const px = route.ex[last]
          const py = route.ey[last]
          const pz = route.ez[last]
          ex = px + (ex - px) * frac
          ey = py + (ey - py) * frac
          ez = pz + (ez - pz) * frac
          rho = route.rho[last] + (rho - route.rho[last]) * frac
        }
        project(ex, ey, ez, rho)
        const ok = proj[2] > 0
        if (ok && prevOk) {
          const t = i / ARC_STEPS
          const colour = [
            mix(fromC[0], toC[0], t),
            mix(fromC[1], toC[1], t),
            mix(fromC[2], toC[2], t),
          ]
          const headBoost = reach > 0 ? Math.pow(Math.min(1, i / Math.max(reach, 1)), 1.3) : 1
          const a = fade * (0.28 + 0.72 * headBoost)
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(prevX, prevY)
          ctx.lineTo(proj[0], proj[1])
          ctx.strokeStyle = `rgba(4,9,28,${(a * 0.45).toFixed(3)})`
          ctx.lineWidth = size / 190
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(prevX, prevY)
          ctx.lineTo(proj[0], proj[1])
          ctx.strokeStyle = rgba(colour, a)
          ctx.lineWidth = size / 330
          ctx.stroke()
        }
        prevX = proj[0]
        prevY = proj[1]
        prevOk = ok
      }

      // The packet travelling along the arc.
      if (!still && grow < 1) {
        const hi = Math.min(ARC_STEPS - 1, last)
        const f = reach - hi
        const ex = route.ex[hi] + (route.ex[hi + 1] - route.ex[hi]) * f
        const ey = route.ey[hi] + (route.ey[hi + 1] - route.ey[hi]) * f
        const ez = route.ez[hi] + (route.ez[hi + 1] - route.ez[hi]) * f
        const rho = route.rho[hi] + (route.rho[hi + 1] - route.rho[hi]) * f
        project(ex, ey, ez, rho)
        if (proj[2] > 0) {
          const g = ctx.createRadialGradient(proj[0], proj[1], 0, proj[0], proj[1], size / 40)
          g.addColorStop(0, 'rgba(255,255,255,0.95)')
          g.addColorStop(0.35, rgba(toC, 0.55))
          g.addColorStop(1, rgba(toC, 0))
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(proj[0], proj[1], size / 40, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // A ripple where the money lands.
      const arrive = (u - GROW) / 0.3
      if (!still && arrive > 0 && arrive < 1) {
        const v = nodeVec.get(route.to.id) as [number, number, number]
        project(v[0], v[1], v[2], 1.004)
        if (proj[2] > 0.02) {
          ctx.beginPath()
          ctx.arc(proj[0], proj[1], size / 150 + arrive * (size / 26), 0, Math.PI * 2)
          ctx.strokeStyle = rgba(toC, (1 - arrive) * 0.8 * fade)
          ctx.lineWidth = size / 300
          ctx.stroke()
        }
      }
    }
  }

  function drawNodes() {
    for (let i = 0; i < NODES.length; i++) {
      const n = NODES[i]
      const v = nodeVec.get(n.id) as [number, number, number]
      project(v[0], v[1], v[2], 1.004)
      if (proj[2] <= 0.03) {
        continue
      }
      const seen = clamp01(proj[2] * 4)
      const c = n.kind === 'fiat' ? FIAT_RGB : CRYPTO_RGB
      const unit = size / 230
      const pulse = options.reducedMotion ? 0.4 : 0.5 + 0.5 * Math.sin(clock * 1.8 + i * 1.7)

      ctx.beginPath()
      ctx.arc(proj[0], proj[1], unit * (3.4 + pulse * 2.6), 0, Math.PI * 2)
      ctx.fillStyle = rgba(c, 0.16 * seen)
      ctx.fill()

      ctx.beginPath()
      ctx.arc(proj[0], proj[1], unit * 2.7, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(4,9,28,${(0.6 * seen).toFixed(3)})`
      ctx.fill()

      ctx.beginPath()
      ctx.arc(proj[0], proj[1], unit * 2.0, 0, Math.PI * 2)
      ctx.fillStyle = rgba(c, seen)
      ctx.fill()

      ctx.beginPath()
      ctx.arc(proj[0], proj[1], unit * 0.8, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,255,255,${(0.9 * seen).toFixed(3)})`
      ctx.fill()
    }
  }

  function drawFrame(still: boolean) {
    const half = size / 2
    ctx.clearRect(0, 0, size, size)

    // Air around the planet.
    const glow = ctx.createRadialGradient(half, half, radius * 0.97, half, half, radius * 1.3)
    glow.addColorStop(0, 'rgba(90,160,255,0.55)')
    glow.addColorStop(0.25, 'rgba(70,120,240,0.22)')
    glow.addColorStop(1, 'rgba(60,90,230,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(half, half, radius * 1.3, 0, Math.PI * 2)
    ctx.fill()

    paintEarth()
    ctx.drawImage(buffer, half - disc / 2, half - disc / 2)

    drawArcs(still)
    drawNodes()
  }

  // -------------------------------------------------------------------------
  // Loop, dragging and cleanup

  layout()
  let running = false
  let frame = 0
  let lastTime = 0
  let visible = true
  let dragging = false
  let lastX = 0
  let velocity = 0

  function tick(now: number) {
    frame = 0
    if (!running) {
      return
    }
    const dt = Math.min(0.05, lastTime ? (now - lastTime) / 1000 : 0.016)
    lastTime = now
    clock += dt
    cloudDrift += dt * 1.6
    if (!dragging) {
      velocity *= Math.pow(0.04, dt)
      rotation += (spinSpeed + velocity) * dt
    }
    drawFrame(false)
    frame = requestAnimationFrame(tick)
  }

  function start() {
    if (running || options.reducedMotion || !visible || document.hidden) {
      return
    }
    running = true
    lastTime = 0
    frame = requestAnimationFrame(tick)
  }

  function stop() {
    running = false
    if (frame) {
      cancelAnimationFrame(frame)
      frame = 0
    }
  }

  function onPointerDown(event: PointerEvent) {
    dragging = true
    lastX = event.clientX
    velocity = 0
    try {
      canvas.setPointerCapture(event.pointerId)
    } catch {
      // Not every browser allows this. Dragging still works without it.
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging) {
      return
    }
    const rect = canvas.getBoundingClientRect()
    const dx = event.clientX - lastX
    lastX = event.clientX
    const turn = dx / (rect.width * 0.4)
    rotation -= turn
    velocity = -turn * 30
    if (options.reducedMotion) {
      drawFrame(true)
    }
  }

  function onPointerUp() {
    dragging = false
  }

  function onVisibility() {
    if (document.hidden) {
      stop()
    } else {
      start()
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  document.addEventListener('visibilitychange', onVisibility)

  let observer: IntersectionObserver | null = null
  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].isIntersecting
      if (visible) {
        start()
      } else {
        stop()
      }
    })
    observer.observe(canvas)
  }

  let resizer: ResizeObserver | null = null
  let lastWidth = Math.round(canvas.getBoundingClientRect().width)
  if (typeof ResizeObserver !== 'undefined') {
    resizer = new ResizeObserver(() => {
      const width = Math.round(canvas.getBoundingClientRect().width)
      if (width === lastWidth || width < 100) {
        return
      }
      lastWidth = width
      layout()
      if (!running) {
        drawFrame(!!options.reducedMotion)
      }
    })
    resizer.observe(canvas)
  }

  spinSpeed = options.reducedMotion ? 0 : (Math.PI * 2) / 80
  drawFrame(!!options.reducedMotion)
  start()

  return {
    destroy() {
      stop()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      document.removeEventListener('visibilitychange', onVisibility)
      if (observer) {
        observer.disconnect()
      }
      if (resizer) {
        resizer.disconnect()
      }
    },
  }
}
