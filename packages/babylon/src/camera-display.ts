import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Color4 } from "@babylonjs/core/Maths/math.color.js";
import type { IColor4Like } from "@babylonjs/core/Maths/math.like.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Observable, type Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Nullable } from "@babylonjs/core/types.js";
import { Display, RefreshClock, windowFrustum, windowProjection, type DisplayRefresh, type ISize2 } from "@spacexr/spatial-display-core";
import { WINDOW_LAYER_MASK, type IDisplayChange, type IDisplayLens, type IDisplayWindow, type ITextureDisplay } from "./display.js";
import { SourceHub, type ISourceHubClient } from "./source-hub.js";

/**
 * Who renders the scene of the camera.
 * - "app": the application does, in its render loop. This is the case of a
 *   display that shows the scene it is seen in, and of a scene drawn on the
 *   canvas as well.
 * - "display": the display does, for a scene that exists only to be seen
 *   through displays. Nothing of that scene reaches the canvas.
 */
export type DisplayDrive = "app" | "display";

/**
 * A material that the meshes of an image are drawn with instead of their own:
 * one for all of them, or the one a function picks for each, null leaving a
 * mesh its own.
 */
export type DisplayMaterialOverride = Material | ((mesh: AbstractMesh) => Nullable<Material>);

export interface ICameraDisplayOptions {
  /**
   * Camera whose view is shown. Its scene is the source scene of the display;
   * it does not have to be the scene the display is seen in, but both must
   * belong to the same engine.
   */
  camera: Camera;
  /** Size of the image, in pixels. Default 1280 x 720. */
  resolution?: Readonly<ISize2>;
  /** Meshes of the source scene that show in the image. Default: all of them. */
  include?: (mesh: AbstractMesh) => boolean;
  /** When the image is drawn again. Default "frame". */
  refresh?: DisplayRefresh;
  /** Who renders the source scene. Default "app". */
  drive?: DisplayDrive;
  /**
   * Stops drawing the image while no surface of the display is on screen
   * (default true). A display with no registered surface always draws: a
   * material that samples `texture` directly is not known to the display.
   */
  pauseWhenHidden?: boolean;
  /** Samples of the multisampling of the image. Default 1: none. */
  samples?: number;
  /** Builds the mipmaps of the image after each draw, for surfaces seen small or at a grazing angle. Default false. */
  mipmaps?: boolean;
  /**
   * Background of the image. Default: the clear color of the source scene.
   * With an alpha under 1 the background is see-through, and a surface lets
   * what stands behind it show there.
   */
  clearColor?: Readonly<IColor4Like>;
  /** Applies the post-processes of the camera to the image. Default false. */
  postProcesses?: boolean;
  /**
   * Draws the meshes with another material in the image, and with their own
   * everywhere else: a wireframe for an x-ray, a flat color for a mask. The
   * meshes are not copied. The material belongs to the scene of the camera.
   * Default: none.
   */
  overrideMaterial?: DisplayMaterialOverride;
  /** Name of the texture. Default "display". */
  name?: string;
}

interface ISurfaceWatch {
  /** Where the draws of the surface are announced; null for a kind of mesh that does not announce them. */
  observable: Observable<Mesh> | null;
  observer: Observer<Mesh> | null;
  /** Frame of the engine at which the surface was last drawn. */
  drawnAt: number;
}

/** What a display holds while it is a window. */
interface IWindowState {
  window: IDisplayWindow;
  anchor: TransformNode | null;
  /** The camera that stands in for the eye of the viewer, in the scene the display shows. */
  camera: TargetCamera;
  projection: Matrix;
  /** The scene the opening stands in, and the observer that follows its viewer. */
  host: Scene;
  observer: Observer<Scene> | null;
}

/** What a display holds while it is a lens. */
interface ILensState {
  lens: IDisplayLens;
  anchor: TransformNode | null;
  /** The camera that copies the one of the viewer, in the scene the display shows. */
  camera: TargetCamera;
  projection: Matrix;
  /** From the world of the viewer to their screen: what a surface reads the image with. */
  transform: Matrix;
  observer: Observer<Scene> | null;
}

