import * as THREE from 'three';

export function createHolographicGrid(): THREE.Group {
  const group = new THREE.Group();

  // Grid principal — linhas cyan
  const grid = new THREE.GridHelper(30, 60, 0x00AAFF, 0x003366);
  const mat = grid.material as THREE.LineBasicMaterial;
  mat.transparent = true;
  mat.opacity = 0.35;
  group.add(grid);

  // Círculo de referência central
  const ringGeo = new THREE.RingGeometry(0.08, 0.12, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00AAFF,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  return group;
}
