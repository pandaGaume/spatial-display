/**
 * A sphere that takes the viewer into another world.
 *
 * From outside, the sphere is an object of the room as any other: nothing of
 * it is a portal. Walk into it, and its wall shows another scene, all around:
 * the viewer stands in the other world, and looks about as they would there.
 *
 * They have not been sent anywhere. The inside of the sphere is the surface of
 * a display that is a lens onto the other scene: its camera stands there
 * where the viewer stands against the sphere, and looks where they look. The
 * viewer is still in the room, at the centre of the sphere, held there while
 * they look around; a key that moves takes them back out.
 *
 * The other scene is never rendered by the application: its display renders
 * it, and only while the viewer is in the sphere, or close to it.
 *
 * Keys: W, A, S, D or the arrows to walk; drag to look around.
 * URL: ?webgpu for the WebGPU engine, ?rh for right-handed scenes.
 */
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder.js";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.js";
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

/** Toward the back of the room, away from where the viewer starts. */
const back = rightHanded ? -1 : 1;
/** Height of the eyes of the viewer, and radius of the sphere, in meters. */
const EYES = 1.6;
const RADIUS = 1.3;
/** Seconds the viewer takes to reach the centre of the sphere, and to leave it. */
const PASSAGE = 0.7;
/** The keys that walk: W, A, S, D and the arrows. */
const FORWARD = [87, 38];
const BACKWARD = [83, 40];
const LEFT = [65, 37];
const RIGHT = [68, 39];

async function createEngine(): Promise<AbstractEngine> {
  if (params.has("webgpu")) {
    const { WebGPUEngine } = await import("@babylonjs/core/Engines/webgpuEngine.js");
    const engine = new WebGPUEngine(canvas, { antialias: true });
    await engine.initAsync();
    return engine;
  }
  return new Engine(canvas, true);
}

const colored = (scene: Scene, name: string, color: Color3, emissive = 0): StandardMaterial => {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.emissiveColor = color.scale(emissive);
  material.specularColor = new Color3(0.15, 0.15, 0.15);
  return material;
};

/**
 * The other world: bright, open, with something to see in every direction,
 * so that turning around in the sphere tells where one looks. The anchor is
 * where the centre of the sphere stands in it.
 */
