import { describe, expect, it } from "vitest";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Constants } from "@babylonjs/core/Engines/constants.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  CameraDisplay,
  CylinderSurfaceBuilder,
  DisplayMaterial,
  MeshSurfaceBuilder,
  NEON_BLUE,
  NEON_WHITE,
  NeonMaterial,
  Portal,
  PortalBuilder,
  RectSurfaceBuilder,
  type IPortalOptions,
  type IRectSurfaceOptions,
} from "@spacexr/spatial-display-babylon";
import { Display, PhysicalDisplay } from "@spacexr/spatial-display-core";

const makeScene = (rightHanded = false) => {
  const engine = new NullEngine({ renderWidth: 1280, renderHeight: 720, textureSize: 512, deterministicLockstep: false, lockstepMaxSteps: 1 });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = rightHanded;
  const camera = new FreeCamera("camera", Vector3.Zero(), scene);
  return { engine, scene, camera };
};

/** A portal on a flat rectangle, wearing what `dress` asks for. */
const gate = (scene: Scene, rect: IRectSurfaceOptions, dress: Omit<IPortalOptions, "surface"> = {}, name = "gate"): Portal =>
  new Portal(name, scene, { surface: new RectSurfaceBuilder(rect), ...dress });

const extendOf = (mesh: AbstractMesh | null): number[] => (mesh as AbstractMesh).getBoundingInfo().boundingBox.extendSize.asArray();
const frameOf = (portal: Portal): AbstractMesh => portal.frame as AbstractMesh;
const glowOf = (portal: Portal): AbstractMesh => portal.glow as AbstractMesh;
const neonOf = (portal: Portal): NeonMaterial => portal.neon as NeonMaterial;

