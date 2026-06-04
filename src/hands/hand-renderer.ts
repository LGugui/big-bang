import type { HandFrame, Landmark } from './ws-hand-client';

// [fromIdx, toIdx, outerPx, innerPx] — border = (outer - inner) / 2 ≈ 3–4px per side
const SEGMENTS: [number, number, number, number][] = [
  // Wrist → MCPs (palm base, widest)
  [0,  1, 26, 18], // wrist → thumb CMC
  [0,  5, 28, 20], // wrist → index MCP
  [0,  9, 28, 20], // wrist → middle MCP
  [0, 13, 26, 18], // wrist → ring MCP
  [0, 17, 24, 16], // wrist → pinky MCP
  // Knuckle row
  [5,  9, 24, 16],
  [9, 13, 22, 14],
  [13,17, 20, 12],
  // Thumb
  [1,  2, 20, 12],
  [2,  3, 17, 10],
  [3,  4, 14,  7],
  // Index
  [5,  6, 20, 12],
  [6,  7, 17, 10],
  [7,  8, 14,  7],
  // Middle
  [9, 10, 20, 12],
  [10,11, 17, 10],
  [11,12, 14,  7],
  // Ring
  [13,14, 18, 11],
  [14,15, 15,  9],
  [15,16, 12,  6],
  // Pinky
  [17,18, 16, 10],
  [18,19, 13,  8],
  [19,20, 10,  5],
];

// All 21 landmark indices get a dot — size by tier
const DOT_RADII: Record<number, number> = {
  0: 5,    // wrist
  4: 4.5, 8: 4.5, 12: 4.5, 16: 4, 20: 4,   // fingertips
  1: 3.5, 5: 3.5, 9: 3.5, 13: 3.5, 17: 3.5, // MCPs
  2: 3, 3: 3, 6: 3, 7: 3, 10: 3, 11: 3, 14: 3, 15: 3, 18: 3, 19: 3, // PIPs + DIPs
};

// Dark fill: same dark color as inner stroke — slightly translucent "digital glove"
const FILL   = 'rgba(18, 22, 28, 0.68)';
const BORDER = 'rgba(255, 255, 255, 0.90)';
const DOT    = 'rgba(255, 255, 255, 0.95)';

const PALM_TRIS: [number, number, number][] = [
  [0,1,5],[0,5,9],[0,9,13],[0,13,17],[1,5,9],[5,9,13],[9,13,17],
];

export class HandRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lastFrame: HandFrame = { hands: [] };
  private fadeAlpha = 0;
  private connected = false;
  isGrabbing = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setConnected(v: boolean): void { this.connected = v; }

  update(frame: HandFrame): void {
    this.lastFrame = frame;
    if (frame.hands.length > 0) this.fadeAlpha = Math.min(1, this.fadeAlpha + 0.15);
  }

  render(): void {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);
    if (!this.connected || this.lastFrame.hands.length === 0) {
      this.fadeAlpha = Math.max(0, this.fadeAlpha - 0.06);
    }
    if (this.fadeAlpha <= 0.01) return;
    for (const hand of this.lastFrame.hands) {
      this.drawHand(hand.landmarks, width, height, this.fadeAlpha);
    }
  }

  private drawHand(lm: Landmark[], w: number, h: number, alpha: number): void {
    const ctx = this.ctx;
    // Mirror X — matches CSS scaleX(-1) on video element
    const pts = lm.map(l => [(1 - l.x) * w, l.y * h] as [number, number]);

    ctx.save();
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    // ── PASS 1: Palm fill (dark polygon behind all segments) ──────────
    ctx.fillStyle = `rgba(18, 22, 28, ${alpha * 0.65})`;
    for (const [a, b, c] of PALM_TRIS) {
      ctx.beginPath();
      ctx.moveTo(pts[a][0], pts[a][1]);
      ctx.lineTo(pts[b][0], pts[b][1]);
      ctx.lineTo(pts[c][0], pts[c][1]);
      ctx.closePath();
      ctx.fill();
    }

    // ── PASS 2: White border stroke (outer, with subtle glow) ─────────
    ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.70})`;
    ctx.shadowBlur  = 4;
    ctx.strokeStyle = BORDER.replace('0.90', String(alpha * 0.90));

    for (const [a, b, outer] of SEGMENTS) {
      ctx.lineWidth = outer;
      ctx.beginPath();
      ctx.moveTo(pts[a][0], pts[a][1]);
      ctx.lineTo(pts[b][0], pts[b][1]);
      ctx.stroke();
    }

    // ── PASS 3: Dark fill stroke (inner — creates the white border effect) ──
    ctx.shadowBlur  = 0;
    ctx.strokeStyle = `rgba(18, 22, 28, ${alpha * 0.72})`;

    for (const [a, b, , inner] of SEGMENTS) {
      ctx.lineWidth = inner;
      ctx.beginPath();
      ctx.moveTo(pts[a][0], pts[a][1]);
      ctx.lineTo(pts[b][0], pts[b][1]);
      ctx.stroke();
    }

    // ── PASS 4: Joint dots ────────────────────────────────────────────
    // Draw all 21 landmark positions as small white dots
    ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.60})`;
    ctx.shadowBlur  = 4;
    ctx.fillStyle   = `rgba(255, 255, 255, ${alpha * 0.95})`;

    for (let i = 0; i < 21; i++) {
      const r = DOT_RADII[i] ?? 2.5;
      const [x, y] = pts[i];
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── PASS 5: Palm cursor (pointer circle) ─────────────────────────
    // Centroid of palm landmarks 0,5,9,13,17 — same as Meta Quest pointer dot
    const cx = (pts[0][0]+pts[5][0]+pts[9][0]+pts[13][0]+pts[17][0]) / 5;
    const cy = (pts[0][1]+pts[5][1]+pts[9][1]+pts[13][1]+pts[17][1]) / 5;
    const t  = Date.now() * 0.003;
    const pr = 20 + Math.sin(t) * 1.5;

    ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.55})`;
    ctx.shadowBlur  = 6;
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.75})`;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, pr, 0, Math.PI * 2);
    ctx.stroke();

    // Tiny center dot of the cursor
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = `rgba(255, 255, 255, ${alpha * 0.80})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // ── PASS 6: Pinch indicator ───────────────────────────────────────
    const pd = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
    if (pd < 0.08) {
      const mx   = (pts[4][0] + pts[8][0]) / 2;
      const my   = (pts[4][1] + pts[8][1]) / 2;
      const pt2  = Date.now() * 0.007;
      const norm = 1 - pd / 0.08;
      const pr2  = this.isGrabbing ? 22 + Math.sin(pt2) * 5 : 14 + norm * 7;

      ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.85})`;
      ctx.shadowBlur  = this.isGrabbing ? 18 : 10;
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * (this.isGrabbing ? 0.95 : 0.80)})`;
      ctx.lineWidth   = this.isGrabbing ? 2 : 1.5;
      ctx.beginPath();
      ctx.arc(mx, my, pr2, 0, Math.PI * 2);
      ctx.stroke();

      if (this.isGrabbing) {
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(pt2 * 0.5);
        ctx.setLineDash([4, 7]);
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.35})`;
        ctx.lineWidth   = 1;
        ctx.shadowBlur  = 0;
        ctx.beginPath();
        ctx.arc(0, 0, pr2 + 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      ctx.shadowBlur  = 8;
      ctx.fillStyle   = `rgba(255, 255, 255, ${alpha * 0.95})`;
      ctx.beginPath();
      ctx.arc(mx, my, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private resize(): void {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
}
