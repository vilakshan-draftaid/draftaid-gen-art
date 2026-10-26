import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { animate } from 'motion';
import { buildModel, disposeModel } from './models.js';
import { buildAnnotations, disposeAnnotations, setOpacity, setAnnotationColor } from './annotations.js';
import { buildGrid, updateGrid, disposeGrid } from './grid.js';
import { createEdgePass } from './edgePass.js';
import { vectorSnapshot } from './vector.js';
import { VIEWS, SPRING, COLORS, DRAG } from './config.js';

const DISTANCE = 600;
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const AXIS_LABEL = { x: 'X axis', y: 'Y axis', z: 'Z axis' };

// 0 when off-axis, 1 when looking straight down an axis
const alignment = (dot) => THREE.MathUtils.smoothstep(Math.abs(dot), 0.94, 0.999);

function viewQuaternion(name) {
  const { dir, up } = VIEWS[name];
  const eye = new THREE.Vector3(...dir).normalize().multiplyScalar(DISTANCE);
  const m = new THREE.Matrix4().lookAt(eye, new THREE.Vector3(), new THREE.Vector3(...up));
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

// Copies the canvas, trimmed to its non-transparent pixels plus padding
function cropToContent(src, pad) {
  const { width: W, height: H } = src;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const data = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * 4 + 3] < 4) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(cv, -x0, -y0);
  return new Promise((res) => out.toBlob(res, 'image/png'));
}