describe("Portal", () => {
  it("is a physical display on a bare surface, unless asked for more", () => {
    const { scene } = makeScene();
    const portal = gate(scene, { width: 1.6, height: 0.9 });
    expect(portal).toBeInstanceOf(PhysicalDisplay);
    expect(portal).toBeInstanceOf(Display);
    expect(portal.screen.parent).toBe(portal.root);
    expect(extendOf(portal.screen)).toEqual([expect.closeTo(0.8), expect.closeTo(0.45), 0]);
    // No frame, no light, no glow: the screen is the only mesh.
    expect([portal.framed, portal.lit, portal.glowing]).toEqual([false, false, false]);
    expect([portal.frame, portal.glow, portal.neon]).toEqual([null, null, null]);
    expect(scene.meshes).toHaveLength(1);
    expect(scene.meshes[0]).toBe(portal.screen);
    expect(scene.materials).toHaveLength(0);
  });

  it("wears a frame and a line of light under one node", () => {
    const { scene } = makeScene();
    const portal = gate(scene, { width: 1.6, height: 0.9 }, { frame: { section: 0.03 }, light: true });
    expect(frameOf(portal).parent).toBe(portal.root);
    expect(glowOf(portal).parent).toBe(portal.root);
    expect(glowOf(portal).material).toBe(portal.neon);
    expect(portal.neon).toBeInstanceOf(NeonMaterial);
    // A white line, with no glow around it. The line is an opaque tube, with no lighting.
    expect(neonOf(portal).lit).toBe(true);
    expect(neonOf(portal).lineColor).toMatchObject(NEON_WHITE);
    expect(neonOf(portal).glowSize).toBe(0);
    const line = frameOf(portal).material as StandardMaterial;
    expect(line.needAlphaBlending()).toBeFalsy();
    expect(line.disableLighting).toBe(true);
    expect(line.emissiveColor).toMatchObject(NEON_WHITE);
    // The frame goes around the rectangle: half a size plus the section.
    expect(extendOf(portal.frame)).toEqual([expect.closeTo(0.83), expect.closeTo(0.48), expect.closeTo(0.015)]);
  });

  it("has a plain frame when it is not lit, and may glow all the same", () => {
    const { scene } = makeScene();
    const portal = gate(scene, { width: 1, height: 1 }, { frame: { section: 0.05, color: { r: 0.5, g: 0.2, b: 0.1 } } });
    // A solid as any other: it takes the light of the scene, and gives none.
    const body = frameOf(portal).material as StandardMaterial;
    expect(body.disableLighting).toBe(false);
    expect(body.diffuseColor).toMatchObject({ r: 0.5, g: 0.2, b: 0.1 });
    expect(body.emissiveColor).toMatchObject({ r: 0, g: 0, b: 0 });
    expect(portal.glow).toBeNull();

    // A glow with no light: its own color, around a line that is not drawn.
    portal.glowing = true;
    expect(neonOf(portal).lit).toBe(false);
    expect(neonOf(portal).glowColor).toMatchObject(NEON_BLUE);
    expect(neonOf(portal).glowSize).toBeCloseTo(0.18);

    portal.lit = true;
    expect(neonOf(portal).lit).toBe(true);
    expect(body.disableLighting).toBe(true);
    expect(body.emissiveColor).toMatchObject(NEON_WHITE);
    portal.frameColor = { r: 0, g: 1, b: 0 };
    portal.lit = false;
    expect(body.diffuseColor).toMatchObject({ r: 0, g: 1, b: 0 });
  });

  it("draws its glow before its screen, so that the image is never under the glow", () => {
    const { scene, camera } = makeScene();
    const portal = gate(scene, { width: 2, height: 1, display: new CameraDisplay({ camera }) }, { frame: { section: 0.02 }, light: true, glow: { size: 0.1 } });
    // 64 vertices for the tube, 16 for the four ribbons of the glow.
    expect(frameOf(portal).getTotalVertices()).toBe(64);
    expect(glowOf(portal).getTotalVertices()).toBe(16);
    expect(glowOf(portal).getVerticesData(VertexBuffer.UV2Kind)).toHaveLength(16 * 2);
    expect(glowOf(portal).getVerticesData(VertexBuffer.TangentKind)).toHaveLength(16 * 4);
    // The bounds of the glow make room for the light the shader spreads from the centre line of the tube.
    expect(extendOf(portal.frame)).toEqual([expect.closeTo(1.02), expect.closeTo(0.52), expect.closeTo(0.01)]);
    expect(extendOf(portal.glow)).toEqual([expect.closeTo(1.11), expect.closeTo(0.61), expect.closeTo(0.1)]);
    portal.glowSize = 0.3;
    expect(neonOf(portal).glowSize).toBe(0.3);
    expect(extendOf(portal.glow)).toEqual([expect.closeTo(1.31), expect.closeTo(0.81), expect.closeTo(0.3)]);

    // The screen is drawn with the blended meshes even when opaque, and writes its depth first.
    const material = portal.screen.material as DisplayMaterial;
    expect(material.opaque).toBe(true);
    expect(material.needAlphaBlending()).toBe(true);
    expect(material.needDepthPrePass).toBe(true);
    // Blended meshes that stand as far from the eye are drawn in the order the scene holds them: the glow
    // first. That holds wherever the portal stands, also after a change of size.
    portal.root.position.set(5, 0, 0);
    portal.setDimension(1, 1);
    expect(glowOf(portal).getBoundingInfo().boundingSphere.centerWorld.asArray()).toEqual([5, 0, 0]);
    scene.render();
    expect(glowOf(portal).getBoundingInfo().boundingSphere.centerWorld.asArray()).toEqual([5, 0, 0]);
    expect(portal.screen.getBoundingInfo().boundingSphere.centerWorld.asArray()).toEqual([5, 0, 0]);
    expect(scene.meshes.indexOf(glowOf(portal))).toBeLessThan(scene.meshes.indexOf(portal.screen));
  });

  it("sets the line and the glow of its frame apart", () => {
    const { scene } = makeScene();
    const portal = gate(scene, { width: 1, height: 1 }, { frame: { section: 0.02 }, light: true, glow: { intensity: 2, color: { r: 1, g: 0, b: 0 } } });
    // The width of the line is the section of the frame.
    expect(neonOf(portal).lineWidth).toBe(0.02);
    portal.frameSection = 0.05;
    expect(neonOf(portal).lineWidth).toBe(0.05);
    // With no section the line is still drawn, as a hairline.
    portal.frameSection = 0;
    expect(neonOf(portal).lineWidth).toBe(0);
    expect(neonOf(portal).minLineWidth).toBeGreaterThan(0);

    expect(portal.glowIntensity).toBe(2);
    expect(portal.glowColor).toMatchObject({ r: 1, g: 0, b: 0 });
    portal.glowIntensity = 0.5;
    portal.glowColor = { r: 0, g: 1, b: 0 };
    portal.lineColor = { r: 1, g: 1, b: 0 };
    expect(neonOf(portal).glowIntensity).toBe(0.5);
    expect(neonOf(portal).glowColor).toMatchObject({ r: 0, g: 1, b: 0 });
    // The color of the line goes to the tube and to the hairline that the glow draws from afar.
    expect(neonOf(portal).lineColor).toMatchObject({ r: 1, g: 1, b: 0 });
    expect((frameOf(portal).material as StandardMaterial).emissiveColor).toMatchObject({ r: 1, g: 1, b: 0 });
  });

  it("blends its light over what stands behind it, so that it reads on any color", () => {
    const { scene } = makeScene();
    const portal = gate(scene, { width: 1, height: 1 }, { glow: true });
    expect(neonOf(portal).needAlphaBlending()).toBe(true);
    expect(neonOf(portal).alphaMode).toBe(Constants.ALPHA_PREMULTIPLIED_PORTERDUFF);
    expect(neonOf(portal).cover).toBe(1);
    neonOf(portal).cover = 0;
    expect(neonOf(portal).cover).toBe(0);
  });

  it("puts on and takes off its frame, its light and its glow at any time", () => {
    const { scene, camera } = makeScene();
    const display = new CameraDisplay({ camera });
    const portal = gate(scene, { width: 2, height: 1, display });
    const shows = display.texture.renderListPredicate;
    const material = portal.screen.material as DisplayMaterial;
    // A bare surface is drawn with the opaque meshes.
    expect(material.needAlphaBlending()).toBe(false);

    portal.framed = true;
    expect(frameOf(portal).getTotalVertices()).toBe(64);
    expect(portal.glow).toBeNull();
    // What the portal wears stays out of the image of its display, as its screen does.
    expect(shows(frameOf(portal))).toBe(false);

    // With no light, the glow is made after the screen: it is moved before it in the scene all the same.
    portal.glowing = true;
    expect(shows(glowOf(portal))).toBe(false);
    expect(scene.meshes.indexOf(glowOf(portal))).toBeLessThan(scene.meshes.indexOf(portal.screen));
    expect(material.needAlphaBlending()).toBe(true);
    expect(neonOf(portal).lit).toBe(false);

    // What was set on the material itself comes back with the next one.
    neonOf(portal).cover = 0.25;
    neonOf(portal).flow.amplitude = 0.4;
    const former = glowOf(portal);
    portal.glowing = false;
    expect(portal.glow).toBeNull();
    expect(former.isDisposed()).toBe(true);
    expect(shows(former)).toBe(true);
    expect(material.needAlphaBlending()).toBe(false);
    portal.lit = true;
    expect(neonOf(portal).cover).toBe(0.25);
    expect(neonOf(portal).flow.amplitude).toBe(0.4);
    expect(neonOf(portal).glowSize).toBe(0);

    // With no frame the line stands on the edge of the rectangle itself, as a hairline.
    portal.framed = false;
    expect(portal.frame).toBeNull();
    expect(neonOf(portal).lineWidth).toBe(0);
    expect(extendOf(portal.glow)).toEqual([expect.closeTo(1), expect.closeTo(0.5), 0]);
  });

  it("changes the size of its surface without rebuilding a mesh", () => {
    const { scene } = makeScene();
    const portal = gate(scene, { width: 1.6, height: 0.9 }, { frame: { section: 0.1 } });
    const geometry = frameOf(portal).geometry;
    const indices = frameOf(portal).getIndices();
    const screen = portal.screen.geometry;
    const meshes = scene.meshes.length;

    portal.setDimension(3, 2);
    expect([portal.width, portal.height]).toEqual([3, 2]);
    expect(portal.dimension).toEqual({ width: 3, height: 2 });
    expect(extendOf(portal.frame)).toEqual([expect.closeTo(1.6), expect.closeTo(1.1), expect.closeTo(0.05)]);
    expect(extendOf(portal.screen)).toEqual([1.5, 1, 0]);

    portal.width = 4;
    expect(portal.dimension).toEqual({ width: 4, height: 2 });
    expect(extendOf(portal.screen)).toEqual([2, 1, 0]);

    portal.frameSection = 0.2;
    expect(extendOf(portal.frame)).toEqual([expect.closeTo(2.2), expect.closeTo(1.2), expect.closeTo(0.1)]);

    expect(frameOf(portal).geometry).toBe(geometry);
    expect(frameOf(portal).getIndices()).toBe(indices);
    expect(portal.screen.geometry).toBe(screen);
    expect(scene.meshes).toHaveLength(meshes);
  });

  it("shows the display of its surface, with an opacity", () => {
    const { scene, camera } = makeScene();
    const portal = gate(scene, { width: 1.6, height: 0.9, opacity: 0.4 }, { frame: true, light: true, glow: true });
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
    // A portal stays out of the image of its own display: its screen, and its frame too.
    expect(display.texture.renderListPredicate(portal.screen)).toBe(false);
    expect(display.texture.renderListPredicate(frameOf(portal))).toBe(false);
    expect(display.texture.renderListPredicate(glowOf(portal))).toBe(false);

    portal.opacity = 1;
    expect(material.opaque).toBe(true);
    expect(material.needDepthPrePass).toBe(true);

    // The back of the portal shows the image when asked, and still does with another display.
    expect(portal.doubleSided).toBe(false);
    expect(material.backFaceCulling).toBe(true);
    portal.doubleSided = true;
    expect(material.backFaceCulling).toBe(false);
    portal.display = new CameraDisplay({ camera });
    expect((portal.screen.material as DisplayMaterial).backFaceCulling).toBe(false);
    portal.display = display;

    portal.display = null;
    expect(portal.screen.isEnabled()).toBe(false);
    expect(display.texture.renderListPredicate(portal.screen)).toBe(true);
    expect(display.texture.renderListPredicate(frameOf(portal))).toBe(true);
  });

  it("lets through the transparent pixels of its display, and a color when asked", () => {
    const { scene, camera } = makeScene();
    const display = new CameraDisplay({ camera });
    const portal = gate(scene, { width: 1, height: 1, display });
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
    const portal = gate(scene, { width: 1.6, height: 0.9, display });
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
    // The size of the surface is another matter.
    expect(portal.dimension).toEqual({ width: 1.6, height: 0.9 });
  });

  it("resizes its display to keep a density of pixels, when asked", () => {
    const { scene, camera } = makeScene();
    const display = new CameraDisplay({ camera, resolution: { width: 100, height: 100 } });
    const portal = gate(scene, { width: 2, height: 1, display, pixelsPerUnit: 203 });
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
      const portal = gate(scene, { width: 1, height: 1 });
      return (portal.screen.getVerticesData(VertexBuffer.NormalKind) as ArrayLike<number>)[2] as number;
    };
    expect(normalZ(false)).toBe(-1);
    expect(normalZ(true)).toBe(1);
  });

  it("empties its surface when its display is disposed, and leaves its display alone when disposed itself", () => {
    const { scene, camera } = makeScene();
    const display = new CameraDisplay({ camera });
    const portal = gate(scene, { width: 1, height: 1, display });
    display.dispose();
    expect(portal.display).toBeNull();
    expect(portal.screen.isEnabled()).toBe(false);

    const kept = new CameraDisplay({ camera });
    const other = gate(scene, { width: 1, height: 1, display: kept }, { frame: true, light: true }, "other");
    const meshes = scene.meshes.length;
    const materials = scene.materials.length;
    other.dispose();
    // Its screen, its frame and the ribbons of its light; their three materials.
    expect(scene.meshes).toHaveLength(meshes - 3);
    expect(scene.materials).toHaveLength(materials - 3);
    expect(other.root.isDisposed()).toBe(true);
    expect(scene.customRenderTargets).toContain(kept.texture);
  });
});

