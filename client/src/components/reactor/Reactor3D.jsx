import { Canvas } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "@react-three/drei";

/* ------------------------------------------------------------------ */
/*  STATE CONFIG — the only place you need to tune look/speed/colors   */
/*                                                                     */
/*  Speed order:  thinking  >  speaking  >  listening  >  idle         */
/*  spinSpeed  = revolving speed (rad/sec)                             */
/*  pulseSpeed = expand-in/out speed (rad/sec)                         */
/*  pulseAmount= how far it expands in/out (fraction of size)          */
/*  flowSpeed  = how fast the veins/cells inside the shell move        */
/* ------------------------------------------------------------------ */
const STATE_CONFIG = {
  idle: {
    color: "#5a8fd6", // soft blue
    spinSpeed: 0.12,
    pulseSpeed: 1.0,
    pulseAmount: 0.018,
    flowSpeed: 0.25,
    glow: 0.7,
  },
  listening: {
    color: "#5a8fd6", // soft blue
    spinSpeed: 0.2,
    pulseSpeed: 1.6,
    pulseAmount: 0.03,
    flowSpeed: 0.4,
    glow: 0.78,
  },
  speaking: {
    color: "#8e7fd6", // soft purple
    spinSpeed: 0.55,
    pulseSpeed: 3.4,
    pulseAmount: 0.055,
    flowSpeed: 0.9,
    glow: 0.85,
  },
  thinking: {
    color: "#4fb8a0", // calm aqua green
    spinSpeed: 1.3,
    pulseSpeed: 6.0,
    pulseAmount: 0.075,
    flowSpeed: 1.8,
    glow: 0.95,
  },
};

// Your buttons use "answering" for Speaking — both names work.
function normalizeState(s) {
  if (s === "answering" || s === "speaking") return "speaking";
  if (STATE_CONFIG[s]) return s;
  return "idle";
}

/* ------------------------------------------------------------------ */
/*  Shared smooth driver.                                              */
/*  Every value eases toward the new state's target (no snapping),     */
/*  color blends through HSL so blue -> green -> purple stays vivid,   */
/*  and phases are ACCUMULATED so changing speed never makes the       */
/*  animation jump. `surge` fires 1 -> 0 on every state change and     */
/*  powers the flash / shockwave.                                      */
/* ------------------------------------------------------------------ */
function useReactorDrive(reactorState) {
  const key = normalizeState(reactorState);
  const cfg = STATE_CONFIG[key];

  const targetColor = useMemo(() => new THREE.Color(cfg.color), [cfg.color]);

  const drive = useRef({
    spinSpeed: cfg.spinSpeed,
    pulseSpeed: cfg.pulseSpeed,
    pulseAmount: cfg.pulseAmount,
    flowSpeed: cfg.flowSpeed,
    glow: cfg.glow,
    spin: 0,
    pulse: 0,
    flow: 0,
    surge: 0,
    color: new THREE.Color(cfg.color),
  });

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    drive.current.surge = 1; // state just changed -> trigger flash
  }, [key]);

  useFrame((_, delta) => {
    const d = drive.current;
    const dt = Math.min(delta, 0.05);
    const k = 2.2; // transition smoothness (lower = slower, more cinematic)

    d.spinSpeed = THREE.MathUtils.damp(d.spinSpeed, cfg.spinSpeed, k, dt);
    d.pulseSpeed = THREE.MathUtils.damp(d.pulseSpeed, cfg.pulseSpeed, k, dt);
    d.pulseAmount = THREE.MathUtils.damp(d.pulseAmount, cfg.pulseAmount, k, dt);
    d.flowSpeed = THREE.MathUtils.damp(d.flowSpeed, cfg.flowSpeed, k, dt);
    d.glow = THREE.MathUtils.damp(d.glow, cfg.glow, k, dt);

    d.color.lerpHSL(targetColor, 1 - Math.exp(-2.4 * dt));

    d.spin += d.spinSpeed * dt;
    d.pulse += d.pulseSpeed * dt;
    d.flow += d.flowSpeed * dt;
    d.surge = Math.max(0, d.surge - dt * 0.9);
  });

  return drive;
}

