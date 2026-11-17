/**
 * An x-ray screen, in one scene.
 *
 * The portal is a window onto the very scene it stands in: its display looks
 * at what stands behind the opening from the eye of the viewer, and draws
 * every mesh as a wireframe. It sees more layers than the camera of the
 * application does: the pipes in the wall and under the floor, which that
 * camera never draws, show in the screen.
 *
 * A figure walks around the wall. Its bones are meshes of that hidden layer,
 * carried by the same joints as its body: the camera of the application
 * draws the body, the screen draws the bones. So the figure shows as a
 * skeleton when it passes behind the screen, and still does behind the wall,
 * where the eye has lost it.
 *
 * No mesh is copied: a mesh is drawn solid by the camera of the application
 * and as a wireframe by the screen, from the same vertices.
 *
 * URL: ?webgpu for the WebGPU engine, ?rh for a right-handed scene, ?xr for a
 * button that enters the scene in a headset.
 */
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.js";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder.js";
import { CreateTorusKnot } from "@babylonjs/core/Meshes/Builders/torusKnotBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.js";
import { CameraDisplay, PortalBuilder, RectSurfaceBuilder } from "@spacexr/spatial-display-babylon";
import { offerHeadset } from "../xr.js";

const params = new URLSearchParams(location.search);
const rightHanded = params.has("rh");
const canvas = document.getElementById("canvas") as HTMLCanvasElement;

/** A layer the camera of the application does not draw: Babylon.js gives cameras and meshes the 28 bits below it. */
const HIDDEN_LAYER = 0x20000000;
const EVERYDAY_LAYERS = 0x0fffffff;
/** Toward the back of the scene, away from where the viewer starts. */
const back = rightHanded ? -1 : 1;

/** Size of the wall, in meters. */
const WALL = { width: 7, height: 2.8, depth: 0.5, z: 2.2 };

async function createEngine(): Promise<AbstractEngine> {
  if (params.has("webgpu")) {
    const { WebGPUEngine } = await import("@babylonjs/core/Engines/webgpuEngine.js");
    const engine = new WebGPUEngine(canvas, { antialias: true });
    await engine.initAsync();
    return engine;
  }
  return new Engine(canvas, true);
}

/** Paints courses of bricks, each laid half a brick off the one under it. */
function createBricks(scene: Scene): DynamicTexture {
  const width = 1792;
  const height = 720;
  const texture = new DynamicTexture("bricks", { width, height }, scene, true);
  const context = texture.getContext();
  context.fillStyle = "#b9b2a6";
  context.fillRect(0, 0, width, height);
  const courses = 24;
  const course = height / courses;
  const brick = course * 2.9;
  const joint = 4;
  // The same wall at every load: the shade of a brick comes from its place.
  const shade = (row: number, column: number): number => (Math.sin(row * 12.9898 + column * 78.233) * 43758.5453) % 1;
  for (let row = 0; row < courses; row++) {
    const offset = row % 2 === 0 ? 0 : -brick / 2;
    for (let column = 0; offset + column * brick < width; column++) {
      const tone = Math.abs(shade(row, column));
      context.fillStyle = `rgb(${Math.round(150 + 45 * tone)}, ${Math.round(72 + 26 * tone)}, ${Math.round(56 + 18 * tone)})`;
      context.fillRect(offset + column * brick + joint / 2, row * course + joint / 2, brick - joint, course - joint);
    }
  }
  texture.update();
  return texture;
}

/** A figure that walks: its body, its bones, and what moves them. */
interface IWalker {
  /** Stands on the ground, and looks along its own z. */
  readonly root: TransformNode;
  /** What everyone sees. */
  readonly body: readonly AbstractMesh[];
  /** What only the screen sees: on the hidden layer, carried by the joints of the body. */
  readonly bones: readonly AbstractMesh[];
  /** Sets the limbs for a figure that has walked `distance`, in meters. */
  stride(distance: number): void;
}

/**
 * Builds a figure out of plain shapes, 1.75 m tall. Each part of its body
 * hangs from a joint, with a bone inside it: a mesh of the hidden layer,
 * which follows the joint as the body does.
 */
