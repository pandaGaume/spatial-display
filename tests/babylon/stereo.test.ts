import { describe, expect, it } from "vitest";
import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { StereoscopicFreeCamera } from "@babylonjs/core/Cameras/Stereoscopic/stereoscopicFreeCamera.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.js";
import { attachDisplay, CameraDisplay, DisplayMaterial, PortalBuilder, RectSurfaceBuilder, type DisplayChangeKind } from "@spacexr/spatial-display-babylon";

const makeEngine = (): NullEngine => new NullEngine({ renderWidth: 1280, renderHeight: 720, textureSize: 512, deterministicLockstep: false, lockstepMaxSteps: 1 });

/** Distance between the two eyes of the viewer, in the units of the scene. */
const EYES_APART = 0.4;

/** The scene of the viewer: a camera with two eyes, side by side, in front of the origin and off its axis. */
const makeHost = (engine: NullEngine) => {
  const scene = new Scene(engine);
  const camera = new StereoscopicFreeCamera("host.camera", new Vector3(0.5, 0.2, -3), EYES_APART, true, scene);
  camera.setTarget(Vector3.Zero());
  // A camera with one eye, to go back to.
  const single = new FreeCamera("host.single", new Vector3(0.5, 0.2, -3), scene);
  single.setTarget(Vector3.Zero());
  scene.activeCamera = camera;
  return { scene, camera, single };
};

