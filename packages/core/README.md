[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

# @spacexr/spatial-display-core

Contract and math of displays for 3D scenes, with no rendering library: what a display is, how its image fits a surface, when it is drawn again, and the geometry of the frame a surface can wear.

No dependencies, no DOM.

## Install

```bash
npm install @spacexr/spatial-display-core
```

With Babylon.js, add [`@spacexr/spatial-display-babylon`](https://www.npmjs.com/package/@spacexr/spatial-display-babylon), which draws all of this: the view of a camera on any mesh, and a portal with a frame of light. An application that uses the adapter imports from the core only for types.

## What it holds

| Part | Job |
|---|---|
| `IDisplay`, `IPhysicalDisplay` | the contract: an image of a size in pixels, and a rectangle of the world it covers |
| `Display`, `PhysicalDisplay` | base classes of that contract; a subclass adds what draws them |
| `IOutline`, `createRectOutline`, `createCylinderOutlines`, `createMeshOutlines` | the lines a frame runs along: around a rectangle, on the rims of a cylinder, on the open edges of any mesh of triangles |
| `createFrame`, `createFrameHalo` | vertex data of a tube of square section along those lines, and of the ribbons a shader spreads into a glow around it |
| `createCylinderWall` | vertex data of a ring, or of a bent screen |
| `createRectTunnel` | walls of light behind a window |
| `fitUv`, `DisplayFit` | how an image fills a surface of other proportions: stretch, contain, cover |
| `windowFrustum`, `windowProjection` | off-axis projection of a window: what a viewer sees through an opening |
| `RefreshClock`, `DisplayRefresh` | when an image is drawn again: every frame, at a rate, on demand |

## A display with a place in the world

`PhysicalDisplay` keeps two sizes apart: the image, in pixels, and the rectangle it covers, in world units. A subclass adds the objects that draw it and keeps them in step through two hooks:

```ts
import { PhysicalDisplay } from "@spacexr/spatial-display-core";

class Billboard extends PhysicalDisplay {
  protected override onDimensionChanged(): void {
    // The rectangle changed size: move the vertices.
  }
  protected override onResized(): void {
    // The image changed size: allocate another texture.
  }
}

const board = new Billboard({ width: 1.6, height: 0.9, pixelsPerUnit: 800 });
board.resolution;         // { width: 1280, height: 720 }
board.setDimension(2, 1); // the image follows, to keep 800 pixels per unit
board.dpi;                // pixels per inch, a world unit being a meter
```

## The frame of a surface

An outline is a line on the edge of a surface: its points, the way out of the surface at each of them, and the normal of the surface there. A frame is built along any number of outlines, and resized by rewriting its vertices:

```ts
import { createFrame, createFrameHalo, createRectOutline, writeFrame, writeRectOutline } from "@spacexr/spatial-display-core";

const outline = createRectOutline(1.6, 0.9);
const tube = createFrame([outline], 0.012);      // positions, normals, uvs, indices
const halo = createFrameHalo([outline], 0.012);  // anchors of the glow, for a shader

writeRectOutline(outline, 2, 1.2);               // another size: nothing is allocated
writeFrame([outline], 0.012, tube.positions, tube.normals, tube.uvs);
```

`createCylinderOutlines` gives the two rims of a ring, or the edge of a bent screen. `createMeshOutlines(positions, indices)` finds the open edges of a mesh: vertices that stand at the same place are taken as one, so a seam in its texture coordinates is not mistaken for an edge.

Arrays are plain typed arrays: 3 numbers per position, 2 per texture coordinate. Faces are wound as the vertex data of Babylon.js, which draws them facing outward in left- and right-handed scenes alike.

## Documentation

The [repository](https://github.com/pandaGaume/spatial-display#readme) explains how each part is used by the Babylon.js adapter, and what has been checked.

## License

Apache-2.0. See [LICENSE](LICENSE).
