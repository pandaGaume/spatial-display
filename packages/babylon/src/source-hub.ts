import { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** A display, as the hub of its source scene sees it. */
export interface ISourceHubClient {
  /** True when the display renders its source scene itself. */
  readonly driven: boolean;
  /**
   * Called once at the beginning of every frame of the engine. Returns true
   * when the image of the display is to be drawn at this frame.
   */
  prepareFrame(deltaSeconds: number, frameId: number): boolean;
}

const HUBS = new WeakMap<Scene, SourceHub>();

/**
 * What the displays of one source scene share: the beat of the frame, and the
 * rendering of a scene the application does not render itself.
 *
 * Such a scene is rendered here with a camera that sees nothing, into a target
 * of one pixel: animations, physics, shadow maps and the observables of the
 * scene run as in any render, the displays are drawn as the custom render
 * targets they are, and nothing reaches the canvas.
 */
export class SourceHub {
  static acquire(scene: Scene): SourceHub {
    let hub = HUBS.get(scene);
    if (!hub) {
      hub = new SourceHub(scene);
      HUBS.set(scene, hub);
    }
    return hub;
  }

  private readonly clients = new Set<ISourceHubClient>();
  private observer: Observer<AbstractEngine> | null = null;
  private camera: Camera | null = null;
  private sink: RenderTargetTexture | null = null;
  /** Frame of the scene after the last render done here, to notice that the application renders it too. */
  private renderedFrame = -1;
  private warned = false;

  private constructor(private readonly scene: Scene) {}

  add(client: ISourceHubClient): void {
    this.clients.add(client);
    this.observer ??= this.scene.getEngine().onBeginFrameObservable.add(() => this.beginFrame());
  }

  remove(client: ISourceHubClient): void {
    this.clients.delete(client);
    if (this.clients.size > 0) return;
    if (this.observer) this.scene.getEngine().onBeginFrameObservable.remove(this.observer);
    this.observer = null;
    this.sink?.dispose();
    this.sink = null;
    this.camera?.dispose();
    this.camera = null;
    HUBS.delete(this.scene);
  }

  private beginFrame(): void {
    const scene = this.scene;
    if (scene.isDisposed) return;
    const engine = scene.getEngine();
    const deltaSeconds = engine.getDeltaTime() / 1000;
    const frameId = engine.frameId;
    let render = false;
    for (const client of this.clients) {
      if (client.prepareFrame(deltaSeconds, frameId) && client.driven) render = true;
    }
    if (render) this.render();
  }

  /** Renders the scene now, off the canvas: the displays whose image is due are drawn. */
  render(): void {
    const scene = this.scene;
    if (!this.warned && this.renderedFrame >= 0 && scene.getFrameId() !== this.renderedFrame) {
      this.warned = true;
      Logger.Warn(`spatial-display: a display renders the scene of its camera (drive: "display") and the application renders that scene too. Leave the default drive: "app".`);
    }
    const camera = (this.camera ??= this.createCamera());
    // The camera of the scene is swapped the way the render targets of Babylon.js swap it: without notifying
    // the change, which is undone before anything else runs. Outside of this call the scene keeps its camera.
    const previous = scene._activeCamera;
    scene._activeCamera = camera;
    try {
      scene.render();
    } finally {
      scene._activeCamera = previous;
    }
    this.renderedFrame = scene.getFrameId();
  }

  /** A camera that draws no mesh, into a target of its own. */
  private createCamera(): Camera {
    const scene = this.scene;
    const camera = new Camera("spatial-display.driver", Vector3.Zero(), scene, false);
    camera.layerMask = 0;
    camera.doNotSerialize = true;
    const sink = new RenderTargetTexture("spatial-display.sink", 1, scene, { generateMipMaps: false, generateDepthBuffer: false });
    camera.outputRenderTarget = sink;
    this.sink = sink;
    return camera;
  }
}
