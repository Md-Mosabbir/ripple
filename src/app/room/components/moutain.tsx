import { shaderMaterial } from "@react-three/drei";
import { useFrame, extend } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
const MountainMaterial = shaderMaterial(
  {
    uTime: 0,

    // 🎨 Pink palette
    uBaseColor: new THREE.Color("#d18ab0"), // dusty rose base
    uPeakColor: new THREE.Color("#ffe0e9"), // light dreamy pink peak
    uLightColor: new THREE.Color("#fff4c2"), // soft sunlight
    uShadowColor: new THREE.Color("#c686bc"), // gentle shadow (NOT black!)
  },
  // ======================
  // 🌄 VERTEX SHADER
  // ======================
  `
  varying float vY;
  varying vec3 vWorldPosition;

  void main() {
    vY = position.y;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
  `,
  // ======================
  // 🌄 FRAGMENT SHADER
  // ======================
  `
  uniform float uTime;
  uniform vec3 uBaseColor;
  uniform vec3 uLightColor;
  uniform vec3 uShadowColor;
  uniform vec3 uPeakColor;

  varying float vY;
  varying vec3 vWorldPosition;

  void main() {
    // 🌸 1. HEIGHT GRADIENT (base → peak)
    float h = smoothstep(-2.0, 6.0, vY);
    vec3 base = mix(uBaseColor, uPeakColor, h);

    // ☀️ 2. SOFT NORMAL
    vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));

    // 🌞 3. WRAPPED LIGHTING (Zelda magic)
    vec3 lightDir = normalize(vec3(-0.6, 1.0, 0.4));
    float NdotL = dot(normal, lightDir);
    float wrapped = NdotL * 0.5 + 0.5;

    // 🎨 4. COLORFUL SHADING (no harsh black)
    vec3 light = mix(uShadowColor, uLightColor, wrapped);
    vec3 color = base * light;

    // ✨ subtle animated movement for painterly feel
    float subtle = sin(vWorldPosition.x * 0.3 + uTime * 0.2) * 0.01;
    color += subtle;

    // 🌟 5. SOFT HIGHLIGHT
    float highlight = pow(max(NdotL, 0.0), 4.0);
    color += highlight * 0.25;

    // 🌫️ 6. ATMOSPHERIC FADE (distance softness)
    float dist = length(cameraPosition - vWorldPosition);
    float fog = smoothstep(20.0, 80.0, dist);
    color = mix(color, vec3(0.9, 0.85, 0.95), fog * 0.4); // soft pinkish fog

    gl_FragColor = vec4(color, 1.0);
  }
  `,
);

extend({ MountainMaterial });

// --- 2. THE NEW MOUNTAIN COMPONENT ---
export default function Mountain({ geometry, layer, mountainRef }: any) {
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