function createWorld(engine: AbstractEngine): { scene: Scene; camera: FreeCamera; anchor: TransformNode } {
  const scene = new Scene(engine);
  scene.useRightHandedSystem = rightHanded;
  scene.clearColor = new Color4(0.52, 0.74, 0.96, 1);
  new HemisphericLight("sun", new Vector3(0.3, 1, 0.2), scene);

  // It lends the display its scene and its layers: the lens draws with a camera of its own.
  const camera = new FreeCamera("world.camera", Vector3.Zero(), scene);
  const anchor = new TransformNode("anchor", scene);
  anchor.position.set(0, EYES, 0);

  const ground = CreateGround("meadow", { width: 120, height: 120 }, scene);
  ground.material = colored(scene, "grass", new Color3(0.36, 0.62, 0.3));

  // A circle of standing stones, each of its own color and height.
  const stones = 14;
  for (let i = 0; i < stones; i++) {
    const angle = (i / stones) * 2 * Math.PI;
    const height = 3 + 2.5 * Math.abs(Math.sin(i * 1.7));
    const stone = CreateBox(`stone${i}`, { width: 1.1, height, depth: 0.7 }, scene);
    stone.position.set(9 * Math.sin(angle), height / 2, 9 * Math.cos(angle));
    stone.rotation.y = angle;
    stone.material = colored(scene, `stone${i}.color`, Color3.FromHSV((i / stones) * 360, 0.55, 0.9));
  }

  // Four signs, to tell which way one looks. They face the centre of the circle.
  ["NORTH", "EAST", "SOUTH", "WEST"].forEach((name, i) => {
    const angle = (i / 4) * 2 * Math.PI;
    const sign = CreatePlane(`sign.${name}`, { width: 2.6, height: 0.8 }, scene);
    sign.position.set(5.5 * Math.sin(angle), 2.9, 5.5 * Math.cos(angle));
    sign.billboardMode = 7;
    const text = new DynamicTexture(`sign.${name}.text`, { width: 416, height: 128 }, scene);
    text.drawText(name, null, null, "bold 88px system-ui, sans-serif", "#10203a", "#ffffff");
    const material = new StandardMaterial(`sign.${name}.material`, scene);
    material.emissiveTexture = text;
    material.disableLighting = true;
    sign.material = material;
  });

  // Something overhead, and something that goes around.
  const knot = CreateTorusKnot("knot", { radius: 1.4, tube: 0.4, radialSegments: 128, tubularSegments: 24 }, scene);
  knot.position.set(0, 8, 0);
  knot.material = colored(scene, "teal", new Color3(0.05, 0.6, 0.6), 0.15);
  const moons = [0, 1, 2].map((i) => {
    const moon = CreateSphere(`moon${i}`, { diameter: 0.9, segments: 16 }, scene);
    moon.material = colored(scene, `moon${i}.color`, Color3.FromHSV(40 + i * 110, 0.7, 1), 0.2);
    return moon;
  });

  // Runs only when the scene is rendered: what moves here proves that the display drives it.
  let time = 0;
  scene.onBeforeRenderObservable.add(() => {
    time += Math.min(engine.getDeltaTime() / 1000, 0.1);
    knot.rotation.y = time * 0.5;
    knot.rotation.x = time * 0.2;
    moons.forEach((moon, i) => {
      const angle = time * 0.4 + (i * 2 * Math.PI) / 3;
      moon.position.set(4 * Math.sin(angle), 2.2 + 0.6 * Math.sin(time + i), 4 * Math.cos(angle));
    });
  });
  return { scene, camera, anchor };
}

