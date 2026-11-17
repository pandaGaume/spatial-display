import { describe, expect, it } from "vitest";
import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import { Scene } from "@babylonjs/core/scene.js";
import { CameraDisplay, Portal, RectSurfaceBuilder, WINDOW_LAYER_MASK } from "@spacexr/spatial-display-babylon";

/** A layer the camera of the scene does not draw. */
const HIDDEN_LAYER = 0x20000000;

/** One scene: a viewer in front of the origin, a box it sees and a box on a layer it does not draw. */
const makeScene = () => {
  const engine = new NullEngine({ renderWidth: 1280, renderHeight: 720, textureSize: 512, deterministicLockstep: false, lockstepMaxSteps: 1 });
  const scene = new Scene(engine);
  const viewer = new FreeCamera("viewer", new Vector3(0.4, 0.1, -3), scene);
  viewer.setTarget(Vector3.Zero());
  const seen = CreateBox("seen", { size: 1 }, scene);
  seen.position.z = 4;
  seen.material = new StandardMaterial("paint", scene);
  const hidden = CreateBox("hidden", { size: 1 }, scene);
  hidden.position.z = 6;
  hidden.layerMask = HIDDEN_LAYER;
  // Never the camera of the scene: it lends a display its layers.
  const scanner = new FreeCamera("scanner", Vector3.Zero(), scene, false);
  scanner.layerMask = 0x0fffffff | HIDDEN_LAYER;
  const frame = (): void => {
    engine.beginFrame();
    scene.render();
    engine.endFrame();
  };
  return { engine, scene, viewer, scanner, seen, hidden, frame };
};

/** The material a mesh is drawn with in the image of a display, when it is not its own. */
const inImage = (display: CameraDisplay, mesh: AbstractMesh) => mesh.getMaterialForRenderPass(display.texture.renderPassId);

describe("material override", () => {
  it("draws the meshes of an image with another material, and leaves them their own", () => {
    const { scene, scanner, seen, hidden, frame } = makeScene();
    const wire = new StandardMaterial("wire", scene);
    wire.wireframe = true;
    const paint = seen.material;
    const display = new CameraDisplay({ camera: scanner, overrideMaterial: wire });
    frame();
    expect(inImage(display, seen)).toBe(wire);
    expect(inImage(display, hidden)).toBe(wire);
    // Everywhere else the mesh is what it was: nothing was copied, nothing was repainted.
    expect(seen.material).toBe(paint);
    expect(scene.meshes).toHaveLength(2);

    // A function picks a material for each mesh, or none.
    const other = new StandardMaterial("other", scene);
    display.overrideMaterial = (mesh) => (mesh.layerMask === HIDDEN_LAYER ? other : null);
    frame();
    expect(inImage(display, seen)).toBeUndefined();
    expect(inImage(display, hidden)).toBe(other);

    // Without an override every mesh gets its own material back in the image.
    display.overrideMaterial = null;
    frame();
    expect(inImage(display, seen)).toBeUndefined();
    expect(inImage(display, hidden)).toBeUndefined();
  });
});

describe("a window onto its own scene", () => {
  it("looks at what stands behind the portal, from the eye of the viewer", () => {
    const { scene, viewer, scanner, seen, hidden, frame } = makeScene();
    const wire = new StandardMaterial("wire", scene);
    const display = new CameraDisplay({ camera: scanner, overrideMaterial: wire });
    const portal = new Portal("xray", scene, { surface: new RectSurfaceBuilder({ width: 2, height: 1, display, window: true }), frame: true, light: true, glow: true });
    portal.root.position.set(0, 0, 1);

    // No anchor was given: the opening gives onto the scene it stands in, from where it stands.
    expect(display.window).toBe(portal);
    expect(display.texture.getScene()).toBe(scene);
    frame();
    const eye = display.windowCamera as Camera;
    expect(eye.position.asArray()).toEqual([expect.closeTo(viewer.position.x), expect.closeTo(viewer.position.y), expect.closeTo(viewer.position.z)]);
    // It starts drawing at the plane of the opening, 4 in front of the viewer.
    expect(eye.minZ).toBeCloseTo(4, 1);
    // It draws the layers of the camera it was lent, the hidden one included; the camera of the scene still does not.
    expect(eye.layerMask & HIDDEN_LAYER).not.toBe(0);
    expect(viewer.layerMask & HIDDEN_LAYER).toBe(0);

    // The portal does not show in its own image: neither its screen, nor its frame, nor the glow of its frame.
    const shows = display.texture.renderListPredicate;
    expect([portal.screen, portal.frame, portal.glow].map((mesh) => shows(mesh as AbstractMesh))).toEqual([false, false, false]);
    expect(shows(seen)).toBe(true);
    expect(shows(hidden)).toBe(true);

    // The light behind the opening is set on the portal itself, and keeps its own look in the image.
    const glow = portal.worldGlow as AbstractMesh;
    expect(glow.parent).toBe(portal.root);
    expect(glow.layerMask).toBe(WINDOW_LAYER_MASK);
    expect(inImage(display, glow)).toBeUndefined();
    expect(inImage(display, seen)).toBe(wire);
    expect(inImage(display, hidden)).toBe(wire);

    // The screen moves: the camera stays on the eye of the viewer, its near plane follows the opening.
    portal.root.position.z = 2;
    frame();
    expect(eye.position.z).toBeCloseTo(viewer.position.z);
    expect(eye.minZ).toBeCloseTo(5, 1);

    portal.display = null;
    expect(shows(portal.frame as AbstractMesh)).toBe(true);
  });
});
