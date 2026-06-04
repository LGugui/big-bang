import type { HandFrame, Landmark } from './ws-hand-client';

const THUMB_CHAIN  = [[1,2,6],[2,3,5],[3,4,4]] as const;
const INDEX_CHAIN  = [[5,6,7],[6,7,6],[7,8,5]] as const;
const MIDDLE_CHAIN = [[9,10,7],[10,11,6],[11,12,5]] as const;
const RING_CHAIN   = [[13,14,6],[14,15,5],[15,16,4]] as const;
const PINKY_CHAIN  = [[17,18,5],[18,19,4],[19,20,3]] as const;

const FINGER_CHAINS = [THUMB_CHAIN, INDEX_CHAIN, MIDDLE_CHAIN, RING_CHAIN, PINKY_CHAIN];

const PALM_TRIS: [number, number, number][] = [
  [0,1,5],[0,5,9],[0,9,13],[0,13,17],[1,5,9],[5,9,13],[9,13,17],[13,17,0],
];

const PALM_LINES: [number, number, number][] = [
  [0,1,5],[0,5,5],[0,9,5],[0,13,5],[0,17,5],[5,9,4],[9,13,4],[13,17,4],
];

const TIPS = new Set([4, 8, 12, 16, 20]);
const KNUCKLES = new Set([5, 9, 13, 17, 1]);

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
    // Mirror X to match CSS scaleX(-1) on video
    const pts = lm.map(l => [(1 - l.x) * w, l.y * h] as [number, number]);

    // Depth factor per landmark: closer = brighter
    const df = (i: number) => Math.max(0.55, 1 - lm[i].z * 2.5);
    const dfSeg = (a: number, b: number) => Math.max(0.55, 1 - ((lm[a].z + lm[b].z) / 2) * 2.5);

    // ── PASS 1: Palm mesh fill ──────────────────────────────────────
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    // Radial gradient centered at palm base (landmark 9)
    const [px, py] = pts[9];
    const palmGrad = ctx.createRadialGradient(px, py, 4, px, py, 100);
    palmGrad.addColorStop(0, `rgba(30, 160, 255, ${alpha * 0.18})`);
    palmGrad.addColorStop(0.6, `rgba(10, 100, 220, ${alpha * 0.09})`);
    palmGrad.addColorStop(1, `rgba(0, 60, 180, ${alpha * 0.02})`);

    ctx.fillStyle = palmGrad;
    for (const [a, b, c] of PALM_TRIS) {
      ctx.beginPath();
      ctx.moveTo(pts[a][0], pts[a][1]);
      ctx.lineTo(pts[b][0], pts[b][1]);
      ctx.lineTo(pts[c][0], pts[c][1]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // ── PASS 2: Outer segment glow (wide, faint, no shadow) ─────────
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha * 0.18;

    const drawSegOuter = (a: number, b: number, width: number) => {
      ctx.lineWidth = width * 5;
      ctx.strokeStyle = 'rgba(0, 160, 255, 1)';
      ctx.beginPath();
      ctx.moveTo(pts[a][0], pts[a][1]);
      ctx.lineTo(pts[b][0], pts[b][1]);
      ctx.stroke();
    };

    for (const [a, b] of PALM_LINES) drawSegOuter(a, b, 5);
    for (const chain of FINGER_CHAINS)
      for (const [a, b, w_] of chain) drawSegOuter(a, b, w_);
    ctx.restore();

    // ── PASS 3: Mid glow (medium, cyan, soft shadow) ─────────────────
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0, 190, 255, 0.9)';
    ctx.shadowBlur = 14;

    const drawSegMid = (a: number, b: number, width: number) => {
      const d = dfSeg(a, b);
      ctx.lineWidth = width * 2.2;
      ctx.strokeStyle = `rgba(60, 200, 255, ${alpha * 0.45 * d})`;
      ctx.beginPath();
      ctx.moveTo(pts[a][0], pts[a][1]);
      ctx.lineTo(pts[b][0], pts[b][1]);
      ctx.stroke();
    };

    for (const [a, b, w_] of PALM_LINES) drawSegMid(a, b, w_);
    for (const chain of FINGER_CHAINS)
      for (const [a, b, w_] of chain) drawSegMid(a, b, w_);
    ctx.restore();

    // ── PASS 4: Core segments (thin, bright white) ───────────────────
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(200, 240, 255, 1)';
    ctx.shadowBlur = 6;

    const drawSegCore = (a: number, b: number, width: number) => {
      const d = dfSeg(a, b);
      ctx.lineWidth = Math.max(1, width * 0.65);
      ctx.strokeStyle = `rgba(230, 248, 255, ${alpha * 0.92 * d})`;
      ctx.beginPath();
      ctx.moveTo(pts[a][0], pts[a][1]);
      ctx.lineTo(pts[b][0], pts[b][1]);
      ctx.stroke();
    };

    for (const [a, b, w_] of PALM_LINES) drawSegCore(a, b, w_);
    for (const chain of FINGER_CHAINS)
      for (const [a, b, w_] of chain) drawSegCore(a, b, w_);
    ctx.restore();

    // ── PASS 5: Joints ────────────────────────────────────────────────
    ctx.save();

    for (let i = 0; i < 21; i++) {
      const [x, y] = pts[i];
      const isTip = TIPS.has(i);
      const isKnuckle = KNUCKLES.has(i);
      const isWrist = i === 0;
      const d = df(i);

      const rInner = isTip ? 6.5 : (isWrist ? 5.5 : isKnuckle ? 4.5 : 3);
      const rOuter = rInner + 3;

      // Outer halo ring
      ctx.shadowColor = isTip ? 'rgba(0, 240, 255, 1)' : 'rgba(0, 160, 255, 0.8)';
      ctx.shadowBlur = isTip ? 22 : 14;
      ctx.strokeStyle = isTip
        ? `rgba(0, 220, 255, ${alpha * d * 0.85})`
        : `rgba(80, 190, 255, ${alpha * d * 0.65})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, rOuter, 0, Math.PI * 2);
      ctx.stroke();

      // Inner filled disc
      ctx.shadowBlur = isTip ? 16 : 8;
      const innerGrad = ctx.createRadialGradient(x, y, 0, x, y, rInner);
      innerGrad.addColorStop(0, `rgba(255, 255, 255, ${alpha * d * (isTip ? 1 : 0.9)})`);
      innerGrad.addColorStop(0.5, `rgba(160, 230, 255, ${alpha * d * 0.85})`);
      innerGrad.addColorStop(1, `rgba(60, 180, 255, ${alpha * d * 0.5})`);
      ctx.fillStyle = innerGrad;
      ctx.beginPath();
      ctx.arc(x, y, rInner, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ── PASS 6: Pinch indicator ────────────────────────────────────────
    const pinchDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
    if (pinchDist < 0.08) {
      const mx = (pts[4][0] + pts[8][0]) / 2;
      const my = (pts[4][1] + pts[8][1]) / 2;
      const t = Date.now() * 0.007;
      const intensity = Math.max(0, 1 - pinchDist / 0.08);
      const pulse = this.isGrabbing ? 18 + Math.sin(t) * 5 : 13 + intensity * 5;

      ctx.save();

      // Outer ring — animated scan line
      ctx.shadowColor = this.isGrabbing ? 'rgba(0,255,180,1)' : 'rgba(0,220,255,1)';
      ctx.shadowBlur = this.isGrabbing ? 35 : 22;
      ctx.strokeStyle = this.isGrabbing
        ? `rgba(0, 255, 180, ${alpha * 0.95})`
        : `rgba(0, 220, 255, ${alpha * 0.9})`;
      ctx.lineWidth = this.isGrabbing ? 2.5 : 1.8;
      ctx.beginPath();
      ctx.arc(mx, my, pulse, 0, Math.PI * 2);
      ctx.stroke();

      // Second rotating ring when grabbing
      if (this.isGrabbing) {
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(t * 0.5);
        ctx.strokeStyle = `rgba(0, 255, 220, ${alpha * 0.4})`;
        ctx.lineWidth = 1;
        ctx.shadowBlur = 10;
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, pulse + 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Radial fill
      const fillGrad = ctx.createRadialGradient(mx, my, 0, mx, my, pulse);
      fillGrad.addColorStop(0, this.isGrabbing
        ? `rgba(0, 255, 180, ${alpha * 0.35})`
        : `rgba(0, 200, 255, ${alpha * 0.2})`);
      fillGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fillGrad;
      ctx.beginPath();
      ctx.arc(mx, my, pulse, 0, Math.PI * 2);
      ctx.fill();

      // Center bright dot
      ctx.shadowBlur = 12;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.95})`;
      ctx.beginPath();
      ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
}