export default function Viewer(props) {
  const { leadModel, viewMix, snapToken, apiRef } = props;
  const mountRef = useRef(null);
  const readoutRef = useRef(null);
  const ctx = useRef(null);

  // One-time setup
  useEffect(() => {
    const mount = mountRef.current;
    // preserveDrawingBuffer lets video export read each frame back
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.autoClear = false;
    renderer.domElement.style.touchAction = 'none';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const annoScene = new THREE.Scene(); // dimensions, kept out of the edge pass
    const gridScene = new THREE.Scene(); // drawn first, behind the part
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);
    scene.add(camera);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xa5a5a5, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(220, 320, 0); // rides with the camera, tilted up and right
    camera.add(key);

    const surface = new THREE.MeshStandardMaterial({
      color: COLORS.surface,
      roughness: 0.95,
      metalness: 0,
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const normalMaterial = new THREE.MeshNormalMaterial();

    const target = new THREE.WebGLRenderTarget(1, 1, {
      depthTexture: new THREE.DepthTexture(1, 1),
    });
    const edgePass = createEdgePass(target);
    edgePass.material.uniforms.near.value = camera.near;
    edgePass.material.uniforms.far.value = camera.far;

    const state = {
      renderer, scene, annoScene, camera, surface, target, edgePass,
      halfHeight: 120, models: {}, slots: null, modelName: '', anim: null,
      edgesOn: true, dimsInIso: false, viewName: undefined, targetQ: new THREE.Quaternion(),
      readout: '', gridScene,
      surfaceOpacity: 1, lineOpacity: 1, background: COLORS.background, detailColor: '#292929',
      gridOn: false, gridColor: '#d6d6d6', gridOpacity: 1,
    };

    state.applyDetailColor = () => {
      for (const m of Object.values(state.models)) setAnnotationColor(m.anno, state.detailColor, state.background);
    };

    state.applyQuaternion = (q) => {
      camera.quaternion.copy(q);
      camera.position.set(0, 0, DISTANCE).applyQuaternion(q);
    };

    state.updateFrustum = () => {
      const { w, h } = state.capture ?? { w: mount.clientWidth, h: mount.clientHeight };
      const aspect = w / Math.max(h, 1);
      const hh = state.halfHeight;
      camera.left = -hh * aspect;
      camera.right = hh * aspect;
      camera.top = hh;
      camera.bottom = -hh;
      camera.updateProjectionMatrix();
    };

    // Models are built on first use and kept, so two can be on screen while crossfading
    state.getModel = (name) => {
      if (state.models[name]) return state.models[name];
      const m = buildModel(name, surface);
      const anno = buildAnnotations(m.dims, m.bbox);
      anno.group.position.copy(m.group.position);
      const grid = buildGrid(m.bbox, anno.radius);
      scene.add(m.group);
      annoScene.add(anno.group);
      gridScene.add(grid.group);
      const entry = { name, part: m.group, anno, grid, halfHeight: m.radius * 1.45 };
      state.models[name] = entry;
      setAnnotationColor(anno, state.detailColor, state.background);
      return entry;
    };

    state.disposeModels = () => {
      for (const m of Object.values(state.models)) {
        scene.remove(m.part);
        disposeModel(m.part);
        annoScene.remove(m.anno.group);
        disposeAnnotations(m.anno.group);
        gridScene.remove(m.grid.group);
        disposeGrid(m.grid.group);
      }
      state.models = {};
    };

    state.springTo = (name) => {
      state.anim?.stop();
      const from = camera.quaternion.clone();
      const to = state.targetQ;
      const q = new THREE.Quaternion();
      state.anim = animate(0, 1, {
        ...SPRING,
        onUpdate: (t) => state.applyQuaternion(q.slerpQuaternions(from, to, t)),
      });
    };

    const resize = () => {
      if (state.capture) return;
      const { clientWidth: w, clientHeight: h } = mount;
      renderer.setSize(w, h);
      const pr = renderer.getPixelRatio();
      target.setSize(Math.floor(w * pr), Math.floor(h * pr));
      edgePass.material.uniforms.resolution.value.set(w * pr, h * pr);
      state.updateFrustum();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    // Drag to rotate: grab the part, turn it under the cursor
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const canvas = renderer.domElement;
    const hitsPart = (e) => {
      const lead = state.lead;
      if (!lead) return false;
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObject(lead.part, true).length > 0;
    };
    let drag = null;
    const qa = new THREE.Quaternion();
    const qb = new THREE.Quaternion();
    const onDown = (e) => {
      if (!hitsPart(e)) return;
      state.anim?.stop();
      drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    };
    const onMove = (e) => {
      if (!drag) {
        canvas.style.cursor = hitsPart(e) ? 'grab' : '';
        return;
      }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      qa.setFromAxisAngle(up, -dx * DRAG.speed);
      qb.setFromAxisAngle(right, -dy * DRAG.speed);
      state.applyQuaternion(qb.multiply(qa).multiply(camera.quaternion).normalize());
    };
    const onUp = (e) => {
      if (!drag) return;
      drag = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      canvas.style.cursor = hitsPart(e) ? 'grab' : '';
    };
    const onDouble = () => state.springTo();
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('dblclick', onDouble);

    // Redraw labels once the brand font is ready
    document.fonts?.ready.then(() => state.disposeModels());

    const back = new THREE.Vector3();
    let raf;
    state.frame = () => {

      // How lined up are we with each axis?
      back.set(0, 0, 1).applyQuaternion(camera.quaternion);
      const al = { x: alignment(back.x), y: alignment(back.y), z: alignment(back.z) };
      const maxKey = ['x', 'y', 'z'].reduce((a, b) => (al[b] > al[a] ? b : a));
      const onAxis = al[maxKey];

      // Which models are showing, and how much of each
      if (!state.slots) return;
      const slots = state.slots.map((sl) => [state.getModel(sl.name), sl.surface, sl.lines]);
      state.lead = state.getModel(state.leadName);
      state.modelName = state.lead.name;

      // Framing stays on one model so switching models never zooms; the zoom dial multiplies on top
      const hh = state.getModel(state.frameModel ?? state.leadName).halfHeight;
      if (Math.abs(hh - state.halfHeight) > 1e-4) {
        state.halfHeight = hh;
        state.updateFrustum();
      }

      for (const m of Object.values(state.models)) {
        m.part.visible = false;
        m.anno.group.visible = false;
        m.grid.group.visible = false;
      }

      // Readout
      let label = 'Free rotation';
      if (state.viewName && camera.quaternion.angleTo(state.targetQ) < 0.01) label = VIEWS[state.viewName].label;
      else if (onAxis > 0.999) label = AXIS_LABEL[maxKey];
      const text = `${state.modelName}|${label}`;
      if (text !== state.readout && readoutRef.current) {
        state.readout = text;
        readoutRef.current.firstChild.textContent = state.modelName;
        readoutRef.current.lastChild.textContent = label;
      }

      renderer.setRenderTarget(null);
      renderer.setClearColor(state.background, state.transparent ? 0 : 1);
      renderer.clear();

      // Grids behind everything
      if (state.gridOn) {
        for (const [m, , wl] of slots) {
          m.grid.group.visible = true;
          updateGrid(m.grid, back, state.gridColor, state.gridOpacity * wl);
        }
        renderer.render(gridScene, camera);
      }

      for (const [m, ws, wl] of slots) {
        if (ws <= 0.001 && wl <= 0.001) continue;
        m.part.visible = true;

        // 1. normals + depth for edge detection
        renderer.setRenderTarget(target);
        renderer.setClearColor(0x000000, 1);
        renderer.clear();
        scene.overrideMaterial = normalMaterial;
        renderer.render(scene, camera);
        scene.overrideMaterial = null;

        // 2. shaded part; material fades out on an axis so only the drawing lines remain
        renderer.setRenderTarget(null);
        renderer.clearDepth();
        surface.opacity = state.surfaceOpacity * (1 - onAxis) * ws;
        surface.depthWrite = surface.opacity > 0.6;
        if (ws > 0.001) renderer.render(scene, camera);

        // 3. edge lines
        if (state.edgesOn) {
          edgePass.material.uniforms.opacity.value = wl * state.lineOpacity;
          renderer.render(edgePass.scene, edgePass.camera);
        }

        // 4. dimensions, each axis view shows its own; the toggle shows all off-axis
        const anno = m.anno;
        anno.group.visible = true;
        const iso = state.dimsInIso ? 1 - onAxis : 0;
        const lw = wl * state.lineOpacity;
        for (const k of ['x', 'y', 'z']) {
          const set = anno.sets[k];
          setOpacity(set, Math.max(al[k], iso) * lw);
          const flipped = back.dot(set.normal) < 0;
          if (flipped !== set.flipped) {
            set.flipped = flipped;
            set.labels.forEach((l) => { l.scale.x = flipped ? -1 : 1; });
          }
        }
        setOpacity(anno.box, 0); // glass box outline stays hidden
        renderer.render(annoScene, camera);

        m.part.visible = false;
        anno.group.visible = false;
      }
      state.lead.part.visible = true; // for picking
    };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!state.capture) state.frame();
    };
    loop();

    // Apply props (scene values for one moment in time)
    let last = {};
    state.apply = (p) => {
      state.slots = p.modelSlots;
      state.leadName = p.leadModel;
      state.frameModel = p.frameModel;

      // View: follow the timeline directly while it plays, scrubs or records,
      // otherwise spring the camera from wherever it is now
      const { from, to, t } = p.viewMix;
      if (from !== last.from || to !== last.to || t !== last.t || p.viewKey !== last.viewKey) {
        state.targetQ = viewQuaternion(from).slerp(viewQuaternion(to), t);
        const first = state.viewName === undefined;
        state.viewName = t >= 1 ? to : t <= 0 ? from : null;
        if (first || p.instant) {
          state.anim?.stop();
          state.applyQuaternion(state.targetQ);
        } else state.springTo();
      }

      // Turn: start from the selected view, then rotate the part about screen axes (q is in camera space)
      if (p.turn && p.turn.id !== last.turnId && last.turnId !== undefined) {
        const base = viewQuaternion(from).slerp(viewQuaternion(to), t);
        state.targetQ = base.multiply(new THREE.Quaternion(...p.turn.q).invert());
        state.viewName = null;
        state.springTo();
      }

      if (camera.zoom !== p.zoom) {
        camera.zoom = p.zoom;
        camera.updateProjectionMatrix();
      }
      state.dimsInIso = p.dimsInIso;

      const u = edgePass.material.uniforms;
      state.edgesOn = p.edges.visible;
      u.color.value.set(p.edges.color);
      u.thickness.value = p.edges.thickness * (state.capture?.lineScale ?? 1);
      state.lineOpacity = p.edges.opacity;

      // Details (dimensions) follow the edge color
      if (p.edges.color !== last.color || p.background !== last.background) {
        state.detailColor = p.edges.color;
        state.background = p.background;
        state.applyDetailColor();
      }

      surface.color.set(p.surface.color);
      state.surfaceOpacity = p.surface.opacity;
      state.gridOn = p.grid.visible;
      state.gridColor = p.grid.color;
      state.gridOpacity = p.grid.opacity;
      last = { from, to, t, viewKey: p.viewKey, turnId: p.turn?.id ?? null, color: p.edges.color, background: p.background };
    };

    // Video capture: render frames at a fixed size, off the screen loop
    const api = {
      canvas,
      begin(w, h) {
        state.anim?.stop();
        const screenH = mount.clientHeight * renderer.getPixelRatio();
        state.capture = { w, h, lineScale: h / Math.max(screenH, 1), pixelRatio: renderer.getPixelRatio() };
        renderer.setPixelRatio(1);
        renderer.setSize(w, h, false);
        target.setSize(w, h);
        edgePass.material.uniforms.resolution.value.set(w, h);
        state.updateFrustum();
      },
      render(p) {
        state.apply({ ...p, instant: true });
        state.frame();
      },
      end() {
        const pr = state.capture.pixelRatio;
        state.capture = null;
        renderer.setPixelRatio(pr);
        resize();
        if (state.props) state.apply({ ...state.props, instant: true }); // back to the editor's moment
      },
    };
    // Snapshots of the current orientation, background left transparent
    const still = (scale, fn) => {
      const w = mount.clientWidth, h = mount.clientHeight;
      const pr = renderer.getPixelRatio(), u = edgePass.material.uniforms;
      const thickness = u.thickness.value;
      state.capture = { w, h };
      state.transparent = true;
      renderer.setPixelRatio(1);
      renderer.setSize(w * scale, h * scale, false);
      target.setSize(w * scale, h * scale);
      u.resolution.value.set(w * scale, h * scale);
      u.thickness.value = thickness * scale / pr;
      state.updateFrustum();
      try {
        state.frame();
        return fn(w, h);
      } finally {
        u.thickness.value = thickness;
        state.transparent = false;
        state.capture = null;
        renderer.setPixelRatio(pr);
        resize();
      }
    };
    api.png = (scale = 2) => still(scale, () => cropToContent(canvas, 16 * scale));
    api.svg = (solid) => still(1, (w, h) => vectorSnapshot({
      renderer, scene, camera, w, h, lead: state.lead,
      faces: solid ? { color: surface.color, opacity: state.surfaceOpacity } : null,
      edges: { visible: state.edgesOn, color: '#' + edgePass.material.uniforms.color.value.getHexString(), thickness: state.props?.edges.thickness ?? 1, opacity: state.lineOpacity },
      transparent: true,
    }));
    if (apiRef) apiRef.current = api;

    ctx.current = state;
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      state.anim?.stop();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('dblclick', onDouble);
      state.disposeModels();
      target.dispose();
      renderer.dispose();
      mount.removeChild(canvas);
    };
  }, []);

  // Every render: push the current scene values in
  useEffect(() => {
    ctx.current.props = props;
    if (!ctx.current.capture) ctx.current.apply(props);
  });

  // Snap back to the selected view after free rotation
  useEffect(() => {
    if (snapToken) ctx.current.springTo();
  }, [snapToken]);

  return (
    <>
      <div className="axis-stage" ref={mountRef} />
      <p className="axis-readout" ref={readoutRef}>
        <strong>{leadModel}</strong>
        <span>{VIEWS[viewMix.to].label}</span>
      </p>
    </>
  );
}
