import type { HandFrame } from './ws-hand-client';

const PINCH_THRESHOLD = 0.055;
const PINCH_COOLDOWN_MS = 350;

export class HandInteraction {
  private lastPinchStart = 0;
  isPinching = false;
  currentNdcX = 0;
  currentNdcY = 0;

  onPinchStart?: (ndcX: number, ndcY: number) => void;
  onPinchMove?: (ndcX: number, ndcY: number) => void;
  onPinchEnd?: () => void;

  update(frame: HandFrame): void {
    if (frame.hands.length === 0) {
      if (this.isPinching) {
        this.isPinching = false;
        this.onPinchEnd?.();
      }
      return;
    }

    const lm = frame.hands[0].landmarks;
    const thumb = lm[4];
    const index = lm[8];

    const dist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
    const nowPinching = dist < PINCH_THRESHOLD;

    // NDC from index fingertip — espelhar X para alinhar com câmera scaleX(-1)
    const ndcX = (1 - index.x) * 2 - 1;
    const ndcY = -(index.y * 2 - 1);
    this.currentNdcX = ndcX;
    this.currentNdcY = ndcY;

    const now = Date.now();

    if (nowPinching && !this.isPinching) {
      if (now - this.lastPinchStart > PINCH_COOLDOWN_MS) {
        this.isPinching = true;
        this.lastPinchStart = now;
        this.onPinchStart?.(ndcX, ndcY);
      }
    } else if (nowPinching && this.isPinching) {
      this.onPinchMove?.(ndcX, ndcY);
    } else if (!nowPinching && this.isPinching) {
      this.isPinching = false;
      this.onPinchEnd?.();
    }
  }
}
