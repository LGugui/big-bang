import type { ShapeType } from '../objects/primitives';

export function initShapeSelector(onChange: (shape: ShapeType) => void): void {
  const container = document.getElementById('shape-selector')!;

  container.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-shape]') as HTMLElement | null;
    if (!btn) return;

    container.querySelectorAll('[data-shape]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    onChange(btn.dataset.shape as ShapeType);
  });

  // Ativa cubo por padrão
  (container.querySelector('[data-shape="cube"]') as HTMLElement)?.classList.add('active');
}
