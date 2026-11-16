import { describe, expect, it } from "vitest";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
// What lets a mesh make instances of itself.
import "@babylonjs/core/Meshes/instancedMesh.js";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.js";
import { Scene } from "@babylonjs/core/scene.js";
import { CameraDisplay, DisplayMaterial, TextureDisplay, attachDisplay, type DisplayChangeKind } from "@spacexr/spatial-display-babylon";
import { Display } from "@spacexr/spatial-display-core";

const makeEngine = (): NullEngine => new NullEngine({ renderWidth: 1280, renderHeight: 720, textureSize: 512, deterministicLockstep: false, lockstepMaxSteps: 1 });

/** A scene with a camera at the origin looking down +z, and a box in front of it. */
const makeScene = (engine: NullEngine, name: string) => {
  const scene = new Scene(engine);
  const camera = new FreeCamera(`${name}.camera`, Vector3.Zero(), scene);
  camera.setTarget(new Vector3(0, 0, 1));
  const box = CreateBox(`${name}.box`, { size: 1 }, scene);
  box.position.z = 5;
  return { scene, camera, box };
};

/** One frame of an application that renders `scenes` in its loop. */
const frame = (engine: NullEngine, ...scenes: Scene[]): void => {
  engine.beginFrame();
  for (const scene of scenes) scene.render();
  engine.endFrame();
};

/** Counts the draws of the image of a display. */
const countDraws = (display: CameraDisplay): { readonly count: number } => {
  const counter = { count: 0 };
  display.texture.onAfterRenderObservable.add(() => counter.count++);
  return counter;
};

