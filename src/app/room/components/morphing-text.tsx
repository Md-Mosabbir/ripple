"use client";
import React, { useMemo, useRef, useEffect } from "react";
import { useFrame, useThree, createPortal } from "@react-three/fiber";
import { useFBO, Text, Center } from "@react-three/drei";
import { useControls } from "leva";
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
    uInfluence: { value: 1.0 },
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
      uniform float uInfluence;
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
        pVel += influence * (0.1 + mouseSpeed * 5.0) * uInfluence;

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
    uTime: { value: 0 },
    uColor: { value: new THREE.Color("#000000") },
    uChromatic: { value: 1.0 },
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
    uniform vec3 uColor;
    uniform float uChromatic;
    varying vec2 vUv;

    void main() {
      vec4 sim = texture2D(tSimulation, vUv);
      vec2 grad = sim.zw; // The ripple gradient
      
      // Chromatic Aberration: Shift R, G, and B slightly differently
      float r = texture2D(tScene, vUv + grad * 0.05 * uChromatic).r;
      float g = texture2D(tScene, vUv + grad * 0.06 * uChromatic).g;
      float b = texture2D(tScene, vUv + grad * 0.07 * uChromatic).b;
      
      // The ripple glow (shimmer)
      float pressure = sim.x;

      // We want transparency where the text is not present
      vec4 sceneColor = texture2D(tScene, vUv);
      float alpha = texture2D(tScene, vUv + grad * 0.06 * uChromatic).a;

      gl_FragColor = vec4(vec3(r, g, b) * uColor, alpha);
    }
  `,
};

export function MorphingText({ 
  position, 
  rotation, 
  scale = [1, 1, 1],
  fontSize = 1, 
  layer = 0,
  text = "Creating the\nunexpected"
}: any) {
  const { gl } = useThree();

  const folderName = layer === 0 ? "Morphing Text (Main)" : `Morphing Text (Layer ${layer})`;
  const { wireframe, planeSizeMultiplier, chromaticStrength, rippleInfluence } = useControls(folderName, {
    wireframe: false,
    planeSizeMultiplier: { value: 6, min: 1, max: 20, step: 0.1 },
    chromaticStrength: { value: 1.0, min: 0, max: 5.0, step: 0.1 },
    rippleInfluence: { value: 1.0, min: 0.1, max: 5.0, step: 0.1 },
  });

  const simMat = useRef<THREE.ShaderMaterial>(null!);
  const visualMat = useRef<THREE.ShaderMaterial>(null!);
  const lastMouse = useRef(new THREE.Vector2());

  // FBOs for simulation ping-pong
  const fboA = useFBO(512, 512, { type: THREE.HalfFloatType });
  const fboB = useFBO(512, 512, { type: THREE.HalfFloatType });
  const sceneFBO = useFBO(1024, 1024);

  const fboARef = useRef(fboA);
  const fboBRef = useRef(fboB);

  const simScene = useMemo(() => new THREE.Scene(), []);
  const textScene = useMemo(() => new THREE.Scene(), []);
  const orthoCam = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
  const textCam = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10), []);

  useEffect(() => {
    // Increase bounds enough to fit multi-line text
    // A factor of 6-8 usually covers common multi-line cases with room for ripples
    const halfSize = fontSize * 3; 
    textCam.left = -halfSize;
    textCam.right = halfSize;
    textCam.top = halfSize;
    textCam.bottom = -halfSize;
    textCam.updateProjectionMatrix();
  }, [textCam, fontSize]);

  useFrame((state) => {
    const { mouse, clock } = state;
    if (!simMat.current || !visualMat.current) return;

    // Map mouse to 0-1 range for the localized ripples
    const m = new THREE.Vector2(
      mouse.x * 0.5 + 0.5,
      mouse.y * 0.5 + 0.5
    );

    // 1. Run Simulation (Ping-Pong)
    simMat.current.uniforms.tDiffuse.value = fboARef.current.texture;
    simMat.current.uniforms.mousePos.value.copy(m);
    simMat.current.uniforms.lastMousePos.value.copy(lastMouse.current);
    simMat.current.uniforms.uInfluence.value = rippleInfluence;

    gl.setRenderTarget(fboBRef.current);
    gl.render(simScene, orthoCam);

    // 2. Render Text to a hidden texture
    gl.setRenderTarget(sceneFBO);
    gl.setClearColor(0x000000, 0); // Clear with transparent background
    gl.clear();
    gl.render(textScene, textCam);

    // 3. Render Final Visuals to screen (done via main R3F render loop for the mesh below)
    visualMat.current.uniforms.tSimulation.value = fboBRef.current.texture;
    visualMat.current.uniforms.tScene.value = sceneFBO.texture;
    visualMat.current.uniforms.uTime.value = clock.elapsedTime;
    visualMat.current.uniforms.uChromatic.value = chromaticStrength;

    gl.setRenderTarget(null);

    // Swap FBOs
    const temp = fboARef.current;
    fboARef.current = fboBRef.current;
    fboBRef.current = temp;

    lastMouse.current.copy(m);
  });

  return (
    <>
      {/* Simulation Logic - Rendered off-screen */}
      {createPortal(
        <mesh>
          <planeGeometry args={[2, 2]} />
          <shaderMaterial ref={simMat} {...SimulationShader} />
        </mesh>,
        simScene
      )}

      {/* The Text Scene - Rendered off-screen into sceneFBO */}
      {createPortal(
        <>
          <ambientLight intensity={1} />
          <Center>
            <Text
              fontSize={fontSize}
              color="white"
              anchorX="center"
              anchorY="middle"
              font="https://fonts.gstatic.com/s/playfairdisplay/v40/nuFRD-vYSZviVYUb_rj3ij__anPXDTnCjmHKM4nYO7KN_qiTbtY.ttf"
            >
              {text}
              {wireframe && <meshBasicMaterial wireframe color="white" />}
            </Text>
          </Center>
        </>,
        textScene
      )}

      {/* The Final Display Plane in the main scene */}
      <mesh 
        position={position} 
        rotation={rotation} 
        scale={scale}
        frustumCulled={false}
        onUpdate={(o) => o.layers.set(layer)}
      >
        <planeGeometry args={[fontSize * planeSizeMultiplier, fontSize * planeSizeMultiplier]} />
        <shaderMaterial
          ref={visualMat}
          {...WaterVisualShader}
          transparent
          wireframe={wireframe}
        />
      </mesh>
    </>
  );
}