describe("PortalBuilder", () => {
  it("builds a portal step by step, with nothing on its edges unless asked", () => {
    const { scene, camera } = makeScene();
    const display = new CameraDisplay({ camera });
    const bare = new PortalBuilder("bare", scene).withSurface(new RectSurfaceBuilder({ width: 2, height: 1, display })).build();
    expect(bare.root.name).toBe("bare");
    expect(bare.display).toBe(display);
    expect([bare.framed, bare.lit, bare.glowing]).toEqual([false, false, false]);

    const dressed = new PortalBuilder("gate", scene)
      .withSurface(new RectSurfaceBuilder({ width: 2, height: 1, display, opacity: 0.5 }))
      .withFrame(true, 0.05)
      .withLight(true, { r: 1, g: 0.5, b: 0 })
      .withGlow({ size: 0.3, color: { r: 0, g: 1, b: 0 } })
      .build();
    expect([dressed.framed, dressed.lit, dressed.glowing]).toEqual([true, true, true]);
    expect(dressed.opacity).toBe(0.5);
    expect(dressed.frameSection).toBe(0.05);
    expect(dressed.lineColor).toMatchObject({ r: 1, g: 0.5, b: 0 });
    expect(dressed.glowSize).toBe(0.3);
    expect(dressed.glowColor).toMatchObject({ r: 0, g: 1, b: 0 });
    expect(frameOf(dressed).name).toBe("gate.frame");
    expect(glowOf(dressed).name).toBe("gate.glow");
    expect(dressed.screen.name).toBe("gate.screen");
  });

  it("takes its last word for each step, and the defaults of what it is asked with no detail", () => {
    const { scene } = makeScene();
    const surface = new RectSurfaceBuilder({ width: 1, height: 1 });
    const portal = new PortalBuilder("gate", scene).withSurface(surface).withFrame().withLight().withGlow().withGlow(false).build();
    expect([portal.framed, portal.lit, portal.glowing]).toEqual([true, true, false]);
    expect(portal.frameSection).toBeCloseTo(0.012);
    expect(portal.lineColor).toMatchObject(NEON_WHITE);
    // What a portal is not asked to wear keeps its settings for the day it is.
    expect(portal.glowSize).toBeCloseTo(0.18);
    expect(new PortalBuilder("other", scene).withSurface(surface).withFrame(false, 0.5).build().frame).toBeNull();
  });

  it("needs a surface", () => {
    const { scene } = makeScene();
    expect(() => new PortalBuilder("gate", scene).withFrame().build()).toThrow(/surface/);
  });
});

