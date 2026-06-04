"""
BigBang WebSocket Bridge
Envia landmarks + gestos de mãos em tempo real para o browser (ws://localhost:8765).
Uso: python ws_bridge.py
"""

import asyncio
import json
import math
import os
import sys

import cv2

sys.path.insert(0, os.path.dirname(__file__))

try:
    import websockets
except ImportError:
    print("[BigBang Bridge] Instalando websockets...")
    os.system(f"{sys.executable} -m pip install websockets")
    import websockets

from detector import HandDetector

try:
    from face_detector import FaceDetector
    _FACE_ENABLED = True
except Exception:
    _FACE_ENABLED = False
    print("[Bridge] FaceDetector indisponível — só mãos.")

PORT = 8765


# ── Gesture detection helpers ──────────────────────────────────────────────

def _dist(a, b):
    return math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)


def _ext(lm, tip, base):
    """Tip farther from wrist than base (squared distance, no sqrt)."""
    w = lm[0]
    dt2 = (lm[tip].x - w.x)**2 + (lm[tip].y - w.y)**2 + (lm[tip].z - w.z)**2
    db2 = (lm[base].x - w.x)**2 + (lm[base].y - w.y)**2 + (lm[base].z - w.z)**2
    return dt2 > db2


def gesture_state(lm):
    """Returns current gesture state dict for one hand's 21 landmarks."""
    pinch = _dist(lm[4], lm[8]) < 0.08
    fist  = (not _ext(lm, 8, 6) and not _ext(lm, 12, 10)
             and not _ext(lm, 16, 14) and not _ext(lm, 20, 18))
    open_ = (_ext(lm, 8, 6) and _ext(lm, 12, 10) and _ext(lm, 16, 14)
             and _ext(lm, 20, 18) and _ext(lm, 4, 2))
    ring  = (_ext(lm, 16, 14) and not _ext(lm, 8, 6)
             and not _ext(lm, 12, 10) and not _ext(lm, 20, 18))
    return {"pinch": pinch, "fist": fist, "open": open_, "ring": ring}


_NULL_GESTURES = {"pinch": False, "fist": False, "open": False, "ring": False}

CFG = {
    "max_hands": 2,
    "detection_confidence": 0.6,
    "tracking_confidence": 0.5,
    "flip_handedness": True,
    "visibility_threshold": 0.4,
}

clients: set = set()


async def handler(ws):
    clients.add(ws)
    print(f"[Bridge] Cliente conectado — {len(clients)} ativo(s)")
    try:
        await ws.wait_closed()
    finally:
        clients.discard(ws)
        print(f"[Bridge] Cliente desconectado — {len(clients)} ativo(s)")


_FACE_CFG = {
    "face_detection_confidence": 0.5,
    "face_tracking_confidence": 0.5,
}


async def camera_loop():
    detector  = HandDetector(CFG)
    face_det  = FaceDetector(_FACE_CFG) if _FACE_ENABLED else None
    face_tick = 0

    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not cap.isOpened():
        cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[Bridge] ERRO: câmera não disponível.")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    print(f"[Bridge] Câmera ativa — enviando para ws://localhost:{PORT}")

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                await asyncio.sleep(0.01)
                continue

            frame = cv2.flip(frame, 1)
            _, hands = detector.find_hands(frame, draw=False)

            # Face detection every 2nd frame (~30 fps) to keep bridge at 60 fps
            face_data = None
            if face_det:
                face_tick += 1
                if face_tick % 2 == 0:
                    lm, _bs, _mat = face_det.find_face(frame)
                    if lm:
                        face_data = [
                            {"x": round(l.x, 4), "y": round(l.y, 4), "z": round(l.z, 4)}
                            for l in lm
                        ]

            if clients:
                payload = []
                for lm, label in hands:
                    payload.append({
                        "label": label,
                        "landmarks": [
                            {"x": round(l.x, 4), "y": round(l.y, 4), "z": round(l.z, 4)}
                            for l in lm
                        ],
                    })
                top_gs = gesture_state(hands[0][0]) if hands else _NULL_GESTURES
                msg_obj: dict = {"hands": payload, "gestures": top_gs}
                if face_data is not None:
                    msg_obj["face"] = face_data
                msg = json.dumps(msg_obj)
                dead = set()
                for c in clients:
                    try:
                        await c.send(msg)
                    except Exception:
                        dead.add(c)
                clients -= dead

            await asyncio.sleep(1 / 60)
    finally:
        cap.release()
        detector.close()
        if face_det:
            face_det.close()
        print("[Bridge] Câmera liberada.")


async def main():
    print(f"[BigBang Bridge] Iniciando ws://localhost:{PORT}")
    print("[BigBang Bridge] Ctrl+C para parar\n")
    async with websockets.serve(handler, "localhost", PORT):
        await camera_loop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Bridge] Encerrado.")
