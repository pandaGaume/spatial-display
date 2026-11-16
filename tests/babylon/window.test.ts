import { describe, expect, it } from "vitest";
import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.js";
import { CameraDisplay, Portal, TextureDisplay, WINDOW_LAYER_MASK } from "@spacexr/spatial-display-babylon";

const makeEngine = (): NullEngine => new NullEngine({ renderWidth: 1280, renderHeight: 720, textureSize: 512, deterministicLockstep: false, lockstepMaxSteps: 1 });

/** The scene the opening stands in: its camera is in front of an opening of 2 by 1 at the origin, off its axis. */
const makeHost = (engine: NullEngine, rightHanded = false) => {
  const scene = new Scene(engine);
  scene.useRightHandedSystem = rightHanded;
  const camera = new FreeCamera("host.camera", new Vector3(0.5, 0.2, rightHanded ? 3 : -3), scene);
  camera.setTarget(Vector3.Zero());
  const root = new TransformNode("opening", scene);
  return { scene, camera, window: { root, width: 2, height: 1 } };
};

/** The scene behind the opening. */
const makeWorld = (engine: NullEngine, rightHanded = false) => {
  const scene = new Scene(engine);
  scene.useRightHandedSystem = rightHanded;
  const camera = new FreeCamera("world.camera", Vector3.Zero(), scene);
  return { scene, camera };
};

/** One frame of an application that renders `scene` only. */
const frame = (engine: NullEngine, scene: Scene): void => {
  engine.beginFrame();
  scene.render();
  engine.endFrame();
};

/** Where a point of the world lands in the image of a camera, from -1 to 1 on each axis. */
const inImage = (camera: Camera, x: number, y: number, z: number): number[] => {
  const p = Vector3.TransformCoordinates(new Vector3(x, y, z), camera.getViewMatrix(true).multiply(camera.getProjectionMatrix()));
  return [p.x, p.y];
};

