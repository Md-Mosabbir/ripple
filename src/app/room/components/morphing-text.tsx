"use client";
import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Center, Text } from "@react-three/drei";
import * as THREE from "three";

const TEXT_CONFIG = {
  glowRadius: 0.15,
  glowSharpness: 2.5,
  displacement: 0.5,
  pinkTailWidth: 0.2,
  // --- WAVE SETTINGS ---
  waveSpeed: 2.0,        // How fast the wave rolls
  waveFrequency: 4.0,    // How many "humps" in the wave
  waveAmplitude: 0.15,   // How tall the wave is
};

export function MorphingText({ position, rotation, fontSize, layer = 0 }: any) {
  const meshRef = useRef<any>(null);
  const mouseLerp = useRef(new THREE.Vector2(0.5, 0.5));

  useFrame((state) => {
    if (!meshRef.current) return;
    const { mouse, clock } = state;

    // Smooth mouse following
    mouseLerp.current.x = THREE.MathUtils.lerp(mouseLerp.current.x, mouse.x * 0.5 + 0.5, 0.08);
    mouseLerp.current.y = THREE.MathUtils.lerp(mouseLerp.current.y, mouse.y * 0.5 + 0.5, 0.08);

    const material = meshRef.current.material;
    material.uniforms.uTime.value = clock.elapsedTime;
    material.uniforms.uMouse.value.set(mouseLerp.current.x, mouseLerp.current.y);
  });

  return (
    <Center position={position} rotation={rotation}>
      <Text
        ref={meshRef}
        fontSize={fontSize}
        font="https://fonts.gstatic.com/s/playfairdisplay/v40/nuFRD-vYSZviVYUb_rj3ij__anPXDTnCjmHKM4nYO7KN_qiTbtY.ttf"
        anchorX="center"
        anchorY="middle"
        onUpdate={(o) => o.layers.set(layer)}
      >
        Creating the{"\n"}unexpected
        <shaderMaterial
          transparent
          uniforms={{
            uTime: { value: 0 },
            uMouse: { value: new THREE.Vector2(0.5, 0.5) },
          }}
          vertexShader={`
            varying vec2 vUv;
            varying float vDist;
            uniform float uTime;
            uniform vec2 uMouse;

            void main() {
              vUv = uv;
              vec3 pos = position;

              // 1. BASE SINE WAVE (The "Wavy" Look)
              // We use pos.x so the wave travels horizontally across the letters
              float wave = sin(pos.x * ${TEXT_CONFIG.waveFrequency.toFixed(1)} + uTime * ${TEXT_CONFIG.waveSpeed.toFixed(1)}) * ${TEXT_CONFIG.waveAmplitude.toFixed(2)};
              pos.y += wave;
              pos.z += wave * 0.5;

              // 2. MOUSE DISPLACEMENT
              float dist = distance(uv, uMouse);
              vDist = dist;
              float lift = smoothstep(${TEXT_CONFIG.glowRadius.toFixed(2)}, 0.0, dist);
              
              // Add the mouse pull on top of the base wave
              pos.z += lift * ${TEXT_CONFIG.displacement.toFixed(2)};
              pos.y += lift * 0.1;

              gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
          `}
          fragmentShader={`
            varying vec2 vUv;
            varying float vDist;

            void main() {
              vec3 baseColor = vec3(0.2, 0.2, 0.2);

              // Smooth white glow
              float whiteMask = pow(smoothstep(${TEXT_CONFIG.glowRadius.toFixed(2)}, 0.0, vDist), ${TEXT_CONFIG.glowSharpness.toFixed(1)});
              vec3 whiteLight = vec3(1.0) * whiteMask;

              // Pink tail on the edges
              float tailMask = smoothstep(${TEXT_CONFIG.pinkTailWidth.toFixed(2)}, 0.0, vDist);
              float pinkEdge = clamp(tailMask - whiteMask, 0.0, 1.0);
              vec3 pinkTail = vec3(1.0, 0.4, 0.7) * pinkEdge * 0.6;

              gl_FragColor = vec4(baseColor + whiteLight + pinkTail, 1.0);
            }
          `}
        />
      </Text>
    </Center>
  );
}
