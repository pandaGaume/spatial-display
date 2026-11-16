import { describe, expect, it } from "vitest";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";
import { CameraDisplay, NEON_BLUE, NeonMaterial, Portal } from "@spacexr/spatial-display-babylon";

const makeScene = (rightHanded = false) => {
  const engine = new NullEngine({ renderWidth: 1280, renderHeight: 720, textureSize: 512, deterministicLockstep: false, lockstepMaxSteps: 1 });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = rightHanded;
  const camera = new FreeCamera("camera", Vector3.Zero(), scene);
  return { engine, scene, camera };
};

const extend = (portal: Portal): number[] => portal.frame.getBoundingInfo().boundingBox.extendSize.asArray();

describe("Portal", () => {
  it("is a frame and a screen under one node", () => {
    const { scene } = makeScene();
    const portal = new Portal("gate", scene, { width: 1.6, height: 0.9 });
    expect(portal.frame.parent).toBe(portal.root);
    expect(portal.screen.parent).toBe(portal.root);
    expect(portal.frame.getTotalVertices()).toBe(64);
    expect(portal.frame.material).toBe(portal.neon);
    expect(portal.neon).toBeInstanceOf(NeonMaterial);
    expect(portal.neon.color).toMatchObject(NEON_BLUE);
    expect(portal.neon.needAlphaBlending()).toBe(true);
    // The frame goes around the opening: half a size plus the section of 0.03.
    expect(extend(portal)).toEqual([expect.closeTo(0.83), expect.closeTo(0.48), expect.closeTo(0.015)]);
    expect(portal.screen.scaling.asArray()).toEqual([1.6, 0.9, 1]);
  });

  it("is resized without rebuilding a mesh", () => {
    const { scene } = makeScene();
    const portal = new Portal("gate", scene, { width: 1.6, height: 0.9, frameSection: 0.1 });
    const geometry = portal.frame.geometry;
    const indices = portal.frame.getIndices();
    const meshes = scene.meshes.length;

    portal.resize(3, 2);
    expect([portal.width, portal.height]).toEqual([3, 2]);
    expect(portal.dimension).toEqual({ width: 3, height: 2 });
    expect(extend(portal)).toEqual([expect.closeTo(1.6), expect.closeTo(1.1), expect.closeTo(0.05)]);
    expect(portal.screen.scaling.asArray()).toEqual([3, 2, 1]);

    portal.frameSection = 0.2;
    expect(extend(portal)).toEqual([expect.closeTo(1.7), expect.closeTo(1.2), expect.closeTo(0.1)]);

    expect(portal.frame.geometry).toBe(geometry);
    expect(portal.frame.getIndices()).toBe(indices);
    expect(portal.frame.getTotalVertices()).toBe(64);
    expect(scene.meshes).toHaveLength(meshes);
  });

  it("shows a display in its opening, with an opacity", () => {
    const { scene, camera } = makeScene();
    const portal = new Portal("gate", scene, { width: 1.6, height: 0.9, opacity: 0.4 });
    // An empty frame: nothing in the opening.
    expect(portal.screen.isEnabled()).toBe(false);
    expect(portal.resolution).toEqual({ width: 0, height: 0 });

    const display = new CameraDisplay({ camera });
    portal.display = display;
    expect(portal.screen.isEnabled()).toBe(true);
    const material = portal.screen.material;
    expect(material?.getActiveTextures()).toContain(display.texture);
    expect(material?.needAlphaBlending()).toBe(true);
    // The screen of a portal stays out of the image of its own display.
    expect(display.texture.renderListPredicate(portal.screen)).toBe(false);
    expect(display.texture.renderListPredicate(portal.frame)).toBe(true);

    portal.opacity = 1;
    expect(material?.needAlphaBlending()).toBe(false);

    portal.display = null;
    expect(portal.screen.isEnabled()).toBe(false);
    expect(display.texture.renderListPredicate(portal.screen)).toBe(true);
  });

  it("is a physical display: pixels on a rectangle of the world", () => {
    const { scene, camera } = makeScene();
    const display = new CameraDisplay({ camera, resolution: { width: 1280, height: 720 } });
    const portal = new Portal("gate", scene, { width: 1.6, height: 0.9, display });
    expect(portal.resolution).toEqual({ width: 1280, height: 720 });
    expect(portal.dimension).toEqual({ width: 1.6, height: 0.9 });
    expect(portal.pixelPerUnit.x).toBeCloseTo(800);
    expect(portal.pixelPerUnit.y).toBeCloseTo(800);
    expect(portal.dpi).toBeCloseTo(20.32);
  });

  it("resizes its display to keep a density of pixels, when asked", () => {
    const { scene, camera } = makeScene();
    const display = new CameraDisplay({ camera, resolution: { width: 100, height: 100 } });
    const portal = new Portal("gate", scene, { width: 2, height: 1, display, pixelsPerUnit: 203 });
    // By steps of 8 pixels.
    expect(display.resolution).toEqual({ width: 408, height: 200 });
    portal.resize(1, 1);
    expect(display.resolution).toEqual({ width: 200, height: 200 });

    // Never above what the engine can allocate: 512 for the null engine.
    portal.pixelsPerUnit = 2000;
    expect(display.resolution).toEqual({ width: 512, height: 512 });

    // Without a density the resolution is left alone.
    portal.pixelsPerUnit = undefined;
    portal.resize(0.1, 0.1);
    expect(display.resolution).toEqual({ width: 512, height: 512 });
  });

  it("faces -z in a left-handed scene and +z in a right-handed one", () => {
    const normalZ = (rightHanded: boolean): number => {
      const { scene } = makeScene(rightHanded);
      const portal = new Portal("gate", scene, { width: 1, height: 1 });
      return (portal.screen.getVerticesData(VertexBuffer.NormalKind) as ArrayLike<number>)[2] as number;
    };
    expect(normalZ(false)).toBe(-1);
    expect(normalZ(true)).toBe(1);
  });

  it("empties its opening when its display is disposed, and leaves its display alone when disposed itself", () => {
    const { scene, camera } = makeScene();
    const display = new CameraDisplay({ camera });
    const portal = new Portal("gate", scene, { width: 1, height: 1, display });
    display.dispose();
    expect(portal.display).toBeNull();
    expect(portal.screen.isEnabled()).toBe(false);

    const kept = new CameraDisplay({ camera });
    const other = new Portal("other", scene, { width: 1, height: 1, display: kept });
    const meshes = scene.meshes.length;
    other.dispose();
    expect(scene.meshes).toHaveLength(meshes - 2);
    expect(other.root.isDisposed()).toBe(true);
    expect(scene.customRenderTargets).toContain(kept.texture);
  });
});
