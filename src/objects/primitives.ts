import * as THREE from 'three';

export type ShapeType = 'cube' | 'sphere' | 'cylinder';

const COLORS: Record<ShapeType, number> = {
  cube: 0x8B5CF6,
  sphere: 0x00AAFF,
  cylinder: 0x00FFCC,
};

function holoGroup(geo: THREE.BufferGeometry, color: number): THREE.Group {
  const group = new THREE.Group();

  const solid = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, side: THREE.DoubleSide })
  );

  const wire = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.75 })
  );

  group.add(solid, wire);
  return group;
}

export function createPrimitive(shape: ShapeType, position: THREE.Vector3): THREE.Group {
  const color = COLORS[shape];

  let geo: THREE.BufferGeometry;
  switch (shape) {
    case 'cube':      geo = new THREE.BoxGeometry(1, 1, 1); break;
    case 'sphere':    geo = new THREE.SphereGeometry(0.6, 16, 12); break;
    case 'cylinder':  geo = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 16); break;
  }

  const group = holoGroup(geo, color);
  // Spawn logo acima do ponto de clique — mais próximo do ambiente real
  group.position.set(position.x, position.y + 0.6, position.z);
  group.userData.baseY = group.position.y;

  return group;
}
