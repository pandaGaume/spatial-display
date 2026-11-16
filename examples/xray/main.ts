/**
 * An x-ray screen, in one scene.
 *
 * The portal is a window onto the very scene it stands in: its display looks
 * at what stands behind the opening from the eye of the viewer, and draws
 * every mesh as a wireframe. It sees more layers than the camera of the
 * application does: the pipes in the wall and under the floor, which that
 * camera never draws, show in the screen.
 *
 * No mesh is copied: a mesh is drawn solid by the camera of the application
 * and as a wireframe by the screen, from the same vertices.
 *
 * URL: ?webgpu for the WebGPU engine, ?rh for a right-handed scene.
 */
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.js";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder.js";
import { CreateTorusKnot } from "@babylonjs/core/Meshes/Builders/torusKnotBuilder.js";
import { Scene } from "@babylonjs/core/scene.js";
import { CameraDisplay, Portal } from "@spacexr/spatial-display-babylon";

const params = new URLSearchParams(location.search);
const rightHanded = params.has("rh");
const canvas = document.getElementById("canvas") as HTMLCanvasElement;

/** A layer the camera of the application does not draw: Babylon.js gives cameras and meshes the 28 bits below it. */
const HIDDEN_LAYER = 0x20000000;
const EVERYDAY_LAYERS = 0x0fffffff;
/** Toward the back of the scene, away from where the viewer starts. */
const back = rightHanded ? -1 : 1;

async function createEngine(): Promise<AbstractEngine> {
  if (params.has("webgpu")) {
    const { WebGPUEngine } = await import("@babylonjs/core/Engines/webgpuEngine.js");
    const engine = new WebGPUEngine(canvas, { antialias: true });
    await engine.initAsync();
    return engine;
  }
  return new Engine(canvas, true);
}