async function main(): Promise<void> {
  const engine = await createEngine();
  const status = document.getElementById("status") as HTMLElement;

  // --- The room: what the application renders.
  const room = new Scene(engine);
  room.useRightHandedSystem = rightHanded;
  room.clearColor = new Color4(0.02, 0.025, 0.05, 1);
  const light = new HemisphericLight("light", new Vector3(0, 1, 0), room);
  light.intensity = 0.7;

  const floor = CreateGround("floor", { width: 24, height: 24 }, room);
  floor.material = colored(room, "floor", new Color3(0.1, 0.11, 0.17));
  for (const [i, [x, z]] of ([[-4, 2], [4, 2], [-4, 9], [4, 9], [-6, 5.5], [6, 5.5]] as const).entries()) {
    const pillar = CreateCylinder(`pillar${i}`, { diameter: 0.5, height: 3.4, tessellation: 20 }, room);
    pillar.position.set(x, 1.7, z * back);
    pillar.material = colored(room, `pillar${i}.color`, new Color3(0.5, 0.32, 0.22));
  }

  // The viewer walks on the floor of the room, and looks around by dragging.
  const camera = new FreeCamera("camera", new Vector3(0, EYES, -3 * back), room);
  camera.setTarget(new Vector3(0, EYES, 5.5 * back));
  camera.minZ = 0.05;
  camera.speed = 0.25;
  camera.keysUp = FORWARD;
  camera.keysDown = BACKWARD;
  camera.keysLeft = LEFT;
  camera.keysRight = RIGHT;
  camera.attachControl(canvas, true);
  const pace = camera.speed;

  // --- The sphere. Its node is its centre: what the viewer stands against, as seen by the lens.
  const centre = new Vector3(0, EYES, 5.5 * back);
  const sphere = new TransformNode("sphere", room);
  sphere.position.copyFrom(centre);
  // Its shell is a plain object of the room, drawn from outside only.
  const shell = CreateSphere("sphere.shell", { diameter: 2 * RADIUS, segments: 48 }, room);
  shell.parent = sphere;
  const lacquer = colored(room, "lacquer", new Color3(0.06, 0.09, 0.16), 0.25);
  lacquer.specularColor = new Color3(0.9, 0.95, 1);
  lacquer.specularPower = 96;
  shell.material = lacquer;
  // It rests on a ring of light.
  const base = CreateTorus("sphere.base", { diameter: 1.5, thickness: 0.06, tessellation: 48 }, room);
  base.position.set(centre.x, 0.03, centre.z);
  const glow = new StandardMaterial("sphere.base.light", room);
  glow.disableLighting = true;
  glow.emissiveColor = new Color3(0.35, 0.75, 1);
  base.material = glow;

  // --- The other world, seen from inside the sphere only. The application never renders it.
  const world = createWorld(engine);
  const display = new CameraDisplay({ camera: world.camera, drive: "display", samples: 4, name: "world.display" });
  // A lens onto the other scene: its camera stands at the anchor as the viewer stands against the sphere.
  display.setLens({ scene: room, root: sphere }, world.anchor);
  // The inside of the sphere: a mesh whose front faces look inward. From outside it is not drawn at all.
  const inside = CreateSphere("sphere.inside", { diameter: 2 * RADIUS - 0.04, segments: 48, sideOrientation: Mesh.BACKSIDE }, room);
  inside.parent = sphere;
  attachDisplay(inside, display);

  // --- In and out. The viewer is outside, on their way in, inside, or on their way out.
  let state: "outside" | "entering" | "inside" | "leaving" = "outside";
  let progress = 0;
  const from = new Vector3();
  const to = new Vector3();
  /** Where the viewer came in from: they go back out the same way. */
  const door = new Vector3();
  const ease = (t: number): number => t * t * (3 - 2 * t);
  const pass = (next: "entering" | "leaving", target: Vector3): void => {
    state = next;
    progress = 0;
    from.copyFrom(camera.position);
    to.copyFrom(target);
    // The keys do not walk while the viewer is carried.
    camera.speed = 0;
  };

  room.onBeforeRenderObservable.add(() => {
    const seconds = Math.min(engine.getDeltaTime() / 1000, 0.1);
    const distance = Vector3.Distance(camera.position, centre);
    if (state === "outside") {
      // The viewer walks at the height of their eyes, whatever they look at.
      camera.position.y = EYES;
      // The other world is drawn while the viewer is close enough to step in: its first image is then ready.
      display.paused = distance > RADIUS + 2.5;
      if (distance < RADIUS) {
        door.copyFrom(camera.position).subtractInPlace(centre);
        door.y = 0;
        if (door.lengthSquared() < 1e-6) door.set(0, 0, -back);
        // Far enough back for the sphere to show whole again.
        door.normalize().scaleInPlace(RADIUS + 2.2).addInPlace(centre);
        pass("entering", centre);
      }
    } else if (state === "inside") {
      camera.position.copyFrom(centre);
    } else {
      progress = Math.min(1, progress + seconds / PASSAGE);
      Vector3.LerpToRef(from, to, ease(progress), camera.position);
      if (progress === 1) {
        if (state === "entering") state = "inside";
        else {
          state = "outside";
          camera.speed = pace;
        }
      }
    }
    status.textContent =
      state === "inside"
        ? "You stand in the other world: drag to look around. A key that moves takes you back to the room."
        : state === "outside"
          ? "Walk into the sphere: W, A, S, D or the arrows, and drag to look around."
          : "";
  });

  // A key that moves takes the viewer out of the sphere, by where they came in.
  const moves = new Set([...FORWARD, ...BACKWARD, ...LEFT, ...RIGHT]);
  window.addEventListener("keydown", (event) => {
    if (state === "inside" && moves.has(event.keyCode)) pass("leaving", door);
  });

  // Only the room is rendered here.
  engine.runRenderLoop(() => room.render());
  window.addEventListener("resize", () => engine.resize());

  // For the checks made from the console of the browser.
  Object.assign(window, { engine, room, world, camera, sphere, shell, inside, display, centre, Vector3, state: () => state });
}

void main();
