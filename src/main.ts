import * as THREE from 'three';
import { CameraManager } from './camera/camera-manager';
import { SceneManager } from './scene/scene-manager';
import { initShapeSelector } from './ui/shape-selector';
import { initTransformMode } from './ui/transform-mode';
import { BrowserHandTracker } from './hands/browser-hand-tracker';
import { HandRenderer } from './hands/hand-renderer';
import { HandInteraction } from './hands/hand-interaction';
import { WsHandClient } from './hands/ws-hand-client';
import type { GestureState } from './hands/ws-hand-client';
import type { TransformMode } from './objects/selection-manager';
import { ArLabels } from './scene/ar-labels';
import { DepthScanner } from './scene/depth-scanner';

const videoEl      = document.getElementById('camera-feed')  as HTMLVideoElement;
const canvasEl     = document.getElementById('three-canvas') as HTMLCanvasElement;
const handCanvasEl = document.getElementById('hand-canvas')  as HTMLCanvasElement;
const labelCanvasEl= document.getElementById('label-canvas') as HTMLCanvasElement;
const statusEl     = document.getElementById('status')       as HTMLDivElement;
const errorEl      = document.getElementById('camera-error') as HTMLDivElement;
const handStatusEl = document.getElementById('hand-status')  as HTMLDivElement;
const scanStatusEl = document.getElementById('scan-status')  as HTMLDivElement;
const scanToggleEl = document.getElementById('scan-toggle')  as HTMLButtonElement;

async function init() {
  const cam = new CameraManager(videoEl);
  const cameraOk = await cam.start();
  if (!cameraOk) { errorEl.classList.add('visible'); videoEl.style.display = 'none'; }

  const scene  = new SceneManager(canvasEl);
  const objMgr = scene.getObjectManager();
  const selMgr = scene.getSelectionManager();

  initShapeSelector(s => objMgr.setShape(s));
  initTransformMode(selMgr);

  if (cameraOk) scene.initAnalyzers(videoEl);

  const segmenter = scene.getSegmenter();

  // ── Hand tracking ──────────────────────────────────────────────
  const handTracker = new BrowserHandTracker(videoEl);
  const renderer    = new HandRenderer(handCanvasEl);
  const interaction = new HandInteraction();

  interaction.onPinchStart = (x, y) => { objMgr.pinchStart(x, y); renderer.isGrabbing = true; };
  interaction.onPinchMove  = (x, y) =>   objMgr.pinchMove(x, y);
  interaction.onPinchEnd   = ()     => { objMgr.pinchEnd();         renderer.isGrabbing = false; };

  // ── WebSocket Bridge (Python server) ───────────────────────────
  let bridgeConnected = false;
  let lastGesture: GestureState = { pinch: false, fist: false, open: false, ring: false };
  const TRANSFORM_MODES: TransformMode[] = ['translate', 'rotate', 'scale'];

  const wsClient = new WsHandClient('ws://localhost:8765', frame => {
    renderer.update(frame);
    interaction.update(frame);
  });

  wsClient.onConnect = () => {
    bridgeConnected = true;
    handStatusEl.textContent = '✦ BRIDGE ATIVA';
    handStatusEl.style.color = 'rgba(0,255,180,0.7)';
    renderer.setConnected(true);
  };

  wsClient.onDisconnect = () => {
    bridgeConnected = false;
  };

  wsClient.onGesture = (g) => {
    if (g.fist && !lastGesture.fist) objMgr.deleteSelected();
    if (g.open && !lastGesture.open) selMgr.deselect();
    if (g.ring && !lastGesture.ring && selMgr.selected) {
      const cur = selMgr.getMode();
      const next = TRANSFORM_MODES[(TRANSFORM_MODES.indexOf(cur) + 1) % TRANSFORM_MODES.length];
      selMgr.setMode(next);
    }
    lastGesture = g;
  };

  // BrowserHandTracker: sempre renderiza; só interage quando bridge offline
  handTracker.onFrame = frame => {
    renderer.update(frame);
    if (!bridgeConnected) interaction.update(frame);
  };
  handTracker.onReady = () => {
    if (!bridgeConnected) {
      handStatusEl.textContent = '✦ MÃO ATIVA';
      handStatusEl.style.color = 'rgba(0,255,180,0.7)';
    }
    renderer.setConnected(true);
  };
  handStatusEl.textContent = '◌ CARREGANDO MEDIAPIPE...';
  handStatusEl.style.color = 'rgba(255,200,0,0.5)';

  // ── AR Labels + Depth Scanner ──────────────────────────────────
  const arLabels     = new ArLabels(labelCanvasEl);
  const depthScanner = new DepthScanner(scene.getThreeScene());

  depthScanner.onStatusChange = msg => { scanStatusEl.textContent = msg; };
  if (segmenter) segmenter.onStatusChange = msg => { scanStatusEl.textContent = msg; };

  // Raycaster para obter posição 3D do clique no momento do scan
  const raycaster = new THREE.Raycaster();
  const spawnPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  arLabels.onScanRequest = async (obj) => {
    arLabels.startScanAnimation(obj);

    // Calcular posição 3D central do objeto detectado
    const cx = 1 - (obj.left + obj.right) / 2;  // espelhar
    const cy = (obj.top + obj.bottom) / 2;
    const ndcX = cx * 2 - 1;
    const ndcY = -(cy * 2 - 1);
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), scene.getCamera());
    const spawnPos = new THREE.Vector3();
    raycaster.ray.intersectPlane(spawnPlane, spawnPos);

    await depthScanner.scanObject(videoEl, obj, spawnPos);
  };

  // Scan mode toggle
  let scanMode = false;
  const toggleScan = () => {
    scanMode = !scanMode;
    arLabels.setScanMode(scanMode);
    scanToggleEl.classList.toggle('active', scanMode);
    labelCanvasEl.classList.toggle('interactive', scanMode);

    if (scanMode) {
      // Pré-carregar modelos
      depthScanner.loadModel();
      if (segmenter && !segmenter.ready && !segmenter['loading']) {
        segmenter.init();
      }
    }
  };

  scanToggleEl.addEventListener('click', toggleScan);
  window.addEventListener('keydown', e => { if (e.key === 'q' || e.key === 'Q') toggleScan(); });

  // Segmentação periódica (a cada 3s quando em scan mode)
  setInterval(async () => {
    if (!scanMode || !segmenter?.ready) return;
    await segmenter.analyzeFrame(videoEl);
    arLabels.updateSegLabels(segmenter.labels);
  }, 3000);

  // Atualizar object detector labels (mais frequente)
  setInterval(() => {
    arLabels.updateObjects(scene.getAnalyzer()?.getObjects() ?? []);
  }, 300);

  // Render loops
  const renderHands  = () => { renderer.render();   requestAnimationFrame(renderHands);  };
  const renderLabels = () => { arLabels.render();    requestAnimationFrame(renderLabels); };
  renderHands();
  renderLabels();

  scene.start();

  handTracker.init().catch(e => {
    handStatusEl.textContent = '✕ MEDIAPIPE ERRO';
    console.warn(e);
  });

  statusEl.textContent = 'BIG BANG · Q=SCAN · PINCH=MOVER · FIST=DELETAR · RING=MODO · OPEN=SOLTAR';
}

init();
