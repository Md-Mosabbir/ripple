"use client";
import { useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

import { PinkGrass } from "./grass";
import Mountain from "./moutain";
import { GLTF } from "three-stdlib";
export function Architecture({ layer = 0, ...props }: any) {
  type UnseenGLTF = GLTF & {
    nodes: {
      SM_Wall: THREE.Mesh;
      SM_Mountain: THREE.Mesh;
      SM_Mountain2: THREE.Mesh;
      SM_Rock: THREE.Mesh;
      SM_Rock2: THREE.Mesh;
      SM_Ledge: THREE.Mesh;
      SM_Stairs: THREE.Mesh;
    };
    materials: {
      Mat_Architecture: THREE.Material;
      Mat_Rock: THREE.Material;
      Mat_Rock2: THREE.Material;
      Mat_Ledge: THREE.Material;
      Mat_Stairs: THREE.Material;
    };
  };

  const { nodes, materials } = useGLTF("/unseen.glb") as unknown as UnseenGLTF;

  // Refs for mountains
  const mountainRef = useRef<THREE.Mesh>(null!);
  const mountainRef2 = useRef<THREE.Mesh>(null!);

  const handleUpdate = (o: THREE.Object3D) => {
    o.layers.set(layer);
    o.layers.enable(1);
  };

  return (
    <group {...props} dispose={null}>
      {/* 🌿 Grass Components */}
      <PinkGrass
        targetMesh={mountainRef2}
        count={1400}
        scaleVar={1.0}
        onUpdate={handleUpdate}
      />

      <PinkGrass
        targetMesh={mountainRef}
        count={9000}
        scaleVar={1.0}
        onUpdate={handleUpdate}
      />

      {/* 🗻 Mountains */}
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

      {/* 🏰 Architecture Elements */}
      <mesh geometry={nodes.SM_Wall.geometry} onUpdate={handleUpdate}>
        <primitive object={materials.Mat_Architecture} attach="material" />
      </mesh>

      {/* 🪨 Rocks and Ledges */}
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
