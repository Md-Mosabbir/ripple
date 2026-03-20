import {
  EffectComposer,
  Bloom,
  DepthOfField,
  Vignette,
  Noise,
} from "@react-three/postprocessing";
import { useControls } from "leva";
export default function SceneEffects() {
  const {
    bloomIntensity,
    bloomThreshold,
    bloomSmoothing,
    enableBloom,

    dofFocus,
    dofFocalLength,
    dofBokeh,
    enableDOF,

    vignetteDarkness,
    vignetteOffset,
    enableVignette,

    noiseOpacity,
    enableNoise,
  } = useControls("✨ Post FX", {
    // 🌸 BLOOM (SUBTLE!!)
    enableBloom: true,
    bloomIntensity: { value: 0.5, min: 0, max: 1.5, step: 0.01 },
    bloomThreshold: { value: 0.6, min: 0, max: 1, step: 0.01 },
    bloomSmoothing: { value: 0.9, min: 0, max: 1, step: 0.01 },

    // 🎯 DOF (LESS BLUR)
    enableDOF: false,
    dofFocus: { value: 0.05, min: 0, max: 0.2, step: 0.001 },
    dofFocalLength: { value: 0.02, min: 0, max: 0.1, step: 0.001 },
    dofBokeh: { value: 1.2, min: 0, max: 5, step: 0.1 },

    // 🌑 VIGNETTE (VERY LIGHT)
    enableVignette: true,
    vignetteOffset: { value: 0.39, min: 0, max: 1 },
    vignetteDarkness: { value: 0.56, min: 0, max: 1 },

    // 🎞️ NOISE (THIS IS THE SECRET SAUCE)
    enableNoise: true,
    noiseOpacity: { value: 0.10, min: 0, max: 0.3, step: 0.01 },
  });

  return (
    <EffectComposer>
      {/* ✨ BLOOM */}
      {enableBloom && (
        <Bloom
          intensity={bloomIntensity}
          luminanceThreshold={bloomThreshold}
          luminanceSmoothing={bloomSmoothing}
        />
      )}

      {/* 🎯 DOF (KEEP OFF INITIALLY) */}
      {enableDOF && (
        <DepthOfField
          focusDistance={dofFocus}
          focalLength={dofFocalLength}
          bokehScale={dofBokeh}
        />
      )}

      {/* 🌑 VIGNETTE */}
      {enableVignette && (
        <Vignette
          eskil={false}
          offset={vignetteOffset}
          darkness={vignetteDarkness}
        />
      )}

      {/* 🎞️ NOISE (HUGE IMPACT) */}
      {enableNoise && <Noise opacity={noiseOpacity} />}
    </EffectComposer>
  );
}
