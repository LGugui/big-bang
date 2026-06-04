import type { HandFrame, Landmark } from './ws-hand-client';

// Segmentos com espessura por posição (base→ponta)
const THUMB_CHAIN  = [[1,2,6],[2,3,5],[3,4,4]] as const;
const INDEX_CHAIN  = [[5,6,6],[6,7,5],[7,8,4]] as const;
const MIDDLE_CHAIN = [[9,10,6],[10,11,5],[11,12,4]] as const;
const RING_CHAIN   = [[13,14,5],[14,15,4],[15,16,3]] as const;
const PINKY_CHAIN  = [[17,18,4],[18,19,3],[19,20,2]] as const;

const FINGER_CHAINS = [THUMB_CHAIN, INDEX_CHAIN, MIDDLE_CHAIN, RING_CHAIN, PINKY_CHAIN];

// Palma — triângulos de preenchimento
const PALM_TRIS: [number, number, number][] = [
  [0,1,5],[0,5,9],[0,9,13],[0,13,17],[5,9,13],[9,13,17],
];

// Webbing entre dedos
const WEBS: [number, number, number][] = [
  [1,5,9],[5,9,13],[9,13,17],
];

// Juntas dos dedos (conexões da palma)
const PALM_LINES: [number, number][] = [
  [0,1],[0,5],[0,9],[0,13],[0,17],[5,9],[9,13],[13,17],
];

const TIPS = new Set([4, 8, 12, 16, 20]);

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
    if (frame.hands.length > 0) {
      this.fadeAlpha = Math.min(1, this.fadeAlpha + 0.15);
    }
  }

  render(): void {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    if (!this.connected) { this.fadeAlpha = Math.max(0, this.fadeAlpha - 0.08); }
    if (this.lastFrame.hands.length === 0) { this.fadeAlpha = Math.max(0, this.fadeAlpha - 0.06); }
    if (this.fadeAlpha <= 0.01) return;

    for (const hand of this.lastFrame.hands) {
      this.drawHand(hand.landmarks, width, height, this.fadeAlpha);
    }
  }

  private drawHand(lm: Landmark[], w: number, h: number, alpha: number): void {
    // Espelhar X para alinhar com CSS scaleX(-1) do vídeo
    const pts = lm.map(l => [(1 - l.x) * w, l.y * h] as [number, number]);

    // ── Palm fill (ghostly translucent) ──────────────────────────────
    this.ctx.save();
    for (const [a, b, c] of PALM_TRIS) {
      this.ctx.beginPath();
      this.ctx.moveTo(pts[a][0], pts[a][1]);
      this.ctx.lineTo(pts[b][0], pts[b][1]);
      this.ctx.lineTo(pts[c][0], pts[c][1]);
      this.ctx.closePath();
      this.ctx.fillStyle = `rgba(255,255,255,${alpha * 0.07})`;
      this.ctx.fill();
    }
    // Webbing
    for (const [a, b, c] of WEBS) {
      this.ctx.beginPath();
      this.ctx.moveTo(pts[a][0], pts[a][1]);
      this.ctx.lineTo(pts[b][0], pts[b][1]);
      this.ctx.lineTo(pts[c][0], pts[c][1]);
      this.ctx.closePath();
      this.ctx.fillStyle = `rgba(255,255,255,${alpha * 0.04})`;
      this.ctx.fill();
    }
    this.ctx.restore();

    // ── Palm lines ────────────────────────────────────────────────────
    this.ctx.save();
    this.ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.55})`;
    this.ctx.lineWidth = 2.5;
    this.ctx.shadowColor = 'rgba(255,255,255,0.9)';
    this.ctx.shadowBlur = 10;
    this.ctx.lineCap = 'round';
    for (const [a, b] of PALM_LINES) {
      this.ctx.beginPath();
      this.ctx.moveTo(pts[a][0], pts[a][1]);
      this.ctx.lineTo(pts[b][0], pts[b][1]);
      this.ctx.stroke();
    }
    this.ctx.restore();

    // ── Finger segments com espessura variada ─────────────────────────
    for (const chain of FINGER_CHAINS) {
      for (const [a, b, w_] of chain) {
        const depth = (lm[a].z + lm[b].z) / 2;
        const depthFactor = Math.max(0.5, 1 - depth * 3);
        this.ctx.save();
        this.ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.85 * depthFactor})`;
        this.ctx.lineWidth = w_ * depthFactor;
        this.ctx.shadowColor = 'rgba(255,255,255,1)';
        this.ctx.shadowBlur = 12 + w_ * 2;
        this.ctx.lineCap = 'round';
        this.ctx.beginPath();
        this.ctx.moveTo(pts[a][0], pts[a][1]);
        this.ctx.lineTo(pts[b][0], pts[b][1]);
        this.ctx.stroke();
        this.ctx.restore();
      }
    }

    // ── Joint dots ────────────────────────────────────────────────────
    for (let i = 0; i < 21; i++) {
      const [x, y] = pts[i];
      const isTip = TIPS.has(i);
      const r = isTip ? 5 : 3;
      const depth = lm[i].z;
      const bright = Math.max(0.5, 1 - depth * 3);

      this.ctx.save();
      this.ctx.shadowColor = 'rgba(255,255,255,1)';
      this.ctx.shadowBlur = isTip ? 18 : 8;
      this.ctx.fillStyle = `rgba(255,255,255,${alpha * bright * (isTip ? 1 : 0.8)})`;
      this.ctx.beginPath();
      this.ctx.arc(x, y, r, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    // ── Pinch indicator ───────────────────────────────────────────────
    const pinchDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
    if (pinchDist < 0.07) {
      const mx = (pts[4][0] + pts[8][0]) / 2;
      const my = (pts[4][1] + pts[8][1]) / 2;
      const pulse = this.isGrabbing ? 14 + Math.sin(Date.now() * 0.01) * 4 : 10;

      this.ctx.save();
      this.ctx.shadowColor = this.isGrabbing ? '#00FFCC' : 'rgba(255,255,255,0.9)';
      this.ctx.shadowBlur = this.isGrabbing ? 25 : 15;
      this.ctx.strokeStyle = this.isGrabbing
        ? `rgba(0,255,204,${alpha})`
        : `rgba(255,255,255,${alpha * 0.9})`;
      this.ctx.lineWidth = this.isGrabbing ? 3 : 2;
      this.ctx.beginPath();
      this.ctx.arc(mx, my, pulse, 0, Math.PI * 2);
      this.ctx.stroke();

      // Fill central
      this.ctx.fillStyle = this.isGrabbing
        ? `rgba(0,255,204,${alpha * 0.25})`
        : `rgba(255,255,255,${alpha * 0.15})`;
      this.ctx.fill();
      this.ctx.restore();
    }
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
}
