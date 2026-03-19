"use client";
import React, { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, createPortal } from "@react-three/fiber";
import { useFBO, Text, Center } from "@react-three/drei";
import * as THREE from "three";

// --- 1. SIMULATION SHADER (The Physics Engine) ---
const SimulationShader = {
  uniforms: {
    tDiffuse: { value: null },
    delta: { value: 1.2 },
    resolution: { value: new THREE.Vector2(512, 512) },
    mousePos: { value: new THREE.Vector2(0, 0) },
    lastMousePos: { value: new THREE.Vector2(0, 0) },
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
      
      pVel -= 0.005 * delta * pressure; 
      pVel *= 0.992;
      pressure *= 0.996;

      float mouseSpeed = distance(mousePos, lastMousePos);
      float dist = distance(vUv, mousePos);
      if (dist < 0.035) {
        pressure += mouseSpeed * 12.0; 
      }

      gl_FragColor = vec4(pressure, pVel, (p_right - p_left), (p_up - p_down));
    }
  `,
};

// --- 2. TEXT BENDING SHADER (The Morphing Magic) ---
const MorphingTextShader = {
  uniforms: {
    tSimulation: { value: null },
    uColor: { value: new THREE.Color("white") },
    uMousePos: { value: new THREE.Vector2(0, 0) },
    uMouseVel: { value: new THREE.Vector2(0, 0) },
  },
  vertexShader: `
    varying vec2 vUv;
    varying float vPressure;
    uniform sampler2D tSimulation;
    uniform vec2 uMousePos;
    uniform vec2 uMouseVel;

    void main() {
      vUv = uv;
      
      // Calculate screen-space UV for sampling the simulation
      vec4 modelPosition = modelMatrix * vec4(position, 1.0);
      vec4 viewPosition = viewMatrix * modelPosition;
      vec4 projectionPosition = projectionMatrix * viewPosition;
      vec2 screenUv = (projectionPosition.xy / projectionPosition.w) * 0.5 + 0.5;

      // Sample simulation for displacement
      vec4 sim = texture2D(tSimulation, screenUv);
      vPressure = sim.x;
      vec2 grad = sim.zw;

      vec3 newPos = position;
      
      float waterMask = smoothstep(0.01, 0.4, vPressure);
      float distToMouse = distance(screenUv, uMousePos);
      
      // Tighten the radius of the effect so it doesn't overwhelm the text
      float localMask = smoothstep(0.2, 0.0, distToMouse); 
      
      // Combine masks so text only bends where the wave exists AND we stroked
      float mask = waterMask * localMask;

      // Subtle shear based on mouse movement velocity
      // Scaled down significantly (from 250/150 to 60/30) to make it elegant and not 'loud'
      float shearX = uMouseVel.x * 60.0;
      float shearY = uMouseVel.y * 30.0;
      
      // position.y is positive at the top, negative at the bottom.
      // A positive shearX makes the top lean right and the bottom lean left.
      // This creates a perfect typographic slant/italicizing effect matching the image!
      newPos.x += position.y * shearX * mask;
      newPos.y += position.x * shearY * mask;
      
      // Gentle Z push so the wave still feels slightly 3D
      newPos.z += waterMask * 0.2;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    varying float vPressure;
    uniform vec3 uColor;

    void main() {
      // Sleek metallic base (unseen studio like)
      vec3 base = vec3(0.12, 0.12, 0.14);
      
      // Chrome/silver reflection sweep across the text
      float shine = smoothstep(0.4, 0.55, vUv.y + sin(vUv.x * 5.0) * 0.1) - smoothstep(0.55, 0.7, vUv.y + sin(vUv.x * 5.0) * 0.1);
      
      vec3 highlight = vec3(0.85, 0.85, 0.9); // Bright silver reflection
      vec3 pinkGlint = vec3(1.0, 0.6, 0.8); // Subtle pink iridescent rim
      
      vec3 finalCol = base + highlight * shine * 0.7;
      
      // Iridescent holographic tint on the bottom edge matching the 'pink one' flavor
      finalCol = mix(finalCol, vec3(0.3, 0.25, 0.35), smoothstep(0.3, 0.0, vUv.y));
      
      // Water interaction: adds a gentle glossy pink shimmer where the water ripples hit
      float shimmer = pow(max(0.0, vPressure), 1.5) * 1.5;
      finalCol += pinkGlint * shimmer;

      gl_FragColor = vec4(finalCol, 1.0);
    }
  `,
};

// --- 3. FINAL COMPOSITE (Chromatic Aberration) ---
const WaterVisualShader = {
  uniforms: {
    tSimulation: { value: null },
    tScene: { value: null },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tSimulation;
    uniform sampler2D tScene;
    varying vec2 vUv;

    void main() {
      vec4 sim = texture2D(tSimulation, vUv);
      vec2 grad = sim.zw;
      
      // Retrieve the text's alpha mask to separate it from the empty background
      float alpha = texture2D(tScene, vUv + grad * 0.06).a;
      
      // Stronger Chromatic Aberration for that "liquid" text look
      float r = texture2D(tScene, vUv + grad * 0.05).r;
      float g = texture2D(tScene, vUv + grad * 0.06).g;
      float b = texture2D(tScene, vUv + grad * 0.07).b;
      vec3 textColor = vec3(r, g, b);
      
      // A beautiful soft blush/peach aesthetic background gradient!
      vec3 bgColor = mix(vec3(0.96, 0.91, 0.90), vec3(0.88, 0.77, 0.76), vUv.y * 1.5 - 0.2); 
      
      // Composite the text gracefully over the beautiful background
      vec3 finalColor = mix(bgColor, textColor, alpha);
      
      // Background pinkish-white haze where the water ripples happen
      float pressure = sim.x;
      float haze = pow(max(0.0, pressure), 3.0) * 5.0;
      vec3 glow = vec3(1.0, 0.4, 0.8) * haze;

      gl_FragColor = vec4(finalColor + glow, 1.0);
    }
  `,
};

const WaterScene = () => {
  const { viewport, gl } = useThree();
  const simMat = useRef<THREE.ShaderMaterial>(null!);
  const visualMat = useRef<THREE.ShaderMaterial>(null!);
  const textMat = useRef<THREE.ShaderMaterial>(null!);
  const lastMouse = useRef(new THREE.Vector2(0, 0));
  const smoothedVel = useRef(new THREE.Vector2(0, 0));

  // FBOs
  let fboA = useFBO(512, 512, { type: THREE.FloatType });
  let fboB = useFBO(512, 512, { type: THREE.FloatType });
  const sceneFBO = useFBO(); // To capture the bent text scene

  // Scenes
  const simScene = useMemo(() => new THREE.Scene(), []);
  const mainScene = useMemo(() => new THREE.Scene(), []);
  const orthoCam = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);

  useFrame((state) => {
    const { mouse, camera } = state;
    const currentMouse = new THREE.Vector2(mouse.x * 0.5 + 0.5, mouse.y * 0.5 + 0.5);

    // Calculate and smooth mouse velocity for the text bend effect
    const rawVel = new THREE.Vector2().subVectors(currentMouse, lastMouse.current);
    smoothedVel.current.lerp(rawVel, 0.1); // Smooth decay of the velocity

    // 1. Update Physics Simulation
    simMat.current.uniforms.tDiffuse.value = fboA.texture;
    simMat.current.uniforms.mousePos.value.copy(currentMouse);
    simMat.current.uniforms.lastMousePos.value.copy(lastMouse.current);
    gl.setRenderTarget(fboB);
    gl.render(simScene, orthoCam);

    // 2. Render the "Morphing" Text into an FBO
    textMat.current.uniforms.tSimulation.value = fboB.texture;
    if (textMat.current.uniforms.uMousePos) {
      textMat.current.uniforms.uMousePos.value.copy(currentMouse);
      textMat.current.uniforms.uMouseVel.value.copy(smoothedVel.current);
    }
    gl.setRenderTarget(sceneFBO);
    gl.render(mainScene, camera);

    // 3. Final Composite (Chromatic Aberration & Background Glow)
    visualMat.current.uniforms.tSimulation.value = fboB.texture;
    visualMat.current.uniforms.tScene.value = sceneFBO.texture;
    gl.setRenderTarget(null);

    // Swap FBOs
    let temp = fboA;
    fboA = fboB;
    fboB = temp;
    lastMouse.current.copy(currentMouse);
  });

  return (
    <>
      {/* Simulation Plane */}
      {createPortal(
        <mesh>
          <planeGeometry args={[2, 2]} />
          <shaderMaterial ref={simMat} {...SimulationShader} />
        </mesh>,
        simScene
      )}

      {/* The Text that actually bends */}
      {createPortal(
        <Text
          font="https://fonts.gstatic.com/s/playfairdisplay/v40/nuFRD-vYSZviVYUb_rj3ij__anPXDTnCjmHKM4nYO7KN_qiTbtY.ttf"
          fontSize={Math.min(viewport.width * 0.12, 0.38)}
          maxWidth={viewport.width * 0.8}
          fontWeight={500}
          letterSpacing={-0.02}
          lineHeight={0.9}
          textAlign="center"
          anchorX="center"
          anchorY="middle"
          position={[0, 0, 0]}
        >
          Creating the{"\n"}unexpected
          <shaderMaterial
            ref={textMat}
            {...MorphingTextShader}
            transparent
            // We need enough vertices for it to bend smoothly!
            side={THREE.DoubleSide}
          />
        </Text>,
        mainScene
      )}

      {/* The Final Viewport Mesh */}
      <mesh>
        <planeGeometry args={[viewport.width, viewport.height]} />
        <shaderMaterial ref={visualMat} {...WaterVisualShader} transparent />
      </mesh>
    </>
  );
};

export default function Watcher() {
  return (
    <div className="h-screen w-full bg-[#b77ac2]">
      <Canvas camera={{ position: [0, 0, 2], fov: 45 }} dpr={[1, 2]}>
        <WaterScene />
      </Canvas>
    </div>
  );
}
