import * as THREE from "three";
import { useRef, useState, useEffect } from "react";
import { useGLTF, Sampler, shaderMaterial } from "@react-three/drei";
import { useFrame, extend } from "@react-three/fiber";

import { GLTF } from "three-stdlib";
const PinkGrassMaterial = shaderMaterial(
  {
    uTime: 0,
    uWindStrength: 0.12,

    // 🎨 Pink palette
    uBasePink: new THREE.Color("#ffe0e9"), // top blade
    uDryPink: new THREE.Color("#d18ab0"), // variation
    uDarkRoot: new THREE.Color("#c686bc"), // base/root

    // 🌅 sky & sun for sunset
    uSkyDay: new THREE.Color("#ffe0f0"),
    uSkySunset: new THREE.Color("#ffb6d1"),
    uSunDay: new THREE.Color("#fff4c2"),
    uSunSunset: new THREE.Color("#ff8cc7"),

    uLightDir: new THREE.Vector3(-0.5, 1.0, 0.3).normalize(),
  },

  // ======================
  // 🌿 VERTEX SHADER
  // ======================
  `
  uniform float uTime;
  uniform float uWindStrength;

  varying float vRelativeY;
  varying vec3 vWorldPosition;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vRelativeY = position.y;
    vec3 pos = position;

    // 🔹 instance world position
    vec4 worldPos = instanceMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPos.xyz;

    // 🌬️ wind sway
    float worldOffset = instanceMatrix[3].x + instanceMatrix[3].z;
    float wave1 = sin(uTime * 1.5 + worldOffset);
    float wave2 = sin(uTime * 0.7 + worldOffset * 1.7);
    float sway = (wave1 + wave2) * 0.5 * uWindStrength * vRelativeY;

    pos.x += sway;
    pos.z += sway * 0.2;

    // 🔹 subtle jitter to fake density
    float jitterX = (hash(vWorldPosition.xz) - 0.5) * 0.05;
    float jitterZ = (hash(vWorldPosition.zx) - 0.5) * 0.05;
    pos.x += jitterX;
    pos.z += jitterZ;

    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
  }
  `,

  // ======================
  // 🌿 FRAGMENT SHADER
  // ======================
  `
  uniform float uTime;

  uniform vec3 uBasePink;
  uniform vec3 uDryPink;
  uniform vec3 uDarkRoot;

  uniform vec3 uSkyDay;
  uniform vec3 uSkySunset;
  uniform vec3 uSunDay;
  uniform vec3 uSunSunset;

  uniform vec3 uLightDir;

  varying float vRelativeY;
  varying vec3 vWorldPosition;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p){
    return hash(floor(p));
  }

  void main() {
    // ⏰ day-night cycle
    float dayCycle = sin(uTime * 0.05) * 0.5 + 0.5;
    vec3 skyColor = mix(uSkyDay, uSkySunset, dayCycle);
    vec3 sunColor = mix(uSunDay, uSunSunset, dayCycle);

    // 🌱 base variation + fake extra blades
    float n = noise(vWorldPosition.xz * 3.0);
    float extra = noise(vWorldPosition.xz * 12.0) * 0.2; // tiny extra blades
    vec3 grassCol = mix(uBasePink, uDryPink, n * 0.5 + extra);
    grassCol += (n - 0.5) * 0.05; // tiny per-blade variation

    float heightFactor = clamp(vRelativeY, 0.0, 1.0);
    vec3 color = mix(uDarkRoot, grassCol, heightFactor);

    // ☀️ lighting
    vec3 normal = normalize(vec3(0.2, 1.0, 0.2));
    float diffuse = max(dot(normal, normalize(uLightDir)), 0.0);
    vec3 lighting = sunColor * diffuse + skyColor * 0.25;

    // ✨ fresnel glow
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);

    vec3 fresnelCol = mix(
      vec3(0.8, 0.6, 0.7), // soft pink glow
      vec3(1.0, 0.8, 0.9), // warm sunset pink
      dayCycle
    ) * fresnel * 0.8;

    vec3 finalColor = color * lighting + fresnelCol;

    gl_FragColor = vec4(finalColor, 1.0);
  }
  `,
);

extend({ PinkGrassMaterial });

export { PinkGrassMaterial };

interface PinkGrassProps {
  targetMesh: React.MutableRefObject<THREE.Mesh>;
  count?: number;
  scaleVar?: number;
  onUpdate?: (o: THREE.Object3D) => void; // Added this
}
export function PinkGrass({
  targetMesh,
  count = 5000,
  scaleVar = 0.5,
}: PinkGrassProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const materialRef = useRef<any>(null!);
  const [isReady, setIsReady] = useState(false);

  type GrassGLTF = GLTF & {
    nodes: {
      Grass: THREE.Mesh;
    };
    materials: {
      Mat_Grass: THREE.Material;
    };
  };

  // 1. Load the grass geometry
  const { nodes } = useGLTF("/simple_grass.glb") as unknown as GrassGLTF;

  // 2. FIX: Force the sampler to "Wake Up" once the targetMesh is truly attached to the DOM
  useEffect(() => {
    if (targetMesh.current) {
      // Small timeout ensures the GPU has the geometry ready
      const timeout = setTimeout(() => setIsReady(true), 100);
      return () => clearTimeout(timeout);
    }
  }, [targetMesh]);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uTime = state.clock.elapsedTime;
    }
  });

  // Don't even mount the Sampler until the mountain is 100% ready
  if (!isReady || !targetMesh.current) return null;

  return (
    <Sampler
      // The 'key' ensures that if something changes, the grass system re-renders correctly
      key={isReady ? "ready" : "loading"}
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
      <instancedMesh
        ref={meshRef}
        args={[nodes.Grass.geometry, null, count]}
        frustumCulled={false}
      >
        <pinkGrassMaterial
          ref={materialRef}
          transparent
          side={THREE.DoubleSide}
        />
      </instancedMesh>
    </Sampler>
  );
}

useGLTF.preload("/simple_grass.glb");
