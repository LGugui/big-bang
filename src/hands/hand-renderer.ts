import type { HandFrame, Landmark } from './ws-hand-client';

// [fromIdx, toIdx, outerPx, innerPx]
const SEGMENTS: [number, number, number, number][] = [
  // Palm connections
  [0, 1, 24, 17], [0, 5, 24, 17], [0, 9, 24, 17], [0, 13, 24, 17], [0, 17, 24, 17],
  [5, 9, 22, 15], [9, 13, 22, 15], [13, 17, 22, 15],
  // Thumb
  [1, 2, 20, 13], [2, 3, 17, 11], [3, 4, 14, 8],
  // Index
  [5, 6, 20, 13], [6, 7, 17, 11], [7, 8, 14, 8],
  // Middle
  [9, 10, 20, 13], [10, 11, 17, 11], [11, 12, 14, 8],
  // Ring
  [13, 14, 18, 12], [14, 15, 15, 9],  [15, 16, 12, 7],
  // Pinky
  [17, 18, 16, 10], [18, 19, 13, 8],  [19, 20, 10, 5],
];

const PALM_TRIS: [number, number, number][] = [
  [0,1,5],[0,5,9],[0,9,13],[0,13,17],[1,5,9],[5,9,13],[9,13,17],
];

const TIPS = [4, 8, 12, 16, 20];

// Knuckle joints worth highlighting
const KNUCKLES = [0, 1, 5, 9, 13, 17];

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
    const pts = lm.map(l => [(1 - l.x) * w, l.y * h] as [number, number]);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // ── PASS 1: Palm dark fill ──────────────────────────────────────
    ctx.fillStyle = `rgba(10, 10, 14, ${alpha * 0.78})`;
    for (const [a, b, c] of PALM_TRIS) {
      ctx.beginPath();
      ctx.moveTo(pts[a][0], pts[a][1]);
      ctx.lineTo(pts[b][0], pts[b][1]);
      ctx.lineTo(pts[c][0], pts[c][1]);
      ctx.closePath();
      ctx.fill();
    }

    // ── PASS 2: Outer white glow strokes ─────────────────────────────
    ctx.shadowColor = 'rgba(255, 255, 255, 0.85)';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.92})`;

    for (const [a, b, outer] of SEGMENTS) {
      ctx.lineWidth = outer;
      ctx.beginPath();
      ctx.moveTo(pts[a][0], pts[a][1]);
      ctx.lineTo(pts[b][0], pts[b][1]);
      ctx.stroke();
    }

    // ── PASS 3: Inner dark strokes (creates the outline effect) ──────
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(10, 10, 14, ${alpha * 0.82})`;

    for (const [a, b, , inner] of SEGMENTS) {
      ctx.lineWidth = inner;
      ctx.beginPath();
      ctx.moveTo(pts[a][0], pts[a][1]);
      ctx.lineTo(pts[b][0], pts[b][1]);
      ctx.stroke();
    }

    // ── PASS 4: Tip caps — dark circle with white ring ────────────────
    for (const i of TIPS) {
      const [x, y] = pts[i];
      const r = 9;

      // White outer cap
      ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      // Dark inner cap
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(10, 10, 14, ${alpha * 0.85})`;
      ctx.beginPath();
      ctx.arc(x, y, r - 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── PASS 5: Knuckle dots ─────────────────────────────────────────
    ctx.shadowBlur = 0;
    for (const i of KNUCKLES) {
      const [x, y] = pts[i];
      const r = i === 0 ? 5 : 3.5;

      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.75})`;
      ctx.shadowColor = 'rgba(255,255,255,0.6)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(10, 10, 14, ${alpha * 0.8})`;
      ctx.beginPath();
      ctx.arc(x, y, r - 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── PASS 6: Palm pointer cursor ──────────────────────────────────
    // Centroid of palm landmarks 0,5,9,13,17
    const palmCx = (pts[0][0] + pts[5][0] + pts[9][0] + pts[13][0] + pts[17][0]) / 5;
    const palmCy = (pts[0][1] + pts[5][1] + pts[9][1] + pts[13][1] + pts[17][1]) / 5;
    const t = Date.now() * 0.004;
    const cursorR = 8 + Math.sin(t) * 1.5;

    ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.65})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(palmCx, palmCy, cursorR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.55})`;
    ctx.beginPath();
    ctx.arc(palmCx, palmCy, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // ── PASS 7: Pinch indicator ───────────────────────────────────────
    const pinchDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
    if (pinchDist < 0.08) {
      const mx = (pts[4][0] + pts[8][0]) / 2;
      const my = (pts[4][1] + pts[8][1]) / 2;
      const intensity = 1 - pinchDist / 0.08;
      const pt = Date.now() * 0.007;
      const pulse = this.isGrabbing ? 20 + Math.sin(pt) * 5 : 14 + intensity * 6;

      // Outer ring
      ctx.shadowColor = 'rgba(255, 255, 255, 1)';
      ctx.shadowBlur = this.isGrabbing ? 28 : 18;
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * (this.isGrabbing ? 0.95 : 0.8)})`;
      ctx.lineWidth = this.isGrabbing ? 2 : 1.5;
      ctx.beginPath();
      ctx.arc(mx, my, pulse, 0, Math.PI * 2);
      ctx.stroke();

      // Rotating dashed ring when grabbing
      if (this.isGrabbing) {
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(pt * 0.6);
        ctx.setLineDash([5, 8]);
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.4})`;
        ctx.lineWidth = 1;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(0, 0, pulse + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Center dot
      ctx.shadowBlur = 10;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.95})`;
      ctx.beginPath();
      ctx.arc(mx, my, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
}
