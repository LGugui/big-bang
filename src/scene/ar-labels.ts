import type { DetectedObject } from './scene-analyzer';
import type { SegmentLabel } from './scene-segmenter';

export class ArLabels {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private objects: DetectedObject[] = [];
  private segLabels: SegmentLabel[] = [];
  private scanMode = false;
  private scanTarget: DetectedObject | null = null;
  private scanProgress = 0;
  private scanAnimating = false;
  onScanRequest?: (obj: DetectedObject) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('click', this.onClick);
  }

  setScanMode(on: boolean): void {
    this.scanMode = on;
  }

  updateObjects(objects: DetectedObject[]): void { this.objects = objects; }
  updateSegLabels(labels: SegmentLabel[]): void { this.segLabels = labels; }

  startScanAnimation(obj: DetectedObject): void {
    this.scanTarget = obj;
    this.scanProgress = 0;
    this.scanAnimating = true;
  }

  render(): void {
    const { width, height } = this.canvas;
    // Não limpar — o hand-renderer ou outro overlay já limpa
    // (este é um canvas separado)
    this.ctx.clearRect(0, 0, width, height);

    if (!this.scanMode && !this.scanAnimating) return;

    const t = performance.now() / 1000;

    // ── Scan animation ─────────────────────────────────────────────
    if (this.scanAnimating && this.scanTarget) {
      this.scanProgress = Math.min(1, this.scanProgress + 0.018);
      this.drawScanAnimation(this.scanTarget, this.scanProgress, width, height);
      if (this.scanProgress >= 1) {
        this.scanAnimating = false;
        this.scanTarget = null;
      }
    }

    if (!this.scanMode) return;

    // ── Segmentation labels (scene context) ───────────────────────
    for (const seg of this.segLabels) {
      const sx = (1 - seg.cx) * width; // espelhar
      const sy = seg.cy * height;
      this.ctx.save();
      this.ctx.font = '500 9px "Courier New"';
      this.ctx.fillStyle = 'rgba(180,220,255,0.45)';
      this.ctx.shadowColor = 'rgba(0,150,255,0.5)';
      this.ctx.shadowBlur = 5;
      const tw = this.ctx.measureText(seg.label).width;
      this.ctx.fillText(seg.label, sx - tw / 2, sy);
      this.ctx.restore();
    }

    // ── Object labels ──────────────────────────────────────────────
    for (const obj of this.objects) {
      // Mirror X (câmera espelhada)
      const left  = (1 - obj.right)  * width;
      const right = (1 - obj.left)   * width;
      const top   = obj.top    * height;
      const bot   = obj.bottom * height;
      const cx    = (left + right) / 2;
      const w_    = right - left;
      const h_    = bot - top;

      // Bounding box dashed
      this.ctx.save();
      this.ctx.strokeStyle = `rgba(0,200,255,${0.5 + Math.sin(t * 3) * 0.15})`;
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([6, 4]);
      this.ctx.shadowColor = '#00AAFF';
      this.ctx.shadowBlur = 8;
      this.ctx.strokeRect(left, top, w_, h_);

      // Cantos destacados
      this.ctx.setLineDash([]);
      this.ctx.lineWidth = 2.5;
      const cs = 12; // corner size
      [[left,top],[right,top],[left,bot],[right,bot]].forEach(([x,y]) => {
        const dx = x === left ? 1 : -1;
        const dy = y === top  ? 1 : -1;
        this.ctx.beginPath();
        this.ctx.moveTo(x + dx * cs, y);
        this.ctx.lineTo(x, y);
        this.ctx.lineTo(x, y + dy * cs);
        this.ctx.stroke();
      });
      this.ctx.restore();

      // Label
      const label  = obj.label.toUpperCase();
      const pct    = Math.round(obj.score * 100);
      const text   = `${label}  ${pct}%`;
      this.ctx.save();
      this.ctx.font = '600 11px "Courier New", monospace';
      const tw = this.ctx.measureText(text).width;
      const lx = cx - tw / 2 - 8;
      const ly = top - 22;

      // Label bg
      this.ctx.fillStyle = 'rgba(0,10,20,0.75)';
      this.ctx.beginPath();
      this.ctx.roundRect(lx, ly, tw + 16, 18, 3);
      this.ctx.fill();

      this.ctx.strokeStyle = 'rgba(0,180,255,0.6)';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();

      this.ctx.fillStyle = `rgba(0,220,255,${0.8 + Math.sin(t*2)*0.1})`;
      this.ctx.shadowColor = '#00AAFF';
      this.ctx.shadowBlur = 6;
      this.ctx.fillText(text, lx + 8, ly + 13);

      // "SCAN" button indicator
      this.ctx.font = '500 9px "Courier New"';
      this.ctx.fillStyle = 'rgba(0,255,180,0.55)';
      this.ctx.shadowBlur = 0;
      this.ctx.fillText('[ CLIQUE PARA SCANEAR ]', cx - 62, bot + 14);
      this.ctx.restore();
    }
  }

  private drawScanAnimation(obj: DetectedObject, progress: number, W: number, H: number): void {
    const left  = (1 - obj.right)  * W;
    const right = (1 - obj.left)   * W;
    const top   = obj.top    * H;
    const bot   = obj.bottom * H;
    const scanY = top + (bot - top) * progress;

    this.ctx.save();

    // Linha de scan principal
    const gradient = this.ctx.createLinearGradient(left, scanY, right, scanY);
    gradient.addColorStop(0,   'transparent');
    gradient.addColorStop(0.2, 'rgba(0,255,200,0.15)');
    gradient.addColorStop(0.5, 'rgba(0,255,200,0.8)');
    gradient.addColorStop(0.8, 'rgba(0,255,200,0.15)');
    gradient.addColorStop(1,   'transparent');
    this.ctx.strokeStyle = gradient;
    this.ctx.lineWidth = 2;
    this.ctx.shadowColor = '#00FFCC';
    this.ctx.shadowBlur = 16;
    this.ctx.beginPath();
    this.ctx.moveTo(left, scanY);
    this.ctx.lineTo(right, scanY);
    this.ctx.stroke();

    // Área já scaneada — leve preenchimento
    this.ctx.fillStyle = 'rgba(0,200,255,0.04)';
    this.ctx.fillRect(left, top, right - left, scanY - top);

    // Grade de scan na área varrida
    const gridStep = 14;
    this.ctx.strokeStyle = 'rgba(0,180,255,0.08)';
    this.ctx.lineWidth = 0.5;
    this.ctx.setLineDash([2, 6]);
    this.ctx.shadowBlur = 0;
    for (let y = top; y < scanY; y += gridStep) {
      this.ctx.beginPath();
      this.ctx.moveTo(left, y);
      this.ctx.lineTo(right, y);
      this.ctx.stroke();
    }
    for (let x = left; x < right; x += gridStep) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, top);
      this.ctx.lineTo(x, Math.min(scanY, top + (bot - top) * progress));
      this.ctx.stroke();
    }

    // Texto de progresso
    this.ctx.setLineDash([]);
    this.ctx.font = 'bold 10px "Courier New"';
    this.ctx.fillStyle = 'rgba(0,255,200,0.8)';
    this.ctx.shadowColor = '#00FFCC';
    this.ctx.shadowBlur = 8;
    const pct = Math.round(progress * 100);
    this.ctx.fillText(`SCANNING ${pct}%`, left + 4, scanY - 6);

    this.ctx.restore();
  }

  private onClick = (e: MouseEvent): void => {
    if (!this.scanMode || this.scanAnimating) return;
    const nx = e.clientX / this.canvas.width;
    const ny = e.clientY / this.canvas.height;
    const mx = 1 - nx; // mirror

    for (const obj of this.objects) {
      if (mx >= obj.left && mx <= obj.right && ny >= obj.top && ny <= obj.bottom) {
        this.onScanRequest?.(obj);
        break;
      }
    }
  };

  private resize(): void {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
}
