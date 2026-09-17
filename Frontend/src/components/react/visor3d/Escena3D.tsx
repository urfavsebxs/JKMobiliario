import { Suspense, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Bounds,
  Html,
  OrbitControls,
  useBounds,
  useGLTF,
  useProgress,
} from "@react-three/drei";
import * as THREE from "three";

export interface Escala3D {
  x: number;
  y: number;
  z: number;
}

interface Escena3DProps {
  url: string;
  color: string;
  escala: Escala3D;
  girar: boolean;
  /** Pausa el render cuando el visor sale del viewport. */
  activo: boolean;
}

/**
 * `Bounds` sólo reencuadra al redimensionar el lienzo, así que refrescamos y
 * reencuadramos a mano cada vez que las medidas cambian de escala.
 */
function Reencuadrar({ escala }: { escala: Escala3D }) {
  const bounds = useBounds();
  const firma = `${escala.x.toFixed(3)}|${escala.y.toFixed(3)}|${escala.z.toFixed(3)}`;

  useEffect(() => {
    bounds.refresh().clip().fit();
  }, [bounds, firma]);

  return null;
}

/**
 * Sombra de contacto procedural: un degradado radial sobre un plano que se
 * adapta a la huella del mueble. Se prefiere a `ContactShadows` de drei porque
 * su parche de shader no es compatible con three r186 y deja visible el plano.
 */
function SombraSuave({ ancho, profundo }: { ancho: number; profundo: number }) {
  const textura = useMemo(() => {
    const lienzo = document.createElement("canvas");
    lienzo.width = 256;
    lienzo.height = 256;

    const ctx = lienzo.getContext("2d");
    if (!ctx) return null;

    const gradiente = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradiente.addColorStop(0, "rgba(61, 55, 41, 0.5)");
    gradiente.addColorStop(0.5, "rgba(61, 55, 41, 0.26)");
    gradiente.addColorStop(1, "rgba(61, 55, 41, 0)");
    ctx.fillStyle = gradiente;
    ctx.fillRect(0, 0, 256, 256);

    const textura = new THREE.CanvasTexture(lienzo);
    textura.colorSpace = THREE.SRGBColorSpace;
    return textura;
  }, []);

  useEffect(() => () => textura?.dispose(), [textura]);

  if (!textura) return null;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} renderOrder={-1}>
      <planeGeometry args={[ancho * 1.35, profundo * 1.6]} />
      <meshBasicMaterial map={textura} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/**
 * Carga el GLB, lo apoya sobre el suelo (y = 0), lo centra y aplica la escala
 * derivada de las medidas elegidas por el cliente. El modelo de prueba usa una
 * única malla con material sin texturas, así que el recoloreado es directo.
 */
function Contenido({ url, color, escala }: { url: string; color: string; escala: Escala3D }) {
  const { scene } = useGLTF(url);

  const { modelo, tamano } = useMemo(() => {
    const copia = scene.clone(true);

    copia.traverse((objeto) => {
      const malla = objeto as THREE.Mesh;
      if (!malla.isMesh) return;

      // Clonamos los materiales: los del GLB viven en la caché de useGLTF y
      // los comparten otras instancias del visor.
      const originales = Array.isArray(malla.material) ? malla.material : [malla.material];
      const clones = originales.map((material) => {
        const clon = material.clone() as THREE.MeshStandardMaterial;
        clon.roughness = 0.62; // acabado mate, coherente con mobiliario
        clon.metalness = 0;
        return clon;
      });
      malla.material = Array.isArray(malla.material) ? clones : clones[0];
    });

    const caja = new THREE.Box3().setFromObject(copia);
    const centro = caja.getCenter(new THREE.Vector3());
    const tamano = caja.getSize(new THREE.Vector3());

    // Centrado en X/Z y apoyado en el suelo para que cámara y sombras
    // trabajen siempre en el mismo sistema de coordenadas.
    copia.position.set(-centro.x, -caja.min.y, -centro.z);

    return { modelo: copia, tamano };
  }, [scene]);

  useEffect(() => {
    modelo.traverse((objeto) => {
      const malla = objeto as THREE.Mesh;
      if (!malla.isMesh) return;
      const materiales = Array.isArray(malla.material) ? malla.material : [malla.material];
      materiales.forEach((material) => {
        (material as THREE.MeshStandardMaterial).color.set(color);
      });
    });
  }, [modelo, color]);

  useEffect(
    () => () => {
      modelo.traverse((objeto) => {
        const malla = objeto as THREE.Mesh;
        if (!malla.isMesh) return;
        const materiales = Array.isArray(malla.material) ? malla.material : [malla.material];
        materiales.forEach((material) => material.dispose());
      });
    },
    [modelo]
  );

  const ancho = Math.max(tamano.x * escala.x, 0.1);
  const profundo = Math.max(tamano.z * escala.z, 0.1);

  return (
    <>
      <Bounds fit clip observe margin={1.15}>
        <group scale={[escala.x, escala.y, escala.z]}>
          <primitive object={modelo} dispose={null} />
        </group>
        <Reencuadrar escala={escala} />
      </Bounds>

      {/* La sombra sigue la huella del mueble y se mantiene fuera de `Bounds`
          para no agrandar el encuadre de la cámara. */}
      <SombraSuave ancho={ancho} profundo={profundo} />
    </>
  );
}

function Progreso() {
  const { progress } = useProgress();

  return (
    <Html center>
      <p className="whitespace-nowrap font-sans text-[13px] text-jk-gold-deep">
        Cargando modelo… {Math.round(progress)}%
      </p>
    </Html>
  );
}

export default function Escena3D({ url, color, escala, girar, activo }: Escena3DProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      frameloop={activo ? "always" : "never"}
      camera={{ position: [2.8, 1.9, 3.2], fov: 35, near: 0.05, far: 200 }}
      gl={{ antialias: true, alpha: false }}
      aria-hidden="true"
    >
      <color attach="background" args={["#f3f1ea"]} />

      <hemisphereLight args={["#ffffff", "#d8d2c4", 0.9]} />
      <directionalLight position={[4.5, 7, 5]} intensity={2.2} />
      <directionalLight position={[-5, 3.5, -4]} intensity={0.55} />
      <directionalLight position={[0, 2, -6]} intensity={0.35} />

      <Suspense fallback={<Progreso />}>
        <Contenido url={url} color={color} escala={escala} />
      </Suspense>

      <OrbitControls
        makeDefault
        enablePan={false}
        autoRotate={girar}
        autoRotateSpeed={1.2}
        enableDamping
        dampingFactor={0.08}
        minDistance={0.3}
        maxDistance={40}
        minPolarAngle={0.18}
        maxPolarAngle={Math.PI / 2 - 0.05}
      />
    </Canvas>
  );
}
