import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Color4 } from "@babylonjs/core/Maths/math.color.js";
import type { IColor4Like } from "@babylonjs/core/Maths/math.like.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Observable, type Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { RefreshClock, type DisplayRefresh, type ISize2 } from "@spacexr/spatial-display-core";
import type { IDisplayChange, ITextureDisplay } from "./display.js";
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
  /** Background of the image. Default: the clear color of the source scene. An alpha of 0 leaves it see-through for a surface that uses the alpha of the image. */
  clearColor?: IColor4Like;
  /** Applies the post-processes of the camera to the image. Default false. */
  postProcesses?: boolean;
  /** Name of the texture. Default "display". */
  name?: string;
}

interface ISurfaceWatch {
  observer: Observer<Mesh> | null;
  /** Frame of the engine at which the surface was last drawn. */
  drawnAt: number;
}

/** A surface drawn this many frames ago still counts as on screen: scenes are not all rendered at every frame. */
const HIDDEN_AFTER_FRAMES = 2;

const DEFAULT_RESOLUTION: Readonly<ISize2> = { width: 1280, height: 720 };

/**
 * A display that shows what a camera sees: the camera is drawn into a render
 * target, which any material samples as a texture.
 *
 * The image is the one of a screen: it does not depend on who looks at the
 * surface, and one draw serves every viewer, both eyes of a headset included.
 */
export class CameraDisplay implements ITextureDisplay, ISourceHubClient {
  readonly onChangedObservable = new Observable<IDisplayChange>();
  /** Stops the drawing of the image. The last one stays on the surfaces. */
  paused = false;
  /** See `ICameraDisplayOptions.pauseWhenHidden`. */
  pauseWhenHidden: boolean;

  private readonly name: string;
  private readonly options: Readonly<ICameraDisplayOptions>;
  private readonly size: ISize2;
  private readonly clock: RefreshClock;
  private readonly surfaces = new Map<AbstractMesh, ISurfaceWatch>();
  private _camera: Camera;
  private _texture: RenderTargetTexture;
  private _drive: DisplayDrive;
  private hub: SourceHub;
  private sceneDisposeObserver: Observer<Scene> | null = null;
  private disposed = false;

  constructor(options: Readonly<ICameraDisplayOptions>) {
    this.options = options;
    this.name = options.name ?? "display";
    this.size = sanitize(options.resolution ?? DEFAULT_RESOLUTION);
    this.clock = new RefreshClock(options.refresh ?? "frame");
    this.pauseWhenHidden = options.pauseWhenHidden ?? true;
    this._drive = options.drive ?? "app";
    this._camera = options.camera;
    this._texture = this.createTexture(options.camera);
    this.hub = this.attachSource(options.camera.getScene());
  }

  /** What a material samples to show the display. Another object after the camera moved to another scene. */
  get texture(): RenderTargetTexture {
    return this._texture;
  }

  get resolution(): Readonly<ISize2> {
    return this.size;
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
      this._texture.activeCamera = value;
      this.clock.invalidate();
      return;
    }
    if (scene.getEngine() !== this._camera.getScene().getEngine()) {
      throw new Error("spatial-display: the camera of a display cannot move to a scene of another engine.");
    }
    // A render target belongs to the scene it draws.
    this.detachSource();
    this._camera = value;
    this._texture = this.createTexture(value);
    this.hub = this.attachSource(scene);
    this.clock.invalidate();
    this.onChangedObservable.notifyObservers({ kind: "texture" });
  }

  /** Changes the size of the image. The texture stays the same object. */
  resize(width: number, height: number): void {
    const size = sanitize({ width, height });
    if (this.disposed || (size.width === this.size.width && size.height === this.size.height)) return;
    this.size.width = size.width;
    this.size.height = size.height;
    this._texture.resize(size);
    this.clock.invalidate();
    this.onChangedObservable.notifyObservers({ kind: "resolution" });
  }

  /** Draws the image again at the next frame: what a "manual" refresh waits for. */
  invalidate(): void {
    this.clock.invalidate();
  }

  addSurface(mesh: Mesh): void {
    if (this.disposed || this.surfaces.has(mesh)) return;
    const engine = mesh.getScene().getEngine();
    // A surface counts as on screen when it enters, so that its first image gets drawn.
    const watch: ISurfaceWatch = { observer: null, drawnAt: engine.frameId };
    watch.observer = mesh.onBeforeRenderObservable.add(() => {
      watch.drawnAt = engine.frameId;
    });
    this.surfaces.set(mesh, watch);
  }

  removeSurface(mesh: Mesh): void {
    const watch = this.surfaces.get(mesh);
    if (!watch) return;
    this.surfaces.delete(mesh);
    if (watch.observer) mesh.onBeforeRenderObservable.remove(watch.observer);
  }

  /** @internal Called by the hub of the source scene at the beginning of every frame. */
  prepareFrame(deltaSeconds: number, frameId: number): boolean {
    const texture = this._texture;
    const active = !this.paused && this.isWatched(frameId);
    if (active) {
      // Babylon.js updates the cameras it renders the scene with, and no other.
      const scene = this._camera.getScene();
      if (scene.activeCamera !== this._camera && !scene.activeCameras?.includes(this._camera)) this._camera.update();
    }
    if (this.clock.refresh === "frame") {
      const rate = active ? RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME : RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
      if (texture.refreshRate !== rate) texture.refreshRate = rate;
      return active;
    }
    // The texture is drawn once each time its counter is reset.
    if (texture.refreshRate !== RenderTargetTexture.REFRESHRATE_RENDER_ONCE) texture.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    if (!active) {
      // Due as soon as a surface shows again.
      this.clock.invalidate();
      return false;
    }
    if (!this.clock.tick(deltaSeconds)) return false;
    texture.resetRefreshCounter();
    return true;
  }

  /** Releases the texture. Surfaces that showed the display are notified with "disposed". */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of [...this.surfaces.keys()]) this.removeSurface(mesh as Mesh);
    this.detachSource();
    this.onChangedObservable.notifyObservers({ kind: "disposed" });
    this.onChangedObservable.clear();
  }

  private isWatched(frameId: number): boolean {
    if (!this.pauseWhenHidden || this.surfaces.size === 0) return true;
    for (const [mesh, watch] of this.surfaces) {
      if (frameId - watch.drawnAt <= HIDDEN_AFTER_FRAMES && mesh.isEnabled()) return true;
    }
    return false;
  }

  private createTexture(camera: Camera): RenderTargetTexture {
    const scene = camera.getScene();
    const options = this.options;
    const mipmaps = options.mipmaps ?? false;
    const texture = new RenderTargetTexture(this.name, { width: this.size.width, height: this.size.height }, scene, {
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
    if (options.clearColor) {
      const c = options.clearColor;
      texture.clearColor = new Color4(c.r, c.g, c.b, c.a);
    }
    if (options.postProcesses) texture.useCameraPostProcesses = true;
    scene.customRenderTargets.push(texture);
    return texture;
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
  }
}

function sanitize(size: Readonly<ISize2>): ISize2 {
  return { width: Math.max(1, Math.round(size.width)), height: Math.max(1, Math.round(size.height)) };
}