describe("a portal on the wall of a cylinder", () => {
  it("frames the two rims of a ring", () => {
    const { scene, camera } = makeScene();
    const display = new CameraDisplay({ camera });
    const portal = new PortalBuilder("ring", scene)
      .withSurface(new CylinderSurfaceBuilder({ diameter: 2, height: 1, tessellation: 32, display, doubleSided: true }))
      .withFrame(true, 0.1)
      .withLight()
      .withGlow({ size: 0.2 })
      .build();
    // Its width is the length of the turn.
    expect(portal.width).toBeCloseTo(2 * Math.PI);
    expect(portal.height).toBe(1);
    expect(extendOf(portal.screen)).toEqual([expect.closeTo(1), 0.5, expect.closeTo(1)]);
    expect(portal.doubleSided).toBe(true);
    // 32 sides on each rim: 16 vertices of tube and 4 of ribbon for each.
    expect(frameOf(portal).getTotalVertices()).toBe(2 * 32 * 16);
    expect(glowOf(portal).getTotalVertices()).toBe(2 * 32 * 4);
    // The tube stands on the rims: a section above the top one, half a section on each face of the wall.
    expect(extendOf(portal.frame)).toEqual([expect.closeTo(1.05), expect.closeTo(0.6), expect.closeTo(1.05)]);
    // The ribbons of a curve meet on mitres.
    const joints = glowOf(portal).getVerticesData(VertexBuffer.TangentKind) as ArrayLike<number>;
    expect(joints[3]).toBe(1);
    // The glow keeps the centre of the wall: it is drawn before it from every angle.
    expect(glowOf(portal).getBoundingInfo().boundingSphere.center.asArray()).toEqual(portal.screen.getBoundingInfo().boundingSphere.center.asArray());
    expect(scene.meshes.indexOf(glowOf(portal))).toBeLessThan(scene.meshes.indexOf(portal.screen));
    // A wall is not a window.
    expect(portal.isWindow).toBe(false);
    expect(display.window).toBeNull();
  });

  it("changes diameter with its width, without rebuilding a mesh", () => {
    const { scene } = makeScene();
    const portal = new Portal("ring", scene, { surface: new CylinderSurfaceBuilder({ diameter: 2, height: 1 }), frame: { section: 0.1 } });
    const geometry = frameOf(portal).geometry;
    const meshes = scene.meshes.length;
    portal.setDimension(Math.PI, 2);
    expect(extendOf(portal.screen)).toEqual([expect.closeTo(0.5), 1, expect.closeTo(0.5)]);
    expect(extendOf(portal.frame)).toEqual([expect.closeTo(0.55), expect.closeTo(1.1), expect.closeTo(0.55)]);
    expect(frameOf(portal).geometry).toBe(geometry);
    expect(scene.meshes).toHaveLength(meshes);
  });

  it("bends a screen toward who faces it, or around them", () => {
    for (const rightHanded of [false, true]) {
      const { scene } = makeScene(rightHanded);
      const front = rightHanded ? 1 : -1;
      const middleOf = (portal: Portal): number[] => {
        const positions = portal.screen.getVerticesData(VertexBuffer.PositionKind) as ArrayLike<number>;
        const normals = portal.screen.getVerticesData(VertexBuffer.NormalKind) as ArrayLike<number>;
        // The middle column of a quarter of a turn of 64 sides: the ninth of 17.
        return [positions[8 * 2 * 3 + 2] as number, normals[8 * 2 * 3 + 2] as number];
      };
      const bulging = new Portal("out", scene, { surface: new CylinderSurfaceBuilder({ diameter: 2, height: 1, arc: 0.25 }), frame: true });
      // The middle of the wall stands in front of the node, and looks the way a flat portal does.
      expect(middleOf(bulging)).toEqual([expect.closeTo(front), expect.closeTo(front)]);
      expect(bulging.width).toBeCloseTo(Math.PI / 2);
      // One line around the screen: 16 sides at the bottom, 16 at the top, and its two ends.
      expect(frameOf(bulging).getTotalVertices()).toBe(34 * 16);

      const hugging = new Portal("in", scene, { surface: new CylinderSurfaceBuilder({ diameter: 2, height: 1, arc: 0.25, facing: "inside" }) });
      // The wall stands behind the node, and its inner face looks back at it.
      expect(middleOf(hugging)).toEqual([expect.closeTo(-front), expect.closeTo(front)]);
    }
  });
});