/* Soft white radial gradient (tinted per-state through material color) */
function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.2, "rgba(255,255,255,0.85)");
  gradient.addColorStop(0.5, "rgba(255,255,255,0.28)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/* ------------------------------------------------------------------ */
/*  Shell shader: translucent sphere with a glowing cellular vein web  */
/*  (animated worley edges) + fresnel rim — the look in your reference */
/* ------------------------------------------------------------------ */
const SHELL_VERTEX = /* glsl */ `
  varying vec3 vObjPos;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  void main() {
    vObjPos = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SHELL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3  uColor;
  uniform float uIntensity;
  uniform float uScale;
  uniform float uOpacity;

  varying vec3 vObjPos;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  vec3 hash3(vec3 p) {
    p = vec3(
      dot(p, vec3(127.1, 311.7,  74.7)),
      dot(p, vec3(269.5, 183.3, 246.1)),
      dot(p, vec3(113.5, 271.9, 124.6))
    );
    return fract(sin(p) * 43758.5453123);
  }

  // distance gap between nearest and 2nd-nearest cell point = cell edges
  float cellEdge(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;

    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        for (int z = -1; z <= 1; z++) {
          vec3 g = vec3(float(x), float(y), float(z));
          vec3 o = hash3(i + g);
          o = 0.5 + 0.5 * sin(uTime + 6.2831 * o);
          float d = length(g + o - f);
          if (d < d1) { d2 = d1; d1 = d; }
          else if (d < d2) { d2 = d; }
        }
      }
    }
    return d2 - d1;
  }

  void main() {
    vec3 p = normalize(vObjPos) * uScale;
    float e = cellEdge(p);

    float web  = 1.0 - smoothstep(0.0, 0.13, e);  // thin bright veins
    float soft = 1.0 - smoothstep(0.0, 0.42, e);  // soft glow around veins

    float fres = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewDir))), 2.2);

    vec3 col = uColor * (0.16 + soft * 0.40 + fres * 0.45) + mix(uColor, vec3(1.0), 0.22) * web * 0.32;
    float a  = (0.05 + soft * 0.13 + web * 0.36 + fres * 0.26) * uOpacity;

    gl_FragColor = vec4(col * uIntensity, a);
  }
`;

function useShellUniforms(scale, opacity) {
  return useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color("#2b8cff") },
      uIntensity: { value: 1 },
      uScale: { value: scale },
      uOpacity: { value: opacity },
    }),
    [scale, opacity]
  );
}