/**
 * What a window or a lens draws for the right eye of a viewer who has two, as
 * in a headset: an image of its own, by a camera of its own. The left eye
 * keeps the image and the camera of the display.
 */
interface IRightEye {
  texture: RenderTargetTexture;
  camera: TargetCamera;
  projection: Matrix;
  /** For a lens: from the world of the viewer to the screen of their right eye. */
  transform: Matrix;
}

/** The near plane of a window is the plane of its opening, by a hair: what the camera draws starts on the opening. */
const WINDOW_NEAR_RATIO = 0.999;
/** Closer than this to the plane of the opening, the near plane stops following the eye. */
const WINDOW_MIN_NEAR = 0.005;
/** Far plane of a window whose camera has none. */
const WINDOW_DEFAULT_FAR = 10000;

const TMP_MATRIX = new Matrix();
const TMP_WORLD = new Matrix();
const TMP_VIEW = new Matrix();
const TMP_EYE = new Vector3();
const TMP_SCALE = new Vector3();
const UP = new Vector3(0, 1, 0);
const TMP_PROJECTION = new Array<number>(16).fill(0);

/** A surface drawn this many frames ago still counts as on screen: scenes are not all rendered at every frame. */
const HIDDEN_AFTER_FRAMES = 2;

const DEFAULT_RESOLUTION: Readonly<ISize2> = { width: 1280, height: 720 };

/**
 * A display that shows what a camera sees: the camera is drawn into a render
 * target, which any material samples as a texture.
 *
 * By default the image is the one of a screen: it does not depend on who looks
 * at the surface, and one draw serves every viewer, both eyes of a headset
 * included.
 *
 * `setWindow` makes it the image of a window instead: what the viewer of an
 * opening sees through it, as if the opening gave onto the scene of the
 * display. The display then draws with a camera of its own, which follows the
 * eye of the viewer; the camera it was given only lends its scene, its far
 * plane and its layer mask.
 *
 * `setLens` makes it the image of a lens: what the viewer sees, drawn as the
 * display draws it. The camera of the display copies the one of the viewer,
 * and a surface shows the part of the image it covers on screen, whatever its
 * shape. Nothing is cut in front of the surface, as the plane of a window
 * does: what the image shows is chosen by the layers of the camera given and
 * by `include`.
 *
 * A window and a lens follow a viewer. For one who has two eyes, the camera of
 * a headset or a stereoscopic one, they draw two images, one for each eye, and
 * a surface shows each eye its own: what stands behind the opening has depth.
 * The second image is another draw of the scene the display shows.
 */
export class CameraDisplay extends Display implements ITextureDisplay, ISourceHubClient {
  readonly onChangedObservable = new Observable<IDisplayChange>();
  /**
   * The colors of a render target are multiplied by their alpha: what is drawn
   * over a transparent background, antialiased edges included, is blended with nothing.
   */
  readonly premultipliedAlpha = true;
  /** Stops the drawing of the image. The last one stays on the surfaces. */
  paused = false;
  /** See `ICameraDisplayOptions.pauseWhenHidden`. */
  pauseWhenHidden: boolean;

  private readonly name: string;
  private readonly options: Readonly<ICameraDisplayOptions>;
  private readonly clock: RefreshClock;
  private readonly surfaces = new Map<AbstractMesh, ISurfaceWatch>();
  private _camera: Camera;
  private _texture: RenderTargetTexture;
  private _drive: DisplayDrive;
  private _clearColor: Readonly<IColor4Like> | null;
  private _overrideMaterial: DisplayMaterialOverride | null;
  /** True while meshes carry a material of this display: they are given their own back once the override is gone. */
  private overridden = false;
  private hub: SourceHub;
  private windowState: IWindowState | null = null;
  private lensState: ILensState | null = null;
  /** There while a window or a lens follows a viewer who has two eyes. */
  private rightEye: IRightEye | null = null;
  /** A window and a lens are drawn once the viewer is known for the frame: whether the image is due waits until then. */
  private windowDue = false;
  private sceneDisposeObserver: Observer<Scene> | null = null;
  private disposed = false;

