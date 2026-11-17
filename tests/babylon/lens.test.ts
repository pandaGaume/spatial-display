import { describe, expect, it } from "vitest";
import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.js";
import { attachDisplay, CameraDisplay, CylinderSurfaceBuilder, Portal, PortalBuilder, RectSurfaceBuilder, type DisplayChangeKind } from "@spacexr/spatial-display-babylon";

/** A layer the camera of the scene does not draw. */
const HIDDEN_LAYER = 0x20000000;

const makeEngine = (): NullEngine => new NullEngine({ renderWidth: 1280, renderHeight: 720, textureSize: 512, deterministicLockstep: false, lockstepMaxSteps: 1 });

/** One frame of an application that renders `scene` only. */
const frame = (engine: NullEngine, scene: Scene): void => {
  engine.beginFrame();
  scene.render();
  engine.endFrame();
};

/** One scene: a viewer off the axis who looks at the origin, and a camera that lends a display its layers. */
const makeScene = (engine: NullEngine, rightHanded = false) => {
  const scene = new Scene(engine);
  scene.useRightHandedSystem = rightHanded;
  const viewer = new FreeCamera("viewer", new Vector3(1.2, 2, rightHanded ? 5 : -5), scene);
  viewer.setTarget(new Vector3(0, 1, 0));
  // Never the camera of the scene.
  const scanner = new FreeCamera("scanner", Vector3.Zero(), scene, false);
  scanner.layerMask = 0x0fffffff | HIDDEN_LAYER;
  return { scene, viewer, scanner };
};

/** What a camera draws with: from the world to its image. */
const transformOf = (camera: Camera): Matrix => camera.getViewMatrix(true).multiply(camera.getProjectionMatrix());

const expectSameMatrix = (actual: Matrix, expected: Matrix): void => {
  for (const [i, value] of expected.asArray().entries()) expect(actual.m[i]).toBeCloseTo(value, 4);
};

