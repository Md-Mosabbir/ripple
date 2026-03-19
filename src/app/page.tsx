"use client"
import * as THREE from 'three'
import React, { useRef } from 'react'
import { Canvas, useFrame, extend, useThree } from '@react-three/fiber'
import { shaderMaterial, Text, RenderTexture, PerspectiveCamera } from '@react-three/drei'

const DistortionMaterial = shaderMaterial(
  {
    u_texture: null,
    u_mouse: new THREE.Vector2(0, 0),
    u_prevMouse: new THREE.Vector2(0, 0),
  },
  // Vertex Shader
  `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
  `,
  // Fragment Shader
  `
  uniform sampler2D u_texture;
  uniform vec2 u_mouse;
  uniform vec2 u_prevMouse;
  varying vec2 vUv;

  void main() {
    // Increase grid size for smoother text distortion (e.g., 60.0 or 80.0)
    vec2 gridUV = floor(vUv * vec2(40.0, 40.0)) / vec2(40.0, 40.0);
    vec2 centerOfPixel = gridUV + vec2(1.0/40.0, 1.0/40.0);
    
    vec2 mouseDirection = u_mouse - u_prevMouse;
    vec2 pixelToMouseDirection = centerOfPixel - u_mouse;
    float pixelDistanceToMouse = length(pixelToMouseDirection);
    
    // Increased radius to 0.4 for a "heavier" feel on text
    float strength = smoothstep(0.4, 0.0, pixelDistanceToMouse);

    vec2 uvOffset = strength * -mouseDirection * 0.5;
    vec2 uv = vUv - uvOffset;

    vec4 color = texture2D(u_texture, uv);
    gl_FragColor = color;
  }
  `
)

extend({ DistortionMaterial })

function Hero() {
  const meshRef = useRef()
  // viewport = size in 3D units, size = size in pixels
  const { viewport, size } = useThree()

  useFrame((state) => {
    const { mouse } = state
    if (meshRef.current) {
      const material = meshRef.current.material
      material.u_prevMouse.lerp(material.u_mouse, 0.1)
      // Normalize mouse (-1 to +1) to UV space (0 to 1)
      material.u_mouse.set(mouse.x * 0.5 + 0.5, mouse.y * 0.5 + 0.5)
    }
  })

  return (
    <mesh ref={meshRef}>
      {/* 1. Scale geometry to match the viewport exactly */}
      <planeGeometry args={[viewport.width, viewport.height]} />

      <distortionMaterial transparent>
        {/* 2. Set RenderTexture to the actual pixel size of the window */}
        <RenderTexture attach="u_texture" width={size.width} height={size.height}>
          <PerspectiveCamera
            makeDefault
            manual
            aspect={viewport.width / viewport.height}
            position={[0, 0, 5]}
          />
          <color attach="background" args={['#000']} />
          <Text
            // 3. Font size relative to viewport width (roughly 15vw)
            fontSize={viewport.width * 0.15}
            color="white"
            maxWidth={viewport.width * 0.8}
            textAlign="center"
            anchorX="center"
            anchorY="middle"
          >
            GLITCH{"\n"}AGENCY
          </Text>
        </RenderTexture>
      </distortionMaterial>
    </mesh>
  )
}

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', paddingInline: '10rem' }}>
      <Canvas
        // dpr={[1, 2]} ensures it looks sharp on high-res displays (retina)
        dpr={[1, 2]}
        camera={{ position: [0, 0, 5], fov: 75 }}
      >
        <Hero />
      </Canvas>
    </div>
  )
}
