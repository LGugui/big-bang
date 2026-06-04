export interface Landmark { x: number; y: number; z: number; }
export interface HandData { label: string; landmarks: Landmark[]; }
export interface GestureState { pinch: boolean; fist: boolean; open: boolean; ring: boolean; }
export interface HandFrame { hands: HandData[]; gestures?: GestureState; face?: Landmark[]; }

type FrameCallback = (frame: HandFrame) => void;

export class WsHandClient {
  private url: string;
  private ws: WebSocket | null = null;
  private onFrame: FrameCallback;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onGesture?: (g: GestureState) => void;

  constructor(url: string, onFrame: FrameCallback) {
    this.url = url;
    this.onFrame = onFrame;
    this.connect();
  }

  private connect(): void {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[HandClient] Conectado ao bridge');
        this.onConnect?.();
      };

      this.ws.onmessage = (e) => {
        try {
          const frame: HandFrame = JSON.parse(e.data);
          this.onFrame(frame);
          if (frame.gestures) this.onGesture?.(frame.gestures);
        } catch { /* malformed frame */ }
      };

      this.ws.onclose = () => {
        console.log('[HandClient] Bridge desconectado. Tentando em 2s...');
        this.onDisconnect?.();
        this.ws = null;
        setTimeout(() => this.connect(), 2000);
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      setTimeout(() => this.connect(), 2000);
    }
  }
}
