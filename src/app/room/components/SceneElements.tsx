"use client";
import { useThree, useFrame, extend } from "@react-three/fiber";
import { useGLTF, shaderMaterial } from "@react-three/drei";
import * as THREE from "three";
import { GLTF } from "three/examples/jsm/Addons.js";
import { useEffect, useRef, useState } from "react";
import { PinkGrass } from "./grass";

// --- 1. THE MOUNTAIN SHADER ---
// This handles the pink gradient and the white glowing wave
const MountainMaterial = shaderMaterial(
  {
    uTime: 0,
    uBaseColor: new THREE.Color("#C686BC"), // Surface Pink
    uPeakColor: new THREE.Color("#ffe0e9"), // Lighter Peak Pink
    uWaveColor: new THREE.Color("#ffffff"), // The White Wave
  },
  `
  varying float vY;
  varying vec3 vWorldPosition;
  void main() {
    vY = position.y;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
  `,
  `
  uniform float uTime;
  uniform vec3 uBaseColor;
  uniform vec3 uPeakColor;
  uniform vec3 uWaveColor;
  varying float vY;
  varying vec3 vWorldPosition;

  void main() {
    // 1. Soft Vertical Gradient
    vec3 color = mix(uBaseColor, uPeakColor, smoothstep(-2.0, 6.0, vY));

    // 2. The Continuous White Wave 
    // Spreading out from the center (0,0,0)
    float dist = length(vWorldPosition.xz);
    float wave = sin(dist * 0.4 - uTime * 2.0);
    float ripple = smoothstep(0.9, 1.0, wave);
    
    // Mix wave glow (0.2 for subtle, increase for more glow)
    vec3 finalColor = mix(color, uWaveColor, ripple * 0.25);

    gl_FragColor = vec4(finalColor, 1.0);
  }
  `
);

extend({ MountainMaterial });

// --- 2. THE NEW MOUNTAIN COMPONENT ---
function Mountain({ geometry, layer, mountainRef }: any) {
  const matRef = useRef<any>(null!);

  useFrame((state) => {
    if (matRef.current) {
      matRef.current.uTime = state.clock.elapsedTime;
    }
  });

  const handleUpdate = (o: any) => {
    o.layers.set(layer);
    o.layers.enable(1);
  };

  return (
    <mesh ref={mountainRef} geometry={geometry} onUpdate={handleUpdate}>
      <mountainMaterial ref={matRef} transparent />
    </mesh>
  );
}

// --- 3. MAIN ARCHITECTURE COMPONENT ---
export function Architecture({ layer = 0, ...props }: any) {
  const { nodes, materials } = useGLTF("/unseen.glb") as any;

  // Refs for the mountains
  const mountainRef = useRef<THREE.Mesh>(null!);
  const mountainRef2 = useRef<THREE.Mesh>(null!);

  const handleUpdate = (o: any) => {
    o.layers.set(layer);
    o.layers.enable(1);
  };

  return (
    <group {...props} dispose={null}>
      {/* The Grass components. 
          Note: I pass the refs directly. PinkGrass now handles the 
          'ready' state internally to prevent the "F12/Move camera" bug.
      */}
      <PinkGrass
        targetMesh={mountainRef2}
        count={1000}
        scaleVar={1.7}
        onUpdate={handleUpdate}
      />

      <PinkGrass
        targetMesh={mountainRef}
        count={2000}
        scaleVar={1.7} // Scaled down for that "carpet" look
        onUpdate={handleUpdate}
      />

      {/* Architecture Elements */}
      <mesh geometry={nodes.SM_Wall.geometry} onUpdate={handleUpdate}>
        <primitive object={materials.Mat_Architecture} attach="material" />
      </mesh>

      {/* Using the new Mountain Component for both mountains */}
      <Mountain
        mountainRef={mountainRef}
        geometry={nodes.SM_Mountain.geometry}
        layer={layer}
      />

      <Mountain
        mountainRef={mountainRef2}
        geometry={nodes.SM_Mountain2.geometry}
        layer={layer}
      />

      {/* Rocks and Ledges */}
      <mesh geometry={nodes.SM_Rock.geometry} onUpdate={handleUpdate}>
        <primitive object={materials.Mat_Rock} attach="material" />
      </mesh>

      <mesh geometry={nodes.SM_Rock2.geometry} onUpdate={handleUpdate}>
        <primitive object={materials.Mat_Rock2} attach="material" />
      </mesh>

      <mesh geometry={nodes.SM_Ledge.geometry} onUpdate={handleUpdate}>
        <primitive object={materials.Mat_Ledge} attach="material" />
      </mesh>

      <mesh geometry={nodes.SM_Stairs.geometry} onUpdate={handleUpdate}>
        <primitive object={materials.Mat_Stairs} attach="material" />
      </mesh>
    </group>
  );
}

// --- 🎥 CAMERA CONTROLLER ---
export function CameraController({ x, y, z, rx, ry, rz, fov, near, far, autoLookAt }: any) {
  const { camera } = useThree();

  useFrame(() => {
    camera.position.set(x, y, z);
    if (autoLookAt) {
      camera.lookAt(0, 0, 0);
    } else {
      camera.rotation.set(rx, ry, rz);
    }
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.near = near;
      cam.far = far;
      cam.updateProjectionMatrix();
    }
  });

  return null;
}