function createWalker(scene: Scene, skin: StandardMaterial, ivory: StandardMaterial): IWalker {
  const body: AbstractMesh[] = [];
  const bones: AbstractMesh[] = [];
  const root = new TransformNode("walker", scene);
  const joint = (name: string, parent: TransformNode, x: number, y: number): TransformNode => {
    const node = new TransformNode(`walker.${name}`, scene);
    node.parent = parent;
    node.position.set(x, y, 0);
    return node;
  };
  const flesh = <T extends AbstractMesh>(mesh: T, parent: TransformNode): T => {
    mesh.parent = parent;
    mesh.material = skin;
    body.push(mesh);
    return mesh;
  };
  const bone = <T extends AbstractMesh>(mesh: T, parent: TransformNode): T => {
    mesh.parent = parent;
    mesh.material = ivory;
    mesh.layerMask = HIDDEN_LAYER;
    bones.push(mesh);
    return mesh;
  };
  /** A part of a limb, hanging from its joint: flesh around a bone, and the knob of the joint. */
  const segment = (name: string, at: TransformNode, length: number, thickness: number): void => {
    flesh(CreateCapsule(`walker.${name}`, { height: length + thickness, radius: thickness / 2, tessellation: 12 }, scene), at).position.y = -length / 2;
    bone(CreateCylinder(`walker.${name}.bone`, { height: length, diameterTop: 0.05, diameterBottom: 0.032, tessellation: 8 }, scene), at).position.y = -length / 2;
    bone(CreateSphere(`walker.${name}.knob`, { diameter: 0.075, segments: 8 }, scene), at);
  };
  const limb = (name: string, parent: TransformNode, x: number, y: number, upper: number, lower: number, thickness: number) => {
    const top = joint(name, parent, x, y);
    segment(`${name}.upper`, top, upper, thickness);
    const middle = joint(`${name}.middle`, top, 0, -upper);
    segment(`${name}.lower`, middle, lower, thickness * 0.85);
    return { top, middle };
  };

  // --- The trunk, from the hips up.
  const hips = joint("hips", root, 0, HIP_HEIGHT);
  const trunk = flesh(CreateCapsule("walker.trunk", { height: 0.74, radius: 0.17, tessellation: 16 }, scene), hips);
  trunk.position.y = 0.31;
  trunk.scaling.set(1.15, 1, 0.72);
  bone(CreateTorus("walker.pelvis", { diameter: 0.25, thickness: 0.055, tessellation: 16 }, scene), hips).scaling.z = 0.7;
  bone(CreateCylinder("walker.spine", { height: 0.6, diameter: 0.045, tessellation: 8 }, scene), hips).position.y = 0.32;
  for (let rib = 0; rib < 4; rib++) {
    const ring = bone(CreateTorus(`walker.rib${rib}`, { diameter: 0.3 - rib * 0.022, thickness: 0.022, tessellation: 16 }, scene), hips);
    ring.position.y = 0.27 + rib * 0.075;
    ring.scaling.z = 0.68;
  }
  const collar = bone(CreateCylinder("walker.collar", { height: 0.46, diameter: 0.03, tessellation: 8 }, scene), hips);
  collar.rotation.z = Math.PI / 2;
  collar.position.y = 0.56;

  // --- The head.
  const neck = joint("neck", hips, 0, 0.66);
  flesh(CreateSphere("walker.head", { diameter: 0.24, segments: 12 }, scene), neck).position.y = 0.13;
  bone(CreateSphere("walker.skull", { diameter: 0.185, segments: 10 }, scene), neck).position.y = 0.15;
  bone(CreateBox("walker.jaw", { width: 0.1, height: 0.04, depth: 0.1 }, scene), neck).position.set(0, 0.045, 0.035);
  bone(CreateCylinder("walker.neck.bone", { height: 0.12, diameter: 0.04, tessellation: 8 }, scene), neck);

  // --- The limbs: the left ones, then the right ones.
  const legs = [-1, 1].map((side) => limb(side < 0 ? "leg.left" : "leg.right", hips, side * 0.1, -0.02, 0.44, 0.44, 0.13));
  const arms = [-1, 1].map((side) => limb(side < 0 ? "arm.left" : "arm.right", hips, side * 0.26, 0.54, 0.3, 0.28, 0.09));
  for (const [i, leg] of legs.entries()) {
    flesh(CreateBox(`walker.foot${i}`, { width: 0.1, height: 0.07, depth: 0.25 }, scene), leg.middle).position.set(0, -0.46, 0.06);
    bone(CreateBox(`walker.foot${i}.bone`, { width: 0.045, height: 0.03, depth: 0.19 }, scene), leg.middle).position.set(0, -0.46, 0.06);
  }

  const stride = (distance: number): void => {
    const phase = (distance / STRIDE) * 2 * Math.PI;
    for (const [i, leg] of legs.entries()) {
      // The two legs are half a stride apart. A turn about x by a positive angle sends what hangs backward.
      const own = phase + i * Math.PI;
      leg.top.rotation.x = -0.5 * Math.sin(own);
      // The knee bends while its leg swings forward, and is straight when the foot lands.
      leg.middle.rotation.x = 0.85 * Math.max(0, Math.cos(own));
      // An arm swings with the leg of the other side, and its elbow stays bent, forward.
      const arm = arms[i];
      if (arm) {
        arm.top.rotation.x = 0.42 * Math.sin(own);
        arm.middle.rotation.x = -0.35 - 0.2 * Math.max(0, -Math.sin(own));
      }
    }
    // The body sinks a little at each step, and leans into its walk.
    hips.position.y = HIP_HEIGHT - 0.02 * (1 - Math.cos(2 * phase));
    hips.rotation.x = 0.05;
    hips.rotation.z = 0.03 * Math.sin(phase);
  };
  stride(0);
  return { root, body, bones, stride };
}

