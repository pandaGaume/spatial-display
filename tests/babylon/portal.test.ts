import { describe, expect, it } from "vitest";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Constants } from "@babylonjs/core/Engines/constants.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";
import { CameraDisplay, DisplayMaterial, NEON_BLUE, NEON_WHITE, NeonMaterial, Portal } from "@spacexr/spatial-display-babylon";
import { Display, PhysicalDisplay } from "@spacexr/spatial-display-core";

const makeScene = (rightHanded = false) => {
  const engine = new NullEngine({ renderWidth: 1280, renderHeight: 720, textureSize: 512, deterministicLockstep: false, lockstepMaxSteps: 1 });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = rightHanded;
  const camera = new FreeCamera("camera", Vector3.Zero(), scene);
  return { engine, scene, camera };
};

const extend = (portal: Portal): number[] => portal.frame.getBoundingInfo().boundingBox.extendSize.asArray();
/** A frame with no glow: its bounds are those of the tube. */
const bare = { glowSize: 0 };

describe("Portal", () => {
  it("is a physical display made of a frame, its glow and a screen under one node", () => {
    const { scene } = makeScene();
    const portal = new Portal("gate", scene, { width: 1.6, height: 0.9, frameSection: 0.03, neon: bare });
    expect(portal).toBeInstanceOf(PhysicalDisplay);
    expect(portal).toBeInstanceOf(Display);
    expect(portal.frame.parent).toBe(portal.root);
    expect(portal.glow.parent).toBe(portal.root);
    expect(portal.screen.parent).toBe(portal.root);
    expect(portal.glow.material).toBe(portal.neon);
    expect(portal.neon).toBeInstanceOf(NeonMaterial);
    // A white line in a blue glow. The line is an opaque tube, with no lighting.
    expect(portal.neon.lineColor).toMatchObject(NEON_WHITE);
    expect(portal.neon.glowColor).toMatchObject(NEON_BLUE);
    const line = portal.frame.material as StandardMaterial;
    expect(line.needAlphaBlending()).toBeFalsy();
    expect(line.disableLighting).toBe(true);
    expect(line.emissiveColor).toMatchObject(NEON_WHITE);
    // The frame goes around the opening: half a size plus the section.
    expect(extend(portal)).toEqual([expect.closeTo(0.83), expect.closeTo(0.48), expect.closeTo(0.015)]);
    expect(portal.screen.scaling.asArray()).toEqual([1.6, 0.9, 1]);
  });

  it("draws its glow before its screen, so that the image is never under the glow", () => {
    const { scene, camera } = makeScene();
    const portal = new Portal("gate", scene, { width: 2, height: 1, frameSection: 0.02, neon: { glowSize: 0.1 }, display: new CameraDisplay({ camera }) });
    const glowExtend = (): number[] => portal.glow.getBoundingInfo().boundingBox.extendSize.asArray();
    // 64 vertices for the tube, 16 for the four ribbons of the glow.
    expect(portal.frame.getTotalVertices()).toBe(64);
    expect(portal.glow.getTotalVertices()).toBe(16);
    expect(portal.glow.getVerticesData(VertexBuffer.UV2Kind)).toHaveLength(16 * 2);
    // The bounds of the glow make room for the light the shader spreads from the centre line of the tube.
    expect(extend(portal)).toEqual([expect.closeTo(1.02), expect.closeTo(0.52), expect.closeTo(0.01)]);
    expect(glowExtend()).toEqual([expect.closeTo(1.11), expect.closeTo(0.61), expect.closeTo(0.1)]);
    portal.glowSize = 0.3;
    expect(portal.neon.glowSize).toBe(0.3);
    expect(glowExtend()).toEqual([expect.closeTo(1.31), expect.closeTo(0.81), expect.closeTo(0.3)]);

    // The screen is drawn with the blended meshes even when opaque, and writes its depth first.
    const material = portal.screen.material as DisplayMaterial;
    expect(material.opaque).toBe(true);
    expect(material.needAlphaBlending()).toBe(true);
    expect(material.needDepthPrePass).toBe(true);
    // Blended meshes that stand as far from the eye are drawn in the order they were built in: the glow
    // first. That holds wherever the portal stands, also after a change of size.
    portal.root.position.set(5, 0, 0);
    portal.setDimension(1, 1);
    expect(portal.glow.getBoundingInfo().boundingSphere.centerWorld.asArray()).toEqual([5, 0, 0]);
    scene.render();
    expect(portal.glow.getBoundingInfo().boundingSphere.centerWorld.asArray()).toEqual([5, 0, 0]);
    expect(portal.screen.getBoundingInfo().boundingSphere.centerWorld.asArray()).toEqual([5, 0, 0]);
    expect(scene.meshes.indexOf(portal.glow)).toBeLessThan(scene.meshes.indexOf(portal.screen));
  });

  it("sets the line and the glow of its frame apart", () => {
    const { scene } = makeScene();
    const portal = new Portal("gate", scene, { width: 1, height: 1, frameSection: 0.02, neon: { glowIntensity: 2, glowColor: { r: 1, g: 0, b: 0 } } });
    // The width of the line is the section of the frame.
    expect(portal.neon.lineWidth).toBe(0.02);
    portal.frameSection = 0.05;
    expect(portal.neon.lineWidth).toBe(0.05);
    // With no section the line is still drawn, as a hairline.
    portal.frameSection = 0;
    expect(portal.neon.lineWidth).toBe(0);
    expect(portal.neon.minLineWidth).toBeGreaterThan(0);

    expect(portal.glowIntensity).toBe(2);
    expect(portal.glowColor).toMatchObject({ r: 1, g: 0, b: 0 });
    portal.glowIntensity = 0.5;
    portal.glowColor = { r: 0, g: 1, b: 0 };
    portal.lineColor = { r: 1, g: 1, b: 0 };
    expect(portal.neon.glowIntensity).toBe(0.5);
    expect(portal.neon.glowColor).toMatchObject({ r: 0, g: 1, b: 0 });
    // The color of the line goes to the tube and to the hairline that the glow draws from afar.
    expect(portal.neon.lineColor).toMatchObject({ r: 1, g: 1, b: 0 });
    expect((portal.frame.material as StandardMaterial).emissiveColor).toMatchObject({ r: 1, g: 1, b: 0 });
  });

  it("blends its light over what stands behind it, so that it reads on any color", () => {
    const { scene } = makeScene();
    const portal = new Portal("gate", scene, { width: 1, height: 1 });
    expect(portal.neon.needAlphaBlending()).toBe(true);
    expect(portal.neon.alphaMode).toBe(Constants.ALPHA_PREMULTIPLIED_PORTERDUFF);
    expect(portal.neon.cover).toBe(1);
    portal.neon.cover = 0;
    expect(portal.neon.cover).toBe(0);
  });

  it("changes the size of its opening without rebuilding a mesh", () => {
    const { scene } = makeScene();
    const portal = new Portal("gate", scene, { width: 1.6, height: 0.9, frameSection: 0.1, neon: bare });
    const geometry = portal.frame.geometry;
    const indices = portal.frame.getIndices();
    const meshes = scene.meshes.length;

    portal.setDimension(3, 2);
    expect([portal.width, portal.height]).toEqual([3, 2]);
    expect(portal.dimension).toEqual({ width: 3, height: 2 });
    expect(extend(portal)).toEqual([expect.closeTo(1.6), expect.closeTo(1.1), expect.closeTo(0.05)]);
    expect(portal.screen.scaling.asArray()).toEqual([3, 2, 1]);

    portal.width = 4;
    expect(portal.dimension).toEqual({ width: 4, height: 2 });
    expect(portal.screen.scaling.asArray()).toEqual([4, 2, 1]);

    portal.frameSection = 0.2;
    expect(extend(portal)).toEqual([expect.closeTo(2.2), expect.closeTo(1.2), expect.closeTo(0.1)]);

    expect(portal.frame.geometry).toBe(geometry);
    expect(portal.frame.getIndices()).toBe(indices);
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
    const material = portal.screen.material as DisplayMaterial;
    expect(material.getActiveTextures()).toContain(display.texture);
    expect(material.opaque).toBe(false);
    expect(material.needDepthPrePass).toBe(false);
    expect(material.alphaMode).toBe(Constants.ALPHA_PREMULTIPLIED_PORTERDUFF);
    // The screen of a portal stays out of the image of its own display.
    expect(display.texture.renderListPredicate(portal.screen)).toBe(false);
    expect(display.texture.renderListPredicate(portal.frame)).toBe(true);

    portal.opacity = 1;
    expect(material.opaque).toBe(true);
    expect(material.needDepthPrePass).toBe(true);

    portal.display = null;
    expect(portal.screen.isEnabled()).toBe(false);
    expect(display.texture.renderListPredicate(portal.screen)).toBe(true);
  });

  it("lets through the transparent pixels of its display, and a color when asked", () => {
    const { scene, camera } = makeScene();
    const display = new CameraDisplay({ camera });
    const portal = new Portal("gate", scene, { width: 1, height: 1, display });
    const material = portal.screen.material as DisplayMaterial;
    // The colors of a render target are multiplied by their alpha.
    expect(material.premultipliedImage).toBe(true);
    expect(material.useImageAlpha).toBe(false);
    expect(material.opaque).toBe(true);

    // A see-through background: the portal follows what the texture says of itself.
    display.clearColor = { r: 0, g: 0, b: 0, a: 0 };
    expect(material.useImageAlpha).toBe(true);
    expect(material.opaque).toBe(false);
    display.clearColor = null;
    expect(material.useImageAlpha).toBe(false);

    // Unless told otherwise.
    portal.useImageAlpha = true;
    expect(material.useImageAlpha).toBe(true);
    portal.useImageAlpha = undefined;
    expect(material.useImageAlpha).toBe(false);

    portal.chromaKey = { color: { r: 0, g: 1, b: 0 } };
    expect(material.chromaKey).toEqual({ color: { r: 0, g: 1, b: 0 } });
    expect(material.opaque).toBe(false);
    portal.chromaKey = null;
    expect(material.opaque).toBe(true);
  });

  it("has the resolution of its display: pixels on a rectangle of the world", () => {
    const { scene, camera } = makeScene();
    const display = new CameraDisplay({ camera, resolution: { width: 1280, height: 720 } });
    const portal = new Portal("gate", scene, { width: 1.6, height: 0.9, display });
    expect(portal.resolution).toEqual({ width: 1280, height: 720 });
    expect(portal.dimension).toEqual({ width: 1.6, height: 0.9 });
    expect(portal.pixelPerUnit.x).toBeCloseTo(800);
    expect(portal.pixelPerUnit.y).toBeCloseTo(800);
    expect(portal.dpi).toBeCloseTo(20.32);

    // Resizing the image of the portal resizes its display, and the other way round.
    portal.resize(640, 360);
    expect(display.resolution).toEqual({ width: 640, height: 360 });
    expect(display.texture.getSize()).toEqual({ width: 640, height: 360 });
    display.resize(320, 180);
    expect(portal.resolution).toEqual({ width: 320, height: 180 });
    // The size of the opening is another matter.
    expect(portal.dimension).toEqual({ width: 1.6, height: 0.9 });
  });

  it("resizes its display to keep a density of pixels, when asked", () => {
    const { scene, camera } = makeScene();
    const display = new CameraDisplay({ camera, resolution: { width: 100, height: 100 } });
    const portal = new Portal("gate", scene, { width: 2, height: 1, display, pixelsPerUnit: 203 });
    // By steps of 8 pixels.
    expect(display.resolution).toEqual({ width: 408, height: 200 });
    expect(portal.resolution).toEqual({ width: 408, height: 200 });
    portal.setDimension(1, 1);
    expect(display.resolution).toEqual({ width: 200, height: 200 });

    // Never above what the engine can allocate: 512 for the null engine.
    portal.pixelsPerUnit = 2000;
    expect(display.resolution).toEqual({ width: 512, height: 512 });

    // Without a density the resolution is left alone.
    portal.pixelsPerUnit = undefined;
    portal.setDimension(0.1, 0.1);
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
    expect(scene.meshes).toHaveLength(meshes - 3);
    expect(other.root.isDisposed()).toBe(true);
    expect(scene.customRenderTargets).toContain(kept.texture);
  });
});