/** The scene a display shows. */
const makeWorld = (engine: NullEngine) => {
  const scene = new Scene(engine);
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

const numbers = (matrix: Matrix): number[] => Array.from(matrix.asArray());
const close = (matrix: Matrix): unknown[] => numbers(matrix).map((value) => expect.closeTo(value, 4));

describe("a viewer who has two eyes", () => {
  it("looks through a window with each of them: two images, two cameras", () => {
    const engine = makeEngine();
    const host = makeHost(engine);
    const world = makeWorld(engine);
    const display = new CameraDisplay({ camera: world.camera, drive: "display" });
    const changes: DisplayChangeKind[] = [];
    display.onChangedObservable.add((change) => changes.push(change.kind));
    const opening = { root: new TransformNode("opening", host.scene), width: 2, height: 1 };
    display.setWindow(opening);
    // Until its viewer is met, a window has one image.
    expect(display.rightTexture).toBeNull();

    let draws = 0;
    display.texture.onAfterRenderObservable.add(() => draws++);
    frame(engine, host.scene);
    const left = display.windowCamera as Camera;
    const right = display.rightEyeCamera as Camera;
    const image = display.rightTexture;
    expect(image).not.toBeNull();
    expect(changes).toEqual(["mapping"]);
    // The image of the right eye is one more target of the scene the display shows, of the size of the other.
    expect(world.scene.customRenderTargets).toEqual([display.texture, image]);
    expect(image?.getSize()).toEqual(display.texture.getSize());
    expect(image?.activeCamera).toBe(right);
    let rightDraws = 0;
    image?.onAfterRenderObservable.add(() => rightDraws++);

    // Each camera stands where its eye does, seen from the opening: they are as far apart as the eyes.
    const [leftEye, rightEye] = host.camera.rigCameras as [Camera, Camera];
    for (const [camera, eye] of [[left, leftEye], [right, rightEye]] as const) {
      expect(camera.position.asArray()).toEqual([expect.closeTo(eye.globalPosition.x), expect.closeTo(eye.globalPosition.y), expect.closeTo(eye.globalPosition.z)]);
      // The frustum of each passes through the edges of the opening: its corners are the corners of both images.
      expect(inImage(camera, -1, -0.5, 0)).toEqual([expect.closeTo(-1), expect.closeTo(-1)]);
      expect(inImage(camera, 1, 0.5, 0)).toEqual([expect.closeTo(1), expect.closeTo(1)]);
    }
    // Babylon.js turns the two eyes about what the camera looks at: they stand further apart than the distance asked.
    const apart = Vector3.Distance(leftEye.globalPosition, rightEye.globalPosition);
    expect(apart).toBeGreaterThan(EYES_APART);
    expect(Vector3.Distance(left.position, right.position)).toBeCloseTo(apart);
    // What stands behind the opening does not land at the same place in the two images: it has depth.
    expect(inImage(left, 0, 0, 5)[0]).not.toBeCloseTo(inImage(right, 0, 0, 5)[0] as number, 2);

    // The two images are drawn together.
    frame(engine, host.scene);
    expect(draws).toBe(2);
    expect(rightDraws).toBe(1);

    // A viewer with one eye again: one image is enough.
    host.scene.activeCamera = host.single;
    frame(engine, host.scene);
    expect(display.rightTexture).toBeNull();
    expect(display.rightEyeCamera).toBeNull();
    expect(world.scene.customRenderTargets).toEqual([display.texture]);
    expect(world.scene.cameras).not.toContain(right);
    expect(changes).toEqual(["mapping", "mapping"]);

    // And back to a screen from two eyes: the second image goes with the window.
    host.scene.activeCamera = host.camera;
    frame(engine, host.scene);
    expect(display.rightTexture).not.toBeNull();
    display.setWindow(null);
    expect(display.rightTexture).toBeNull();
    expect(world.scene.customRenderTargets).toEqual([display.texture]);
  });

  it("is copied eye by eye by a lens, which reads each image as its eye sees", () => {
    const engine = makeEngine();
    const host = makeHost(engine);
    const scanner = new FreeCamera("scanner", Vector3.Zero(), host.scene, false);
    const display = new CameraDisplay({ camera: scanner });
    display.setLens({ scene: host.scene });
    const bubble = CreateSphere("bubble", { diameter: 1 }, host.scene);
    const surface = attachDisplay(bubble, display);
    frame(engine, host.scene);

    const [leftEye, rightEye] = host.camera.rigCameras as [Camera, Camera];
    const left = display.lensCamera as Camera;
    const right = display.rightEyeCamera as Camera;
    // Each camera of the lens is a copy of the camera of its eye: same view, same projection.
    const seenBy = (camera: Camera): Matrix => camera.getViewMatrix(true).multiply(camera.getProjectionMatrix());
    expect(numbers(seenBy(left))).toEqual(close(seenBy(leftEye)));
    expect(numbers(seenBy(right))).toEqual(close(seenBy(rightEye)));
    expect(numbers(seenBy(left))).not.toEqual(close(seenBy(right)));
    // An eye is given half of the screen, side by side with the other: the image has the proportions of that half,
    // 640 by 720, brought down to what the null engine can allocate.
    expect(display.resolution).toEqual({ width: 455, height: 512 });

    // The surface reads the image of each eye where that eye sees it.
    expect(numbers(display.rightImageTransform as Matrix)).toEqual(close(seenBy(rightEye)));
    expect(numbers(display.imageTransform as Matrix)).toEqual(close(seenBy(leftEye)));
    expect(surface.material.rightImage).toBe(display.rightTexture);
    expect(surface.material.rightProjector).toBe(display.rightImageTransform);
    // The image of the right eye stays out of itself, as the other does.
    expect(display.rightTexture?.renderListPredicate(bubble)).toBe(false);

    // With one eye the surface reads one image again.
    host.scene.activeCamera = host.single;
    frame(engine, host.scene);
    expect(display.rightTexture).toBeNull();
    expect(surface.material.rightImage).toBeNull();
    expect(surface.material.rightProjector).toBeNull();
  });

  it("shows each eye its own image in a portal, and one image to a screen", () => {
    const engine = makeEngine();
    const host = makeHost(engine);
    const world = makeWorld(engine);
    const display = new CameraDisplay({ camera: world.camera, drive: "display", clearColor: { r: 0, g: 0, b: 0, a: 0.5 } });
    const portal = new PortalBuilder("gate", host.scene).withSurface(new RectSurfaceBuilder({ width: 2, height: 1, display, window: true })).build();
    frame(engine, host.scene);
    const material = portal.screen.material as DisplayMaterial;
    expect(material.rightImage).toBe(display.rightTexture);
    // A window reads both images by the texture coordinates of its opening.
    expect(material.rightProjector).toBeNull();
    // The background of the second image is the one of the first.
    expect(display.rightTexture?.hasAlpha).toBe(true);
    display.clearColor = null;
    expect(display.rightTexture?.hasAlpha).toBe(false);

    // A display that is a screen does not depend on who looks at it: one image for both eyes.
    const screen = new CameraDisplay({ camera: world.camera, drive: "display" });
    attachDisplay(CreateSphere("ball", { diameter: 1 }, host.scene), screen);
    frame(engine, host.scene);
    expect(screen.rightTexture).toBeNull();
  });
});
