"use client";
import { useMemo, useRef, Suspense } from "react";
import { Canvas, useFrame, createPortal, useLoader } from "@react-three/fiber";
import {
  useFBO,
  Environment,
  OrbitControls,
  ContactShadows,
} from "@react-three/drei";
import { useControls, Leva } from "leva";
import * as THREE from "three";
import { CameraController } from "./components/SceneElements";
import { RGBELoader } from "three/examples/jsm/Addons.js";
import { Petals } from "./petals";
import { MorphingText } from "./components/morphing-text";
import { Architecture } from "./components/architecture";
import SceneEffects from "./components/scene-effects";

// --- 1. SIMULATION SHADER ---
const SimulationShader = {
  uniforms: {
    tDiffuse: { value: null },
    delta: { value: 1.0 }, // [Range 0.5 - 1.0] Lower is more stable
    resolution: { value: new THREE.Vector2(512, 512) },
    mousePos: { value: new THREE.Vector2(0, 0) },
    lastMousePos: { value: new THREE.Vector2(0, 0) },
    uDamping: { value: 0.96 }, // [Range 0.90 - 0.99] Lower = thicker liquid
    uTime: { value: 0 },
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
      // --- STABILITY TUNING ---
      float waveSpeed = 0.25;    // [Range 0.1 - 0.5] How fast waves travel
      float mouseSize = 0.015;   // [Range 0.01 - 0.1] Size of the "brush"
      float mouseStrength = 0.8; // [Range 0.1 - 1.0] Max height of ripples
      // ------------------------

      vec2 texel = 1.0 / resolution;
      vec4 data = texture2D(tDiffuse, vUv);
      float pressure = data.x;
      float pVel = data.y;
      
      float p_right = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).x;
      float p_left = texture2D(tDiffuse, vUv + vec2(-texel.x, 0.0)).x;
      float p_up = texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).x;
      float p_down = texture2D(tDiffuse, vUv + vec2(0.0, -texel.y)).x;
      
      // Discrete Wave Equation
      float acceleration = (p_right + p_left + p_up + p_down - 4.0 * pressure) * waveSpeed;
      pVel += acceleration * delta;
      pressure += pVel * delta;
      
      // Apply damping
      pVel *= uDamping;
      pressure *= uDamping;

      // --- STABLE MOUSE INJECTION ---
      float mouseDist = distance(vUv, mousePos);
      float mouseSpeed = distance(mousePos, lastMousePos);
      
      if (mouseDist < mouseSize) {
        // Instead of += (which explodes), we use max() to "cap" the energy
        float impact = min(mouseSpeed * 15.0, mouseStrength);
        pressure = max(pressure, impact); 
      }

      // Store physics data: Red=Pressure, Green=Velocity, Blue/Alpha=Normals
      gl_FragColor = vec4(pressure, pVel, (p_right - p_left), (p_up - p_down));
    }
  `,
};

// --- 2. WATER SHADER ---
const WaterShader = {
  uniforms: {
    tSimulation: { value: null },
    tRefraction: { value: null },
    uRefractionStrength: { value: 0.2 }, // [Range 0.0 - 1.0] How much waves distort the BG
    uGlowSize: { value: 2.5 },           // [Range 1.0 - 5.0] Sharpness of pink glow
    uTime: { value: 0 },
    uWaveSpeed: { value: 0.5 },          // [Range 0.1 - 2.0] Speed of background ripples
  },
  vertexShader: `
    varying vec2 vUv;
    varying vec4 vScreenPos;
    varying vec3 vWorldPos;
    uniform sampler2D tSimulation;

    void main() {
      vUv = uv;
      vec3 pos = position;
      
      // Pull height from the simulation
      float ripple = texture2D(tSimulation, uv).r;
      pos.z += ripple * 1.2; // Vertical displacement
      
      vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
      vWorldPos = worldPosition.xyz;
      vec4 projectionPosition = projectionMatrix * viewMatrix * worldPosition;
      vScreenPos = projectionPosition;
      gl_Position = projectionPosition;
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    varying vec4 vScreenPos;
    varying vec3 vWorldPos;
    uniform sampler2D tSimulation;
    uniform sampler2D tRefraction;
    uniform float uRefractionStrength;
    uniform float uGlowSize;
    uniform float uTime;
    uniform float uWaveSpeed;

    // Background procedural wave math
    vec2 wavedx(vec2 position, vec2 direction, float frequency, float timeshift) {
      float x = dot(direction, position) * frequency + timeshift;
      float wave = exp(sin(x) - 1.0);
      float dx = wave * cos(x);
      return vec2(wave, -dx);
    }

    float getwaves(vec2 position) {
      float iter = 0.0;
      float frequency = 1.0;
      float timeMultiplier = 2.0;
      float weight = 1.0;
      float sumOfValues = 0.0;
      float sumOfWeights = 0.0;
      for(int i=0; i < 6; i++) { // Slightly optimized from 8 to 6 iterations
        vec2 p = vec2(sin(iter), cos(iter));
        vec2 res = wavedx(position, p, frequency, uTime * uWaveSpeed * timeMultiplier);
        position += p * res.y * weight * 0.3;
        sumOfValues += res.x * weight;
        sumOfWeights += weight;
        weight *= 0.82;
        frequency *= 1.18;
        timeMultiplier *= 1.07;
        iter += 12.39;
      }
      return sumOfValues / sumOfWeights;
    }

    void main() {
      // 1. Get Simulation data
      vec4 sim = texture2D(tSimulation, vUv);
      float pressure = sim.x;
      vec2 physicsDistortion = sim.zw;

      // 2. Get Background Procedural Waves
      float octaveHeight = getwaves(vWorldPos.xz * 0.2);

      // 3. Combine distortions for refraction
      vec2 screenUv = (vScreenPos.xy / vScreenPos.w) * 0.5 + 0.5;
      vec2 finalDistortion = physicsDistortion * 0.5 + (octaveHeight * 0.05); 
      vec3 refraction = texture2D(tRefraction, screenUv + finalDistortion * uRefractionStrength).rgb;

      // 4. Color Layers
      vec3 pinkBase = mix(vec3(1.0, 0.92, 0.95), vec3(0.98, 0.80, 0.85), vUv.y);
      vec3 finalColor = mix(refraction, pinkBase, 0.35);

      // 5. Highlights and Glow
      float peak = pow(max(0.0, octaveHeight), 2.0);
      vec3 octaveHighlight = vec3(1.0, 0.95, 1.0) * peak * 0.3;
      
      // The pressure from the mouse creates these two glows:
      vec3 mouseWhite = vec3(1.0, 1.0, 1.0) * pow(max(0.0, pressure), 2.0) * 2.0;
      vec3 pinkGlow = vec3(1.0, 0.3, 0.6) * pow(max(0.0, pressure), uGlowSize) * 2.5;
      
      finalColor += mouseWhite + pinkGlow + octaveHighlight;

      // 6. Circular Mask
      float edgeMask = smoothstep(0.5, 0.48, distance(vUv, vec2(0.5))); 
      gl_FragColor = vec4(finalColor, edgeMask);
    }
  `,
};

function SkyDome({ layer = 0 }) {
  const texture = useLoader(RGBELoader, "/pink_sunrise_4k.hdr");

  const { rotationX, rotationY, rotationZ } = useControls("Sky Rotation", {
    rotationX: { value: 1.72, min: -Math.PI, max: Math.PI, step: 0.01 },
    rotationY: { value: 2.8, min: -Math.PI, max: Math.PI, step: 0.01 },
    rotationZ: { value: -1.1, min: -Math.PI, max: Math.PI, step: 0.01 },
  });

  return (
    <mesh
      rotation={[rotationX, rotationY, rotationZ]}
      onUpdate={(o) => {
        o.layers.set(layer);
        if (layer === 2) o.layers.enable(2);
      }}
    >
      <sphereGeometry args={[500, 64, 32]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} fog={false} />
    </mesh>
  );
}

const Scene = () => {
  const simMat = useRef<THREE.ShaderMaterial>(null!);
  const waterMat = useRef<THREE.ShaderMaterial>(null!);
  const meshGroup = useRef<THREE.Group>(null!);
  const uvMouse = useRef(new THREE.Vector2(0, 0));
  const lastUvMouse = useRef(new THREE.Vector2(0, 0));

  const { damping, refractionStrength, glowSize, waveSpeed } = useControls(
    "Water Style",
    {
      damping: { value: 0.97, min: 0.9, max: 0.99 },
      refractionStrength: { value: 0.25, min: 0, max: 1.0 },
      glowSize: { value: 2.5, min: 1.0, max: 5.0 },
      waveSpeed: { value: 0.4, min: 0, max: 2.0 },
    },
  );

  const { waterY } = useControls("Layout", {
    waterY: { value: -0.9, min: -5, max: 5 },
  });

  const { moveStrength, lerpSpeed } = useControls("Building Tracking", {
    moveStrength: { value: 0.15, min: 0, max: 0.5, step: 0.01 },
    lerpSpeed: { value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
  });

  const { textPos, textRot, fontSize } = useControls("Scene Text", {
    textPos: { value: [42.1, 9.9, -32.2], step: 0.1, min: -200, max: 200 },
    textRot: { value: [0, 2.23, 0], step: 0.01, min: -Math.PI, max: Math.PI },
    fontSize: { value: 4.1, min: 1, max: 20 },
  });

  const fboA = useFBO(512, 512, { type: THREE.FloatType });
  const fboB = useFBO(512, 512, { type: THREE.FloatType });
  const refractionFbo = useFBO();
  const simTargets = useRef({ read: fboA, write: fboB });
  const simScene = useMemo(() => new THREE.Scene(), []);
  const orthoCam = useMemo(
    () => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    [],
  );

  useFrame((state) => {
    const { scene, clock, mouse, camera, gl } = state;
    if (!waterMat.current || !simMat.current || !meshGroup.current) return;

    // --- 1. MESH ROTATION TRACKING ---
    // Set order to YXZ so Y (horizontal) doesn't skew the X (vertical)

    // mouse.x (Left/Right) controls Rotation Y
    // mouse.y (Up/Down) controls Rotation X
    const targetY = mouse.x * moveStrength * 0.5;
    const targetX = mouse.y * moveStrength;
    meshGroup.current.rotation.y = THREE.MathUtils.lerp(
      meshGroup.current.rotation.y,
      targetY,
      lerpSpeed,
    );
    meshGroup.current.rotation.z = THREE.MathUtils.lerp(
      meshGroup.current.rotation.x,
      targetX,
      lerpSpeed,
    );

    // --- 2. REFRACTION PASS ---
    waterMat.current.visible = false;
    camera.layers.enable(2);
    gl.setRenderTarget(refractionFbo);
    gl.render(scene, camera);
    camera.layers.disable(2);
    waterMat.current.visible = true;

    // --- 3. SIMULATION PHYSICS ---
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

    // --- 4. UPDATE WATER ---
    waterMat.current.uniforms.tSimulation.value =
      simTargets.current.read.texture;
    waterMat.current.uniforms.tRefraction.value = refractionFbo.texture;
    waterMat.current.uniforms.uRefractionStrength.value = refractionStrength;
    waterMat.current.uniforms.uGlowSize.value = glowSize;
    waterMat.current.uniforms.uTime.value = clock.elapsedTime;
    waterMat.current.uniforms.uWaveSpeed.value = waveSpeed;

    lastUvMouse.current.copy(uvMouse.current);
  });

  const { camX, camY, camZ, camRX, camRY, camRZ, camFov, autoLookAt } =
    useControls("Camera Settings", {
      autoLookAt: { value: true },
      camX: { value: 86, min: -300, max: 300, step: 1 },
      camY: { value: 12, min: -200, max: 200, step: 1 },
      camZ: { value: -64, min: -300, max: 300, step: 1 },
      // Manual rotation controls (used when autoLookAt is off)
      camRX: { value: 0, min: -Math.PI, max: Math.PI, step: 0.01 },
      camRY: { value: 0, min: -Math.PI, max: Math.PI, step: 0.01 },
      camRZ: { value: 0, min: -Math.PI, max: Math.PI, step: 0.01 },
      camFov: { value: 35, min: 10, max: 120, step: 1 },
    });

  const { sunIntensity, sunColor, sunPos } = useControls("Sunny Lighting", {
    sunIntensity: { value: 4.5, min: 0, max: 10 },
    sunColor: "#ffdcb5",
    sunPos: { value: [200, -112, -100], step: 1 },
  });
  const { fogColor, fogDensity } = useControls("Environment Fog", {
    fogColor: "#f2d6b2", // Match your page background or sky pink
    fogDensity: { value: 0.01, min: 0, max: 0.0001, step: 0.0001 },
  });

  return (
    <>
      <CameraController
        x={camX}
        y={camY}
        z={camZ}
        rx={camRX}
        ry={camRY}
        rz={camRZ}
        fov={camFov}
        near={0.1}
        far={10000}
        autoLookAt={autoLookAt}
      />
      <axesHelper args={[1000]} />
      {/* ADD THIS LINE */}
      <color attach="background" args={[fogColor]} />
      <fogExp2 attach="fog" args={[fogColor, fogDensity]} />
      {createPortal(
        <mesh>
          <planeGeometry args={[2, 2]} />
          <shaderMaterial ref={simMat} {...SimulationShader} />
        </mesh>,
        simScene,
      )}

      <Suspense fallback={null}>
        <group ref={meshGroup}>
          <SkyDome layer={0} />
          <SkyDome layer={2} />
          <Environment files="/pink_sunrise_4k.hdr" />

          {/* MESH GROUP: Everything in here follows the cursor */}

          <Architecture />
          <Petals count={150} />
          <Architecture
            position={[0, waterY, 0]}
            scale={[1, -1, 1]}
            layer={2}
          />

          {/* 1. THE MAIN TEXT (LAYER 0) */}
          <MorphingText
            position={textPos}
            rotation={textRot}
            fontSize={fontSize}
            layer={0}
          />

          {/* 2. THE REFLECTED TEXT (LAYER 2) */}
          <MorphingText
            position={[textPos[0], 2 * waterY - textPos[1], textPos[2]]}
            rotation={textRot}
            scale={[1, -1, 1]} // Flips it vertically for the reflection
            fontSize={fontSize}
            layer={2}
          />

          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, waterY, 0]}
            onPointerMove={(e) => e.uv && uvMouse.current.copy(e.uv)}
          >
            <planeGeometry args={[200, 200, 300, 300]} />
            <shaderMaterial
              ref={waterMat}
              {...WaterShader}
              transparent={true}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      </Suspense>

      <OrbitControls />
      {/* 1. Subtle global light to lift the shadows */}
      <ambientLight intensity={0.2} />

      {/* 2. The "Sun": High intensity, warm color, and specific angle */}
      <directionalLight
        position={sunPos}
        intensity={sunIntensity}
        color={sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
      >
        <orthographicCamera
          attach="shadow-camera"
          args={[-100, 100, 100, -100, 0.5, 500]}
        />
      </directionalLight>

      <ContactShadows
        position={[0, waterY + 0.01, 0]}
        opacity={0.4}
        scale={100}
        blur={2}
        far={10}
        color="#4b0000" // Dark reddish-brown shadows look better with pink
      />
    </>
  );
};

export default function RoomPage() {
  return (
    <div className="h-screen w-full bg-[#f5ebeb]">
      <Leva collapsed={false} />
      <Canvas dpr={[1, 2]}>
        <Scene />
        <SceneEffects />
      </Canvas>
    </div>
  );
}