/* ------------------------------------------------------------------ */
/*  Core: tiny white-hot point + soft tinted halo                      */
/* ------------------------------------------------------------------ */
function CoreSphere({ reactorState }) {
  const sphereRef = useRef();
  const auraRef = useRef();
  const flareRef = useRef();

  const drive = useReactorDrive(reactorState);
  const glowTexture = useMemo(() => createGlowTexture(), []);

  useFrame(() => {
    if (!sphereRef.current || !auraRef.current || !flareRef.current) return;

    const d = drive.current;
    const beat = Math.sin(d.pulse);

    // core dot
    const scale = 1 + beat * d.pulseAmount * 2.5 + d.surge * 0.4;
    sphereRef.current.scale.setScalar(scale);

    // soft state-colored halo
    const auraScale = 1.9 + beat * d.pulseAmount * 3 + d.surge * 1.4;
    auraRef.current.scale.set(auraScale, auraScale, 1);
    auraRef.current.material.color.copy(d.color);
    auraRef.current.material.opacity = Math.min(1, (0.32 + d.surge * 0.2) * d.glow);

    // tight white flare in the middle
    const flareScale = 0.65 + beat * d.pulseAmount * 2 + d.surge * 0.6;
    flareRef.current.scale.set(flareScale, flareScale, 1);
    flareRef.current.material.opacity = 0.5;
  });

  return (
    <group>
      {/* Soft Aura (sprite — no hard edge like the old solid sphere) */}
      <sprite ref={auraRef}>
        <spriteMaterial
          map={glowTexture}
          color="#2b8cff"
          transparent
          opacity={0.6}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>

      {/* White flare */}
      <sprite ref={flareRef}>
        <spriteMaterial
          map={glowTexture}
          color="#ffffff"
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>

      {/* Core */}
      <mesh ref={sphereRef}>
        <sphereGeometry args={[0.1, 32, 32]} />
        <meshBasicMaterial color="#dbe9ff" toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Inner lattice layer (counter-rotates for depth)                    */
/* ------------------------------------------------------------------ */
function AuraSphere({ reactorState }) {
  const auraRef = useRef();
  const drive = useReactorDrive(reactorState);
  const uniforms = useShellUniforms(3.6, 0.85);

  useFrame(() => {
    if (!auraRef.current) return;
    const d = drive.current;

    auraRef.current.rotation.y = -d.spin * 1.4;
    auraRef.current.rotation.z = d.spin * 0.5;

    const s = 1 + Math.sin(d.pulse - 0.8) * d.pulseAmount * 1.2 + d.surge * 0.05;
    auraRef.current.scale.setScalar(s);

    uniforms.uTime.value = d.flow * 1.3 + 10.0;
    uniforms.uColor.value.copy(d.color);
    uniforms.uIntensity.value = 0.4 * d.glow;
  });

  return (
    <mesh ref={auraRef}>
      <sphereGeometry args={[0.78, 64, 64]} />
      <shaderMaterial
        vertexShader={SHELL_VERTEX}
        fragmentShader={SHELL_FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/*  Floating dust field around the sphere                              */
/* ------------------------------------------------------------------ */
function ParticleCloud({ reactorState }) {
  const pointsRef = useRef();
  const drive = useReactorDrive(reactorState);

  const particleTexture = useMemo(() => createGlowTexture(), []);

  const particles = useMemo(() => {
    const count = 2200;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // denser near the sphere, thinning outward
      const radius = 1.45 + Math.pow(Math.random(), 1.6) * 2.9;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
    }

    return positions;
  }, []);

  useFrame(() => {
    if (!pointsRef.current) return;
    const d = drive.current;

    pointsRef.current.rotation.y = d.spin * 0.35;
    pointsRef.current.rotation.x = d.spin * 0.1;

    // dust breathes with the reactor and bursts outward on state change
    const s = 1 + Math.sin(d.pulse * 0.5) * 0.03 + d.surge * 0.18;
    pointsRef.current.scale.setScalar(s);

    pointsRef.current.material.color.copy(d.color);
    pointsRef.current.material.opacity =
      Math.min(1, (0.38 + Math.sin(d.flow * 3) * 0.06) * d.glow);
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particles.length / 3}
          array={particles}
          itemSize={3}
        />
      </bufferGeometry>

      <pointsMaterial
        map={particleTexture}
        color="#2b8cff"
        size={0.035}
        transparent
        opacity={0.4}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
        toneMapped={false}
      />
    </points>
  );
}

/* Optional orbit ring (kept from your original; currently disabled in scene) */
function ParticleRing({ rotation, speed, radius = 2.5, count = 3000, reactorState }) {
  const groupRef = useRef();
  const drive = useReactorDrive(reactorState);

  useFrame(() => {
    if (!groupRef.current) return;
    const d = drive.current;
    groupRef.current.rotation.y = d.spin * (speed * 300);
    groupRef.current.rotation.x = d.spin * (speed * 15);
    groupRef.current.children[0].material.color.copy(d.color);
  });

  const positions = useMemo(() => {
    const pos = [];

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = radius + (Math.random() - 0.5) * 0.15;

      pos.push(
        Math.cos(angle) * r,
        Math.sin(angle) * r,
        (Math.random() - 0.5) * 0.1
      );
    }

    return new Float32Array(pos);
  }, [radius, count]);

  return (
    <group ref={groupRef} rotation={rotation}>
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={positions}
            count={positions.length / 3}
            itemSize={3}
          />
        </bufferGeometry>

        <pointsMaterial
          color="#2b8cff"
          size={0.014}
          transparent
          opacity={0.25}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Outer shell: the main translucent vein-web sphere                  */
/* ------------------------------------------------------------------ */
function EnergyShell({ reactorState }) {
  const shellRef = useRef();
  const materialRef = useRef();

  const drive = useReactorDrive(reactorState);
  const uniforms = useShellUniforms(2.6, 1.0);

  useFrame(() => {
    if (!shellRef.current || !materialRef.current) return;
    const d = drive.current;

    // expand in / out
    const scale = 1 + Math.sin(d.pulse) * d.pulseAmount + d.surge * 0.09;
    shellRef.current.scale.setScalar(scale);

    // revolving
    shellRef.current.rotation.y = d.spin;
    shellRef.current.rotation.x = d.spin * 0.3;

    // color / flow / brightness
    uniforms.uTime.value = d.flow;
    uniforms.uColor.value.copy(d.color);
    uniforms.uIntensity.value = (0.6 + d.surge * 0.3) * d.glow;
  });

  return (
    <mesh ref={shellRef}>
      <sphereGeometry args={[1.15, 128, 128]} />

      <shaderMaterial
        ref={materialRef}
        vertexShader={SHELL_VERTEX}
        fragmentShader={SHELL_FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/*  Shockwave ring — fires on every state change for a stylish handoff */
/* ------------------------------------------------------------------ */
function Shockwave({ reactorState }) {
  const ringRef = useRef();
  const drive = useReactorDrive(reactorState);

  useFrame(({ camera }) => {
    if (!ringRef.current) return;
    const d = drive.current;

    ringRef.current.visible = d.surge > 0.01;
    if (!ringRef.current.visible) return;

    ringRef.current.quaternion.copy(camera.quaternion); // always face camera

    const e = 1 - d.surge; // 0 -> 1 over the transition
    const eased = 1 - Math.pow(1 - e, 3); // ease-out
    const s = 1 + eased * 2.8;

    ringRef.current.scale.set(s, s, s);
    ringRef.current.material.color.copy(d.color);
    ringRef.current.material.opacity = Math.pow(d.surge, 1.5) * 0.3;
  });

  return (
    <mesh ref={ringRef} visible={false}>
      <ringGeometry args={[0.97, 1.0, 128]} />
      <meshBasicMaterial
        color="#2b8cff"
        transparent
        opacity={0}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

export default function Reactor3D({ reactorState }) {
  const ringSpeed =
    reactorState === "listening"
      ? 0.001
      : reactorState === "thinking"
      ? 0.015
      : 0.003;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#000",
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 5] }}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        dpr={[1, 2]}
      >
        <>
          {/* No scene lights needed: every material is unlit/emissive.
              (Old ambientLight 2 + pointLight 20 were what washed
              the whole screen out.) */}

          <CoreSphere reactorState={reactorState} />
          <AuraSphere reactorState={reactorState} />
          <EnergyShell reactorState={reactorState} />
          <ParticleCloud reactorState={reactorState} />
          <Shockwave reactorState={reactorState} />

          {/* <ParticleRing
            rotation={[Math.PI / 2.4, 0, 0]}
            speed={ringSpeed}
            reactorState={reactorState}
          /> */}

          <OrbitControls
            autoRotate={false}
            //autoRotateSpeed={0.25}
            enableZoom={false}
            enablePan={false}
          />

          <EffectComposer multisampling={4}>
            <Bloom
              intensity={0.4}
              luminanceThreshold={0.35}
              luminanceSmoothing={0.5}
              mipmapBlur
              radius={0.6}
            />
          </EffectComposer>
        </>
      </Canvas>
    </div>
  );
}
