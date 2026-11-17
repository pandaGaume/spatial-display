/**
 * Two scenes on one engine.
 *
 * "room" is the scene the application renders. "world" is never rendered by
 * the application: it exists only to be seen through the portal, whose display
 * renders it (drive: "display").
 *
 * The room also holds a second display, of a camera of the room itself, shown
 * on a sphere and on a slab: any mesh with texture coordinates is a surface.
 * A third portal shows it on a bent screen, a share of the wall of a cylinder.
 *
 * The portals are built step by step: a surface, then a frame, a light and a
 * glow, each of which the controls put on and take off.
 *
 * The portal can also show the world with a see-through background, a picture
 * with transparent parts, and a picture on a green screen: the colored bars
 * that stand behind it tell what it lets through.
 *
 * With ?window the portal is a window instead of a screen: its image follows
 * the eye of the viewer, as if the opening gave onto the world, and the glow
 * of its frame carries on behind the opening.
 *
 * With ?stereo the viewer has two eyes, drawn side by side: a window then
 * draws an image for each, and what stands behind the opening has depth.
 * ?stereo=0.3 sets the distance between the eyes.
 *
 * URL: ?webgpu for the WebGPU engine, ?rh for right-handed scenes, ?window for the window mode, ?stereo for a
 * viewer with two eyes, ?xr for a button that enters the room in a headset.
 */
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { StereoscopicArcRotateCamera } from "@babylonjs/core/Cameras/Stereoscopic/stereoscopicArcRotateCamera.js";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder.js";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.js";
import { CreateTorusKnot } from "@babylonjs/core/Meshes/Builders/torusKnotBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.js";
import { CameraDisplay, CylinderSurfaceBuilder, PortalBuilder, RectSurfaceBuilder, TextureDisplay, attachDisplay, type ITextureDisplay } from "@spacexr/spatial-display-babylon";
import type { DisplayFit, DisplayRefresh } from "@spacexr/spatial-display-core";
import { offerHeadset } from "../xr.js";

const params = new URLSearchParams(location.search);
const rightHanded = params.has("rh");
const windowMode = params.has("window");
/** Distance between the two eyes of the viewer; null for a viewer with one eye. */
const eyesApart = params.has("stereo") ? Number(params.get("stereo")) || 0.064 : null;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;

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

/** The scene behind the portal: bright, moving, and with a sign that tells a mirrored or upside-down image. */
function createWorld(engine: AbstractEngine): { scene: Scene; camera: ArcRotateCamera } {
  const scene = new Scene(engine);
  scene.useRightHandedSystem = rightHanded;
  scene.clearColor = new Color4(0.98, 0.62, 0.32, 1);
  new HemisphericLight("sun", new Vector3(0.3, 1, 0.2), scene);

  const camera = new ArcRotateCamera("world.camera", Math.PI / 2, 1.25, 9, new Vector3(0, 1.2, 0), scene);

  const ground = CreateGround("ground", { width: 30, height: 30 }, scene);
  ground.material = colored(scene, "sand", new Color3(0.86, 0.72, 0.5));

  const knot = CreateTorusKnot("knot", { radius: 0.9, tube: 0.28, radialSegments: 96, tubularSegments: 24 }, scene);
  knot.position.y = 1.6;
  knot.material = colored(scene, "teal", new Color3(0.05, 0.6, 0.6), 0.15);

  const shapes: Mesh[] = [];
  const palette = [new Color3(0.85, 0.15, 0.25), new Color3(0.95, 0.85, 0.2), new Color3(0.3, 0.35, 0.9), new Color3(0.4, 0.8, 0.3)];
  palette.forEach((color, i) => {
    const box = CreateBox(`box${i}`, { size: 0.7 }, scene);
    const angle = (i / palette.length) * Math.PI * 2;
    box.position.set(Math.cos(angle) * 3, 0.35, Math.sin(angle) * 3);
    box.material = colored(scene, `color${i}`, color);
    shapes.push(box);
  });

  // Reads "WORLD" from the camera when the image is the right way round.
  const sign = CreatePlane("sign", { width: 3.2, height: 0.8 }, scene);
  sign.position.set(0, 3.4, 0);
  sign.billboardMode = 7;
  const text = new DynamicTexture("sign.text", { width: 512, height: 128 }, scene);
  text.drawText("WORLD →", null, null, "bold 92px system-ui, sans-serif", "#10203a", "#ffffff");
  const signMaterial = new StandardMaterial("sign.material", scene);
  signMaterial.emissiveTexture = text;
  signMaterial.disableLighting = true;
  sign.material = signMaterial;

  // What a see-through background has to carry: a translucent body, and the light of a neon, which has no alpha.
  const bubble = CreateSphere("bubble", { diameter: 1.6, segments: 32 }, scene);
  bubble.position.set(-2.4, 1.6, 0);
  const glass = colored(scene, "glass", new Color3(0.2, 0.5, 1));
  glass.alpha = 0.5;
  bubble.material = glass;
  // A portal with nothing to show: a frame of light around an empty square.
  const ring = new PortalBuilder("ring", scene).withSurface(new RectSurfaceBuilder({ width: 1.3, height: 1.3 })).withFrame(true, 0.05).withLight().withGlow({ size: 0.3 }).build();
  ring.root.position.set(2.6, 1.7, 0);
  ring.root.billboardMode = 7;

  // Runs only when the scene is rendered: what moves here proves that the display drives it.
  scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime() / 1000;
    knot.rotation.y += dt * 0.9;
    knot.rotation.x += dt * 0.35;
    camera.alpha += dt * 0.15;
    for (const shape of shapes) shape.rotation.y -= dt;
  });
  return { scene, camera };
}