  constructor(options: Readonly<ICameraDisplayOptions>) {
    super(atLeastOnePixel(options.resolution ?? DEFAULT_RESOLUTION));
    this.options = options;
    this.name = options.name ?? "display";
    this.clock = new RefreshClock(options.refresh ?? "frame");
    this.pauseWhenHidden = options.pauseWhenHidden ?? true;
    this._drive = options.drive ?? "app";
    this._clearColor = options.clearColor ? { ...options.clearColor } : null;
    this._overrideMaterial = options.overrideMaterial ?? null;
    this._camera = options.camera;
    this._texture = this.createTexture(options.camera);
    this.hub = this.attachSource(options.camera.getScene());
  }

  /** What a material samples to show the display. Another object after the camera moved to another scene. */
  get texture(): RenderTargetTexture {
    return this._texture;
  }

  /** The scene the display shows. */
  get scene(): Scene {
    return this._camera.getScene();
  }

  /** True when the display renders its source scene itself. */
  get driven(): boolean {
    return this._drive === "display";
  }

  get drive(): DisplayDrive {
    return this._drive;
  }

  set drive(value: DisplayDrive) {
    this._drive = value;
  }

  /** Background of the image; null for the clear color of the source scene. See `ICameraDisplayOptions.clearColor`. */
  get clearColor(): Readonly<IColor4Like> | null {
    return this._clearColor;
  }

  set clearColor(value: Readonly<IColor4Like> | null) {
    this._clearColor = value ? { ...value } : null;
    const seeThrough = this._texture.hasAlpha;
    this.applyClearColor(this._texture);
    if (this.rightEye) this.applyClearColor(this.rightEye.texture);
    this.clock.invalidate();
    if (this._texture.hasAlpha !== seeThrough) this.onChangedObservable.notifyObservers({ kind: "alpha" });
  }

  /** See `ICameraDisplayOptions.overrideMaterial`; null for none. */
  get overrideMaterial(): DisplayMaterialOverride | null {
    return this._overrideMaterial;
  }

  set overrideMaterial(value: DisplayMaterialOverride | null) {
    this._overrideMaterial = value;
    this.clock.invalidate();
  }

  get refresh(): DisplayRefresh {
    return this.clock.refresh;
  }

  set refresh(value: DisplayRefresh) {
    this.clock.refresh = value;
    this.clock.invalidate();
  }

  get camera(): Camera {
    return this._camera;
  }

  /**
   * Shows another camera. The camera may belong to another scene of the same
   * engine: the display then gets a new texture, and notifies it.
   */
  set camera(value: Camera) {
    if (this.disposed || value === this._camera) return;
    const scene = value.getScene();
    if (scene === this._camera.getScene()) {
      this._camera = value;
      // A window and a lens keep drawing with their own camera.
      if (!this.windowState && !this.lensState) this._texture.activeCamera = value;
      this.clock.invalidate();
      return;
    }
    if (scene.getEngine() !== this._camera.getScene().getEngine()) {
      throw new Error("spatial-display: the camera of a display cannot move to a scene of another engine.");
    }
    // A render target belongs to the scene it draws, and so does the camera of a window. Its anchor stays behind.
    const window = this.windowState?.window ?? null;
    const lens = this.lensState?.lens ?? null;
    this.clearWindow();
    this.clearLens();
    this.detachSource();
    this._camera = value;
    this._texture = this.createTexture(value);
    this.hub = this.attachSource(scene);
    if (window) this.setWindow(window);
    else if (lens) this.setLens(lens);
    this.clock.invalidate();
    this.onChangedObservable.notifyObservers({ kind: "texture" });
  }

  /** The opening the display is looked at through; null while it is a screen. */
  get window(): IDisplayWindow | null {
    return this.windowState?.window ?? null;
  }

  /** The camera a window draws with, which follows the eye of its viewer; null while the display is a screen. */
  get windowCamera(): Camera | null {
    return this.windowState?.camera ?? null;
  }

  /** Whose eye the display follows as a lens; null while it is not one. */
  get lens(): IDisplayLens | null {
    return this.lensState?.lens ?? null;
  }

  /** The camera a lens draws with, which copies the one of its viewer; null while the display is not a lens. */
  get lensCamera(): Camera | null {
    return this.lensState?.camera ?? null;
  }

