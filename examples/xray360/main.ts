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
 * surface can have any shape: a cylinder, which no flat window could be, or
 * the two other surfaces of this example, a polygon that is bent and twisted
 * and that circles the machine, and a sphere that closes on a part of it.
 *
 * The ring and the polygon are portals: the first on the wall of a cylinder
 * the library builds, with a frame of light on its two rims, the second on a
 * mesh of the application, whose edge the portal finds and lights.
 *
 * No mesh is copied: a mesh is drawn solid by the camera of the application
 * and as a wireframe by the lens, from the same vertices.
 *
 * With ?stereo the viewer has two eyes, drawn side by side: the lens then
 * draws an image for each, and what shows in a surface has depth.
 * ?stereo=0.3 sets the distance between the eyes.
 *
 * URL: ?polygon or ?sphere to start with that surface, ?webgpu for the
 * WebGPU engine, ?rh for a right-handed scene, ?stereo for a viewer with
 * two eyes, ?xr for a button that enters the scene in a headset.
 */
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { StereoscopicArcRotateCamera } from "@babylonjs/core/Cameras/Stereoscopic/stereoscopicArcRotateCamera.js";
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
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.js";
import { attachDisplay, CameraDisplay, CylinderSurfaceBuilder, MeshSurfaceBuilder, PortalBuilder } from "@spacexr/spatial-display-babylon";
import { offerHeadset } from "../xr.js";

const params = new URLSearchParams(location.search);
const rightHanded = params.has("rh");
/** Distance between the two eyes of the viewer; null for a viewer with one eye. */
const eyesApart = params.has("stereo") ? Number(params.get("stereo")) || 0.064 : null;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;

/** A layer the camera of the application does not draw: Babylon.js gives cameras and meshes the 28 bits below it. */
const HIDDEN_LAYER = 0x20000000;
const EVERYDAY_LAYERS = 0x0fffffff;

/** The color of the back of a surface, when it is plain. */
const PLAIN_BACK = { r: 0.02, g: 0.05, b: 0.09, a: 1 };

/** The corners of the polygon before it is bent: eight of them, one set back in a notch. x to the right, y upward. */
const CORNERS: readonly (readonly [number, number])[] = [
  [0.78, -0.1],
  [0.52, 0.62],
  [0.22, 0.38],
  [0.02, 0.8],
  [-0.6, 0.55],
  [-0.8, -0.05],
  [-0.42, -0.7],
  [0.35, -0.72],
];

/** How far a point of the polygon is pushed toward the machine: the sides wrap around it, the sheet is twisted, top and bottom lean back. */
const bend = (x: number, y: number): number => 0.45 * x * x + 0.3 * x * y - 0.2 * y * y;

async function createEngine(): Promise<AbstractEngine> {
  if (params.has("webgpu")) {
    const { WebGPUEngine } = await import("@babylonjs/core/Engines/webgpuEngine.js");
    const engine = new WebGPUEngine(canvas, { antialias: true });
    await engine.initAsync();
    return engine;
  }
  return new Engine(canvas, true);
}

/**
 * A polygon that is not flat, as a mesh of its own vertices: rings of points
 * from the centre to the sides, each pushed in depth by `depth`. Its front is
 * toward -z.
 */
function createBentPolygon(name: string, scene: Scene, depth: (x: number, y: number) => number): Mesh {
  const rings = 8;
  const perSide = 6;
  const around = CORNERS.length * perSide;
  const positions = [0, 0, depth(0, 0)];
  // A surface needs texture coordinates, even though a lens does not read the image with them.
  const uvs = [0.5, 0.5];
  for (let ring = 1; ring <= rings; ring++) {
    for (let k = 0; k < around; k++) {
      const from = CORNERS[Math.floor(k / perSide)] as readonly [number, number];
      const to = CORNERS[(Math.floor(k / perSide) + 1) % CORNERS.length] as readonly [number, number];
      const along = (k % perSide) / perSide;
      const x = (ring / rings) * (from[0] + (to[0] - from[0]) * along);
      const y = (ring / rings) * (from[1] + (to[1] - from[1]) * along);
      positions.push(x, y, depth(x, y));
      uvs.push(0.5 + x / 1.7, 0.5 + y / 1.7);
    }
  }
  const at = (ring: number, k: number): number => 1 + (ring - 1) * around + (k % around);
  const indices: number[] = [];
  for (let k = 0; k < around; k++) {
    indices.push(0, at(1, k), at(1, k + 1));
    for (let ring = 1; ring < rings; ring++) {
      indices.push(at(ring, k), at(ring + 1, k), at(ring + 1, k + 1), at(ring, k), at(ring + 1, k + 1), at(ring, k + 1));
    }
  }
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.uvs = uvs;
  const sheet = new Mesh(name, scene);
  data.applyToMesh(sheet);
  return sheet;
}

