"use client";

import { useRef, useMemo, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, ContactShadows } from "@react-three/drei";
import * as THREE from "three";

function Body({ color, state }) {
  const groupRef = useRef();
  const headRef = useRef();
  const eyeLeftRef = useRef();
  const eyeRightRef = useRef();
  const mouthRef = useRef();
  const leftArmRef = useRef();
  const rightArmRef = useRef();
  const baseColor = useMemo(() => new THREE.Color(color), [color]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!groupRef.current) return;

    // Breathing
    const breathe = Math.sin(t * 1.2) * 0.015;
    groupRef.current.scale.y = 1 + breathe;
    groupRef.current.position.y = breathe * 0.5;

    // Idle sway
    groupRef.current.rotation.z = Math.sin(t * 0.4) * 0.02;
    groupRef.current.rotation.x = Math.sin(t * 0.3) * 0.01;

    // Head
    if (headRef.current) {
      headRef.current.rotation.z = Math.sin(t * 0.6) * 0.04;
      headRef.current.rotation.x = Math.sin(t * 0.5 + 1) * 0.03;
      if (state === "thinking") {
        headRef.current.rotation.z = Math.sin(t * 0.8) * 0.08;
        headRef.current.rotation.x = -0.1 + Math.sin(t * 0.6) * 0.03;
      }
    }

    // Blink
    if (eyeLeftRef.current && eyeRightRef.current) {
      const blinkCycle = t % 4;
      const blink = blinkCycle > 3.85 && blinkCycle < 3.95 ? 0.1 : 1;
      eyeLeftRef.current.scale.y = blink;
      eyeRightRef.current.scale.y = blink;
    }

    // Mouth
    if (mouthRef.current) {
      if (state === "streaming") {
        mouthRef.current.scale.y = 0.6 + Math.sin(t * 12) * 0.4;
        mouthRef.current.scale.x = 0.9 + Math.sin(t * 8) * 0.1;
      } else {
        mouthRef.current.scale.y = 0.8 + Math.sin(t * 0.8) * 0.2;
        mouthRef.current.scale.x = 1;
      }
    }

    // Arms gentle movement
    if (leftArmRef.current) {
      leftArmRef.current.rotation.z = 0.15 + Math.sin(t * 0.5) * 0.04;
      if (state === "thinking") leftArmRef.current.rotation.z = 0.05 + Math.sin(t * 0.3) * 0.02;
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.z = -0.15 + Math.sin(t * 0.5 + 1) * 0.04;
      if (state === "thinking") {
        rightArmRef.current.rotation.z = -0.3;
        rightArmRef.current.rotation.x = -0.4 + Math.sin(t * 0.7) * 0.05;
      } else {
        rightArmRef.current.rotation.x = 0.1;
      }
    }
  });

  return (
    <group ref={groupRef}>
      {/* Torso */}
      <mesh position={[0, -0.3, 0]}>
        <capsuleGeometry args={[0.35, 0.6, 16, 16]} />
        <meshStandardMaterial
          color={baseColor}
          roughness={0.3}
          metalness={0.1}
          emissive={baseColor}
          emissiveIntensity={0.12}
        />
      </mesh>

      {/* Collar detail */}
      <mesh position={[0, 0.12, 0.05]}>
        <torusGeometry args={[0.22, 0.03, 8, 24]} />
        <meshStandardMaterial color={baseColor} roughness={0.2} metalness={0.3} emissive={baseColor} emissiveIntensity={0.3} />
      </mesh>

      {/* Neck */}
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.12, 0.15, 0.2, 12]} />
        <meshStandardMaterial color="#e8ddd4" roughness={0.6} />
      </mesh>

      {/* Head */}
      <group ref={headRef} position={[0, 0.65, 0]}>
        <mesh>
          <sphereGeometry args={[0.32, 32, 32]} />
          <meshStandardMaterial color="#e8ddd4" roughness={0.6} metalness={0.0} />
        </mesh>

        {/* Hair - stylized cap */}
        <mesh position={[0, 0.12, -0.02]}>
          <sphereGeometry args={[0.33, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
          <meshStandardMaterial color={baseColor} roughness={0.4} metalness={0.05} emissive={baseColor} emissiveIntensity={0.08} />
        </mesh>

        {/* Hair side accents */}
        <mesh position={[-0.24, -0.02, 0.12]} rotation={[0, 0, 0.3]}>
          <capsuleGeometry args={[0.06, 0.18, 8, 8]} />
          <meshStandardMaterial color={baseColor} roughness={0.35} emissive={baseColor} emissiveIntensity={0.06} />
        </mesh>
        <mesh position={[0.24, -0.02, 0.12]} rotation={[0, 0, -0.3]}>
          <capsuleGeometry args={[0.06, 0.18, 8, 8]} />
          <meshStandardMaterial color={baseColor} roughness={0.35} emissive={baseColor} emissiveIntensity={0.06} />
        </mesh>

        {/* Eyes */}
        <group>
          <mesh position={[-0.1, 0.02, 0.28]}>
            <sphereGeometry args={[0.055, 16, 16]} />
            <meshStandardMaterial color="white" roughness={0.3} />
          </mesh>
          <mesh ref={eyeLeftRef} position={[-0.1, 0.02, 0.31]}>
            <sphereGeometry args={[0.032, 16, 16]} />
            <meshStandardMaterial color="#1a1a2e" roughness={0.2} metalness={0.3} />
          </mesh>
          <mesh position={[-0.09, 0.035, 0.335]}>
            <sphereGeometry args={[0.012, 8, 8]} />
            <meshStandardMaterial color="white" emissive="white" emissiveIntensity={1} />
          </mesh>
        </group>
        <group>
          <mesh position={[0.1, 0.02, 0.28]}>
            <sphereGeometry args={[0.055, 16, 16]} />
            <meshStandardMaterial color="white" roughness={0.3} />
          </mesh>
          <mesh ref={eyeRightRef} position={[0.1, 0.02, 0.31]}>
            <sphereGeometry args={[0.032, 16, 16]} />
            <meshStandardMaterial color="#1a1a2e" roughness={0.2} metalness={0.3} />
          </mesh>
          <mesh position={[0.11, 0.035, 0.335]}>
            <sphereGeometry args={[0.012, 8, 8]} />
            <meshStandardMaterial color="white" emissive="white" emissiveIntensity={1} />
          </mesh>
        </group>

        {/* Eyebrows */}
        <mesh position={[-0.1, 0.1, 0.28]} rotation={[0, 0, 0.1]}>
          <boxGeometry args={[0.08, 0.012, 0.02]} />
          <meshStandardMaterial color="#3a3540" roughness={0.8} />
        </mesh>
        <mesh position={[0.1, 0.1, 0.28]} rotation={[0, 0, -0.1]}>
          <boxGeometry args={[0.08, 0.012, 0.02]} />
          <meshStandardMaterial color="#3a3540" roughness={0.8} />
        </mesh>

        {/* Nose */}
        <mesh position={[0, -0.02, 0.32]}>
          <sphereGeometry args={[0.025, 8, 8]} />
          <meshStandardMaterial color="#ddd0c5" roughness={0.7} />
        </mesh>

        {/* Mouth */}
        <mesh ref={mouthRef} position={[0, -0.1, 0.29]}>
          <sphereGeometry args={[0.04, 12, 8]} />
          <meshStandardMaterial color="#c4756e" roughness={0.5} />
        </mesh>

        {/* Blush */}
        <mesh position={[-0.18, -0.04, 0.22]}>
          <sphereGeometry args={[0.055, 12, 12]} />
          <meshStandardMaterial color="#e8a0a0" transparent opacity={0.2} roughness={1} />
        </mesh>
        <mesh position={[0.18, -0.04, 0.22]}>
          <sphereGeometry args={[0.055, 12, 12]} />
          <meshStandardMaterial color="#e8a0a0" transparent opacity={0.2} roughness={1} />
        </mesh>

        {/* Ears */}
        <mesh position={[-0.3, 0, 0]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color="#e0d5cc" roughness={0.6} />
        </mesh>
        <mesh position={[0.3, 0, 0]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color="#e0d5cc" roughness={0.6} />
        </mesh>
      </group>

      {/* Shoulders */}
      <mesh position={[-0.4, 0.05, 0]}>
        <sphereGeometry args={[0.14, 12, 12]} />
        <meshStandardMaterial color={baseColor} roughness={0.35} metalness={0.1} emissive={baseColor} emissiveIntensity={0.08} />
      </mesh>
      <mesh position={[0.4, 0.05, 0]}>
        <sphereGeometry args={[0.14, 12, 12]} />
        <meshStandardMaterial color={baseColor} roughness={0.35} metalness={0.1} emissive={baseColor} emissiveIntensity={0.08} />
      </mesh>

      {/* Arms */}
      <group ref={leftArmRef} position={[-0.44, 0, 0]}>
        <mesh position={[0, -0.28, 0.05]}>
          <capsuleGeometry args={[0.08, 0.35, 8, 8]} />
          <meshStandardMaterial color={baseColor} roughness={0.35} metalness={0.1} />
        </mesh>
        {/* Hand */}
        <mesh position={[0, -0.55, 0.08]}>
          <sphereGeometry args={[0.07, 10, 10]} />
          <meshStandardMaterial color="#e0d5cc" roughness={0.5} />
        </mesh>
      </group>
      <group ref={rightArmRef} position={[0.44, 0, 0]}>
        <mesh position={[0, -0.28, 0.05]}>
          <capsuleGeometry args={[0.08, 0.35, 8, 8]} />
          <meshStandardMaterial color={baseColor} roughness={0.35} metalness={0.1} />
        </mesh>
        <mesh position={[0, -0.55, 0.08]}>
          <sphereGeometry args={[0.07, 10, 10]} />
          <meshStandardMaterial color="#e0d5cc" roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

function Particles({ color, count = 30 }) {
  const meshRef = useRef();
  const particleColor = useMemo(() => new THREE.Color(color), [color]);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 3;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 3;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [count]);

  const speeds = useMemo(() => {
    return Array.from({ length: count }, () => ({
      speed: 0.2 + Math.random() * 0.5,
      offset: Math.random() * Math.PI * 2,
    }));
  }, [count]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const posArray = meshRef.current.geometry.attributes.position.array;
    const t = clock.getElapsedTime();
    for (let i = 0; i < count; i++) {
      const s = speeds[i];
      posArray[i * 3] += Math.sin(t * s.speed + s.offset) * 0.002;
      posArray[i * 3 + 1] += Math.cos(t * s.speed * 0.7 + s.offset) * 0.003;
      if (posArray[i * 3 + 1] > 2) posArray[i * 3 + 1] = -2;
    }
    meshRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={meshRef} geometry={geo}>
      <pointsMaterial
        size={0.03}
        color={particleColor}
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

function GlowRing({ color }) {
  const ref = useRef();
  const ringColor = useMemo(() => new THREE.Color(color), [color]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.z = clock.getElapsedTime() * 0.3;
    ref.current.material.opacity = 0.15 + Math.sin(clock.getElapsedTime() * 1.5) * 0.08;
  });

  return (
    <mesh ref={ref} position={[0, -1.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.6, 0.02, 8, 64]} />
      <meshStandardMaterial
        color={ringColor}
        emissive={ringColor}
        emissiveIntensity={2}
        transparent
        opacity={0.2}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function SecondRing({ color }) {
  const ref = useRef();
  const ringColor = useMemo(() => new THREE.Color(color), [color]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.z = -clock.getElapsedTime() * 0.2;
    ref.current.material.opacity = 0.08 + Math.sin(clock.getElapsedTime() * 0.8 + 1) * 0.05;
  });

  return (
    <mesh ref={ref} position={[0, -1.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.75, 0.015, 8, 64]} />
      <meshStandardMaterial
        color={ringColor}
        emissive={ringColor}
        emissiveIntensity={1.5}
        transparent
        opacity={0.1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export default function Avatar3D({ color = "#4a8fc0", state = "idle" }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div style={{
        width: "100%", height: "100%", display: "flex",
        alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 8,
      }}>
        <div style={{ fontSize: 64, filter: `drop-shadow(0 0 12px ${color}66)` }}>🤖</div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          letterSpacing: 2, color, textTransform: "uppercase", opacity: 0.6,
        }}>
          {state === "thinking" ? "thinking..." : state === "streaming" ? "speaking" : "online"}
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas
        camera={{ position: [0, 0.2, 2.8], fov: 35 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: "default" }}
        style={{ background: "transparent" }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
        fallback={<div style={{ color: "white", padding: 20 }}>Loading 3D...</div>}
        onError={() => setHasError(true)}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 4, 5]} intensity={1} color="#e8f0ff" />
        <directionalLight position={[-2, 3, -3]} intensity={0.4} color="#a0c0ff" />
        <pointLight position={[0, 0, 2]} intensity={0.5} color={color} />
        <hemisphereLight args={["#b0d0ff", "#101828", 0.4]} />

        <Float speed={1.5} rotationIntensity={0.1} floatIntensity={0.3} floatingRange={[-0.05, 0.05]}>
          <Body color={color} state={state} />
        </Float>

        <Particles color={color} count={25} />
        <GlowRing color={color} />
        <SecondRing color={color} />

        <ContactShadows position={[0, -1.2, 0]} opacity={0.35} scale={3} blur={2.5} far={2} color="#000020" />
      </Canvas>

      <div style={{
        position: "absolute",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        letterSpacing: 2,
        color: color,
        textTransform: "uppercase",
        opacity: state === "idle" ? 0.4 : 0.8,
        transition: "opacity 0.3s",
        whiteSpace: "nowrap",
        textShadow: `0 0 10px ${color}66`,
      }}>
        {state === "thinking" ? "thinking..." : state === "streaming" ? "speaking" : "online"}
      </div>
    </div>
  );
}