  /** See `ITextureDisplay.imageTransform`: a matrix while the display is a lens, else null. */
  get imageTransform(): Matrix | null {
    return this.lensState?.transform ?? null;
  }

  /** See `ITextureDisplay.rightTexture`: there while a window or a lens follows a viewer who has two eyes. */
  get rightTexture(): RenderTargetTexture | null {
    return this.rightEye?.texture ?? null;
  }

  /** See `ITextureDisplay.rightImageTransform`: a matrix while a lens follows a viewer who has two eyes, else null. */
  get rightImageTransform(): Matrix | null {
    return this.lensState && this.rightEye ? this.rightEye.transform : null;
  }

  /** The camera that draws the image of the right eye of a viewer who has two; null otherwise. Do not move it. */
  get rightEyeCamera(): Camera | null {
    return this.rightEye?.camera ?? null;
  }

  /** See `ITextureDisplay.setLens`. */
  setLens(lens: IDisplayLens | null, anchor: TransformNode | null = null): void {
    if (this.disposed) return;
    const was = this.lensState !== null;
    this.clearWindow();
    this.clearLens();
    if (lens) {
      const scene = this._camera.getScene();
      if (anchor && anchor.getScene() !== scene) throw new Error("spatial-display: the anchor of a lens belongs to the scene its display shows.");
      if (lens.scene.getEngine() !== scene.getEngine()) throw new Error("spatial-display: a lens follows a viewer of its own engine.");
      // The rotation and the projection of the viewer are copied as they are: they fit a scene of the same handedness only.
      if (lens.scene.useRightHandedSystem !== scene.useRightHandedSystem) {
        throw new Error("spatial-display: a lens and the scene its display shows have the same handedness.");
      }
      const camera = new TargetCamera(`${this.name}.lens`, Vector3.Zero(), scene, false);
      camera.rotationQuaternion = new Quaternion();
      camera.doNotSerialize = true;
      // The same matrix is rewritten at every frame.
      const projection = new Matrix();
      camera.freezeProjectionMatrix(projection);
      this._texture.activeCamera = camera;
      const state: ILensState = { lens, anchor, camera, projection, transform: Matrix.Identity(), observer: null };
      // Babylon.js updates its cameras before this is notified: the viewer is the one of the frame about to be drawn.
      state.observer = lens.scene.onBeforeRenderObservable.add(() => this.updateLens());
      this.lensState = state;
    }
    this.clock.invalidate();
    if (was !== (this.lensState !== null)) this.onChangedObservable.notifyObservers({ kind: "mapping" });
  }

  /** See `ITextureDisplay.setWindow`. */
  setWindow(window: IDisplayWindow | null, anchor: TransformNode | null = null): void {
    if (this.disposed) return;
    if (this.lensState) this.setLens(null);
    this.clearWindow();
    if (!window) {
      this.clock.invalidate();
      return;
    }
    const scene = this._camera.getScene();
    if (anchor && anchor.getScene() !== scene) throw new Error("spatial-display: the anchor of a window belongs to the scene its display shows.");
    const camera = new TargetCamera(`${this.name}.window`, Vector3.Zero(), scene, false);
    camera.rotationQuaternion = new Quaternion();
    camera.doNotSerialize = true;
    // The same matrix is rewritten at every frame.
    const projection = new Matrix();
    camera.freezeProjectionMatrix(projection);
    this._texture.activeCamera = camera;
    const host = window.root.getScene();
    const state: IWindowState = { window, anchor, camera, projection, host, observer: null };
    // Babylon.js updates its cameras before this is notified: the viewer is the one of the frame about to be drawn.
    state.observer = host.onBeforeRenderObservable.add(() => this.updateWindow());
    this.windowState = state;
    this.clock.invalidate();
  }

  /** Changes the size of the image, in pixels. The texture stays the same object. */
  override resize(width: number, height: number): void {
    if (this.disposed) return;
    const size = atLeastOnePixel({ width, height });
    super.resize(size.width, size.height);
  }

  protected override onResized(): void {
    const { width, height } = this.resolution;
    this._texture.resize({ width, height });
    this.rightEye?.texture.resize({ width, height });
    this.clock.invalidate();
    this.onChangedObservable.notifyObservers({ kind: "resolution" });
  }

