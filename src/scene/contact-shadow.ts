import * as THREE from 'three';

/**
 * Sombra de contato suave por objeto.
 * Âncora visual que faz o objeto parecer estar em uma superfície real.
 */
export function createContactShadow(scene: THREE.Scene): THREE.Mesh {
  const geo = new THREE.CircleGeometry(0.6, 24);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.MultiplyBlending,
  });

  const shadow = new THREE.Mesh(geo, mat);
  shadow.renderOrder = -2;
  scene.add(shadow);
  return shadow;
}

/**
 * Atualiza posição e opacidade da sombra com base na altura do objeto.
 */
export function updateContactShadow(shadow: THREE.Mesh, objPosition: THREE.Vector3, floorY = 0): void {
  const height = objPosition.y - floorY;

  shadow.position.set(objPosition.x, floorY + 0.005, objPosition.z);

  const mat = shadow.material as THREE.MeshBasicMaterial;
  // Mais alto = sombra maior + mais transparente
  const scale = Math.max(0.6, 1 + height * 0.25);
  shadow.scale.setScalar(scale);
  mat.opacity = Math.max(0, 0.35 - height * 0.06);
}
