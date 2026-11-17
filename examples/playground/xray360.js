// spatial-display: an x-ray all around an object, in one scene.
//
// A ring travels up and down a machine. The wall of the ring is a screen: it shows the machine as a wireframe,
// with the parts inside its hull, which the camera of the application never draws. Walk around: the image is
// right from every side.
//
// The display is a lens. Its camera copies the one of the viewer, and a surface shows the part of that image it
// covers on screen. So the surface can have any shape: the wall of a cylinder, which no flat window could be, a
// polygon that is bent and twisted and that circles the machine, or a sphere that closes on a part of it.
//
// The ring and the polygon are portals: the first on the wall of a cylinder the library builds, with a frame of
// light on its two rims, the second on a mesh of the application, whose edge the portal finds and lights.
//
// No mesh is copied: a mesh is drawn solid by the camera of the application and as a wireframe by the lens, from
// the same vertices.
//
// "spatial-display.js", the other file of this snippet, is the library, built to read Babylon.js from the BABYLON
// global of the Playground. Its sources and its documentation: https://github.com/pandaGaume/spatial-display
import { attachDisplay, CameraDisplay, CylinderSurfaceBuilder, MeshSurfaceBuilder, PortalBuilder } from "./spatial-display";

/** A layer the camera of the application does not draw: Babylon.js gives cameras and meshes the 28 bits below it. */
const HIDDEN_LAYER = 0x20000000;
const EVERYDAY_LAYERS = 0x0fffffff;

/** The corners of the polygon before it is bent: eight of them, one set back in a notch. x to the right, y upward. */
const CORNERS = [
  [0.78, -0.1],
  [0.52, 0.62],
  [0.22, 0.38],
  [0.02, 0.8],
  [-0.6, 0.55],
  [-0.8, -0.05],
  [-0.42, -0.7],
  [0.35, -0.72],
];

/** How far a point of the polygon is pushed toward the machine: the sides wrap around it, the sheet is twisted. */
const bend = (x, y) => 0.45 * x * x + 0.3 * x * y - 0.2 * y * y;

/** A polygon that is not flat, as a mesh of its own vertices: rings of points from the centre to the sides. Its front is toward -z. */
function createBentPolygon(name, scene, depth) {
  const rings = 8;
  const perSide = 6;
  const around = CORNERS.length * perSide;
  const positions = [0, 0, depth(0, 0)];
  // A surface needs texture coordinates, even though a lens does not read the image with them.
  const uvs = [0.5, 0.5];
  for (let ring = 1; ring <= rings; ring++) {
    for (let k = 0; k < around; k++) {
      const from = CORNERS[Math.floor(k / perSide)];
      const to = CORNERS[(Math.floor(k / perSide) + 1) % CORNERS.length];
      const along = (k % perSide) / perSide;
      const x = (ring / rings) * (from[0] + (to[0] - from[0]) * along);
      const y = (ring / rings) * (from[1] + (to[1] - from[1]) * along);
      positions.push(x, y, depth(x, y));
      uvs.push(0.5 + x / 1.7, 0.5 + y / 1.7);
    }
  }
  const at = (ring, k) => 1 + (ring - 1) * around + (k % around);
  const indices = [];
  for (let k = 0; k < around; k++) {
    indices.push(0, at(1, k), at(1, k + 1));
    for (let ring = 1; ring < rings; ring++) {
      indices.push(at(ring, k), at(ring + 1, k), at(ring + 1, k + 1), at(ring, k), at(ring + 1, k + 1), at(ring, k + 1));
    }
  }
  const data = new BABYLON.VertexData();
  data.positions = positions;
  data.indices = indices;
  data.uvs = uvs;
  const sheet = new BABYLON.Mesh(name, scene);
  data.applyToMesh(sheet);
  return sheet;
}