async function main(): Promise<void> {
  const engine = await createEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = rightHanded;
  scene.clearColor = new Color4(0.05, 0.06, 0.09, 1);
  new HemisphericLight("light", new Vector3(0.3, 1, -0.4), scene);

  const target = new Vector3(0, 1.45, 0);
  // With two eyes the scene is drawn twice, side by side, and the lens draws an image for each eye.
  const camera = eyesApart === null ? new ArcRotateCamera("camera", -Math.PI / 2 - 0.5, 1.2, 7, target, scene) : new StereoscopicArcRotateCamera("camera", -Math.PI / 2 - 0.5, 1.2, 7, target, eyesApart, true, scene);
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
  const scenery: AbstractMesh[] = [];
  const ground = CreateGround("ground", { width: 16, height: 16, subdivisions: 16 }, scene);
  ground.material = solid("ground", new Color3(0.2, 0.21, 0.25));
  scenery.push(ground);

  const crates = solid("crates", new Color3(0.75, 0.5, 0.2));
  for (const [i, [x, z, size]] of ([[1.9, 1.2, 0.8], [-2.2, 0.6, 0.6], [0.6, -2.3, 0.7]] as const).entries()) {
    const crate = CreateBox(`crate${i}`, { size }, scene);
    crate.position.set(x, size / 2, z);
    crate.rotation.y = 0.4 + i;
    crate.material = crates;
    scenery.push(crate);
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

  // --- The lens. This camera is never the camera of the scene: it lends the lens its layers.
  const scanner = new FreeCamera("xray.scanner", Vector3.Zero(), scene, false);
  scanner.layerMask = EVERYDAY_LAYERS | HIDDEN_LAYER;
  // A lens cuts nothing in front of its surface: what its image holds is picked here.
  const machine = new Set<AbstractMesh>([...hull, ...inside]);
  const around = new Set<AbstractMesh>(scenery);
  let surroundings = false;
  let hullShown = true;
  const background = { r: 0, g: 0.035, b: 0.07, a: 0.86 };
  const display = new CameraDisplay({
    camera: scanner,
    samples: 4,
    // Not quite opaque: the scene shows through, under the lines drawn of it.
    clearColor: background,
    overrideMaterial: xray,
    include: (mesh) => (machine.has(mesh) ? hullShown || mesh.layerMask === HIDDEN_LAYER : surroundings && around.has(mesh)),
    name: "xray.display",
  });
  // The image is the one of the viewer of this scene, at the size of the canvas.
  display.setLens({ scene });

  // --- One lens, three surfaces: each shows the part of the same image it covers on screen.
  const rim = new Color3(0.55, 0.9, 1);
  const halo = { color: new Color3(0.1, 0.55, 1), size: 0.07, intensity: 1.1 };

  // The ring: a portal on the wall of a cylinder, with a frame of light on its two rims. It is sized through
  // the portal, which keeps the section of its frame, never by scaling its node.
  const ring = new PortalBuilder("ring", scene).withSurface(new CylinderSurfaceBuilder({ diameter: 1.7, height: 0.75, display })).withFrame().withLight(true, rim).withGlow(halo).build();

  // The polygon: a mesh of its own vertices, bent toward the machine. The portal takes it as it is, finds
  // its edge and lights it. The front of the sheet is toward the -z of its node, which is kept turned away
  // from the machine.
  const panel = new TransformNode("panel", scene);
  const sheet = createBentPolygon("panel.sheet", scene, bend);
  sheet.parent = panel;
  const polygon = new PortalBuilder("polygon", scene).withSurface(new MeshSurfaceBuilder(sheet, { display })).withLight(true, rim).withGlow(halo).build();

  // The sphere: a bubble around a part of the machine. A closed mesh has no edge to frame: it needs no portal.
  const bubble = CreateSphere("bubble", { diameter: 1, segments: 32 }, scene);
  const surfaces = [ring, polygon, attachDisplay(bubble, display)];

  // --- Controls.
  const input = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;
  const number = (id: string): number => Number(input(id).value);
  const shape = document.getElementById("shape") as HTMLSelectElement;
  const asked = ["polygon", "sphere"].find((name) => params.has(name));
  if (asked) shape.value = asked;

  /** Where the polygon stands around the machine, in radians. It starts between the viewer and the machine, a little to one side. */
  let turn = -2.35;
  /** Places and sizes the surface that shows, from the sliders. */
  const place = (): void => {
    ring.root.setEnabled(shape.value === "ring");
    panel.setEnabled(shape.value === "polygon");
    bubble.setEnabled(shape.value === "sphere");
    const radius = number("radius");
    const size = number("size");
    const height = number("y");
    // The ring: its width is the length of its turn, and `size` the height of its wall.
    ring.root.position.y = height;
    ring.setDimension(2 * Math.PI * radius, size);
    // The polygon: in front of the hull, its -z turned away from the machine. `size` scales it.
    const distance = radius + 0.4;
    panel.position.set(distance * Math.sin(turn), height, distance * Math.cos(turn));
    panel.rotation.y = turn + Math.PI;
    panel.scaling.setAll(0.5 + 0.67 * size);
    // The sphere: around the axis of the machine. `size` stretches it upward.
    bubble.position.y = height;
    bubble.scaling.set(2 * radius, 2 * radius * (0.5 + 0.67 * size), 2 * radius);
  };
  place();
  shape.addEventListener("change", place);
  input("radius").addEventListener("input", place);
  input("size").addEventListener("input", place);
  input("y").addEventListener("input", () => {
    input("scan").checked = false;
    place();
  });
  input("hidden").addEventListener("change", () => (scanner.layerMask = input("hidden").checked ? EVERYDAY_LAYERS | HIDDEN_LAYER : EVERYDAY_LAYERS));
  input("hull").addEventListener("change", () => (hullShown = input("hull").checked));
  input("surroundings").addEventListener("change", () => (surroundings = input("surroundings").checked));
  input("background").addEventListener("input", () => (display.clearColor = { ...background, a: number("background") }));
  const look = (): void => {
    for (const surface of surfaces) {
      surface.opacity = number("opacity");
      // With its back face, a surface also shows from behind: the far half of the ring, seen over the near one.
      surface.doubleSided = input("back").checked;
      // Or its back is plain: the inside of the ring is then a wall of that color, which shows no image.
      surface.backColor = input("plain").checked ? PLAIN_BACK : null;
    }
  };
  look();
  input("opacity").addEventListener("input", look);
  input("back").addEventListener("change", look);
  input("plain").addEventListener("change", look);

  let time = 0;
  scene.onBeforeRenderObservable.add(() => {
    const seconds = engine.getDeltaTime() / 1000;
    knot.rotation.y += seconds * 0.6;
    rotor.rotation.y -= seconds * 1.7;
    if (!input("scan").checked) return;
    time += seconds;
    // The ring and the sphere go up and down the whole machine; the polygon also circles it.
    const polygon = shape.value === "polygon";
    if (polygon) turn += seconds * 0.35;
    input("y").value = String(polygon ? 1.4 + 0.6 * Math.sin(time * 0.6) : 1.4 + 1.05 * Math.sin(time * 0.6));
    place();
  });

  const status = document.getElementById("status") as HTMLElement;
  setInterval(() => {
    const { width, height } = display.resolution;
    status.textContent = `${engine.isWebGPU ? "WebGPU" : "WebGL"}, ${rightHanded ? "right" : "left"}-handed, ${engine.getFps().toFixed(0)} fps. One scene, ${scene.meshes.length} meshes, ${inside.length} of them on a hidden layer. Image of the lens: ${width} x ${height}.`;
  }, 500);

  // With ?xr, the scene can be entered in a headset: its viewer then has two eyes.
  const xr = await offerHeadset(scene, ground);

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());

  // For the checks made from the console of the browser.
  Object.assign(window, { engine, scene, camera, scanner, display, surfaces, ring, polygon, panel, sheet, bubble, knot, hull, inside, xr, Vector3, HIDDEN_LAYER });
}

void main();
