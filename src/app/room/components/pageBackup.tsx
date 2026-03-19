"use client";
import React, { useMemo, useRef, Suspense } from "react";
import { Canvas, useFrame, useThree, createPortal } from "@react-three/fiber";
import { useFBO, Environment } from "@react-three/drei";

import { useControls, Leva } from "leva";
import * as THREE from "three";

import { CameraController, Architecture, SceneText } from "./SceneElements";

// --- 1. SIMULATION SHADER (Physics) ---
const SimulationShader = {
  uniforms: {
    tDiffuse: { value: null },
    delta: { value: 1.1 },
    resolution: { value: new THREE.Vector2(512, 512) },
    mousePos: { value: new THREE.Vector2(0, 0) },
    lastMousePos: { value: new THREE.Vector2(0, 0) },
    uDamping: { value: 0.96 },
    uTime: { value: 0 }
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
    uniform float uTime;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

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
      pVel *= uDamping;
      pressure *= uDamping;

      float mouseSpeed = distance(mousePos, lastMousePos);
      float dist = distance(vUv, mousePos);
      if (dist < 0.035) { 
          pressure += min(mouseSpeed * 25.0, 0.8); 
      } 

      for (int i = 0; i < 8; i++) {
        float fi = float(i);
        float ex = 0.1 + fi * 0.115;
        float ey = 0.3 + 0.4 * sin(uTime * 0.07 + fi * 2.39996);
        vec2 emitter = vec2(ex, ey);
        float d = distance(vUv, emitter);
        float freq  = 1.8 + hash(vec2(fi, 0.0)) * 1.2;
        float phase = hash(vec2(fi, 1.0)) * 6.2832;
        float pulse = sin(uTime * freq + phase);
        float dropRadius = 0.012 + hash(vec2(fi, 2.0)) * 0.008;
        if (d < dropRadius && pulse > 0.7) {
          float strength = (1.0 - d / dropRadius) * (pulse - 0.7) / 0.3;
          pressure += strength * 0.18;
        }
      }

      gl_FragColor = vec4(pressure, pVel, (p_right - p_left), (p_up - p_down));
    }
  `,
};

// --- 2. WATER VISUAL SHADER (Simplified: No Reflection) ---
const WaterShader = {
  uniforms: {
    tSimulation: { value: null },
    tRefraction: { value: null },
    uRefractionStrength: { value: 0.2 },
    uGlowSize: { value: 2.5 }
  },
  vertexShader: `
    varying vec2 vUv;
    varying vec4 vScreenPos;
    uniform sampler2D tSimulation;

    void main() {
      vUv = uv;
      vec3 pos = position;
      float ripple = texture2D(tSimulation, uv).r;
      pos.z += ripple * 1.5;
      
      vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
      vec4 projectionPosition = projectionMatrix * viewMatrix * worldPosition;
      vScreenPos = projectionPosition;
      gl_Position = projectionPosition;
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    varying vec4 vScreenPos;
    uniform sampler2D tSimulation;
    uniform sampler2D tRefraction;
    uniform float uRefractionStrength;
    uniform float uGlowSize;

    void main() {
      vec4 sim = texture2D(tSimulation, vUv);
      float pressure = sim.x;
      vec2 distortion = sim.zw;

      vec2 screenUv = (vScreenPos.xy / vScreenPos.w) * 0.5 + 0.5;

      // 1. REFRACTION (Looking through the water)
      vec2 refractedUv = screenUv + distortion * uRefractionStrength;
      vec3 refraction = texture2D(tRefraction, refractedUv).rgb;

      // 2. BASE COLOR (Pink palette)
      vec3 pinkBase = mix(vec3(1.0, 0.95, 0.92), vec3(0.95, 0.85, 0.82), vUv.y);
      
      // 3. MIX REFRACTION WITH COLOR
      vec3 finalColor = mix(refraction, pinkBase, 0.4);

      // 4. GLOW/HIGHLIGHTS
      vec3 highlight = vec3(1.0, 0.98, 1.0) * pow(max(0.0, pressure), 2.0) * 3.0;
      vec3 pinkGlow  = vec3(1.0, 0.4, 0.8) * pow(max(0.0, pressure), uGlowSize) * 2.0;
      
      finalColor += highlight + pinkGlow;

      float edgeMask = smoothstep(0.5, 0.49, distance(vUv, vec2(0.5))); 
      gl_FragColor = vec4(finalColor, edgeMask);
    }
  `
};

const Scene = () => {
  const { gl, camera } = useThree();
  const simMat = useRef<THREE.ShaderMaterial>(null!);
  const waterMat = useRef<THREE.ShaderMaterial>(null!);
  const uvMouse = useRef(new THREE.Vector2(0, 0));
  const lastUvMouse = useRef(new THREE.Vector2(0, 0));

  const { damping, refractionStrength, glowSize } = useControls("Water Style", {
    damping: { value: 0.97, min: 0.9, max: 0.99 },
    refractionStrength: { value: 0.25, min: 0, max: 1.0 },
    glowSize: { value: 2.5, min: 1.0, max: 5.0 },
  });

  const { waterY } = useControls("Layout", {
    waterY: { value: -2.0, min: -5, max: 5 },
  });

  const fboA = useFBO(512, 512, { type: THREE.FloatType });
  const fboB = useFBO(512, 512, { type: THREE.FloatType });
  const refractionFbo = useFBO(); 

  const simTargets = useRef({ read: fboA, write: fboB });
  const simScene = useMemo(() => new THREE.Scene(), []);
  const orthoCam = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);

  useFrame(({ scene, clock }) => {
    if (!waterMat.current || !simMat.current) return;

    // 1. REFRACTION PASS (Render scene without water)
    waterMat.current.visible = false;
    camera.layers.enable(2);
    gl.setRenderTarget(refractionFbo);
    gl.render(scene, camera);
    camera.layers.disable(2);
    waterMat.current.visible = true;

    // 2. SIMULATION PHYSICS
    simMat.current.uniforms.uTime.value = clock.elapsedTime;
    simMat.current.uniforms.uDamping.value = damping;
    simMat.current.uniforms.mousePos.value.copy(uvMouse.current);
    simMat.current.uniforms.lastMousePos.value.copy(lastUvMouse.current);

    for (let i = 0; i < 2; i++) {
      simMat.current.uniforms.tDiffuse.value = simTargets.current.read.texture;
      gl.setRenderTarget(simTargets.current.write);
      gl.render(simScene, orthoCam);
      const temp = simTargets.current.read;
      simTargets.current.read = simTargets.current.write;
      simTargets.current.write = temp;
    }
    gl.setRenderTarget(null);

    // 3. UPDATE WATER UNIFORMS
    waterMat.current.uniforms.tSimulation.value = simTargets.current.read.texture;
    waterMat.current.uniforms.tRefraction.value = refractionFbo.texture;
    waterMat.current.uniforms.uRefractionStrength.value = refractionStrength;
    waterMat.current.uniforms.uGlowSize.value = glowSize;

    lastUvMouse.current.copy(uvMouse.current);
  });

  return (
    <>
      <CameraController x={86} y={12} z={-64} fov={35} near={0.1} far={10000} autoLookAt={true} />

      {createPortal(
        <mesh>
          <planeGeometry args={[2, 2]} />
          <shaderMaterial ref={simMat} {...SimulationShader} />
        </mesh>,
        simScene
      )}

      <Suspense fallback={null}>
        <Environment files="/pink_sunrise_4k.hdr" background={false} />
        <Architecture />
        {/* Fake Reflection Architecture */}
        <Architecture position={[0, waterY, 0]} scale={[1, -1, 1]} layer={2} />

        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, waterY, 0]}
          onPointerMove={(e) => e.uv && uvMouse.current.copy(e.uv)}
        >
          <planeGeometry args={[500, 500, 512, 512]} />
          <shaderMaterial
            ref={waterMat}
            {...WaterShader}
            transparent={true}
            side={THREE.DoubleSide}
          />
        </mesh>

        <SceneText
          position={[40, 12.5, -24]}
          rotation={[0, 2.2, 0]}
          fontSize={6.1}
        />
        {/* Fake Reflection Text */}
        <SceneText
          position={[40, 2 * waterY  - 10 , -24]}
          rotation={[0, 2.2, 0]}
          scale={[1, -1, 1]}
          fontSize={6.1}
          layer={2}
        />
      </Suspense>

      <ambientLight intensity={0.4} />
    </>
  );
};

export default function RoomPage() {
  return (
    <div className="h-screen w-full bg-[#f5ebeb]">
      <Leva collapsed={false} />
      <Canvas dpr={[1, 2]}>
        <Scene />
      </Canvas>
    </div>
  );
}