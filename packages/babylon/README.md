[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

# @spacexr/spatial-display-babylon

Displays for Babylon.js scenes. A display shows an image as a texture: the view of a camera of any scene, a picture, a video. Any mesh can show it, in the scene of that camera or in another one. A `Portal` is the ready-made surface: a flat rectangle, the wall of a cylinder or a mesh of the application, which wears a frame, a line of light and a glow when asked.

Built on [`@spacexr/spatial-display-core`](https://www.npmjs.com/package/@spacexr/spatial-display-core). WebGL2 and WebGPU: the two materials carry their shaders in GLSL and in WGSL.

Try it in the Babylon.js Playground: [an x-ray all around an object](https://playground.babylonjs.com/#F9VTYN#0), and [an x-ray screen that sees through a wall](https://playground.babylonjs.com/#816LOC#1).

## Install

```bash
npm install @spacexr/spatial-display-babylon @spacexr/spatial-display-core
```

`@babylonjs/core` 9 is a peer dependency. The package imports Babylon.js module by module.

## Use

```ts
import { CameraDisplay, PortalBuilder, RectSurfaceBuilder, attachDisplay } from "@spacexr/spatial-display-babylon";

// The view of a camera. `world` is a scene the application never renders:
// the display renders it itself, and nothing of it reaches the canvas.
const display = new CameraDisplay({ camera: world.activeCamera!, drive: "display", resolution: { width: 1280, height: 720 } });

// In a portal: a surface that carries the display, and what it wears on its edges.
const portal = new PortalBuilder("gate", scene)
  .withSurface(new RectSurfaceBuilder({ width: 1.6, height: 0.9, display }))
  .withFrame()
  .withLight()
  .withGlow()
  .build();
portal.root.position.set(0, 1.5, 2);

// Or on any mesh that has texture coordinates.
attachDisplay(scene.getMeshByName("screen")!, display, { fit: "cover" });
```

There is nothing to call in the render loop: a display hooks itself to the engine and to the scenes it needs.

## Building a portal

| Step | What it sets | Default |
|---|---|---|
| `withSurface(surface)` | what the portal shows its image on: a mesh of the application, or a builder of surfaces. The surface carries its display and the way to show it. | required |
| `withFrame(on, section?)` | a tube of square section along the edges of the surface | none |
| `withLight(on, color?)` | lights those edges: the frame becomes a line of light; with no frame, a hairline is drawn along them | none |
| `withGlow(glow)` | a glow on both sides of the edges: `true`, or its `color`, `size`, `intensity` | none |
| `build()` | the `Portal` | |

Three surfaces:

```ts
// A flat rectangle. It can be a window: see below.
new RectSurfaceBuilder({ width: 1.6, height: 0.9, display, opacity: 0.85 });

// The wall of a cylinder: a ring, framed on its two rims; or, with `arc`, a bent screen.
new CylinderSurfaceBuilder({ diameter: 1.7, height: 0.8, display, doubleSided: true });
new CylinderSurfaceBuilder({ diameter: 3.2, height: 0.8, arc: 0.18, facing: "inside", display });

// A mesh of the application, of any shape. The portal finds its open edges, and does not own it.
new MeshSurfaceBuilder(mesh, { display });
```

A portal changes at any time: `portal.setDimension(width, height)` in world units, `portal.display`, `portal.opacity`, `portal.framed`, `portal.lit`, `portal.glowing`, `portal.glowColor`, `portal.glowSize`. `portal.root` is the node the application places and parents. `portal.dispose()` releases what the portal built, and leaves its display and a mesh of the application as they were.

## Screen, window, lens

A display is a screen by default: its image is glued to the surface, whoever looks at it.

A flat rectangle can be a window: it gives onto the scene of its display, and the image follows the eye of the viewer, with parallax.

```ts
const anchor = new TransformNode("anchor", world);   // where the opening stands in the world
new RectSurfaceBuilder({ width: 2, height: 1.2, display, window: { anchor } });
```

A lens draws what the viewer sees, the way the display draws it, and a surface shows the part of that image it covers on screen. The surface can then have any shape: a ring around an object shows it from every side, as an x-ray with `overrideMaterial`.

```ts
display.setLens({ scene });
new CylinderSurfaceBuilder({ diameter: 1.7, height: 0.8, display, doubleSided: true });
```

## Transparency

What stands behind a surface shows through it by `1 - opacity * alpha of the pixel`. `opacity` applies to the whole image; `useImageAlpha` lets its transparent pixels through; `chromaKey: { color }` lets a color through, as the green of a green screen. A camera display with a see-through `clearColor` shows a scene with nothing where it is empty.

## Documentation

The [repository](https://github.com/pandaGaume/spatial-display#readme) holds the full documentation: how a camera display is drawn, the window and lens modes, layers and the x-ray of one scene, the limits, and three examples. [AGENTS.md](https://github.com/pandaGaume/spatial-display/blob/main/AGENTS.md) is a guide for coding agents that integrate a portal in an application.

## License

Apache-2.0. See [LICENSE](LICENSE).
