import type { HandFrame, Landmark } from './ws-hand-client';

// [fromIdx, toIdx, outerPx] — outer width = full finger/palm capsule size
const SEGMENTS: [number, number, number][] = [
  // Wrist → MCPs
  [0,  1, 28],
  [0,  5, 32],
  [0,  9, 32],
  [0, 13, 30],
  [0, 17, 26],
  // Knuckle row
  [5,  9, 28],
  [9, 13, 26],
  [13,17, 24],
  // Thumb
  [1,  2, 24],
  [2,  3, 20],
  [3,  4, 16],
  // Index
  [5,  6, 22],
  [6,  7, 19],
  [7,  8, 16],
  // Middle
  [9, 10, 22],
  [10,11, 19],
  [11,12, 16],
  // Ring
  [13,14, 20],
  [14,15, 17],
  [15,16, 14],
  // Pinky
  [17,18, 18],
  [18,19, 15],
  [19,20, 12],
];

// Palm + webbing fill triangles — close all inter-finger gaps
const FILL_TRIS: [number, number, number][] = [
  [0,1,5],[0,5,9],[0,9,13],[0,13,17],
  [1,5,9],[5,9,13],[9,13,17],
  // Inter-finger webbing
  [1,2,5],[2,5,6],
  [5,6,9],[6,9,10],
  [9,10,13],[10,13,14],
  [13,14,17],[14,17,18],
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
    this.canvas    = canvas;
    this.ctx       = canvas.getContext('2d')!;
    this.offCanvas = document.createElement('canvas');
    this.offCtx    = this.offCanvas.getContext('2d')!;
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
    const off    = this.offCtx;
    const pts    = lm.map(l => [(1 - l.x) * w, l.y * h] as [number, number]);

    // ── Build unified dark hand on offscreen (opaque, fully merged) ───
    // source-over compositing merges all overlapping strokes into
    // ONE solid shape — no gaps, no internal lines.
    off.clearRect(0, 0, w, h);
    off.lineCap    = 'round';
    off.lineJoin   = 'round';
    off.fillStyle  = '#0e1218';
    off.strokeStyle = '#0e1218';

    for (const [a, b, c] of FILL_TRIS) {
      off.beginPath();
      off.moveTo(pts[a][0], pts[a][1]);
      off.lineTo(pts[b][0], pts[b][1]);
      off.lineTo(pts[c][0], pts[c][1]);
      off.closePath();
      off.fill();
    }
    for (const [a, b, outer] of SEGMENTS) {
      off.lineWidth = outer;
      off.beginPath();
      off.moveTo(pts[a][0], pts[a][1]);
      off.lineTo(pts[b][0], pts[b][1]);
      off.stroke();
    }

    // ── Composite onto main canvas ────────────────────────────────────
    // KEY: canvas shadowBlur on drawImage applies to the OUTER PERIMETER
    // of the entire unified shape — white glow ONLY on external edges,
    // zero internal lines. Identical to Meta Quest hand mesh rendering.
    ctx.save();
    ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.92})`;
    ctx.shadowBlur  = 5;
    ctx.globalAlpha = alpha * 0.78;
    ctx.drawImage(this.offCanvas, 0, 0);
    ctx.restore();

    // ── Joint dots ────────────────────────────────────────────────────
    const dotR = [5, 3,3,3,4.5, 3,3,3,4.5, 3,3,3,4.5, 3,3,3,4, 3,3,3,4];
    ctx.save();
    ctx.shadowColor = `rgba(255,255,255,${alpha * 0.45})`;
    ctx.shadowBlur  = 3;
    ctx.fillStyle   = `rgba(255,255,255,${alpha * 0.90})`;
    for (let i = 0; i < 21; i++) {
      ctx.beginPath();
      ctx.arc(pts[i][0], pts[i][1], dotR[i], 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ── Palm cursor ───────────────────────────────────────────────────
    const cx = (pts[0][0]+pts[5][0]+pts[9][0]+pts[13][0]+pts[17][0]) / 5;
    const cy = (pts[0][1]+pts[5][1]+pts[9][1]+pts[13][1]+pts[17][1]) / 5;
    const t  = Date.now() * 0.003;
    const cr = 20 + Math.sin(t) * 1.5;

    ctx.save();
    ctx.shadowColor = `rgba(255,255,255,${alpha * 0.55})`;
    ctx.shadowBlur  = 7;
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.80})`;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle  = `rgba(255,255,255,${alpha * 0.85})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── Pinch indicator ───────────────────────────────────────────────
    const pd = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
    if (pd < 0.08) {
      const mx   = (pts[4][0] + pts[8][0]) / 2;
      const my   = (pts[4][1] + pts[8][1]) / 2;
      const pt2  = Date.now() * 0.007;
      const pr   = this.isGrabbing ? 22 + Math.sin(pt2) * 5 : 14 + (1 - pd / 0.08) * 7;

      ctx.save();
      ctx.lineCap     = 'round';
      ctx.shadowColor = `rgba(255,255,255,${alpha * 0.85})`;
      ctx.shadowBlur  = this.isGrabbing ? 18 : 10;
      ctx.strokeStyle = `rgba(255,255,255,${alpha * (this.isGrabbing ? 0.95 : 0.80)})`;
      ctx.lineWidth   = this.isGrabbing ? 2 : 1.5;
      ctx.beginPath();
      ctx.arc(mx, my, pr, 0, Math.PI * 2);
      ctx.stroke();

      if (this.isGrabbing) {
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(pt2 * 0.5);
        ctx.setLineDash([4, 7]);
        ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.35})`;
        ctx.lineWidth   = 1;
        ctx.shadowBlur  = 0;
        ctx.beginPath();
        ctx.arc(0, 0, pr + 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      ctx.shadowBlur = 8;
      ctx.fillStyle  = `rgba(255,255,255,${alpha * 0.95})`;
      ctx.beginPath();
      ctx.arc(mx, my, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private resize(): void {
    this.canvas.width     = window.innerWidth;
    this.canvas.height    = window.innerHeight;
    this.offCanvas.width  = window.innerWidth;
    this.offCanvas.height = window.innerHeight;
  }
}
