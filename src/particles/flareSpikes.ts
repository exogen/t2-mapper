/**
 * The spikes a LinearFlareProjectile (plasma bolt) keeps alive around
 * itself, as Tribes2.exe simulates and draws them (binary-verified):
 *
 * - LinearFlareProjectile::advanceTime FUN_0063df30 ages every spike and
 *   respawns any whose lifetime has passed: a random unit direction, an
 *   opening angle that animates from 87° (1.518 rad) to 65°–85°, base scale
 *   size[0], a tip scale that grows from size[1] + [0, 0.25) to
 *   size[2] + [0, 1) during the first 0.15–0.375 s, and a 0.4–0.995 s life.
 * - FUN_0063ee80 builds two 8-point rings per spike: the base ring at
 *   dir × baseScale with radius cos(angle) × baseScale, and the tip ring at
 *   dir × tipScale pulled back by (1 − sin(angle)).
 * - FUN_0063f4e0 draws four triangle fans per spike between the rings,
 *   additively (GL_ONE, GL_ONE) with flareBaseTexture: the base ring at
 *   flareColor × brightness, the tip ring at half that, the fan centre at a
 *   quarter, brightness ramping 0 → 1 until the tip finishes growing and
 *   1 → 0 to the end of life.
 */

interface FlareSpike {
  angle0: number;
  angle1: number;
  baseScale: number;
  tip0: number;
  tip1: number;
  /** Seconds the tip takes to grow and the brightness to ramp up. */
  growSec: number;
  lifetimeSec: number;
  ageSec: number;
  dir: [number, number, number];
}

/** Four fans × four triangles × three vertices. */
export const VERTS_PER_SPIKE = 48;

const ANGLE_START = 1.518;
const DEG_TO_RAD = Math.PI / 180;
/** Ring corner offsets (a, b) around the direction, in engine order. */
const RING: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];
/** Per fan: vertex source (A = base ring, B = tip ring), ring index offset,
 *  u, v, and which colour it takes (0 base, 1 tip ring, 2 fan centre). */
const FAN: ReadonlyArray<readonly [0 | 1, number, number, number, 0 | 1 | 2]> =
  [
    [0, 1, 0.5, 0.9, 0],
    [0, 0, 0, 0.9, 0],
    [1, 0, 0, 0.1, 1],
    [1, 1, 0.5, 0.1, 2],
    [1, 2, 1, 0.1, 1],
    [0, 2, 1, 0.9, 0],
  ];

export class FlareSpikes {
  readonly spikes: FlareSpike[] = [];
  private readonly sizes: readonly [number, number, number];
  private readonly random: () => number;

  constructor(
    count: number,
    sizes: readonly [number, number, number],
    random: () => number = Math.random,
  ) {
    this.sizes = sizes;
    this.random = random;
    for (let i = 0; i < count; i++) this.spikes.push(this.spawn());
  }

  /** advanceTime: age spikes; a spike past its lifetime respawns at once. */
  advance(dtSec: number): void {
    for (let i = 0; i < this.spikes.length; i++) {
      const s = this.spikes[i];
      s.ageSec += dtSec;
      if (s.ageSec > s.lifetimeSec) this.spikes[i] = this.spawn();
    }
  }

  /**
   * Write every spike's triangles into the given buffers (positions ×3,
   * uvs ×2, colours ×3 per vertex) and return the vertex count. `color` is
   * the datablock's flareColor; `brightness` the engine's fade × haze scale.
   */
  writeGeometry(
    positions: Float32Array,
    uvs: Float32Array,
    colors: Float32Array,
    color: readonly [number, number, number],
    brightness = 1,
  ): number {
    let v = 0;
    for (const s of this.spikes) {
      const [dx, dy, dz] = s.dir;
      // Basis perpendicular to the direction: p1 = dir × (x or y axis),
      // p2 = −(dir × p1), both normalised.
      let p1x: number, p1y: number, p1z: number;
      if (Math.abs(dz) < 0.9) {
        p1x = 0;
        p1y = dz;
        p1z = -dy;
      } else {
        p1x = -dz;
        p1y = 0;
        p1z = dx;
      }
      const l1 = Math.hypot(p1x, p1y, p1z) || 1;
      p1x /= l1;
      p1y /= l1;
      p1z /= l1;
      let p2x = -(dy * p1z - dz * p1y);
      let p2y = -(dz * p1x - dx * p1z);
      let p2z = -(dx * p1y - dy * p1x);
      const l2 = Math.hypot(p2x, p2y, p2z) || 1;
      p2x /= l2;
      p2y /= l2;
      p2z /= l2;

      let angle: number;
      let tip: number;
      let bright: number;
      if (s.ageSec < s.growSec) {
        const t = s.ageSec / s.growSec;
        angle = s.angle0;
        tip = s.tip0 + (s.tip1 - s.tip0) * t;
        bright = t;
      } else {
        const t = (s.ageSec - s.growSec) / (s.lifetimeSec - s.growSec);
        angle = s.angle0 + (s.angle1 - s.angle0) * t;
        tip = s.tip1;
        bright = 1 - t;
      }
      const c = Math.cos(angle);
      const pull = 1 - Math.sin(angle);
      // a = p2·cos, b = p1·cos
      const ax = p2x * c,
        ay = p2y * c,
        az = p2z * c;
      const bx = p1x * c,
        by = p1y * c,
        bz = p1z * c;

      const f = brightness * Math.max(0, bright);
      const shade = [f * brightness, f * 0.5, f * 0.25];

      for (let fan = 0; fan < 8; fan += 2) {
        // Triangle fan of six vertices → four triangles.
        const fanVerts = FAN.map(([ring, off, u, tv, shadeIdx]) => {
          const k = (fan + off) & 7;
          const [oa, ob] = RING[k];
          const ox = dx + oa * ax + ob * bx;
          const oy = dy + oa * ay + ob * by;
          const oz = dz + oa * az + ob * bz;
          const scale = ring === 0 ? s.baseScale : tip;
          const back = ring === 0 ? 0 : pull;
          return [
            ox * scale - dx * back,
            oy * scale - dy * back,
            oz * scale - dz * back,
            u,
            tv,
            shade[shadeIdx],
          ] as const;
        });
        for (let tri = 1; tri < 5; tri++) {
          for (const idx of [0, tri, tri + 1]) {
            const [x, y, z, u, tv, sh] = fanVerts[idx];
            positions[v * 3] = x;
            positions[v * 3 + 1] = y;
            positions[v * 3 + 2] = z;
            uvs[v * 2] = u;
            uvs[v * 2 + 1] = tv;
            colors[v * 3] = color[0] * sh;
            colors[v * 3 + 1] = color[1] * sh;
            colors[v * 3 + 2] = color[2] * sh;
            v++;
          }
        }
      }
    }
    return v;
  }

  private spawn(): FlareSpike {
    const r = this.random;
    let dx = 1 - 2 * r();
    let dy = 1 - 2 * r();
    let dz = 1 - 2 * r();
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    return {
      angle0: ANGLE_START,
      angle1: (65 + 20 * r()) * DEG_TO_RAD,
      baseScale: this.sizes[0],
      tip0: this.sizes[1] + 0.25 * r(),
      tip1: this.sizes[2] + r(),
      growSec: 0.15 + 0.225 * r(),
      lifetimeSec: 0.4 + 0.595 * r(),
      ageSec: 0,
      dir: [dx, dy, dz],
    };
  }
}
