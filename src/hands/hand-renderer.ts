import type { HandFrame, Landmark } from './ws-hand-client';

// [fromIdx, toIdx, outerPx, innerPx] — border = (outer-inner)/2 ≈ 4px each side
const SEGMENTS: [number, number, number, number][] = [
  // Wrist → MCPs (widest, form the palm base)
  [0,  1, 28, 20],
  [0,  5, 30, 22],
  [0,  9, 30, 22],
  [0, 13, 28, 20],
  [0, 17, 26, 18],
  // Knuckle row (between MCPs)
  [5,  9, 26, 18],
  [9, 13, 24, 16],
  [13,17, 22, 14],
  // Thumb
  [1,  2, 22, 14],
  [2,  3, 18, 10],
  [3,  4, 15,  7],
  // Index
  [5,  6, 22, 14],
  [6,  7, 18, 10],
  [7,  8, 15,  7],
  // Middle
  [9, 10, 22, 14],
  [10,11, 18, 10],
  [11,12, 15,  7],
  // Ring
  [13,14, 20, 12],
  [14,15, 16,  9],
  [15,16, 13,  6],
  // Pinky
  [17,18, 18, 10],
  [18,19, 14,  7],
  [19,20, 11,  5],
];

// Palm + webbing triangles — fill between fingers to create a solid glove shape
const FILL_TRIS: [number, number, number][] = [
  // Palm base
  [0,1,5],[0,5,9],[0,9,13],[0,13,17],
  // Upper palm
  [1,5,9],[5,9,13],[9,13,17],
  // Webbing between fingers (fills inter-finger gaps)
  [1,2,5],[2,5,6],     // thumb ↔ index
  [5,6,9],[6,9,10],    // index ↔ middle
  [9,10,13],[10,13,14],// middle ↔ ring
  [13,14,17],[14,17,18],// ring ↔ pinky
];

export class HandRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offCanvas: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private lastFrame: HandFrame = { hands: [] };
  private fadeAlpha = 0;
  private connected = false;
  isGrabbing = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.offCanvas = document.createElement('canvas');
    this.offCtx = this.offCanvas.getContext('2d')!;
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
    const ctx    = this.ctx;
    const offCtx = this.offCtx;
    // Mirror X — matches CSS scaleX(-1) on video
    const pts = lm.map(l => [(1 - l.x) * w, l.y * h] as [number, number]);

    // ── Build unified dark hand on offscreen canvas ───────────────────
    // Drawing on a separate canvas lets source-over compositing merge all
    // segments into ONE unified opaque shape — no visible internal lines.
    offCtx.clearRect(0, 0, w, h);
    offCtx.lineCap   = 'round';
    offCtx.lineJoin  = 'round';
    offCtx.fillStyle  = '#11151b';
    offCtx.strokeStyle = '#11151b';

    // Fill palm + webbing
    for (const [a, b, c] of FILL_TRIS) {
      offCtx.beginPath();
      offCtx.moveTo(pts[a][0], pts[a][1]);
      offCtx.lineTo(pts[b][0], pts[b][1]);
      offCtx.lineTo(pts[c][0], pts[c][1]);
      offCtx.closePath();
      offCtx.fill();
    }
    // Segment bodies (inner width — sits inside the white border)
    for (const [a, b, , inner] of SEGMENTS) {
      offCtx.lineWidth = inner;
      offCtx.beginPath();
      offCtx.moveTo(pts[a][0], pts[a][1]);
      offCtx.lineTo(pts[b][0], pts[b][1]);
      offCtx.stroke();
    }

    // ── PASS 1: White outer strokes (border + glow) ───────────────────
    ctx.save();
    ctx.lineCap    = 'round';
    ctx.lineJoin   = 'round';
    ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.65})`;
    ctx.shadowBlur  = 4;
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.88})`;

    for (const [a, b, outer] of SEGMENTS) {
      ctx.lineWidth = outer;
      ctx.beginPath();
      ctx.moveTo(pts[a][0], pts[a][1]);
      ctx.lineTo(pts[b][0], pts[b][1]);
      ctx.stroke();
    }
    ctx.restore();

    // ── PASS 2: Composite dark unified shape (covers interior white) ───
    // globalAlpha gives the "translucent glove" feel — real hand slightly
    // visible underneath, just like Meta Quest passthrough rendering.
    ctx.save();
    ctx.globalAlpha = alpha * 0.80;
    ctx.drawImage(this.offCanvas, 0, 0);
    ctx.restore();

    // ── PASS 3: Joint dots ────────────────────────────────────────────
    ctx.save();
    ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.50})`;
    ctx.shadowBlur  = 4;
    ctx.fillStyle   = `rgba(255, 255, 255, ${alpha * 0.92})`;

    const dotR = [
      5,                               // 0 wrist
      3, 3, 3, 4,                      // 1–4 thumb
      3, 3, 3, 4,                      // 5–8 index
      3, 3, 3, 4,                      // 9–12 middle
      3, 3, 3, 3.5,                    // 13–16 ring
      3, 3, 3, 3.5,                    // 17–20 pinky
    ];
    for (let i = 0; i < 21; i++) {
      const [x, y] = pts[i];
      ctx.beginPath();
      ctx.arc(x, y, dotR[i], 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ── PASS 4: Palm cursor (raycasting pointer — always visible) ─────
    const cx = (pts[0][0]+pts[5][0]+pts[9][0]+pts[13][0]+pts[17][0]) / 5;
    const cy = (pts[0][1]+pts[5][1]+pts[9][1]+pts[13][1]+pts[17][1]) / 5;
    const t  = Date.now() * 0.003;
    const cr = 20 + Math.sin(t) * 1.5;

    ctx.save();
    ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.55})`;
    ctx.shadowBlur  = 7;
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.80})`;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle  = `rgba(255, 255, 255, ${alpha * 0.85})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── PASS 5: Pinch indicator ───────────────────────────────────────
    const pd = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
    if (pd < 0.08) {
      const mx   = (pts[4][0] + pts[8][0]) / 2;
      const my   = (pts[4][1] + pts[8][1]) / 2;
      const pt2  = Date.now() * 0.007;
      const norm = 1 - pd / 0.08;
      const pr   = this.isGrabbing ? 22 + Math.sin(pt2) * 5 : 14 + norm * 7;

      ctx.save();
      ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.85})`;
      ctx.shadowBlur  = this.isGrabbing ? 18 : 10;
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * (this.isGrabbing ? 0.95 : 0.80)})`;
      ctx.lineWidth   = this.isGrabbing ? 2 : 1.5;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.arc(mx, my, pr, 0, Math.PI * 2);
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
        ctx.arc(0, 0, pr + 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      ctx.shadowBlur = 8;
      ctx.fillStyle  = `rgba(255, 255, 255, ${alpha * 0.95})`;
      ctx.beginPath();
      ctx.arc(mx, my, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private resize(): void {
    this.canvas.width       = window.innerWidth;
    this.canvas.height      = window.innerHeight;
    this.offCanvas.width    = window.innerWidth;
    this.offCanvas.height   = window.innerHeight;
  }
}
