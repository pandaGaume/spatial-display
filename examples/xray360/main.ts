/**
 * An x-ray all around an object, in one scene.
 *
 * A ring travels up and down a machine. The wall of the ring is a screen: it
 * shows the machine as a wireframe, with the parts inside its hull, which the
 * camera of the application never draws. The viewer may walk around: the
 * image is right from every side.
 *
 * The display is a lens. Its camera copies the one of the viewer, and the
 * wall of the ring shows the part of that image it covers on screen. So the
 * surface can have any shape: here a cylinder, which no flat window could be.
 *
 * No mesh is copied: a mesh is drawn solid by the camera of the application
 * and as a wireframe by the lens, from the same vertices.
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
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.js";
import { attachDisplay, CameraDisplay } from "@spacexr/spatial-display-babylon";

const params = new URLSearchParams(location.search);
const rightHanded = params.has("rh");
const canvas = document.getElementById("canvas") as HTMLCanvasElement;

/** A layer the camera of the application does not draw: Babylon.js gives cameras and meshes the 28 bits below it. */
const HIDDEN_LAYER = 0x20000000;
const EVERYDAY_LAYERS = 0x0fffffff;

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
  new HemisphericLight("light", new Vector3(0.3, 1, -0.4), scene);

  const camera = new ArcRotateCamera("camera", -Math.PI / 2 - 0.5, 1.2, 7, new Vector3(0, 1.45, 0), scene);
  camera.wheelPrecision = 60;
  camera.minZ = 0.05;
  camera.attachControl(canvas, true);

  const solid = (name: string, color: Color3): StandardMaterial => {
    const material = new StandardMaterial(name, scene);
    material.diffuseColor = color;
    material.specularColor = new Color3(0.12, 0.12, 0.12);
    return material;
  };

  // --- What everyone sees: a floor, a few crates, and the hull of a machine.
  const ground = CreateGround("ground", { width: 16, height: 16, subdivisions: 16 }, scene);
  ground.material = solid("ground", new Color3(0.2, 0.21, 0.25));

  const crates = solid("crates", new Color3(0.75, 0.5, 0.2));
  for (const [i, [x, z, size]] of ([[1.9, 1.2, 0.8], [-2.2, 0.6, 0.6], [0.6, -2.3, 0.7]] as const).entries()) {
    const crate = CreateBox(`crate${i}`, { size }, scene);
    crate.position.set(x, size / 2, z);
    crate.rotation.y = 0.4 + i;
    crate.material = crates;
  }

  const shell = solid("shell", new Color3(0.56, 0.6, 0.66));
  const hull: AbstractMesh[] = [];
  const plate = (mesh: AbstractMesh): AbstractMesh => {
    mesh.material = shell;
    hull.push(mesh);
    return mesh;
  };
  plate(CreateCylinder("base", { diameter: 1.5, height: 0.16, tessellation: 28 }, scene)).position.y = 0.08;
  plate(CreateCylinder("body", { diameter: 1.1, height: 2.2, tessellation: 28 }, scene)).position.y = 1.26;
  plate(CreateSphere("dome", { diameter: 1.1, segments: 14 }, scene)).position.y = 2.36;

  // --- What only the lens sees: the parts inside the hull, on a layer the camera of the application does not draw.
  const inside: AbstractMesh[] = [];
  const parts = solid("parts", new Color3(0.9, 0.5, 0.1));
  const hide = <T extends AbstractMesh>(mesh: T): T => {
    mesh.layerMask = HIDDEN_LAYER;
    mesh.material = parts;
    inside.push(mesh);
    return mesh;
  };
  const knot = hide(CreateTorusKnot("core", { radius: 0.22, tube: 0.07, radialSegments: 96, tubularSegments: 10 }, scene));
  knot.position.y = 1.55;
  for (let i = 0; i < 5; i++) {
    hide(CreateTorus(`coil${i}`, { diameter: 0.8, thickness: 0.05, tessellation: 18 }, scene)).position.y = 0.45 + i * 0.11;
  }
  for (let i = 0; i < 3; i++) {
    const rod = hide(CreateCylinder(`rod${i}`, { diameter: 0.06, height: 2, tessellation: 10 }, scene));
    const angle = (i * 2 * Math.PI) / 3;
    rod.position.set(0.43 * Math.cos(angle), 1.26, 0.43 * Math.sin(angle));
  }
  hide(CreateSphere("tank", { diameter: 0.52, segments: 14 }, scene)).position.y = 2.3;
  const rotor = hide(CreateCylinder("rotor", { diameterTop: 0.2, diameterBottom: 0.56, height: 0.34, tessellation: 9 }, scene));
  rotor.position.y = 1.02;

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
  const seenWire = wire("xray.seen", new Color3(0.16, 0.62, 0.78));
  const hiddenWire = wire("xray.hidden", new Color3(1, 0.62, 0.15));
  const xray = (mesh: AbstractMesh): StandardMaterial => (mesh.layerMask === HIDDEN_LAYER ? hiddenWire : seenWire);

  // --- The ring: an open cylinder, and two rims of light. The node is moved and sized, never the meshes.
  const ring = new TransformNode("ring", scene);
  const wall = CreateCylinder("ring.wall", { diameter: 1, height: 1, tessellation: 64, cap: Mesh.NO_CAP }, scene);
  wall.parent = ring;
  const light = new StandardMaterial("ring.light", scene);
  light.disableLighting = true;
  light.emissiveColor = new Color3(0.55, 0.9, 1);
  const rims = [1, -1].map((side) => {
    const rim = CreateTorus(`ring.rim${side}`, { diameter: 1, thickness: 0.012, tessellation: 64 }, scene);
    rim.parent = ring;
    rim.material = light;
    return { rim, side };
  });
  const sizeRing = (radius: number, height: number): void => {
    wall.scaling.set(2 * radius, height, 2 * radius);
    for (const { rim, side } of rims) {
      rim.scaling.setAll(2 * radius);
      rim.position.y = (side * height) / 2;
    }
  };

  // --- The lens. This camera is never the camera of the scene: it lends the lens its layers.
  const scanner = new FreeCamera("xray.scanner", Vector3.Zero(), scene, false);
  scanner.layerMask = EVERYDAY_LAYERS | HIDDEN_LAYER;
  // A lens cuts nothing in front of its surface: what its image holds is picked here.
  const machine = new Set<AbstractMesh>([...hull, ...inside]);
  let surroundings = false;
  let hullShown = true;
  const background = { r: 0, g: 0.035, b: 0.07, a: 0.86 };
  const display = new CameraDisplay({
    camera: scanner,
    samples: 4,
    // Not quite opaque: the scene shows through, under the lines drawn of it.
    clearColor: background,
    overrideMaterial: xray,
    include: (mesh) => (machine.has(mesh) ? hullShown || mesh.layerMask === HIDDEN_LAYER : surroundings && !mesh.name.startsWith("ring.")),
    name: "xray.display",
  });
  // The image is the one of the viewer of this scene, at the size of the canvas.
  display.setLens({ scene });
  const surface = attachDisplay(wall, display);

  // --- Controls.
  const input = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;
  const number = (id: string): number => Number(input(id).value);
  const resize = (): void => sizeRing(number("radius"), number("band"));
  resize();
  ring.position.y = number("y");
  input("radius").addEventListener("input", resize);
  input("band").addEventListener("input", resize);
  input("y").addEventListener("input", () => {
    input("scan").checked = false;
    ring.position.y = number("y");
  });
  input("hidden").addEventListener("change", () => (scanner.layerMask = input("hidden").checked ? EVERYDAY_LAYERS | HIDDEN_LAYER : EVERYDAY_LAYERS));
  input("hull").addEventListener("change", () => (hullShown = input("hull").checked));
  input("surroundings").addEventListener("change", () => (surroundings = input("surroundings").checked));
  input("background").addEventListener("input", () => (display.clearColor = { ...background, a: number("background") }));
  input("opacity").addEventListener("input", () => (surface.opacity = number("opacity")));
  // With its back face, the wall also shows from the inside: the far half of the ring, seen over the near one.
  surface.doubleSided = input("back").checked;
  input("back").addEventListener("change", () => (surface.doubleSided = input("back").checked));

  let time = 0;
  scene.onBeforeRenderObservable.add(() => {
    const seconds = engine.getDeltaTime() / 1000;
    knot.rotation.y += seconds * 0.6;
    rotor.rotation.y -= seconds * 1.7;
    if (!input("scan").checked) return;
    time += seconds;
    ring.position.y = 1.4 + 1.05 * Math.sin(time * 0.6);
    input("y").value = String(ring.position.y);
  });

  const status = document.getElementById("status") as HTMLElement;
  setInterval(() => {
    const { width, height } = display.resolution;
    status.textContent = `${engine.isWebGPU ? "WebGPU" : "WebGL"}, ${rightHanded ? "right" : "left"}-handed, ${engine.getFps().toFixed(0)} fps. One scene, ${scene.meshes.length} meshes, ${inside.length} of them on a hidden layer. Image of the lens: ${width} x ${height}.`;
  }, 500);

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());

  // For the checks made from the console of the browser.
  Object.assign(window, { engine, scene, camera, scanner, display, surface, ring, wall, knot, hull, inside, Vector3, HIDDEN_LAYER });
}

void main();