describe("lens mode", () => {
  for (const rightHanded of [false, true]) {
    it(`draws with a copy of the camera of the viewer, in a ${rightHanded ? "right" : "left"}-handed scene`, () => {
      const engine = makeEngine();
      const { scene, viewer, scanner } = makeScene(engine, rightHanded);
      // A viewer who tilts their head is followed too.
      viewer.rotation.z = 0.35;
      const display = new CameraDisplay({ camera: scanner });
      expect(display.lensCamera).toBeNull();
      expect(display.imageTransform).toBeNull();

      display.setLens({ scene });
      const copy = display.lensCamera as Camera;
      expect(display.lens?.scene).toBe(scene);
      expect(copy.getScene()).toBe(scene);
      expect(display.texture.activeCamera).toBe(copy);
      // The camera given is neither moved nor drawn with: it lends its layers.
      expect(scene.activeCamera).toBe(viewer);

      frame(engine, scene);
      expectSameMatrix(transformOf(copy), transformOf(viewer));
      expect(copy.layerMask).toBe(scanner.layerMask);
      expect(viewer.layerMask & HIDDEN_LAYER).toBe(0);
      expect(scanner.position.asArray()).toEqual([0, 0, 0]);

      // The viewer moves: so does the copy, at the next frame.
      viewer.position.set(-3, 0.5, rightHanded ? 2 : -2);
      viewer.setTarget(new Vector3(0, 1.5, 0));
      frame(engine, scene);
      expectSameMatrix(transformOf(copy), transformOf(viewer));
      expect(copy.position.x).toBeCloseTo(-3);
    });
  }

  it("takes the size of the screen of the viewer", () => {
    const engine = makeEngine();
    const { scene, scanner } = makeScene(engine);
    const display = new CameraDisplay({ camera: scanner, resolution: { width: 64, height: 64 } });
    display.setLens({ scene });
    frame(engine, scene);
    // The canvas is 1280 by 720, and the null engine allocates no more than 512: the proportions are kept.
    expect(display.resolution).toEqual({ width: 512, height: 288 });

    display.setLens({ scene, scale: 0.25 });
    frame(engine, scene);
    expect(display.resolution).toEqual({ width: 320, height: 180 });
  });

  it("tells its surfaces to read the image where the viewer sees them", () => {
    const engine = makeEngine();
    const { scene, viewer, scanner } = makeScene(engine);
    const display = new CameraDisplay({ camera: scanner });
    const kinds: DisplayChangeKind[] = [];
    display.onChangedObservable.add((change) => kinds.push(change.kind));
    const wall = CreateCylinder("wall", { diameter: 2, height: 1 }, scene);
    const surface = attachDisplay(wall, display, { fit: "contain" });
    expect(surface.material.projector).toBeNull();
    expect(surface.material.border).toMatchObject({ a: 1 });

    display.setLens({ scene });
    const transform = display.imageTransform as Matrix;
    expect(kinds.filter((kind) => kind === "mapping")).toHaveLength(1);
    expect(surface.material.projector).toBe(transform);
    // Nothing is left around the image: it reaches the surface wherever the viewer sees it.
    expect(surface.material.border).toMatchObject({ a: 0 });

    frame(engine, scene);
    expectSameMatrix(transform, transformOf(viewer));
    // The matrix is rewritten in place: the material keeps reading the same object.
    viewer.position.x = -2;
    frame(engine, scene);
    expect(display.imageTransform).toBe(transform);
    expectSameMatrix(transform, transformOf(viewer));

    // A surface that comes later reads the image the same way.
    const other = attachDisplay(CreateBox("box", { size: 1 }, scene), display);
    expect(other.material.projector).toBe(transform);
    // A surface of the lens is not in its image.
    expect(display.texture.renderListPredicate(wall)).toBe(false);

    // Back to a screen: the image is read by the texture coordinates of the mesh, with the camera given.
    display.setLens(null);
    expect(kinds.filter((kind) => kind === "mapping")).toHaveLength(2);
    expect(display.lensCamera).toBeNull();
    expect(display.imageTransform).toBeNull();
    expect(display.texture.activeCamera).toBe(scanner);
    expect(surface.material.projector).toBeNull();
    expect(surface.material.border).toMatchObject({ a: 1 });
    expect(scene.cameras.map((camera) => camera.name)).toEqual(["viewer", "scanner"]);
  });

  it("shows another scene, from where the viewer stands against the root of the lens", () => {
    const engine = makeEngine();
    const { scene, viewer } = makeScene(engine);
    const root = new TransformNode("root", scene);
    root.position.set(1, 0, 0);
    const world = new Scene(engine);
    const worldCamera = new FreeCamera("world.camera", Vector3.Zero(), world);
    const anchor = new TransformNode("anchor", world);
    anchor.position.set(10, 0, 20);
    const display = new CameraDisplay({ camera: worldCamera, drive: "display" });
    let draws = 0;
    display.texture.onAfterRenderObservable.add(() => draws++);

    display.setLens({ scene, root }, anchor);
    const copy = display.lensCamera as Camera;
    expect(copy.getScene()).toBe(world);
    // The application renders the scene of the viewer only: the display renders the other one, once per frame.
    frame(engine, scene);
    frame(engine, scene);
    expect(draws).toBe(2);
    // The viewer stands at (1.2, 2, -5), that is (0.2, 2, -5) from the root: the copy stands there from the anchor.
    expect(copy.position.asArray()).toEqual([expect.closeTo(10.2), expect.closeTo(2), expect.closeTo(15)]);
    // A surface is still read where the viewer sees it, in their own scene.
    expectSameMatrix(display.imageTransform as Matrix, transformOf(viewer));
    // Both look the same way: a point 3 in front of the root and one 3 in front of the anchor land at the same place.
    const seen = Vector3.TransformCoordinates(new Vector3(1, 1, 3), transformOf(viewer));
    const drawn = Vector3.TransformCoordinates(new Vector3(10, 1, 23), transformOf(copy));
    expect([drawn.x, drawn.y]).toEqual([expect.closeTo(seen.x, 4), expect.closeTo(seen.y, 4)]);

    display.dispose();
    expect(world.cameras.map((camera) => camera.name)).not.toContain("display.lens");
  });

  it("shows on a mesh of any shape: one made of its own vertices, a closed one", () => {
    const engine = makeEngine();
    const { scene, scanner } = makeScene(engine);
    const display = new CameraDisplay({ camera: scanner });
    display.setLens({ scene });

    // Four corners that are not in one plane.
    const data = new VertexData();
    data.positions = [-1, -1, 0, 1, -1, 0.4, 1, 1, -0.3, -1, 1, 0.6];
    data.indices = [0, 1, 2, 0, 2, 3];
    data.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    const sheet = new Mesh("sheet", scene);
    data.applyToMesh(sheet);
    const bubble = CreateSphere("bubble", { diameter: 2 }, scene);

    const surfaces = [sheet, bubble].map((mesh) => attachDisplay(mesh, display, { doubleSided: true }));
    for (const surface of surfaces) {
      expect(surface.material.projector).toBe(display.imageTransform);
      expect(surface.doubleSided).toBe(true);
      expect(display.texture.renderListPredicate(surface.mesh)).toBe(false);
    }
    frame(engine, scene);
    // One image serves them all.
    expect(scene.customRenderTargets).toHaveLength(1);

    // The texture coordinates are not read by a lens, yet a surface asks for them.
    const bare = new Mesh("bare", scene);
    const positions = new VertexData();
    positions.positions = data.positions;
    positions.indices = data.indices;
    positions.applyToMesh(bare);
    expect(() => attachDisplay(bare, display)).toThrow(/texture coordinates/);
  });

  it("is either a lens or a window", () => {
    const engine = makeEngine();
    const { scene, scanner } = makeScene(engine);
    const display = new CameraDisplay({ camera: scanner });
    const portal = new Portal("gate", scene, { surface: new RectSurfaceBuilder({ width: 2, height: 1, display, window: true }) });
    expect(display.window).toBe(portal);

    display.setLens({ scene });
    expect(display.window).toBeNull();
    expect(display.windowCamera).toBeNull();
    expect(display.texture.activeCamera).toBe(display.lensCamera);

    display.setWindow(portal);
    expect(display.lens).toBeNull();
    expect(display.imageTransform).toBeNull();
    expect(display.texture.activeCamera).toBe(display.windowCamera);
  });

  it("shows in a portal as on any surface", () => {
    const engine = makeEngine();
    const { scene, scanner } = makeScene(engine);
    const display = new CameraDisplay({ camera: scanner });
    display.setLens({ scene });
    const portal = new Portal("glass", scene, { surface: new RectSurfaceBuilder({ width: 2, height: 1, display }) });
    frame(engine, scene);
    expect(portal.screen.material).toMatchObject({ projector: display.imageTransform });
    expect(display.resolution).toEqual({ width: 512, height: 288 });

    // And all around an object, on the wall of a ring: both its faces read the same image.
    const ring = new PortalBuilder("ring", scene).withSurface(new CylinderSurfaceBuilder({ diameter: 2, height: 1, display, doubleSided: true })).withFrame().withLight().build();
    expect(ring.screen.material).toMatchObject({ projector: display.imageTransform, backFaceCulling: false });
    expect(display.texture.renderListPredicate(ring.screen)).toBe(false);
    expect(display.texture.renderListPredicate(ring.frame as AbstractMesh)).toBe(false);
    frame(engine, scene);
    // One image serves the two portals.
    expect(scene.customRenderTargets).toHaveLength(1);
  });

  it("refuses an anchor of another scene, and a viewer of the other handedness", () => {
    const engine = makeEngine();
    const { scene, scanner } = makeScene(engine);
    const display = new CameraDisplay({ camera: scanner });
    const other = new Scene(engine);
    expect(() => display.setLens({ scene }, new TransformNode("stray", other))).toThrow(/anchor/);
    other.useRightHandedSystem = true;
    new FreeCamera("other.viewer", Vector3.Zero(), other);
    expect(() => display.setLens({ scene: other })).toThrow(/handedness/);
    expect(display.lens).toBeNull();
    expect(display.texture.activeCamera).toBe(scanner);
  });

  it("reads its image with positions counted from the eye, in a scene with a floating origin", () => {
    const engine = makeEngine();
    const scene = new Scene(engine, { useFloatingOrigin: true });
    expect(scene.floatingOriginMode).toBe(true);
    // Far from the origin of the scene, as on the ground of a planet.
    const place = new Vector3(4200, 3100, -3800);
    const viewer = new FreeCamera("viewer", place.add(new Vector3(1.2, 2, -5)), scene);
    viewer.setTarget(place.add(new Vector3(0, 1, 0)));
    const scanner = new FreeCamera("scanner", Vector3.Zero(), scene, false);
    const display = new CameraDisplay({ camera: scanner });
    display.setLens({ scene });
    frame(engine, scene);

    // The lens still stands where the viewer does.
    expect(Vector3.Distance((display.lensCamera as Camera).position, viewer.globalPosition)).toBeLessThan(1e-3);
    // Babylon.js hands the shader of a surface its points counted from the eye of the viewer: read that way, a point
    // lands in the image where the viewer sees it.
    const transform = display.imageTransform as Matrix;
    for (const offset of [new Vector3(0.4, 1.3, 0.2), new Vector3(-2, 0.1, 3), new Vector3(1.5, 2.4, -1)]) {
      const point = place.add(offset);
      const seen = Vector3.TransformCoordinates(point, transformOf(viewer));
      const read = Vector3.TransformCoordinates(point.subtract(viewer.globalPosition), transform);
      expect(read.x).toBeCloseTo(seen.x, 2);
      expect(read.y).toBeCloseTo(seen.y, 2);
    }
    // The transform no longer moves what it reads: only the turn of the viewer and their projection are left.
    expect(transform.m[12]).toBeCloseTo(0, 6);
    expect(transform.m[13]).toBeCloseTo(0, 6);
  });
});