describe("a portal on a mesh of the application", () => {
  it("dresses the mesh where it stands, and gives it back as it was", () => {
    const { scene, camera } = makeScene();
    const display = new CameraDisplay({ camera });
    const sheet = CreatePlane("sheet", { width: 2, height: 1 }, scene);
    sheet.position.set(3, 1, 0);
    const paint = new StandardMaterial("paint", scene);
    sheet.material = paint;
    const meshes = scene.meshes.length;

    const portal = new PortalBuilder("panel", scene).withSurface(new MeshSurfaceBuilder(sheet, { display })).withFrame(true, 0.1).withLight().withGlow().build();
    // The mesh is the node of the portal, and its screen.
    expect(portal.root).toBe(sheet);
    expect(portal.screen).toBe(sheet);
    expect(sheet.material).toBeInstanceOf(DisplayMaterial);
    expect(portal.dimension).toEqual({ width: 2, height: 1 });
    // Its frame runs along its open edges, and follows it.
    expect(frameOf(portal).parent).toBe(sheet);
    expect(frameOf(portal).getTotalVertices()).toBe(64);
    expect(extendOf(portal.frame)).toEqual([expect.closeTo(1.1), expect.closeTo(0.6), expect.closeTo(0.05)]);
    // The glow is made after the mesh, and moved before it in the scene.
    expect(scene.meshes.indexOf(glowOf(portal))).toBeLessThan(scene.meshes.indexOf(sheet));
    scene.render();
    expect(glowOf(portal).getBoundingInfo().boundingSphere.centerWorld.asArray()).toEqual(sheet.getBoundingInfo().boundingSphere.centerWorld.asArray());
    expect(sheet.getBoundingInfo().boundingSphere.centerWorld.asArray()).toEqual([3, 1, 0]);

    // The mesh keeps its size: the application scales it itself.
    portal.setDimension(8, 8);
    expect(portal.dimension).toEqual({ width: 2, height: 1 });

    portal.dispose();
    expect(sheet.isDisposed()).toBe(false);
    expect(sheet.material).toBe(paint);
    expect(scene.meshes).toHaveLength(meshes);
    expect(display.texture.renderListPredicate(sheet)).toBe(true);
  });

  it("takes a mesh as it is, and finds no edge on a closed one", () => {
    const { scene, camera } = makeScene();
    const bubble = CreateSphere("bubble", { diameter: 1, segments: 8 }, scene);
    const meshes = scene.meshes.length;
    const portal = new PortalBuilder("bubble.portal", scene).withSurface(bubble).withFrame().withLight().withGlow().build();
    // Asked for a frame, a sphere has no edge to set it on.
    expect([portal.framed, portal.lit, portal.glowing]).toEqual([true, true, true]);
    expect([portal.frame, portal.glow]).toEqual([null, null]);
    expect(scene.meshes).toHaveLength(meshes);
    // A mesh alone carries no display: the portal is given one later.
    expect(portal.display).toBeNull();
    expect(bubble.isEnabled()).toBe(true);
    portal.display = new CameraDisplay({ camera });
    expect(bubble.material).toBeInstanceOf(DisplayMaterial);
  });

  it("takes the lines of its frame when they are given, and refuses a mesh of another scene", () => {
    const { engine, scene } = makeScene();
    const bubble = CreateSphere("bubble", { diameter: 1, segments: 8 }, scene);
    const equator = new CylinderSurfaceBuilder({ diameter: 1, height: 0, tessellation: 12 }).build("equator", scene);
    // The two rims of a wall with no height: twice the same circle.
    const portal = new Portal("belt", scene, { surface: new MeshSurfaceBuilder(bubble, { outlines: equator.outlines }), light: true });
    expect(glowOf(portal).getTotalVertices()).toBe(2 * 12 * 4);

    const other = new Scene(engine);
    expect(() => new PortalBuilder("stray", other).withSurface(bubble).build()).toThrow(/scene/);
  });
});
