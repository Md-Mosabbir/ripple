import * as THREE from "three";
import { useRef, useState, useEffect } from "react";
import { useGLTF, Sampler, shaderMaterial } from "@react-three/drei";
import { useFrame, extend } from "@react-three/fiber";

const PinkGrassMaterial = shaderMaterial(
  {
    uTime: 0,
    uWindStrength: 0.15,
    uBasePink: new THREE.Color("#ffe0e9"),
    uDarkRoot: new THREE.Color("#c686bc"),
    uLightDir: new THREE.Vector3(-0.5, 1.0, 0.3).normalize(),
  },
  // Vertex Shader
  `
  uniform float uTime;
  uniform float uWindStrength;
  varying float vRelativeY;

  void main() {
    vRelativeY = position.y;
    vec3 pos = position;
    
    // Wind Sway logic
    float worldOffset = instanceMatrix[3].x + instanceMatrix[3].z;
    float sway = sin(uTime * 1.5 + worldOffset) * uWindStrength * vRelativeY;
    pos.x += sway;

    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
  }
  `,
  // Fragment Shader
  `
  uniform vec3 uBasePink;
  uniform vec3 uDarkRoot;
  varying float vRelativeY;

  void main() {
    vec3 color = mix(uDarkRoot, uBasePink, vRelativeY);
    gl_FragColor = vec4(color, 1.0);
  }
  `
);

extend({ PinkGrassMaterial });

export function PinkGrass({ targetMesh, count = 8000, scaleVar = 0.4 }: any) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const materialRef = useRef<any>(null!);
  const [isReady, setIsReady] = useState(false);
  const { nodes } = useGLTF("/simple_grass.glb") as any;

  useEffect(() => {
    if (targetMesh.current) {
      const timeout = setTimeout(() => setIsReady(true), 100);
      return () => clearTimeout(timeout);
    }
  }, [targetMesh]);

  useFrame((state) => {
    if (materialRef.current) materialRef.current.uTime = state.clock.elapsedTime;
  });

  if (!isReady || !targetMesh.current) return null;

  return (
    <Sampler
      mesh={targetMesh}
      instances={meshRef}
      count={count}
      weight="color_1"
      transform={({ position, normal, dummy, color }) => {

        const weight = color ? color.r : 1.0;



        if (weight < 0.1) {

          dummy.scale.setScalar(0);

        } else {

          dummy.position.copy(position);



          const lookAtTarget = new THREE.Vector3().copy(position).add(normal);

          dummy.lookAt(lookAtTarget);



          dummy.rotation.y += Math.random() * Math.PI * 2;

          dummy.rotation.x += (Math.random() - 0.5) * 0.2;



          // Lush Scale Logic

          const s = scaleVar * weight;

          const randomVariation = 0.8 + Math.random() * 0.4;



          dummy.scale.set(

            s * randomVariation, // Width X

            s * randomVariation * 1, // Height Y (Shorter for "carpet" look)

            s * randomVariation, // Width Z

          );

        }



        dummy.updateMatrix();

      }}
    >
      <instancedMesh ref={meshRef} args={[nodes.Grass.geometry, null, count]}>
        <pinkGrassMaterial ref={materialRef} transparent={false} depthWrite={true} side={THREE.FrontSide} />
      </instancedMesh>
    </Sampler>
  );
}
