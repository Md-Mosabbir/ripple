"use client";
import React, { useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree, createPortal } from "@react-three/fiber";
import { useFBO, Text } from "@react-three/drei";
import * as THREE from "three";

// ------------------
// 1. SIMULATION SHADER (The Math)
// ------------------
const SimulationShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(512, 512) },
    mousePos: { value: new THREE.Vector2(0, 0) },
    lastMousePos: { value: new THREE.Vector2(0, 0) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform vec2 mousePos;
    uniform vec2 lastMousePos;
    varying vec2 vUv;

    void main() {
      vec2 texel = 1.0 / resolution;
      vec4 data = texture2D(tDiffuse, vUv);
      float pressure = data.x;
      float pVel = data.y;

      float pR = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).x;
      float pL = texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).x;
      float pU = texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).x;
      float pD = texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).x;

      pVel += (pR + pL + pU + pD - 4.0 * pressure) * 0.5;
      pressure += pVel;

      pVel *= 0.98;
      pressure *= 0.98;

      float dist = distance(vUv, mousePos);
      float influence = smoothstep(0.06, 0.0, dist);
      float mouseSpeed = distance(mousePos, lastMousePos);
      pVel += influence * (0.1 + mouseSpeed * 5.0);

      gl_FragColor = vec4(pressure, pVel, pR - pL, pU - pD);
    }
  `,
};

// ------------------
// 2. VISUAL SHADER (The Look)
// ------------------
const WaterVisualShader = {
  uniforms: {
    tSimulation: { value: null },
    tScene: { value: null },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tSimulation;
    uniform sampler2D tScene;
    varying vec2 vUv;

    void main() {
      vec4 sim = texture2D(tSimulation, vUv);
      vec2 grad = sim.zw; // The ripple gradient
      
      // Chromatic Aberration: Shift R, G, and B slightly differently
      float r = texture2D(tScene, vUv + grad * 0.05).r;
      float g = texture2D(tScene, vUv + grad * 0.06).g;
      float b = texture2D(tScene, vUv + grad * 0.07).b;
      
      // The ripple glow (shimmer)
      float pressure = sim.x;

      gl_FragColor = vec4(vec3(r, g, b) , 1.0);
    }
  `,
};

// ------------------
// 3. MAIN SCENE
// ------------------
function WaterScene() {
  const { viewport, gl } = useThree();

  const simMat = useRef<THREE.ShaderMaterial>(null!);
  const visualMat = useRef<THREE.ShaderMaterial>(null!);
  const lastMouse = useRef(new THREE.Vector2());

  // FBOs for simulation ping-pong
  const fboA = useFBO(512, 512, { type: THREE.HalfFloatType });
  const fboB = useFBO(512, 512, { type: THREE.HalfFloatType });
  const sceneFBO = useFBO(); // To capture the Text

  const fboARef = useRef(fboA);
  const fboBRef = useRef(fboB);

  const simScene = useMemo(() => new THREE.Scene(), []);
  const textScene = useMemo(() => new THREE.Scene(), []);
  const orthoCam = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);

  useEffect(() => {
    gl.autoClear = false;
  }, [gl]);

  useFrame((state) => {
    const mouse = new THREE.Vector2(
      state.mouse.x * 0.5 + 0.5,
      state.mouse.y * 0.5 + 0.5
    );

    // 1. Run Simulation (Ping-Pong)
    simMat.current.uniforms.tDiffuse.value = fboARef.current.texture;
    simMat.current.uniforms.mousePos.value.copy(mouse);
    simMat.current.uniforms.lastMousePos.value.copy(lastMouse.current);

    gl.setRenderTarget(fboBRef.current);
    gl.render(simScene, orthoCam);

    // 2. Render Text to a hidden texture
    gl.setRenderTarget(sceneFBO);
    gl.clear();
    gl.render(textScene, state.camera);

    // 3. Render Final Visuals to screen
    visualMat.current.uniforms.tSimulation.value = fboBRef.current.texture;
    visualMat.current.uniforms.tScene.value = sceneFBO.texture;

    gl.setRenderTarget(null);
    gl.clear();

    // Swap FBOs
    const temp = fboARef.current;
    fboARef.current = fboBRef.current;
    fboBRef.current = temp;

    lastMouse.current.copy(mouse);
  });

  return (
    <>
      {/* Simulation Logic */}
      {createPortal(
        <mesh>
          <planeGeometry args={[2, 2]} />
          <shaderMaterial ref={simMat} {...SimulationShader} />
        </mesh>,
        simScene
      )}

      {/* The Text Scene (Underwater) */}
      {createPortal(
        <>
          <ambientLight intensity={1} />
          <Text
            fontSize={viewport.width * 0.15}
            color="white"
            anchorX="center"
            anchorY="middle"
          >
            RIPPLE{"\n"}TEXT
          </Text>
        </>,
        textScene
      )}

      {/* The Final Display Plane */}
      <mesh frustumCulled={false}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          ref={visualMat}
          {...WaterVisualShader}
          transparent
        />
      </mesh>
    </>
  );
}

export default function App() {
  return (
    <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
      <Canvas camera={{ position: [0, 0, 2], fov: 45 }} dpr={[1, 2]}>
        <WaterScene />
      </Canvas>
    </div>
  );
}
