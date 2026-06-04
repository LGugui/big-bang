import * as THREE from 'three';

// Vertex: deslocamento mínimo baseado em luminância
const VERT = /* glsl */`
uniform sampler2D uVideo;
uniform float uDisplace;
varying float vHeight;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec2 s = vec2(1.0 - uv.x, 1.0 - uv.y); // espelha selfie
  float luma = dot(texture2D(uVideo, s).rgb, vec3(0.299, 0.587, 0.114));
  vHeight = luma;

  vec3 pos = position;
  pos.y += luma * uDisplace;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

// Fragment: só bordas detectadas por Sobel, alpha muito baixo
const FRAG = /* glsl */`
uniform sampler2D uVideo;
uniform float uTime;
uniform float uAlpha;
varying float vHeight;
varying vec2 vUv;

float luma(vec2 uv) {
  vec2 s = vec2(1.0 - uv.x, 1.0 - uv.y);
  return dot(texture2D(uVideo, s).rgb, vec3(0.299, 0.587, 0.114));
}

void main() {
  // Sobel — detecta bordas na imagem da câmera
  float px = 0.004;
  float gx = -luma(vUv + vec2(-px,-px)) - 2.0*luma(vUv + vec2(-px,0.0)) - luma(vUv + vec2(-px,px))
            + luma(vUv + vec2( px,-px)) + 2.0*luma(vUv + vec2( px,0.0)) + luma(vUv + vec2( px,px));
  float gy = -luma(vUv + vec2(-px,-px)) - 2.0*luma(vUv + vec2(0.0,-px)) - luma(vUv + vec2(px,-px))
            + luma(vUv + vec2(-px, px)) + 2.0*luma(vUv + vec2(0.0, px)) + luma(vUv + vec2(px, px));
  float edge = sqrt(gx*gx + gy*gy);

  // Apenas bordas visíveis, resto invisível
  float show = smoothstep(0.12, 0.35, edge);

  // Cor: cyan muito frio, quase branco
  vec3 col = mix(vec3(0.0, 0.55, 0.8), vec3(0.7, 0.95, 1.0), vHeight);

  // Alpha extremamente baixo — mal visível
  float a = show * 0.18 * uAlpha;

  gl_FragColor = vec4(col, a);
}
`;

export class EnvironmentMesh {
  private mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private clock = new THREE.Clock();
  private targetAlpha = 0;
  private currentAlpha = 0;

  constructor(scene: THREE.Scene, video: HTMLVideoElement) {
    // Resolução menor — performance melhor, malha mais sutil
    const geo = new THREE.PlaneGeometry(30, 17, 120, 68);
    geo.rotateX(-Math.PI / 2);

    const tex = new THREE.VideoTexture(video);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uVideo:    { value: tex },
        uDisplace: { value: 1.2 }, // deslocamento sutil
        uTime:     { value: 0 },
        uAlpha:    { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      wireframe: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // glow aditivo — soma no fundo
    });

    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.set(0, -0.8, 0);
    this.mesh.renderOrder = -1; // renderiza antes dos objetos
    scene.add(this.mesh);

    setTimeout(() => { this.targetAlpha = 1; }, 600);
  }

  update(): void {
    this.mat.uniforms.uTime.value = this.clock.getElapsedTime();
    this.currentAlpha += (this.targetAlpha - this.currentAlpha) * 0.025;
    this.mat.uniforms.uAlpha.value = this.currentAlpha;
  }
}