  /** Draws the image again at the next frame: what a "manual" refresh waits for. */
  invalidate(): void {
    this.clock.invalidate();
  }

  addSurface(mesh: AbstractMesh): void {
    if (this.disposed || this.surfaces.has(mesh)) return;
    const engine = mesh.getScene().getEngine();
    // Only the meshes with a geometry of their own tell when they are drawn.
    const observable = (mesh as Partial<Pick<Mesh, "onBeforeRenderObservable">>).onBeforeRenderObservable ?? null;
    // A surface counts as on screen when it enters, so that its first image gets drawn.
    const watch: ISurfaceWatch = { observable, observer: null, drawnAt: engine.frameId };
    if (observable) {
      watch.observer = observable.add(() => {
        watch.drawnAt = engine.frameId;
      });
    }
    this.surfaces.set(mesh, watch);
  }

  removeSurface(mesh: AbstractMesh): void {
    const watch = this.surfaces.get(mesh);
    if (!watch) return;
    this.surfaces.delete(mesh);
    if (watch.observer) watch.observable?.remove(watch.observer);
  }

  /** @internal Called by the hub of the source scene at the beginning of every frame. */
  prepareFrame(deltaSeconds: number, frameId: number): boolean {
    const due = this.decide(deltaSeconds, frameId);
    if (!this.windowState && !this.lensState) return due;
    // A window and a lens are drawn later in the frame, once the place of their viewer is known.
    this.windowDue = due;
    return false;
  }

  /** Whether the image is to be drawn at this frame; sets the render target accordingly. */
  private decide(deltaSeconds: number, frameId: number): boolean {
    // The two images of a viewer who has two eyes are drawn together, or not at all.
    const textures = this.rightEye ? [this._texture, this.rightEye.texture] : [this._texture];
    const active = !this.paused && this.isWatched(frameId);
    if (active && !this.windowState && !this.lensState) {
      // Babylon.js updates the cameras it renders the scene with, and no other.
      const scene = this._camera.getScene();
      if (scene.activeCamera !== this._camera && !scene.activeCameras?.includes(this._camera)) this._camera.update();
    }
    if (this.clock.refresh === "frame") {
      const rate = active ? RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME : RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
      for (const texture of textures) if (texture.refreshRate !== rate) texture.refreshRate = rate;
      return active;
    }
    // A texture is drawn once each time its counter is reset.
    for (const texture of textures) {
      if (texture.refreshRate !== RenderTargetTexture.REFRESHRATE_RENDER_ONCE) texture.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    }
    if (!active) {
      // Due as soon as a surface shows again.
      this.clock.invalidate();
      return false;
    }
    if (!this.clock.tick(deltaSeconds)) return false;
    for (const texture of textures) texture.resetRefreshCounter();
    return true;
  }

