import * as THREE from 'three'
import React, { useRef, useState, useEffect } from 'react'
import { useGLTF, Sampler, shaderMaterial } from '@react-three/drei'
import { useFrame, extend } from '@react-three/fiber'

// --- 1. THE SHADER DEFINITION ---
const PinkGrassMaterial = shaderMaterial(
  {
    uTime: 0,
    uWindStrength: 0.12,
    uYoungPink: new THREE.Color("#ffe0e9"), // Light Glow Pink
    uOldPink: new THREE.Color("#C686BC"),   // Rich Surface Pink
    uBaseColor: new THREE.Color("#d18bbd"), // Deeper pink (replaces the "dark" root)
    uGlistenColor: new THREE.Color("#ffffff"),
  },
  // Vertex Shader
  `
  uniform float uTime;
  uniform float uWindStrength;
  varying float vRelativeY;
  varying vec3 vWorldPosition;

  void main() {
    vRelativeY = position.y;
    vec3 pos = position;
    vWorldPosition = (instanceMatrix * vec4(pos, 1.0)).xyz;

    float worldOffset = instanceMatrix[3].x + instanceMatrix[3].z;
    float sway = sin(uTime * 1.5 + worldOffset) * uWindStrength * vRelativeY;
    
    pos.x += sway;
    pos.z += sway * 0.2;

    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
  }
  `,
  // Fragment Shader
  `
  uniform float uTime;
  uniform vec3 uYoungPink;
  uniform vec3 uOldPink;
  uniform vec3 uBaseColor;
  uniform vec3 uGlistenColor;
  varying float vRelativeY;
  varying vec3 vWorldPosition;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    // 1. PATCHY COLOR MIX
    float patchNoise = hash(floor(vWorldPosition.xz * 0.7));
    vec3 mixedPink = mix(uYoungPink, uOldPink, patchNoise);

    // 2. SOFT GRADIENT (No dark roots, just a deeper pink base)
    vec3 color = mix(uBaseColor, mixedPink, clamp(vRelativeY * 1.2, 0.0, 1.0));

    // 3. WHITE GLINT LOGIC
    // We create moving bands of white light
    float glintLines = sin(vWorldPosition.x * 0.8 + uTime * 0.6) * cos(vWorldPosition.z * 0.8 + uTime * 0.6);
    // Only show the glint on the top half of the blades
    float glintStrength = smoothstep(0.97, 1.0, glintLines) * vRelativeY;
    
    // Mix the white glint onto the pink
    vec3 finalColor = mix(color, uGlistenColor, glintStrength * 0.6);

    gl_FragColor = vec4(finalColor, 1.0);
  }
  `
)

extend({ PinkGrassMaterial })

// --- 2. THE COMPONENT ---
export function PinkGrass({ targetMesh, count = 5000, scaleVar = 0.5 }: { targetMesh: any, count?: number, scaleVar?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null!)
  const materialRef = useRef<any>(null!)
  const [isReady, setIsReady] = useState(false)

  // 1. Load the grass geometry
  const { nodes } = useGLTF('/simple_grass.glb') as any

  // 2. FIX: Force the sampler to "Wake Up" once the targetMesh is truly attached to the DOM
  useEffect(() => {
    if (targetMesh.current) {
      // Small timeout ensures the GPU has the geometry ready
      const timeout = setTimeout(() => setIsReady(true), 100);
      return () => clearTimeout(timeout);
    }
  }, [targetMesh])

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uTime = state.clock.elapsedTime
    }
  })

  // Don't even mount the Sampler until the mountain is 100% ready
  if (!isReady || !targetMesh.current) return null

  return (
    <Sampler
      // The 'key' ensures that if something changes, the grass system re-renders correctly
      key={isReady ? 'ready' : 'loading'}
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
            s * randomVariation,         // Width X
            s * randomVariation * 0.7,   // Height Y (Shorter for "carpet" look)
            s * randomVariation          // Width Z
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
        <pinkGrassMaterial ref={materialRef} side={THREE.DoubleSide} />
      </instancedMesh>
    </Sampler>
  )
}

useGLTF.preload('/simple_grass.glb')
