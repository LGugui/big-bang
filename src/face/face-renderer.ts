import type { Landmark } from '../hands/ws-hand-client';

// MediaPipe FaceLandmarker 478-point model key indices

// Outer face silhouette (ordered for polygon fill)
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

// Eye contours (ordered loops)
const LEFT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
const RIGHT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];

// Eyebrows
const LEFT_BROW  = [336, 296, 334, 293, 300, 276, 283, 282, 295, 285];
const RIGHT_BROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];

// Lips (outer ring ordered for polygon)
const LIPS_OUTER = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409,
  291, 375, 321, 405, 314, 17, 84, 181, 91, 146,
];

// Iris centers
const IRIS_LEFT  = 468;
const IRIS_RIGHT = 472;

export class FaceRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offCanvas: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private lastLandmarks: Landmark[] | null = null;
  private fadeAlpha = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas    = canvas;
    this.ctx       = canvas.getContext('2d')!;
    this.offCanvas = document.createElement('canvas');
    this.offCtx    = this.offCanvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  update(landmarks: Landmark[] | null): void {
    this.lastLandmarks = landmarks;
    if (landmarks) this.fadeAlpha = Math.min(1, this.fadeAlpha + 0.12);
  }

  render(): void {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    if (!this.lastLandmarks) {
      this.fadeAlpha = Math.max(0, this.fadeAlpha - 0.05);
    }
    if (this.fadeAlpha <= 0.01) return;

    this.drawFace(this.lastLandmarks!, width, height, this.fadeAlpha);
  }

  private drawFace(lm: Landmark[], w: number, h: number, alpha: number): void {
    const ctx = this.ctx;
    const off = this.offCtx;

    // Mirror X — matches CSS scaleX(-1) on video
    const pts = lm.map(l => [(1 - l.x) * w, l.y * h] as [number, number]);

    // ── Build unified dark face mesh on offscreen ─────────────────────
    off.clearRect(0, 0, w, h);

    // Face oval filled polygon
    off.fillStyle   = '#0e1218';
    off.strokeStyle = '#0e1218';
    off.lineCap = 'round';
    off.lineJoin = 'round';

    off.beginPath();
    off.moveTo(pts[FACE_OVAL[0]][0], pts[FACE_OVAL[0]][1]);
    for (let i = 1; i < FACE_OVAL.length; i++) {
      off.lineTo(pts[FACE_OVAL[i]][0], pts[FACE_OVAL[i]][1]);
    }
    off.closePath();
    off.fill();

    // Cut out eye holes (destination-out compositing = transparent "holes")
    off.globalCompositeOperation = 'destination-out';

    const cutEye = (indices: number[]) => {
      off.beginPath();
      off.moveTo(pts[indices[0]][0], pts[indices[0]][1]);
      for (let i = 1; i < indices.length; i++) {
        off.lineTo(pts[indices[i]][0], pts[indices[i]][1]);
      }
      off.closePath();
      off.fill();
    };
    cutEye(LEFT_EYE);
    cutEye(RIGHT_EYE);

    // Cut out mouth (lips inner opening)
    const MOUTH_OPEN = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
    cutEye(MOUTH_OPEN);

    off.globalCompositeOperation = 'source-over';

    // ── Composite face onto main canvas with white border shadow ──────
    ctx.save();
    ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.85})`;
    ctx.shadowBlur  = 5;
    ctx.globalAlpha = alpha * 0.72;
    ctx.drawImage(this.offCanvas, 0, 0);
    ctx.restore();

    // ── Eye contours ──────────────────────────────────────────────────
    const drawContour = (indices: number[], close = true, lw = 1.5, a = alpha * 0.85) => {
      ctx.beginPath();
      ctx.moveTo(pts[indices[0]][0], pts[indices[0]][1]);
      for (let i = 1; i < indices.length; i++) {
        ctx.lineTo(pts[indices[i]][0], pts[indices[i]][1]);
      }
      if (close) ctx.closePath();
      ctx.lineWidth   = lw;
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.stroke();
    };

    ctx.save();
    ctx.lineCap    = 'round';
    ctx.lineJoin   = 'round';
    ctx.shadowColor = `rgba(255,255,255,${alpha * 0.5})`;
    ctx.shadowBlur  = 3;

    drawContour(LEFT_EYE,  true, 1.5);
    drawContour(RIGHT_EYE, true, 1.5);
    drawContour(LEFT_BROW,  false, 1.2, alpha * 0.6);
    drawContour(RIGHT_BROW, false, 1.2, alpha * 0.6);
    drawContour(LIPS_OUTER, true, 1.5);

    ctx.restore();

    // ── Iris dots ─────────────────────────────────────────────────────
    if (lm.length > IRIS_LEFT) {
      ctx.save();
      ctx.shadowColor = `rgba(255,255,255,${alpha * 0.6})`;
      ctx.shadowBlur  = 5;
      ctx.fillStyle   = `rgba(255,255,255,${alpha * 0.90})`;

      for (const idx of [IRIS_LEFT, IRIS_RIGHT]) {
        if (lm[idx]) {
          const [ix, iy] = pts[idx];
          ctx.beginPath();
          ctx.arc(ix, iy, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
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
