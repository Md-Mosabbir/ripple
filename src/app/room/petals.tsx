import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export function Petals({ count = 100 }) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);

  // Create dummy object to help calculate transformations
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Generate initial random data for each petal
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const t = Math.random() * 100;
      const factor = 20 + Math.random() * 100;
      const speed = 0.01 + Math.random() / 200;
      const xFactor = -50 + Math.random() * 100;
      const yFactor = -50 + Math.random() * 100;
      const zFactor = -50 + Math.random() * 100;
      temp.push({ t, factor, speed, xFactor, yFactor, zFactor, mx: 0, my: 0 });
    }
    return temp;
  }, [count]);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const range = 100; // The size of the "box" the petals live in

    particles.forEach((particle, i) => {
      // 1. Use a constant speed variable instead of multiplying time directly
      particle.t += particle.speed;

      // 2. Calculate "Falling" and "Drifting"
      // We use (%) to wrap the value. 
      // If position is > 50, it snaps back to -50.
      const x = ((particle.xFactor - time * 2) % range) + range / 2;
      const y = ((particle.yFactor - time * 5) % range) + range / 2;
      const z = particle.zFactor + Math.sin(particle.t) * 5;

      dummy.position.set(x, y, z);

      // 3. Keep the fluttering rotation
      dummy.rotation.set(
        particle.t * 0.5,
        particle.t * 0.3,
        particle.t * 0.2
      );

      // 4. Update the individual instance
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });

    // CRITICAL: Tell Three.js the positions changed
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null!, null!, count]}>
      {/* Small, slightly curved plane for the petal */}
      <planeGeometry args={[0.2, 0.2, 2, 2]} />
      <meshStandardMaterial
        color="#ffccd5"
        side={THREE.DoubleSide}
        roughness={0}
        emissive="#ffb6c1"
        emissiveIntensity={0.2}
      />
    </instancedMesh>
  );
}