async function main(): Promise<void> {
  const engine = await createEngine();
  const status = document.getElementById("status") as HTMLElement;

  // --- The room: what the application renders.
  const room = new Scene(engine);
  room.useRightHandedSystem = rightHanded;
  room.clearColor = new Color4(0.02, 0.025, 0.05, 1);
  const light = new HemisphericLight("light", new Vector3(0, 1, 0), room);
  light.intensity = 0.55;

  const alpha = rightHanded ? Math.PI / 2 - 0.5 : -Math.PI / 2 - 0.5;
  const target = new Vector3(0.2, 1.15, 0);
  // With two eyes the room is drawn twice, side by side, and a window draws an image of the world for each eye.
  const camera = eyesApart === null ? new ArcRotateCamera("camera", alpha, 1.35, 5.2, target, room) : new StereoscopicArcRotateCamera("camera", alpha, 1.35, 5.2, target, eyesApart, true, room);
  camera.wheelPrecision = 60;
  camera.minZ = 0.05;
  camera.attachControl(canvas, true);

  const floor = CreateGround("floor", { width: 12, height: 12 }, room);
  floor.material = colored(room, "floor", new Color3(0.09, 0.1, 0.16));

  const pillar = CreateBox("pillar", { width: 0.35, height: 1.1, depth: 0.35 }, room);
  pillar.position.set(-1.9, 0.55, 0.9);
  pillar.material = colored(room, "pillar", new Color3(0.7, 0.3, 0.2));

  // Flat colored bars behind the portal: what shows of them tells what the portal lets through.
  const bars = [new Color3(1, 1, 1), new Color3(1, 0.5, 0), new Color3(0.5, 0, 0.8), new Color3(0.15, 0.15, 0.15)];
  bars.forEach((color, i) => {
    const bar = CreateBox(`bar${i}`, { width: 0.8, height: 2.4, depth: 0.05 }, room);
    bar.position.set((i - 1.5) * 0.8, 1.25, rightHanded ? -0.9 : 0.9);
    const flat = new StandardMaterial(`bar${i}.material`, room);
    flat.disableLighting = true;
    flat.emissiveColor = color;
    bar.material = flat;
  });

  // --- The world, seen through the portal only.
  const world = createWorld(engine);
  const worldDisplay = new CameraDisplay({ camera: world.camera, drive: "display", resolution: { width: 1280, height: 720 }, samples: 4, name: "world.display" });

  // As a window, the opening stands in the world where this node is: at the height of the portal, so that the
  // ground of the world carries on from the floor of the room, and back from the middle of the world, which
  // lies behind it.
  const anchor = new TransformNode("anchor", world.scene);
  anchor.position.set(0, 1.25, rightHanded ? 6 : -6);
  // The surface carries its display; the frame, its light and its glow are asked for one by one.
  const portal = new PortalBuilder("gate", room)
    .withSurface(new RectSurfaceBuilder({ width: 1.6, height: 0.9, display: worldDisplay, opacity: windowMode ? 1 : 0.9, ...(windowMode ? { window: { anchor } } : {}) }))
    .withFrame()
    .withLight()
    .withGlow()
    .build();
  portal.root.position.set(0, 1.25, 0);

  // --- The same display on an ordinary mesh, framed in its own way.
  const slab = CreateBox("slab", { width: 0.9, height: 0.9, depth: 0.06 }, room);
  slab.position.set(-1.9, 1.6, 0.9);
  slab.rotation.y = rightHanded ? -0.5 : 0.5;
  attachDisplay(slab, worldDisplay, { fit: "cover" });

  // --- A camera of the room itself, shown on a sphere: the display and its surface share a scene.
  const watcher = new FreeCamera("watcher", new Vector3(2.6, 2.4, rightHanded ? 3 : -3), room);
  watcher.setTarget(new Vector3(0, 1.1, 0));
  const roomDisplay = new CameraDisplay({ camera: watcher, resolution: { width: 512, height: 512 }, name: "room.display" });
  const sphere = CreateSphere("sphere", { diameter: 0.9, segments: 32 }, room);
  sphere.position.set(1.9, 0.75, 0.6);
  attachDisplay(sphere, roomDisplay);

  // --- The same display on a bent screen: a share of the wall of a cylinder, which bends around who faces it.
  // Its node is the axis of the cylinder: the wall stands behind it.
  const curve = new PortalBuilder("curve", room)
    .withSurface(new CylinderSurfaceBuilder({ diameter: 3.2, height: 0.8, arc: 0.18, facing: "inside", display: roomDisplay, fit: "cover" }))
    .withFrame()
    .withLight(true, new Color3(1, 0.9, 0.7))
    .withGlow({ color: new Color3(1, 0.45, 0.1), size: 0.12 })
    .build();
  curve.root.position.set(2.4, 1.35, rightHanded ? 1.2 : -1.2);
  curve.root.rotation.y = rightHanded ? -0.5 : 0.5;

  // --- Pictures: one with transparent parts, the same one on a green screen.
  const picture = new Texture("alpha-test.png", room);
  picture.hasAlpha = true;
  const pictureDisplay = new TextureDisplay(picture);
  const greenDisplay = new TextureDisplay(new Texture("green-test.png", room));
  const sources: Record<string, () => ITextureDisplay | null> = {
    world: () => {
      worldDisplay.clearColor = null;
      return worldDisplay;
    },
    "world-clear": () => {
      worldDisplay.clearColor = { r: 0, g: 0, b: 0, a: 0 };
      return worldDisplay;
    },
    picture: () => pictureDisplay,
    green: () => greenDisplay,
    none: () => null,
  };
  const show = (name: string): void => {
    portal.chromaKey = name === "green" ? { color: { r: 0, g: 1, b: 0 } } : null;
    portal.display = sources[name]?.() ?? null;
  };

  // --- Controls.
  const input = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;
  const number = (id: string): number => Number(input(id).value);
  input("mode").value = windowMode ? "window" : "screen";
  input("mode").addEventListener("change", () => {
    if (input("mode").value === "window") params.set("window", "");
    else params.delete("window");
    location.search = params.toString();
  });
  input("opacity").value = String(portal.opacity);
  input("opacity").addEventListener("input", () => (portal.opacity = number("opacity")));
  input("worldDepth").addEventListener("input", () => (portal.worldGlowDepth = number("worldDepth")));
  input("worldIntensity").addEventListener("input", () => (portal.worldGlowIntensity = number("worldIntensity")));
  const resize = (): void => portal.setDimension(number("width"), number("height"));
  input("width").addEventListener("input", resize);
  input("height").addEventListener("input", resize);
  input("section").addEventListener("input", () => (portal.frameSection = number("section")));
  // What the portal wears, put on and taken off: the bent screen follows.
  const dress = (): void => {
    for (const each of [portal, curve]) {
      each.framed = input("frame").checked;
      each.lit = input("light").checked;
      each.glowing = input("glow").checked;
    }
  };
  for (const id of ["frame", "light", "glow"]) input(id).addEventListener("change", dress);
  input("glowSize").addEventListener("input", () => (portal.glowSize = number("glowSize")));
  input("glowIntensity").addEventListener("input", () => (portal.glowIntensity = number("glowIntensity")));
  input("glowColor").addEventListener("input", () => (portal.glowColor = Color3.FromHexString(input("glowColor").value)));
  input("lineColor").addEventListener("input", () => (portal.lineColor = Color3.FromHexString(input("lineColor").value)));
  input("fit").addEventListener("change", () => (portal.fit = input("fit").value as DisplayFit));
  input("source").addEventListener("change", () => show(input("source").value));
  input("refresh").addEventListener("change", () => {
    const value = input("refresh").value;
    const refresh: DisplayRefresh = value === "frame" || value === "manual" ? value : { hz: Number(value) };
    worldDisplay.refresh = refresh;
  });
  canvas.addEventListener("dblclick", () => worldDisplay.invalidate());

  let time = 0;
  let draws = 0;
  worldDisplay.texture.onAfterRenderObservable.add(() => draws++);
  room.onBeforeRenderObservable.add(() => {
    time += engine.getDeltaTime() / 1000;
    if (input("breathe").checked) portal.setDimension(1.6 + 0.6 * Math.sin(time * 1.3), 0.9 + 0.35 * Math.sin(time * 0.9 + 1));
  });
  setInterval(() => {
    status.textContent = `${engine.isWebGPU ? "WebGPU" : "WebGL"}, ${rightHanded ? "right" : "left"}-handed, ${windowMode ? "window" : "screen"}, ${engine.getFps().toFixed(0)} fps, world drawn ${draws} times`;
  }, 500);

  // With ?xr, the room can be entered in a headset: its viewer then has two eyes.
  const xr = await offerHeadset(room, floor);

  // Only the room is rendered here.
  engine.runRenderLoop(() => room.render());
  window.addEventListener("resize", () => engine.resize());

  // For the checks made from the console of the browser.
  Object.assign(window, { engine, room, world, portal, curve, anchor, worldDisplay, roomDisplay, pictureDisplay, greenDisplay, show, xr, Vector3 });
}

void main();