export const createScene = function (engine, canvas) {
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.05, 0.06, 0.09, 1);
  new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0.3, 1, -0.4), scene);

  const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2 - 0.5, 1.2, 7, new BABYLON.Vector3(0, 1.45, 0), scene);
  camera.wheelPrecision = 60;
  camera.minZ = 0.05;
  camera.attachControl(canvas, true);

  const solid = (name, color) => {
    const material = new BABYLON.StandardMaterial(name, scene);
    material.diffuseColor = color;
    material.specularColor = new BABYLON.Color3(0.12, 0.12, 0.12);
    return material;
  };

  // --- What everyone sees: a floor, a few crates, and the hull of a machine.
  const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 16, height: 16, subdivisions: 16 }, scene);
  ground.material = solid("ground", new BABYLON.Color3(0.2, 0.21, 0.25));

  const crates = solid("crates", new BABYLON.Color3(0.75, 0.5, 0.2));
  [[1.9, 1.2, 0.8], [-2.2, 0.6, 0.6], [0.6, -2.3, 0.7]].forEach(([x, z, size], i) => {
    const crate = BABYLON.MeshBuilder.CreateBox(`crate${i}`, { size }, scene);
    crate.position.set(x, size / 2, z);
    crate.rotation.y = 0.4 + i;
    crate.material = crates;
  });

  const shell = solid("shell", new BABYLON.Color3(0.56, 0.6, 0.66));
  const hull = [];
  const plate = (mesh) => {
    mesh.material = shell;
    hull.push(mesh);
    return mesh;
  };
  plate(BABYLON.MeshBuilder.CreateCylinder("base", { diameter: 1.5, height: 0.16, tessellation: 28 }, scene)).position.y = 0.08;
  plate(BABYLON.MeshBuilder.CreateCylinder("body", { diameter: 1.1, height: 2.2, tessellation: 28 }, scene)).position.y = 1.26;
  plate(BABYLON.MeshBuilder.CreateSphere("dome", { diameter: 1.1, segments: 14 }, scene)).position.y = 2.36;

  // --- What only the lens sees: the parts inside the hull, on a layer the camera of the application does not draw.
  const inside = [];
  const parts = solid("parts", new BABYLON.Color3(0.9, 0.5, 0.1));
  const hide = (mesh) => {
    mesh.layerMask = HIDDEN_LAYER;
    mesh.material = parts;
    inside.push(mesh);
    return mesh;
  };
  const knot = hide(BABYLON.MeshBuilder.CreateTorusKnot("core", { radius: 0.22, tube: 0.07, radialSegments: 96, tubularSegments: 10 }, scene));
  knot.position.y = 1.55;
  for (let i = 0; i < 5; i++) {
    hide(BABYLON.MeshBuilder.CreateTorus(`coil${i}`, { diameter: 0.8, thickness: 0.05, tessellation: 18 }, scene)).position.y = 0.45 + i * 0.11;
  }
  for (let i = 0; i < 3; i++) {
    const rod = hide(BABYLON.MeshBuilder.CreateCylinder(`rod${i}`, { diameter: 0.06, height: 2, tessellation: 10 }, scene));
    const angle = (i * 2 * Math.PI) / 3;
    rod.position.set(0.43 * Math.cos(angle), 1.26, 0.43 * Math.sin(angle));
  }
  hide(BABYLON.MeshBuilder.CreateSphere("tank", { diameter: 0.52, segments: 14 }, scene)).position.y = 2.3;
  const rotor = hide(BABYLON.MeshBuilder.CreateCylinder("rotor", { diameterTop: 0.2, diameterBottom: 0.56, height: 0.34, tessellation: 9 }, scene));
  rotor.position.y = 1.02;

  // --- The materials of the x-ray. They are not lit: a wireframe reads by its lines alone.
  const wire = (name, color) => {
    const material = new BABYLON.StandardMaterial(name, scene);
    material.wireframe = true;
    material.disableLighting = true;
    material.diffuseColor = BABYLON.Color3.Black();
    material.specularColor = BABYLON.Color3.Black();
    material.emissiveColor = color;
    return material;
  };
  const seenWire = wire("xray.seen", new BABYLON.Color3(0.16, 0.62, 0.78));
  const hiddenWire = wire("xray.hidden", new BABYLON.Color3(1, 0.62, 0.15));
  const xray = (mesh) => (mesh.layerMask === HIDDEN_LAYER ? hiddenWire : seenWire);

  // --- The lens. This camera is never the camera of the scene: it lends the lens its layers.
  const scanner = new BABYLON.FreeCamera("xray.scanner", BABYLON.Vector3.Zero(), scene, false);
  scanner.layerMask = EVERYDAY_LAYERS | HIDDEN_LAYER;
  // A lens cuts nothing in front of its surface: what its image holds is picked here.
  const machine = new Set([...hull, ...inside]);
  let hullShown = true;
  const display = new CameraDisplay({
    camera: scanner,
    samples: 4,
    // Not quite opaque: the scene shows through, under the lines drawn of it.
    clearColor: { r: 0, g: 0.035, b: 0.07, a: 0.86 },
    overrideMaterial: xray,
    include: (mesh) => machine.has(mesh) && (hullShown || mesh.layerMask === HIDDEN_LAYER),
    name: "xray.display",
  });
  // The image is the one of the viewer of this scene, at the size of the canvas.
  display.setLens({ scene });

  // --- One lens, three surfaces: each shows the part of the same image it covers on screen.
  const rim = new BABYLON.Color3(0.55, 0.9, 1);
  const halo = { color: new BABYLON.Color3(0.1, 0.55, 1), size: 0.07, intensity: 1.1 };

  // The ring: a portal on the wall of a cylinder, with a frame of light on its two rims. It is sized through the
  // portal, which keeps the section of its frame, never by scaling its node.
  const ring = new PortalBuilder("ring", scene)
    .withSurface(new CylinderSurfaceBuilder({ diameter: 1.7, height: 0.75, display, doubleSided: true }))
    .withFrame()
    .withLight(true, rim)
    .withGlow(halo)
    .build();

  // The polygon: a mesh of its own vertices, bent toward the machine. The portal takes it as it is, finds its
  // edge and lights it. The front of the sheet is toward the -z of its node, which is kept turned away from the
  // machine.
  const panel = new BABYLON.TransformNode("panel", scene);
  const sheet = createBentPolygon("panel.sheet", scene, bend);
  sheet.parent = panel;
  const polygon = new PortalBuilder("polygon", scene)
    .withSurface(new MeshSurfaceBuilder(sheet, { display, doubleSided: true }))
    .withLight(true, rim)
    .withGlow(halo)
    .build();

  // The sphere: a bubble around a part of the machine. A closed mesh has no edge to frame: it needs no portal.
  const bubble = BABYLON.MeshBuilder.CreateSphere("bubble", { diameter: 1, segments: 32 }, scene);
  const surfaces = [ring, polygon, attachDisplay(bubble, display, { doubleSided: true })];

  // --- The surface that shows, and where it stands.
  const radius = 0.85;
  const size = 0.75;
  let shape = "ring";
  let moving = true;
  let height = 1.4;
  /** Where the polygon stands around the machine, in radians. It starts between the viewer and the machine. */
  let turn = -2.35;
  const place = () => {
    ring.root.setEnabled(shape === "ring");
    panel.setEnabled(shape === "polygon");
    bubble.setEnabled(shape === "sphere");
    // The ring: its width is the length of its turn, and `size` the height of its wall.
    ring.root.position.y = height;
    ring.setDimension(2 * Math.PI * radius, size);
    // The polygon: in front of the hull, its -z turned away from the machine.
    const distance = radius + 0.4;
    panel.position.set(distance * Math.sin(turn), height, distance * Math.cos(turn));
    panel.rotation.y = turn + Math.PI;
    // The sphere: around the axis of the machine.
    bubble.position.y = height;
    bubble.scaling.set(2 * radius, 2 * radius, 2 * radius);
  };
  place();

  let time = 0;
  scene.onBeforeRenderObservable.add(() => {
    const seconds = engine.getDeltaTime() / 1000;
    knot.rotation.y += seconds * 0.6;
    rotor.rotation.y -= seconds * 1.7;
    if (!moving) return;
    time += seconds;
    // The ring and the sphere go up and down the whole machine; the polygon also circles it.
    if (shape === "polygon") turn += seconds * 0.35;
    height = 1.4 + (shape === "polygon" ? 0.6 : 1.05) * Math.sin(time * 0.6);
    place();
  });

  // --- Controls. The interface is drawn over the canvas: it is in no image of a display.
  const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
  const controls = new BABYLON.GUI.StackPanel("controls");
  controls.width = "230px";
  controls.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  controls.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
  controls.paddingLeft = "12px";
  controls.paddingTop = "12px";
  ui.addControl(controls);
  const row = (control, label) => {
    control.width = "18px";
    control.height = "18px";
    control.color = "#6fb6ff";
    control.background = "#0a1224";
    const header = BABYLON.GUI.Control.AddHeader(control, label, "190px", { isHorizontal: true, controlFirst: true });
    header.height = "28px";
    header.color = "#cfe6ff";
    header.fontSize = 14;
    header.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    controls.addControl(header);
  };
  const pick = (label, value) => {
    const button = new BABYLON.GUI.RadioButton(label);
    button.group = "shape";
    button.isChecked = shape === value;
    button.onIsCheckedChangedObservable.add((checked) => {
      if (!checked) return;
      shape = value;
      place();
    });
    row(button, label);
  };
  const check = (label, checked, onChange) => {
    const box = new BABYLON.GUI.Checkbox(label);
    box.isChecked = checked;
    box.onIsCheckedChangedObservable.add(onChange);
    row(box, label);
  };
  pick("Ring", "ring");
  pick("Polygon, not flat", "polygon");
  pick("Sphere", "sphere");
  check("Move the surface", true, (value) => (moving = value));
  // With its back face, a surface also shows from behind: the far half of the ring, seen over the near one.
  check("Back face", true, (value) => {
    for (const surface of surfaces) surface.doubleSided = value;
  });
  check("See hidden parts", true, (value) => (scanner.layerMask = value ? EVERYDAY_LAYERS | HIDDEN_LAYER : EVERYDAY_LAYERS));
  check("See the hull", true, (value) => (hullShown = value));

  return scene;
};