describe("window mode", () => {
  it("draws with a camera of its own, where the viewer stands as seen from the opening", () => {
    const engine = makeEngine();
    const host = makeHost(engine);
    const world = makeWorld(engine);
    const anchor = new TransformNode("anchor", world.scene);
    anchor.position.set(10, 0, 0);
    const display = new CameraDisplay({ camera: world.camera, drive: "display" });
    let draws = 0;
    display.texture.onAfterRenderObservable.add(() => draws++);

    display.setWindow(host.window, anchor);
    const eye = display.windowCamera as Camera;
    expect(display.window).toBe(host.window);
    expect(eye.getScene()).toBe(world.scene);
    expect(display.texture.activeCamera).toBe(eye);

    const frames = world.scene.getFrameId();
    frame(engine, host.scene);
    frame(engine, host.scene);
    // The scene behind the opening is rendered once per frame of the scene the opening stands in.
    expect(world.scene.getFrameId()).toBe(frames + 2);
    expect(draws).toBe(2);
    expect(eye.position.asArray()).toEqual([expect.closeTo(10.5), expect.closeTo(0.2), expect.closeTo(-3)]);
    // The camera the display was given is left alone, and stays the camera of its scene.
    expect(world.camera.position.asArray()).toEqual([0, 0, 0]);
    expect(world.scene.activeCamera).toBe(world.camera);
    // The near plane of the window is the plane of the opening, and only its camera sees the layer of windows.
    expect(eye.minZ).toBeCloseTo(3, 1);
    expect(eye.minZ).toBeLessThan(3);
    expect(eye.layerMask & WINDOW_LAYER_MASK).not.toBe(0);
    expect(world.camera.layerMask & WINDOW_LAYER_MASK).toBe(0);

    // Its frustum passes through the edges of the opening: their corners are the corners of the image.
    expect(inImage(eye, 9, -0.5, 0)).toEqual([expect.closeTo(-1), expect.closeTo(-1)]);
    expect(inImage(eye, 11, 0.5, 0)).toEqual([expect.closeTo(1), expect.closeTo(1)]);

    // The viewer moves: so does the camera, at the next frame, and the corners stay where they are.
    host.camera.position.set(-1, 0, -2);
    frame(engine, host.scene);
    expect(eye.position.asArray()).toEqual([expect.closeTo(9), expect.closeTo(0), expect.closeTo(-2)]);
    expect(inImage(eye, 9, -0.5, 0)).toEqual([expect.closeTo(-1), expect.closeTo(-1)]);
    expect(inImage(eye, 11, 0.5, 0)).toEqual([expect.closeTo(1), expect.closeTo(1)]);

    // Back to a screen.
    display.setWindow(null);
    expect(display.window).toBeNull();
    expect(display.windowCamera).toBeNull();
    expect(display.texture.activeCamera).toBe(world.camera);
    expect(world.scene.cameras).not.toContain(eye);
  });

  it("stands behind the opening in right-handed scenes too, and follows the scale of its anchor", () => {
    const engine = makeEngine();
    const host = makeHost(engine, true);
    const world = makeWorld(engine, true);
    const anchor = new TransformNode("anchor", world.scene);
    anchor.scaling.setAll(2);
    const display = new CameraDisplay({ camera: world.camera, drive: "display" });
    display.setWindow(host.window, anchor);
    frame(engine, host.scene);
    const eye = display.windowCamera as Camera;
    // In front of the opening is toward +z there; the anchor shows the world twice as large as the opening.
    expect(eye.position.asArray()).toEqual([expect.closeTo(1), expect.closeTo(0.4), expect.closeTo(6)]);
    expect(inImage(eye, -2, -1, 0)).toEqual([expect.closeTo(-1), expect.closeTo(-1)]);
    expect(inImage(eye, 2, 1, 0)).toEqual([expect.closeTo(1), expect.closeTo(1)]);
  });

  it("keeps its last image when the viewer goes behind the opening", () => {
    const engine = makeEngine();
    const host = makeHost(engine);
    const world = makeWorld(engine);
    const display = new CameraDisplay({ camera: world.camera, drive: "display" });
    display.setWindow(host.window);
    frame(engine, host.scene);
    const eye = display.windowCamera as Camera;
    const before = eye.position.asArray();
    host.camera.position.set(0, 0, 4);
    frame(engine, host.scene);
    expect(eye.position.asArray()).toEqual(before);
  });

  it("refuses an anchor of another scene", () => {
    const engine = makeEngine();
    const host = makeHost(engine);
    const world = makeWorld(engine);
    const display = new CameraDisplay({ camera: world.camera });
    expect(() => display.setWindow(host.window, new TransformNode("stray", host.scene))).toThrow(/anchor/);
  });

  it("makes a portal a window, with walls of light behind its opening", () => {
    const engine = makeEngine();
    const host = makeHost(engine);
    const world = makeWorld(engine);
    const anchor = new TransformNode("anchor", world.scene);
    const display = new CameraDisplay({ camera: world.camera, drive: "display" });
    const portal = new Portal("gate", host.scene, { width: 2, height: 1, display, window: { anchor, glow: { depth: 0.5 } } });

    expect(portal.isWindow).toBe(true);
    expect(display.window).toBe(portal);
    // The image of a window is the opening itself.
    portal.fit = "cover";
    expect(portal.fit).toBe("stretch");

    // The light behind the opening stands in the scene of the display, on the layer only the window sees.
    const glow = portal.worldGlow as AbstractMesh;
    expect(glow.getScene()).toBe(world.scene);
    expect(host.scene.meshes).not.toContain(glow);
    expect(glow.parent).toBe(anchor);
    expect(glow.layerMask).toBe(WINDOW_LAYER_MASK);
    expect(glow.getTotalVertices()).toBe(16);
    expect(glow.getBoundingInfo().boundingBox.maximum.asArray()).toEqual([1, 0.5, 0.5]);
    expect(portal.worldGlowDepth).toBe(0.5);
    portal.worldGlowDepth = 1;
    portal.setDimension(4, 2);
    expect(glow.getBoundingInfo().boundingBox.maximum.asArray()).toEqual([2, 1, 1]);

    frame(engine, host.scene);
    expect((display.windowCamera as Camera).position.z).toBeCloseTo(-3);

    // Without its display the portal lets go of the window and of its light.
    portal.display = null;
    expect(display.window).toBeNull();
    expect(portal.worldGlow).toBeNull();
    expect(world.scene.meshes).not.toContain(glow);

    // A display that cannot be a window leaves the portal a screen, without light behind it.
    portal.display = new TextureDisplay(RawTexture.CreateRGBATexture(new Uint8Array(16), 2, 2, host.scene));
    expect(portal.worldGlow).toBeNull();
    portal.dispose();
  });

  it("is a screen unless asked to be a window", () => {
    const engine = makeEngine();
    const host = makeHost(engine);
    const world = makeWorld(engine);
    const display = new CameraDisplay({ camera: world.camera });
    const portal = new Portal("gate", host.scene, { width: 2, height: 1, display });
    expect(portal.isWindow).toBe(false);
    expect(display.window).toBeNull();
    expect(portal.worldGlow).toBeNull();
    expect(display.texture.activeCamera).toBe(world.camera);
  });
});
