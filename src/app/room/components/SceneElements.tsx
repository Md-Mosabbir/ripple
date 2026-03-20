"use client";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";

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