  /** Releases the texture. Surfaces that showed the display are notified with "disposed". */
  override dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of [...this.surfaces.keys()]) this.removeSurface(mesh);
    this.clearWindow();
    this.clearLens();
    this.detachSource();
    this.onChangedObservable.notifyObservers({ kind: "disposed" });
    this.onChangedObservable.clear();
  }

  /** Back to a screen: the display draws with the camera it was given. */
  private clearWindow(): void {
    const state = this.windowState;
    if (!state) return;
    this.windowState = null;
    this.windowDue = false;
    if (state.observer) state.host.onBeforeRenderObservable.remove(state.observer);
    this._texture.activeCamera = this._camera;
    state.camera.dispose();
    this.dropRightEye();
  }

  /** No longer a lens: the display draws with the camera it was given. */
  private clearLens(): void {
    const state = this.lensState;
    if (!state) return;
    this.lensState = null;
    this.windowDue = false;
    if (state.observer) state.lens.scene.onBeforeRenderObservable.remove(state.observer);
    this._texture.activeCamera = this._camera;
    state.camera.dispose();
    this.dropRightEye();
  }

  /**
   * The image and the camera of the right eye, made when a viewer who has two
   * eyes is first met. The surfaces are told: they read another image there.
   */
  private ensureRightEye(kind: "window" | "lens"): IRightEye {
    if (this.rightEye) return this.rightEye;
    const scene = this._camera.getScene();
    const camera = new TargetCamera(`${this.name}.${kind}.right`, Vector3.Zero(), scene, false);
    camera.rotationQuaternion = new Quaternion();
    camera.doNotSerialize = true;
    // The same matrix is rewritten at every frame.
    const projection = new Matrix();
    camera.freezeProjectionMatrix(projection);
    const texture = this.createTexture(camera, `${this.name}.right`);
    this.rightEye = { texture, camera, projection, transform: Matrix.Identity() };
    this.onChangedObservable.notifyObservers({ kind: "mapping" });
    return this.rightEye;
  }

  /** One image is enough again: the viewer has one eye, or the display is a screen. Returns null. */
  private dropRightEye(): null {
    const eye = this.rightEye;
    if (!eye) return null;
    this.rightEye = null;
    // Removes the texture from the custom render targets of its scene too.
    eye.texture.dispose();
    eye.camera.dispose();
    if (!this.disposed) this.onChangedObservable.notifyObservers({ kind: "mapping" });
    return null;
  }

  /**
   * Makes the camera of the lens a copy of the one of the viewer: same place,
   * same direction, same projection, and an image of the size of their screen.
   * Then draws the image, for a scene the display renders itself.
   */
  private updateLens(): void {
    const state = this.lensState;
    if (!state || this.disposed) return;
    const { lens } = state;
    const viewer = lens.scene.activeCamera;
    if (!viewer) return;
    // A viewer who has two eyes gets an image for each: the display copies the camera of each eye.
    const eyes = eyesOf(viewer);
    const right = eyes ? this.ensureRightEye("lens") : this.dropRightEye();
    const sight = eyes ? eyes[0] : viewer;

    // The image is the screen of the viewer, or the share of it one eye is given: it has its proportions, which the
    // projection copied below needs.
    const engine = lens.scene.getEngine();
    const scale = Math.min(2, Math.max(0.1, lens.scale ?? 1));
    const width = engine.getRenderWidth() * sight.viewport.width * scale;
    const height = engine.getRenderHeight() * sight.viewport.height * scale;
    // Never above what the engine can allocate.
    const fit = Math.min(1, engine.getCaps().maxTextureSize / Math.max(width, height, 1));
    this.resize(width * fit, height * fit);

    this.copyEye(state, sight, state.camera, state.projection, state.transform);
    if (eyes && right) this.copyEye(state, eyes[1], right.camera, right.projection, right.transform);

    if (this.windowDue && this.driven) {
      this.windowDue = false;
      this.hub.render();
    }
  }

  /** Makes `camera` a copy of `viewer`, an eye of the viewer of a lens, and writes how a surface reads its image. */
  private copyEye(state: ILensState, viewer: Camera, camera: TargetCamera, projection: Matrix, transform: Matrix): void {
    const { lens, anchor } = state;
    // Where the viewer stands, brought from the frame of `lens.root` to the frame of the anchor when they are given.
    let world = viewer.getWorldMatrix();
    if (lens.root) {
      lens.root.computeWorldMatrix(true).invertToRef(TMP_MATRIX);
      world = world.multiplyToRef(TMP_MATRIX, TMP_WORLD);
    }
    if (anchor) world = world.multiplyToRef(anchor.computeWorldMatrix(true), TMP_MATRIX);
    const rotation = camera.rotationQuaternion as Quaternion;
    // The rotation of a world matrix is the rotation of its camera as it is: a camera of a right-handed scene looks along its -z.
    world.decompose(TMP_SCALE, rotation, camera.position);
    // Babylon.js works out the up of a camera from its rotation only now and then: given here, a viewer who rolls is followed.
    UP.rotateByQuaternionToRef(rotation, camera.upVector);

    projection.copyFrom(viewer.getProjectionMatrix());
    camera.minZ = viewer.minZ;
    camera.maxZ = viewer.maxZ;
    camera.layerMask = this._camera.layerMask;
    // A point of a surface is read in the image where the viewer sees it: their own transform, whatever the anchor.
    if (lens.scene.floatingOriginMode) {
      // A scene with a floating origin counts positions from the eye of its camera, and Babylon.js hands the shader
      // of a surface a world matrix counted from there. The transform reads the points of the surface the same way:
      // it turns as the viewer does, and no longer moves them.
      TMP_VIEW.copyFrom(viewer.getViewMatrix()).setTranslationFromFloats(0, 0, 0);
      TMP_VIEW.multiplyToRef(viewer.getProjectionMatrix(), transform);
    } else viewer.getViewMatrix().multiplyToRef(viewer.getProjectionMatrix(), transform);
  }

  /**
   * Places the camera of the window where the eye of the viewer stands, seen
   * from the opening, and skews its frustum through the edges of the opening.
   * Then draws the image, for a scene the display renders itself.
   */
  private updateWindow(): void {
    const state = this.windowState;
    if (!state || this.disposed) return;
    const viewer = state.host.activeCamera;
    const { width, height } = state.window;
    if (!viewer || !(width > 0) || !(height > 0)) return;
    // A viewer who has two eyes gets an image for each: each eye looks through the opening from its own place.
    const eyes = eyesOf(viewer);
    // From behind there is nothing to look through: the last image stays.
    if (!this.placeEye(state, eyes ? eyes[0] : viewer, state.camera, state.projection)) return;
    const right = eyes ? this.ensureRightEye("window") : this.dropRightEye();
    if (eyes && right) this.placeEye(state, eyes[1], right.camera, right.projection);

    if (this.windowDue && this.driven) {
      this.windowDue = false;
      this.hub.render();
    }
  }

  /**
   * Places `camera` where `viewer`, an eye of the viewer of a window, stands as
   * seen from the opening, and skews its frustum through the edges of the
   * opening. False for an eye that stands behind the opening: nothing is changed.
   */
  private placeEye(state: IWindowState, viewer: Camera, camera: TargetCamera, projection: Matrix): boolean {
    const { window, anchor } = state;
    const { width, height } = window;

    // The eye in the frame of the opening. Its front is toward -z in a left-handed scene, toward +z in a right-handed one.
    window.root.computeWorldMatrix(true).invertToRef(TMP_MATRIX);
    // Babylon.js works out the place of a camera with its view: asked for here, the place is the one of this frame.
    viewer.getViewMatrix();
    const eye = Vector3.TransformCoordinatesToRef(viewer.globalPosition, TMP_MATRIX, TMP_EYE);
    const front = state.host.useRightHandedSystem ? eye.z : -eye.z;
    if (!(front > 1e-6)) return false;

    // The same place in the scene the display shows, which lies behind the opening: toward +z when left-handed, -z when right-handed.
    const scene = this._camera.getScene();
    const rightHanded = scene.useRightHandedSystem;
    camera.position.set(eye.x, eye.y, rightHanded ? front : -front);
    const rotation = camera.rotationQuaternion as Quaternion;
    let scale = 1;
    if (anchor) {
      Vector3.TransformCoordinatesToRef(camera.position, anchor.computeWorldMatrix(true), camera.position);
      rotation.copyFrom(anchor.absoluteRotationQuaternion);
      // An anchor scales the world against the opening: a scale of 2 shows it twice as large. Its three axes are taken as equal.
      scale = Math.abs(anchor.absoluteScaling.x) || 1;
    } else {
      rotation.set(0, 0, 0, 1);
    }

    const distance = front * scale;
    const near = Math.max(distance * WINDOW_NEAR_RATIO, WINDOW_MIN_NEAR * scale);
    const far = Math.max(this._camera.maxZ > 0 ? this._camera.maxZ : WINDOW_DEFAULT_FAR, near * 2);
    const frustum = windowFrustum({ x: eye.x * scale, y: eye.y * scale, distance }, width * scale, height * scale, near);
    windowProjection(frustum, { near, far, rightHanded, halfZRange: scene.getEngine().isNDCHalfZRange }, TMP_PROJECTION);
    Matrix.FromArrayToRef(TMP_PROJECTION, 0, projection);
    camera.minZ = near;
    camera.maxZ = far;
    camera.layerMask = this._camera.layerMask | WINDOW_LAYER_MASK;
    return true;
  }

  private isWatched(frameId: number): boolean {
    if (!this.pauseWhenHidden || this.surfaces.size === 0) return true;
    for (const [mesh, watch] of this.surfaces) {
      // A surface that does not tell when it is drawn counts as on screen while it is enabled.
      if (mesh.isEnabled() && (!watch.observable || frameId - watch.drawnAt <= HIDDEN_AFTER_FRAMES)) return true;
    }
    return false;
  }

  private createTexture(camera: Camera, name = this.name): RenderTargetTexture {
    const scene = camera.getScene();
    const options = this.options;
    const mipmaps = options.mipmaps ?? false;
    const { width, height } = this.resolution;
    const texture = new RenderTargetTexture(name, { width, height }, scene, {
      generateMipMaps: mipmaps,
      samplingMode: mipmaps ? Texture.TRILINEAR_SAMPLINGMODE : Texture.BILINEAR_SAMPLINGMODE,
      samples: options.samples ?? 1,
    });
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    texture.activeCamera = camera;
    // Without a predicate a render target draws the meshes the scene kept for its own camera.
    // A surface of this display stays out of its image: a texture cannot be sampled while it is drawn into.
    const include = options.include;
    texture.renderListPredicate = (mesh) => !this.surfaces.has(mesh) && (include ? include(mesh) : true);
    this.applyClearColor(texture);
    if (options.postProcesses) texture.useCameraPostProcesses = true;
    // Notified once the list of what the image shows is made, and before any of it is drawn.
    texture.onBeforeBindObservable.add(() => this.applyOverride(texture));
    scene.customRenderTargets.push(texture);
    return texture;
  }

  /** Gives the meshes of the image the material they are drawn with in it, which Babylon.js keeps apart from their own. */
  private applyOverride(texture: RenderTargetTexture): void {
    const override = this._overrideMaterial;
    const meshes = texture.renderList;
    if (!meshes || (!override && !this.overridden)) return;
    for (const mesh of meshes) {
      // What a portal sets behind its opening is light, not a body: it keeps its own look.
      const material = override && mesh.layerMask !== WINDOW_LAYER_MASK ? (typeof override === "function" ? override(mesh) : override) : null;
      texture.setMaterialForRendering(mesh, material ?? undefined);
    }
    this.overridden = override !== null;
  }

  private applyClearColor(texture: RenderTargetTexture): void {
    const c = this._clearColor;
    // As every color of the image, the background is stored multiplied by its alpha.
    // Without a color of its own, a render target clears with the one of its scene.
    (texture as { clearColor: Color4 | undefined }).clearColor = c ? new Color4(c.r * c.a, c.g * c.a, c.b * c.a, c.a) : undefined;
    // What a surface reads to know whether the image has see-through parts.
    texture.hasAlpha = c !== null && c.a < 1;
  }

  private attachSource(scene: Scene): SourceHub {
    const hub = SourceHub.acquire(scene);
    hub.add(this);
    this.sceneDisposeObserver = scene.onDisposeObservable.add(() => this.dispose());
    return hub;
  }

  private detachSource(): void {
    const scene = this._camera.getScene();
    if (this.sceneDisposeObserver) scene.onDisposeObservable.remove(this.sceneDisposeObserver);
    this.sceneDisposeObserver = null;
    this.hub.remove(this);
    // Removes the texture from the custom render targets of its scene too.
    this._texture.dispose();
    this.dropRightEye();
  }
}

/**
 * The cameras of the two eyes of a viewer who has two, the left one first:
 * the camera of a headset, or a stereoscopic one. null for a viewer with one eye.
 */
function eyesOf(viewer: Camera): [Camera, Camera] | null {
  const rig = viewer.rigCameras;
  if (rig.length < 2) return null;
  const left = rig.find((camera) => camera.isLeftCamera) ?? rig[0];
  const right = rig.find((camera) => camera.isRightCamera) ?? rig[1];
  return left && right && left !== right ? [left, right] : null;
}

/** A render target cannot have an empty side. */
function atLeastOnePixel(size: Readonly<ISize2>): ISize2 {
  return { width: Math.max(1, Math.round(size.width)), height: Math.max(1, Math.round(size.height)) };
}
