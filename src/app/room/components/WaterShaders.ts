import * as THREE from "three";

/**
 * 🌊 SIMULATION SHADER (Physics)
 */
export const SimulationShader = {
  uniforms: {
    tDiffuse: { value: null },
    delta: { value: 1.2 },
    resolution: { value: new THREE.Vector2(64, 64) },
    mousePos: { value: new THREE.Vector2(0, 0) },
    lastMousePos: { value: new THREE.Vector2(0, 0) },
    uDamping: { value: 0.98 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float delta;
    uniform vec2 mousePos;
    uniform vec2 lastMousePos;
    uniform float uDamping;
    varying vec2 vUv;
    void main() {
      vec2 texel = 1.0 / resolution;
      vec4 data = texture2D(tDiffuse, vUv);
      float pressure = data.x;
      float pVel = data.y;
      
      float p_right = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).x;
      float p_left = texture2D(tDiffuse, vUv + vec2(-texel.x, 0.0)).x;
      float p_up = texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).x;
      float p_down = texture2D(tDiffuse, vUv + vec2(0.0, -texel.y)).x;
      
      pVel += delta * (-2.0 * pressure + p_right + p_left) / 4.0;
      pVel += delta * (-2.0 * pressure + p_up + p_down) / 4.0;
      pressure += delta * pVel;
      
      pVel *= uDamping;
      pressure *= uDamping;
      
      float mouseSpeed = distance(mousePos, lastMousePos);
      float dist = distance(vUv, mousePos);
      
      if (dist < 0.035) { 
        pressure += min(mouseSpeed * 20.0, 0.5); 
      } 
      gl_FragColor = vec4(pressure, pVel, (p_right - p_left), (p_up - p_down));
    }
  `,
};

/**
 * 🌸 PINK WATER SHADER (Visuals)
 */
export const PinkWaterShader = {
  uniforms: {
    tSimulation: { value: null },
    envMap: { value: null }, // Still present if needed for other uses, but reflection logic is removed.
    uSpikeCap: { value: 2.0 },
    uGlowSize: { value: 2.5 }
  },
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vWorldPosition; 
    uniform sampler2D tSimulation;
    uniform float uSpikeCap;

    void main() {
      vUv = uv;
      vec3 pos = position;
      float ripple = texture2D(tSimulation, uv).r;
      
      // Physical wave displacement
      pos.z += clamp(ripple * 1.5, -uSpikeCap, uSpikeCap); 
      
      vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
      vWorldPosition = worldPosition.xyz;
      
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    uniform sampler2D tSimulation;
    uniform float uGlowSize;

    void main() {
      float ripple = texture2D(tSimulation, vUv).r;
      
      // 1. (NORMALS logic removed)
      // 2. (BLURRY REFLECTION logic removed)
      // 3. COLOR PALETTE (Warm Champagne to Soft Pink)
      vec3 pinkBase = mix(vec3(1.0, 0.95, 0.92), vec3(0.95, 0.85, 0.82), vUv.y);
      
      // 4. FINAL COMPOSITION
      vec3 finalBase = pinkBase; // Now just the base pink color

      // Pink Glow on ripples (kept for visualization)
      vec3 glow = vec3(1.0, 0.4, 0.8) * pow(max(0.0, ripple), uGlowSize) * 6.0;
      
      float distFromCenter = distance(vUv, vec2(0.5));
      float edgeMask = smoothstep(0.5, 0.48, distFromCenter); 

      gl_FragColor = vec4(finalBase + glow, edgeMask);
    }
  `
};
