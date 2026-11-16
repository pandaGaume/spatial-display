import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import { Observable, type Observer } from "@babylonjs/core/Misc/observable.js";
import type { ISize2 } from "@spacexr/spatial-display-core";
import type { IDisplayChange, ITextureDisplay } from "./display.js";

export interface ITextureDisplayOptions {
  /**
   * True when the colors of the texture are already multiplied by its alpha.
   * Default false, which is right for pictures and videos as Babylon.js loads them.
   */
  premultipliedAlpha?: boolean;
  /** Disposes of the texture along with the display. Default false: the texture belongs to the application. */
  ownsTexture?: boolean;
}

/** A texture that tells when it is loaded, as `Texture` does. */
interface ILoadable {
  onLoadObservable: Observable<unknown>;
}

const isLoadable = (texture: object): texture is ILoadable => "onLoadObservable" in texture && texture.onLoadObservable instanceof Observable;

/**
 * A display made of a texture the application already has: a picture, a
 * video, a dynamic texture, the output of some other renderer.
 *
 * For a picture with transparent parts, set `texture.hasAlpha = true`, as for
 * any material of Babylon.js: surfaces then let those parts through.
 */
export class TextureDisplay implements ITextureDisplay {
  readonly onChangedObservable = new Observable<IDisplayChange>();
  readonly texture: BaseTexture;
  readonly premultipliedAlpha: boolean;

  private readonly size: ISize2 = { width: 0, height: 0 };
  private readonly ownsTexture: boolean;
  private loadObserver: Observer<unknown> | null = null;
  private disposed = false;

  constructor(texture: BaseTexture, options: Readonly<ITextureDisplayOptions> = {}) {
    this.texture = texture;
    this.premultipliedAlpha = options.premultipliedAlpha ?? false;
    this.ownsTexture = options.ownsTexture ?? false;
    this.readSize();
    // The size of a picture is known once it is loaded.
    if (isLoadable(texture)) {
      this.loadObserver = texture.onLoadObservable.add(() => {
        if (this.readSize()) this.onChangedObservable.notifyObservers({ kind: "resolution" });
      });
    }
  }

  /** Size of the texture, in pixels; zero until a picture is loaded. */
  get resolution(): Readonly<ISize2> {
    return this.size;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.loadObserver && isLoadable(this.texture)) this.texture.onLoadObservable.remove(this.loadObserver);
    this.loadObserver = null;
    if (this.ownsTexture) this.texture.dispose();
    this.onChangedObservable.notifyObservers({ kind: "disposed" });
    this.onChangedObservable.clear();
  }

  /** Reads the size of the texture; true when it changed. */
  private readSize(): boolean {
    const { width, height } = this.texture.getSize();
    if (width === this.size.width && height === this.size.height) return false;
    this.size.width = width;
    this.size.height = height;
    return true;
  }
}
