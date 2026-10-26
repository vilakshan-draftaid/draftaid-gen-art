import * as THREE from 'three';

// Screen-space outline pass. Draws lines where surface normals or depth
// jump, which gives clean CAD-style edges on any geometry.
export function createEdgePass(normalTarget) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tNormal: { value: normalTarget.texture },
      tDepth: { value: normalTarget.depthTexture },
      resolution: { value: new THREE.Vector2(1, 1) },
      thickness: { value: 1 },
      opacity: { value: 1 },
      color: { value: new THREE.Color('#292929') },
      near: { value: 1 },
      far: { value: 2000 },
      normalThreshold: { value: 0.2 },
      depthThreshold: { value: 3 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tNormal;
      uniform sampler2D tDepth;
      uniform vec2 resolution;
      uniform float thickness;
      uniform float opacity;
      uniform vec3 color;
      uniform float near;
      uniform float far;
      uniform float normalThreshold;
      uniform float depthThreshold;
      varying vec2 vUv;

      vec3 N(vec2 uv) { return texture2D(tNormal, uv).rgb * 2.0 - 1.0; }
      float D(vec2 uv) { return near + texture2D(tDepth, uv).r * (far - near); }

      float sampleEdge(vec2 o, vec3 n0, float d0) {
        vec2 uv = vUv + o * thickness / resolution;
        float en = smoothstep(normalThreshold, normalThreshold + 0.15, 1.0 - dot(n0, N(uv)));
        float ed = smoothstep(depthThreshold, depthThreshold * 2.0, abs(D(uv) - d0));
        return max(en, ed);
      }

      void main() {
        vec3 n0 = N(vUv);
        float d0 = D(vUv);
        float e = 0.0;
        e = max(e, sampleEdge(vec2( 1.0,  0.0), n0, d0));
        e = max(e, sampleEdge(vec2(-1.0,  0.0), n0, d0));
        e = max(e, sampleEdge(vec2( 0.0,  1.0), n0, d0));
        e = max(e, sampleEdge(vec2( 0.0, -1.0), n0, d0));
        e = max(e, sampleEdge(vec2( 0.7,  0.7), n0, d0) * 0.8);
        e = max(e, sampleEdge(vec2(-0.7,  0.7), n0, d0) * 0.8);
        e = max(e, sampleEdge(vec2( 0.7, -0.7), n0, d0) * 0.8);
        e = max(e, sampleEdge(vec2(-0.7, -0.7), n0, d0) * 0.8);
        gl_FragColor = vec4(color, e * opacity);
        #include <colorspace_fragment>
      }
    `,
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);

  return { scene, camera: new THREE.Camera(), material };
}