/** Height of the hips of the walker, and the length it covers in two steps, in meters. */
const HIP_HEIGHT = 0.9;
const STRIDE = 1.45;

async function main(): Promise<void> {
  const engine = await createEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = rightHanded;
  scene.clearColor = new Color4(0.05, 0.06, 0.09, 1);
  new HemisphericLight("light", new Vector3(0.3, 1, -0.4 * back), scene);

  // The viewer stands low, about at the height of the screen: the line of sight then runs level through it, and
  // reaches a figure that walks behind the wall. From above it would end on the floor.
  const camera = new ArcRotateCamera("camera", (rightHanded ? 1 : -1) * (Math.PI / 2) - 0.35, 1.45, 8.5, new Vector3(0, 1.1, 0.8 * back), scene);
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
  const ground = CreateGround("ground", { width: 18, height: 18, subdivisions: 18 }, scene);
  ground.material = solid("ground", new Color3(0.2, 0.21, 0.25));

  // A wall of bricks, with a coping stone on top. Its two long faces show the whole of the bricks, its ends and
  // its top the share of them they are wide.
  const thin = WALL.depth / WALL.width;
  const whole = new Vector4(0, 0, 1, 1);
  const end = new Vector4(0, 0, thin, 1);
  const top = new Vector4(0, 0, 1, WALL.depth / WALL.height);
  const wall = CreateBox("wall", { width: WALL.width, height: WALL.height, depth: WALL.depth, faceUV: [whole, whole, end, end, top, top] }, scene);
  wall.position.set(0, WALL.height / 2, WALL.z * back);
  const bricks = solid("bricks", new Color3(1, 1, 1));
  bricks.diffuseTexture = createBricks(scene);
  wall.material = bricks;
  const coping = CreateBox("coping", { width: WALL.width + 0.16, height: 0.09, depth: WALL.depth + 0.16 }, scene);
  coping.position.set(0, WALL.height + 0.045, WALL.z * back);
  coping.material = solid("stone", new Color3(0.72, 0.7, 0.66));

  // A mesh that is costly to draw: 24 576 triangles. It is in the scene once.
  const knot = CreateTorusKnot("knot", { radius: 0.55, tube: 0.18, radialSegments: 256, tubularSegments: 48 }, scene);
  knot.position.set(-1.7, 1.15, 0.9 * back);
  knot.material = solid("knot", new Color3(0.1, 0.55, 0.6));

  const crate = CreateBox("crate", { size: 0.9 }, scene);
  crate.position.set(1.5, 0.45, 0.8 * back);
  crate.rotation.y = 0.5;
  crate.material = solid("crate", new Color3(0.75, 0.5, 0.2));

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
    pipe.position.set(0, y, WALL.z * back);
  }
  for (const [i, x] of [-2.4, -0.6, 1.1, 2.7].entries()) {
    const riser = hide(CreateCylinder(`wall.riser${i}`, { diameter: 0.1, height: 2.6, tessellation: 12 }, scene));
    riser.position.set(x, 1.4, WALL.z * back);
    const valve = hide(CreateTorus(`wall.valve${i}`, { diameter: 0.34, thickness: 0.07, tessellation: 20 }, scene));
    valve.rotation.x = Math.PI / 2;
    valve.position.set(x, 1.3, WALL.z * back);
  }
  // A machine behind the wall, past where the walker goes.
  const tank = hide(CreateCylinder("tank", { diameter: 1.3, height: 1.8, tessellation: 28 }, scene));
  tank.position.set(-0.8, 0.9, 5.6 * back);
  const dome = hide(CreateSphere("dome", { diameter: 1.3, segments: 20 }, scene));
  dome.position.set(-0.8, 1.8, 5.6 * back);
  const cabinet = hide(CreateBox("cabinet", { width: 1, height: 1.6, depth: 0.7 }, scene));
  cabinet.position.set(1.4, 0.8, 5.5 * back);
  // Pipes under the floor.
  for (const [i, x] of [-1.8, 0.1, 2].entries()) {
    const drain = hide(CreateCylinder(`drain${i}`, { diameter: 0.22, height: 7, tessellation: 16 }, scene));
    drain.rotation.x = Math.PI / 2;
    drain.position.set(x, -0.45, 1.2 * back);
  }

  // --- The walker: a body everyone sees, and bones only the screen sees.
  const walker = createWalker(scene, solid("skin", new Color3(0.22, 0.45, 0.85)), solid("ivory", new Color3(0.93, 0.9, 0.82)));
  const body = new Set<AbstractMesh>(walker.body);
  const bones = new Set<AbstractMesh>(walker.bones);
  // It goes around the wall: in front of it, where it passes behind the screen, then behind it, out of sight.
  const path = { x: 4.7, z: 2.3, centre: 1.7 };
  const along = (angle: number): Vector3 => new Vector3(path.x * Math.cos(angle), 0, (path.centre + path.z * Math.sin(angle)) * back);

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
  // The body is a faint outline around its bones, which show plain and bright.
  const bodyWire = wire("xray.body", new Color3(0.08, 0.3, 0.38));
  const boneLight = new StandardMaterial("xray.bone", scene);
  boneLight.disableLighting = true;
  boneLight.diffuseColor = Color3.Black();
  boneLight.specularColor = Color3.Black();
  boneLight.emissiveColor = new Color3(0.97, 0.98, 1);
  const xray = (mesh: AbstractMesh): StandardMaterial => {
    if (bones.has(mesh)) return boneLight;
    if (body.has(mesh)) return bodyWire;
    return mesh.layerMask === HIDDEN_LAYER ? hiddenWire : seenWire;
  };

  // --- The screen. This camera is never the camera of the scene: it lends the screen its layers and its far plane.
  const scanner = new FreeCamera("xray.scanner", Vector3.Zero(), scene, false);
  scanner.layerMask = EVERYDAY_LAYERS | HIDDEN_LAYER;
  scanner.maxZ = 60;
  const background = { r: 0, g: 0.035, b: 0.07, a: 0.82 };
  const display = new CameraDisplay({
    camera: scanner,
    resolution: { width: 1360, height: 1040 },
    samples: 4,
    // Not quite opaque: the scene shows through, under the lines drawn of it.
    clearColor: background,
    overrideMaterial: xray,
    name: "xray.display",
  });
  // Its display shows the scene it stands in: with no anchor given, the opening gives onto what stands behind it.
  const portal = new PortalBuilder("xray", scene)
    .withSurface(new RectSurfaceBuilder({ width: 1.7, height: 1.3, display, window: { glow: { depth: 0.25 } } }))
    .withFrame()
    .withLight()
    .withGlow({ size: 0.12 })
    .build();
  portal.root.position.set(0, 1.3, -1.4 * back);

  // --- Controls.
  const input = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;
  input("hidden").addEventListener("change", () => (scanner.layerMask = input("hidden").checked ? EVERYDAY_LAYERS | HIDDEN_LAYER : EVERYDAY_LAYERS));
  input("wire").addEventListener("change", () => (display.overrideMaterial = input("wire").checked ? xray : null));
  input("background").addEventListener("input", () => (display.clearColor = { ...background, a: Number(input("background").value) }));
  input("x").addEventListener("input", () => {
    input("sweep").checked = false;
    portal.root.position.x = Number(input("x").value);
  });

  let time = 0;
  let angle = -1.2;
  let walked = 0;
  scene.onBeforeRenderObservable.add(() => {
    const seconds = Math.min(engine.getDeltaTime() / 1000, 0.1);
    if (input("walk").checked) {
      // A step along the path, at the pace of a walk, and the limbs for the length walked.
      const step = 1.25 * seconds;
      angle += step / Math.hypot(path.x * Math.sin(angle), path.z * Math.cos(angle));
      walked += step;
      const here = along(angle);
      const ahead = along(angle + 0.01).subtractInPlace(here);
      walker.root.position.copyFrom(here);
      walker.root.rotation.y = Math.atan2(ahead.x, ahead.z);
      walker.stride(walked);
    }
    if (!input("sweep").checked) return;
    time += seconds;
    portal.root.position.x = 2.4 * Math.sin(time * 0.45);
    portal.root.position.y = 1.3 + 0.15 * Math.sin(time * 0.31);
    input("x").value = String(portal.root.position.x);
  });

  const status = document.getElementById("status") as HTMLElement;
  const triangles = Math.round(knot.getTotalIndices() / 3);
  setInterval(() => {
    status.textContent = `${engine.isWebGPU ? "WebGPU" : "WebGL"}, ${rightHanded ? "right" : "left"}-handed, ${engine.getFps().toFixed(0)} fps. One scene, ${scene.meshes.length} meshes, ${hidden.length + bones.size} of them on a hidden layer: pipes, a machine, and the ${bones.size} bones of the walker. The knot has ${triangles} triangles and is in the scene once.`;
  }, 500);

  // With ?xr, the scene can be entered in a headset: its viewer then has two eyes.
  await offerHeadset(scene, ground);

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());

  // For the checks made from the console of the browser.
  Object.assign(window, { engine, scene, camera, scanner, display, portal, knot, wall, hidden, walker, Vector3, HIDDEN_LAYER });
}

void main();