async function main(): Promise<void> {
  const engine = await createEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = rightHanded;
  scene.clearColor = new Color4(0.05, 0.06, 0.09, 1);
  new HemisphericLight("light", new Vector3(0.3, 1, -0.4 * back), scene);

  const camera = new ArcRotateCamera("camera", (rightHanded ? 1 : -1) * (Math.PI / 2) - 0.35, 1.25, 7.5, new Vector3(0, 1.2, 0.6 * back), scene);
  camera.wheelPrecision = 60;
  camera.minZ = 0.05;
  camera.attachControl(canvas, true);

  const solid = (name: string, color: Color3): StandardMaterial => {
    const material = new StandardMaterial(name, scene);
    material.diffuseColor = color;
    material.specularColor = new Color3(0.12, 0.12, 0.12);
    return material;
  };

  // --- What everyone sees.
  const ground = CreateGround("ground", { width: 16, height: 16, subdivisions: 16 }, scene);
  ground.material = solid("ground", new Color3(0.2, 0.21, 0.25));

  const wall = CreateBox("wall", { width: 7, height: 2.8, depth: 0.5 }, scene);
  wall.position.set(0, 1.4, 2.2 * back);
  wall.material = solid("wall", new Color3(0.62, 0.56, 0.5));

  // A mesh that is costly to draw: 24 576 triangles. It is in the scene once.
  const knot = CreateTorusKnot("knot", { radius: 0.55, tube: 0.18, radialSegments: 256, tubularSegments: 48 }, scene);
  knot.position.set(-1.7, 1.15, 0.7 * back);
  knot.material = solid("knot", new Color3(0.1, 0.55, 0.6));

  const crate = CreateBox("crate", { size: 0.9 }, scene);
  crate.position.set(1.5, 0.45, 0.6 * back);
  crate.rotation.y = 0.5;
  crate.material = solid("crate", new Color3(0.75, 0.5, 0.2));

  const ball = CreateSphere("ball", { diameter: 0.8, segments: 24 }, scene);
  ball.position.set(0.2, 0.4, 1.1 * back);
  ball.material = solid("ball", new Color3(0.8, 0.25, 0.3));

  // --- What only the screen sees: on a layer the camera of the application does not draw.
  const hidden: AbstractMesh[] = [];
  const hide = <T extends AbstractMesh>(mesh: T): T => {
    mesh.layerMask = HIDDEN_LAYER;
    mesh.material = pipes;
    hidden.push(mesh);
    return mesh;
  };
  const pipes = solid("pipes", new Color3(0.9, 0.5, 0.1));
  // Pipes in the thickness of the wall.
  for (const [i, y] of [0.5, 1.3, 2.2].entries()) {
    const pipe = hide(CreateCylinder(`wall.pipe${i}`, { diameter: 0.14, height: 6.6, tessellation: 16 }, scene));
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, y, 2.2 * back);
  }
  for (const [i, x] of [-2.4, -0.6, 1.1, 2.7].entries()) {
    const riser = hide(CreateCylinder(`wall.riser${i}`, { diameter: 0.1, height: 2.6, tessellation: 12 }, scene));
    riser.position.set(x, 1.4, 2.2 * back);
    const valve = hide(CreateTorus(`wall.valve${i}`, { diameter: 0.34, thickness: 0.07, tessellation: 20 }, scene));
    valve.rotation.x = Math.PI / 2;
    valve.position.set(x, 1.3, 2.2 * back);
  }
  // A machine behind the wall.
  const tank = hide(CreateCylinder("tank", { diameter: 1.3, height: 1.8, tessellation: 28 }, scene));
  tank.position.set(-0.8, 0.9, 3.6 * back);
  const dome = hide(CreateSphere("dome", { diameter: 1.3, segments: 20 }, scene));
  dome.position.set(-0.8, 1.8, 3.6 * back);
  const cabinet = hide(CreateBox("cabinet", { width: 1, height: 1.6, depth: 0.7 }, scene));
  cabinet.position.set(1.4, 0.8, 3.5 * back);
  // Pipes under the floor.
  for (const [i, x] of [-1.8, 0.1, 2].entries()) {
    const drain = hide(CreateCylinder(`drain${i}`, { diameter: 0.22, height: 7, tessellation: 16 }, scene));
    drain.rotation.x = Math.PI / 2;
    drain.position.set(x, -0.45, 1.2 * back);
  }

  // --- The materials of the x-ray. They are not lit: a wireframe reads by its lines alone.
  const wire = (name: string, color: Color3): StandardMaterial => {
    const material = new StandardMaterial(name, scene);
    material.wireframe = true;
    material.disableLighting = true;
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.emissiveColor = color;
    return material;
  };
  const seenWire = wire("xray.seen", new Color3(0.25, 0.95, 1));
  const hiddenWire = wire("xray.hidden", new Color3(1, 0.62, 0.15));
  const xray = (mesh: AbstractMesh): StandardMaterial => (mesh.layerMask === HIDDEN_LAYER ? hiddenWire : seenWire);

  // --- The screen. This camera is never the camera of the scene: it lends the screen its layers and its far plane.
  const lens = new FreeCamera("xray.lens", Vector3.Zero(), scene, false);
  lens.layerMask = EVERYDAY_LAYERS | HIDDEN_LAYER;
  lens.maxZ = 60;
  const background = { r: 0, g: 0.035, b: 0.07, a: 0.82 };
  const display = new CameraDisplay({
    camera: lens,
    resolution: { width: 1280, height: 800 },
    samples: 4,
    // Not quite opaque: the scene shows through, under the lines drawn of it.
    clearColor: background,
    overrideMaterial: xray,
    name: "xray.display",
  });
  // Its display shows the scene it stands in: with no anchor given, the opening gives onto what stands behind it.
  const portal = new Portal("xray", scene, { width: 1.6, height: 1, display, window: { glow: { depth: 0.25 } }, neon: { glowSize: 0.12 } });
  portal.root.position.set(0, 1.25, -1.2 * back);

  // --- Controls.
  const input = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;
  input("hidden").addEventListener("change", () => (lens.layerMask = input("hidden").checked ? EVERYDAY_LAYERS | HIDDEN_LAYER : EVERYDAY_LAYERS));
  input("wire").addEventListener("change", () => (display.overrideMaterial = input("wire").checked ? xray : null));
  input("background").addEventListener("input", () => (display.clearColor = { ...background, a: Number(input("background").value) }));
  input("x").addEventListener("input", () => {
    input("sweep").checked = false;
    portal.root.position.x = Number(input("x").value);
  });

  let time = 0;
  scene.onBeforeRenderObservable.add(() => {
    if (!input("sweep").checked) return;
    time += engine.getDeltaTime() / 1000;
    portal.root.position.x = 2.4 * Math.sin(time * 0.45);
    portal.root.position.y = 1.25 + 0.25 * Math.sin(time * 0.31);
    input("x").value = String(portal.root.position.x);
  });

  const status = document.getElementById("status") as HTMLElement;
  const triangles = Math.round(knot.getTotalIndices() / 3);
  setInterval(() => {
    status.textContent = `${engine.isWebGPU ? "WebGPU" : "WebGL"}, ${rightHanded ? "right" : "left"}-handed, ${engine.getFps().toFixed(0)} fps. One scene, ${scene.meshes.length} meshes, ${hidden.length} of them on a hidden layer. The knot has ${triangles} triangles and is in the scene once.`;
  }, 500);

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());

  // For the checks made from the console of the browser.
  Object.assign(window, { engine, scene, camera, lens, display, portal, knot, wall, hidden, Vector3, HIDDEN_LAYER });
}

void main();
