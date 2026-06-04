import type { SelectionManager, TransformMode } from '../objects/selection-manager';

export function initTransformMode(selMgr: SelectionManager): void {
  const container = document.getElementById('transform-mode')!;

  const update = (mode: TransformMode) => {
    container.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
    const btn = container.querySelector(`[data-mode="${mode}"]`);
    btn?.classList.add('active');
  };

  container.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-mode]') as HTMLElement | null;
    if (!btn || !selMgr.selected) return;
    const mode = btn.dataset.mode as TransformMode;
    selMgr.setMode(mode);
    update(mode);
  });

  // Sync quando modo muda via teclado
  window.addEventListener('keydown', (e) => {
    if (!selMgr.selected) return;
    if (e.key === 't' || e.key === 'T') update('translate');
    if (e.key === 'r' || e.key === 'R') update('rotate');
    if (e.key === 's' || e.key === 'S') update('scale');
  });

  // Mostrar/ocultar conforme seleção
  selMgr.onSelectionChange = (obj) => {
    container.style.display = obj ? 'flex' : 'none';
    if (obj) update(selMgr.getMode());
  };
}
