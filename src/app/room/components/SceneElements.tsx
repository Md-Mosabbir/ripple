"use client";
import { useThree, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useRef } from "react";
import { PinkGrass } from "./grass";
import Mountain from "./moutain";

// --- 1. THE MOUNTAIN SHADER ---
// This handles the pink gradient and the white glowing wave

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
        count={1400}
        scaleVar={1.0}
        onUpdate={handleUpdate}
      />

      <PinkGrass
        targetMesh={mountainRef}
        count={6000}
        scaleVar={1.0} // Scaled down for that "carpet" look
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
export function CameraController({
  x,
  y,
  z,
  rx,
  ry,
  rz,
  fov,
  near,
  far,
  autoLookAt,
}: any) {
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