describe("CameraDisplay", () => {
  it("draws its camera into a render target of the scene of that camera", () => {
    const engine = makeEngine();
    const host = makeScene(engine, "host");
    const world = makeScene(engine, "world");
    const display = new CameraDisplay({ camera: world.camera, resolution: { width: 640, height: 360 } });

    expect(display.scene).toBe(world.scene);
    expect(display.resolution).toEqual({ width: 640, height: 360 });
    expect(display.texture.getSize()).toEqual({ width: 640, height: 360 });
    expect(display.texture.activeCamera).toBe(world.camera);
    expect(world.scene.customRenderTargets).toEqual([display.texture]);
    expect(host.scene.customRenderTargets).toEqual([]);

    const draws = countDraws(display);
    frame(engine, world.scene, host.scene);
    frame(engine, world.scene, host.scene);
    expect(draws.count).toBe(2);
  });

  it("shows on a mesh of another scene, and keeps its surfaces out of its own image", () => {
    const engine = makeEngine();
    const host = makeScene(engine, "host");
    const display = new CameraDisplay({ camera: host.camera, include: (mesh) => mesh.name !== "hidden" });
    const hidden = CreateBox("hidden", { size: 1 }, host.scene);
    const wall = CreatePlane("wall", { size: 2 }, host.scene);
    const former = new StandardMaterial("former", host.scene);
    wall.material = former;

    const surface = attachDisplay(wall, display, { opacity: 0.5 });
    expect(wall.material).toBeInstanceOf(DisplayMaterial);
    expect(surface.material.opacity).toBe(0.5);
    expect(surface.material.needAlphaBlending()).toBe(true);

    const predicate = display.texture.renderListPredicate;
    expect(predicate(host.box)).toBe(true);
    expect(predicate(wall)).toBe(false);
    expect(predicate(hidden)).toBe(false);

    surface.dispose();
    expect(wall.material).toBe(former);
    expect(predicate(wall)).toBe(true);
  });

  it("renders a scene the application does not render, without touching its camera", () => {
    const engine = makeEngine();
    const host = makeScene(engine, "host");
    const world = makeScene(engine, "world");
    const display = new CameraDisplay({ camera: world.camera, drive: "display" });
    const draws = countDraws(display);
    // The camera the application sees on the scene, whenever its own code runs.
    const seen = new Set<unknown>();
    world.scene.onBeforeRenderObservable.add(() => seen.add(world.scene.activeCamera));
    world.scene.onAfterRenderObservable.add(() => seen.add(world.scene.activeCamera));

    const before = world.scene.getFrameId();
    for (let i = 0; i < 3; i++) frame(engine, host.scene);
    expect(world.scene.getFrameId()).toBe(before + 3);
    expect(draws.count).toBe(3);
    expect(world.scene.activeCamera).toBe(world.camera);
    expect(seen.size).toBe(1);

    // Left to the application, the same scene is not rendered at all.
    const idle = makeScene(engine, "idle");
    const waiting = new CameraDisplay({ camera: idle.camera });
    const idleDraws = countDraws(waiting);
    frame(engine, host.scene);
    expect(idleDraws.count).toBe(0);
  });

  it("draws on demand when its refresh is manual", () => {
    const engine = makeEngine();
    const world = makeScene(engine, "world");
    const display = new CameraDisplay({ camera: world.camera, refresh: "manual" });
    const draws = countDraws(display);
    for (let i = 0; i < 4; i++) frame(engine, world.scene);
    expect(draws.count).toBe(1);
    display.invalidate();
    for (let i = 0; i < 4; i++) frame(engine, world.scene);
    expect(draws.count).toBe(2);
  });

  it("stops drawing while paused, and while none of its surfaces is on screen", () => {
    const engine = makeEngine();
    const host = makeScene(engine, "host");
    const world = makeScene(engine, "world");
    const display = new CameraDisplay({ camera: world.camera, drive: "display" });
    const draws = countDraws(display);
    const wall = CreatePlane("wall", { size: 2 }, host.scene);
    wall.position.z = 4;
    attachDisplay(wall, display);

    for (let i = 0; i < 5; i++) frame(engine, host.scene);
    expect(draws.count).toBe(5);

    // Behind the camera of the host: the surface is not drawn any more.
    wall.position.z = -4;
    for (let i = 0; i < 10; i++) frame(engine, host.scene);
    const hidden = draws.count;
    expect(hidden).toBeLessThan(5 + 5);
    for (let i = 0; i < 5; i++) frame(engine, host.scene);
    expect(draws.count).toBe(hidden);

    // Back in view: one frame shows the last image, then drawing resumes.
    wall.position.z = 4;
    for (let i = 0; i < 5; i++) frame(engine, host.scene);
    expect(draws.count).toBeGreaterThanOrEqual(hidden + 3);

    display.paused = true;
    frame(engine, host.scene);
    const paused = draws.count;
    for (let i = 0; i < 5; i++) frame(engine, host.scene);
    expect(draws.count).toBeLessThanOrEqual(paused + 1);
  });

  it("notifies a change of resolution and keeps its texture", () => {
    const engine = makeEngine();
    const world = makeScene(engine, "world");
    const display = new CameraDisplay({ camera: world.camera });
    const changes: DisplayChangeKind[] = [];
    display.onChangedObservable.add((change) => changes.push(change.kind));
    const texture = display.texture;

    display.resize(800.4, 600);
    display.resize(800, 600);
    expect(changes).toEqual(["resolution"]);
    expect(display.texture).toBe(texture);
    expect(display.resolution).toEqual({ width: 800, height: 600 });
    expect(texture.getSize()).toEqual({ width: 800, height: 600 });
  });

  it("follows its camera to another scene with a new texture", () => {
    const engine = makeEngine();
    const host = makeScene(engine, "host");
    const a = makeScene(engine, "a");
    const b = makeScene(engine, "b");
    const display = new CameraDisplay({ camera: a.camera, drive: "display" });
    const wall = CreatePlane("wall", { size: 2 }, host.scene);
    wall.position.z = 4;
    const surface = attachDisplay(wall, display);
    const changes: DisplayChangeKind[] = [];
    display.onChangedObservable.add((change) => changes.push(change.kind));
    const first = display.texture;

    // Another camera of the same scene keeps the texture.
    const second = new FreeCamera("a.second", new Vector3(1, 0, 0), a.scene);
    display.camera = second;
    expect(display.texture).toBe(first);
    expect(first.activeCamera).toBe(second);
    expect(changes).toEqual([]);

    display.camera = b.camera;
    expect(changes).toEqual(["texture"]);
    expect(display.texture).not.toBe(first);
    expect(a.scene.customRenderTargets).toEqual([]);
    expect(b.scene.customRenderTargets).toEqual([display.texture]);
    expect(surface.material.getActiveTextures()).toContain(display.texture);

    const framesOfA = a.scene.getFrameId();
    const framesOfB = b.scene.getFrameId();
    frame(engine, host.scene);
    expect(a.scene.getFrameId()).toBe(framesOfA);
    expect(b.scene.getFrameId()).toBe(framesOfB + 1);
  });

  it("refuses a mesh or a camera of another engine", () => {
    const world = makeScene(makeEngine(), "world");
    const elsewhere = makeScene(makeEngine(), "elsewhere");
    const display = new CameraDisplay({ camera: world.camera });
    const wall = CreatePlane("wall", { size: 2 }, elsewhere.scene);
    expect(() => attachDisplay(wall, display)).toThrow(/own engine/);
    expect(() => {
      display.camera = elsewhere.camera;
    }).toThrow(/another engine/);
  });

  it("releases its texture and its surfaces when disposed, or when its scene is", () => {
    const engine = makeEngine();
    const host = makeScene(engine, "host");
    const world = makeScene(engine, "world");
    const display = new CameraDisplay({ camera: world.camera, drive: "display" });
    const wall = CreatePlane("wall", { size: 2 }, host.scene);
    attachDisplay(wall, display);
    const changes: DisplayChangeKind[] = [];
    display.onChangedObservable.add((change) => changes.push(change.kind));
    frame(engine, host.scene);
    const cameras = world.scene.cameras.length;
    expect(cameras).toBe(2);

    display.dispose();
    expect(changes).toEqual(["disposed"]);
    expect(world.scene.customRenderTargets).toEqual([]);
    expect(wall.material).toBeNull();
    // The camera the display rendered the scene with is gone too.
    expect(world.scene.cameras).toEqual([world.camera]);
    const frames = world.scene.getFrameId();
    frame(engine, host.scene);
    expect(world.scene.getFrameId()).toBe(frames);

    const other = makeScene(engine, "other");
    const bound = new CameraDisplay({ camera: other.camera });
    const kinds: DisplayChangeKind[] = [];
    bound.onChangedObservable.add((change) => kinds.push(change.kind));
    other.scene.dispose();
    expect(kinds).toEqual(["disposed"]);
  });
});

describe("transparency of displays", () => {
  it("stores the background of a camera display multiplied by its alpha, and tells when it turns see-through", () => {
    const engine = makeEngine();
    const world = makeScene(engine, "world");
    const display = new CameraDisplay({ camera: world.camera, clearColor: { r: 1, g: 0.5, b: 0.2, a: 0.5 } });
    expect(display).toBeInstanceOf(Display);
    expect(display.premultipliedAlpha).toBe(true);
    expect(display.texture.clearColor.asArray()).toEqual([0.5, 0.25, 0.1, 0.5]);
    expect(display.texture.hasAlpha).toBe(true);

    const changes: DisplayChangeKind[] = [];
    display.onChangedObservable.add((change) => changes.push(change.kind));
    display.clearColor = { r: 0, g: 0, b: 0, a: 0 };
    expect(changes).toEqual([]);
    // Back to the clear color of the scene, which is opaque.
    display.clearColor = null;
    expect(display.texture.clearColor).toBeUndefined();
    expect(display.texture.hasAlpha).toBe(false);
    expect(changes).toEqual(["alpha"]);
  });

  it("makes a display of a texture the application has", () => {
    const engine = makeEngine();
    const host = makeScene(engine, "host");
    const picture = RawTexture.CreateRGBATexture(new Uint8Array(8 * 4 * 4), 8, 4, host.scene);
    const display = new TextureDisplay(picture);
    expect(display.texture).toBe(picture);
    expect(display.resolution).toEqual({ width: 8, height: 4 });
    // The colors of a picture are not multiplied by its alpha.
    expect(display.premultipliedAlpha).toBe(false);

    // Any kind of mesh, as a scene hands them out.
    const wall: AbstractMesh = CreatePlane("wall", { size: 2 }, host.scene);
    const surface = attachDisplay(wall, display);
    expect(surface.material.premultipliedImage).toBe(false);
    expect(surface.material.useImageAlpha).toBe(false);
    surface.dispose();

    // A picture with transparent parts says so, as for any material of Babylon.js.
    picture.hasAlpha = true;
    const seeThrough = attachDisplay(wall, display);
    expect(seeThrough.material.useImageAlpha).toBe(true);
    expect(seeThrough.material.needAlphaBlending()).toBe(true);

    const kinds: DisplayChangeKind[] = [];
    display.onChangedObservable.add((change) => kinds.push(change.kind));
    display.dispose();
    expect(kinds).toEqual(["disposed"]);
    // The texture belongs to the application.
    expect(host.scene.textures).toContain(picture);
    expect(wall.material).toBeNull();
  });

  it("refuses to show on an instance, which has no material of its own", () => {
    const engine = makeEngine();
    const host = makeScene(engine, "host");
    const display = new CameraDisplay({ camera: host.camera });
    const wall = CreatePlane("wall", { size: 2 }, host.scene);
    expect(() => attachDisplay(wall.createInstance("copy"), display)).toThrow(/instance/);
  });

  it("keys a color with a hue by its share in each pixel, and a gray one by distance", () => {
    const engine = makeEngine();
    const host = makeScene(engine, "host");
    const display = new CameraDisplay({ camera: host.camera });
    const wall = CreatePlane("wall", { size: 2 }, host.scene);
    const surface = attachDisplay(wall, display, { chromaKey: { color: { r: 0, g: 1, b: 0 } } });
    expect(surface.material.needAlphaBlending()).toBe(true);
    expect(surface.chromaKey).toEqual({ color: { r: 0, g: 1, b: 0 } });
    surface.chromaKey = { color: { r: 0, g: 0, b: 0 }, threshold: 0.2 };
    expect(surface.material.chromaKey?.threshold).toBe(0.2);
    surface.chromaKey = null;
    expect(surface.material.needAlphaBlending()).toBe(false);
  });
});
