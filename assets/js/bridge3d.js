// Whole-bridge 3D viewer: true tube sizes from the STAAD.Pro model, a "steel" view and a "STAAD" view (line model,
// supports, the two deck loads and the deflected shape, exaggerated). Data: assets/models/bridge.json (web_bridge.py).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const ROLE = {
  'top chord':     { c: 0x4f6fc0, name: 'Top chord' },
  'diagonal':      { c: 0x2e9e5c, name: 'Diagonal' },
  'post':          { c: 0x3a8cd8, name: 'Post' },
  'floor beam':    { c: 0x3a8cd8, name: 'Floor beam' },
  'bottom chord':  { c: 0xe0781c, name: 'Bottom chord (edge piece)' },
  'stringer':      { c: 0xe0781c, name: 'Stringer (edge piece)' },
  'stub':          { c: 0xe0781c, name: 'Stub (edge piece)' },
  'stringer seat': { c: 0xe0781c, name: 'Stringer seat (edge piece)' },
  'leg':           { c: 0x8792a2, name: 'Leg' },
  'brace':         { c: 0x6fbf8f, name: 'End brace' },
  'top tie':       { c: 0x3a8cd8, name: 'Top tie' },
  'other':         { c: 0x9aa0a8, name: 'Member' },
};
const SEC = { T075X048: '3/4 x 3/4 x 0.048 in tube', T100X048: '1 x 1 x 0.048 in tube', T100X065: '1 x 1 x 0.065 in tube',
              T125X065: '1 1/4 x 1 1/4 x 0.065 in tube', T150X065: '1 1/2 x 1 1/2 x 0.065 in tube' };
const ftin = L => { const f = Math.floor(L / 12), i = Math.round(L - 12 * f); return f ? `${f} ft ${i} in` : `${i} in`; };
function heat(t) {                                   // 0..1 -> blue, light blue, yellow, orange, red
  const s = [[0x2c, 0x7b, 0xb6], [0xab, 0xd9, 0xe9], [0xff, 0xff, 0xbf], [0xfd, 0xae, 0x61], [0xd7, 0x19, 0x1c]];
  const x = Math.max(0, Math.min(0.9999, t)) * 4, i = Math.floor(x), f = x - i, a = s[i], b = s[i + 1];
  return new THREE.Color().setRGB((a[0] + (b[0] - a[0]) * f) / 255, (a[1] + (b[1] - a[1]) * f) / 255, (a[2] + (b[2] - a[2]) * f) / 255, THREE.SRGBColorSpace);
}


// ---- phones: the page scrolls over the 3D view until the user taps "Tap to turn"; rendering pauses off screen
function touchLock(box, canvas, controls) {
  const touch = matchMedia('(pointer: coarse)').matches;
  const state = { visible: true, touch };
  new IntersectionObserver(es => { state.visible = es[0].isIntersecting; if (!state.visible && touch) lock(); }, { threshold: 0.05 }).observe(box);
  if (!touch) return state;
  const btn = document.createElement('button'); btn.className = 'tapturn'; btn.type = 'button';
  box.appendChild(btn);
  function lock() { controls.enabled = false; canvas.style.touchAction = 'pan-y'; btn.textContent = '\u261D Tap to turn'; btn.classList.remove('on'); }
  function unlock() { controls.enabled = true; canvas.style.touchAction = 'none'; btn.textContent = '\u2713 Done'; btn.classList.add('on'); }
  btn.addEventListener('click', e => { e.stopPropagation(); controls.enabled ? lock() : unlock(); });
  lock();
  return state;
}

export async function bridgeViewer(box, opts = {}) {
  const dark = !!opts.dark;
  const canvas = box.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const coarse = matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = dark ? 1.05 : 1.0;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 5000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.screenSpacePanning = true;
  let sway = opts.autoRotate !== false;
  controls.addEventListener('start', () => { sway = false; });
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-120, 260, 160); sun.castShadow = true;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048); Object.assign(sun.shadow.camera, { left: -220, right: 220, top: 160, bottom: -160, near: 10, far: 700 });
  sun.shadow.bias = -0.0004; scene.add(sun); scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x223344, dark ? 0.5 : 0.8));

  const D = await (await fetch(opts.data || 'assets/models/bridge.json')).json();
  const P = {}; for (const [k, v] of Object.entries(D.joints)) P[k] = new THREE.Vector3(v[0] - 134.4, v[1] - 26.75, v[2]);
  const steel = new THREE.Group(), staad = new THREE.Group(); scene.add(steel, staad);
  const mats = {}; const mat = r => mats[r] || (mats[r] = new THREE.MeshStandardMaterial({ color: (ROLE[r] || ROLE.other).c, metalness: 0.35, roughness: 0.42 }));
  const pick = [];
  for (const m of D.members) {
    const a = P[m.a], b = P[m.b], L = a.distanceTo(b), dir = b.clone().sub(a).normalize();
    const g = new THREE.BoxGeometry(L, m.size, m.size);
    const mesh = new THREE.Mesh(g, mat(m.role)); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.copy(a).add(b).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    mesh.userData = { m, L }; steel.add(mesh); pick.push(mesh);
  }
  // ground: soft shadow and a faint grid
  const groundY = -26.75;
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(900, 600), new THREE.ShadowMaterial({ opacity: dark ? 0.35 : 0.18 }));
  shadowPlane.rotation.x = -Math.PI / 2; shadowPlane.position.y = groundY; shadowPlane.receiveShadow = true; scene.add(shadowPlane);
  const grid = new THREE.GridHelper(720, 60, dark ? 0x3d5f8c : 0xc7ced8, dark ? 0x23436c : 0xe3e7ec);
  grid.position.y = groundY + 0.02; grid.material.transparent = true; grid.material.opacity = dark ? 0.55 : 0.7; scene.add(grid);

  // STAAD view: deformed line model colored by displacement, nodes, supports, deck loads
  const CASES = { v: { id: String(D.worst_case), amp: opts.exaggerate || 40 }, h: { id: '2', amp: 150 } };
  let caseKey = 'v', dsp = D.cases[CASES.v.id].d, dmax = 0, showLoad = true;
  // deflection = vertical movement (2,600 lb case), sway = movement across the bridge (50 lb case), as the rules measure them
  let comp = 1; const dv = v => Math.abs((v || [0, 0, 0])[comp]);
  const dmaxOf = d => { let m = 0; for (const v of Object.values(d)) m = Math.max(m, dv(v)); return m; };
  dmax = dmaxOf(dsp);
  const linePos = [], lineCol = [], lineIdx = [];
  for (const m of D.members) for (const j of [m.a, m.b]) { linePos.push(0, 0, 0); const c = heat(dv(dsp[j]) / dmax); lineCol.push(c.r, c.g, c.b); lineIdx.push(String(j)); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(lineCol, 3));
  const defo = D.members.map(m => {
    const da = dsp[m.a] || [0, 0, 0], db = dsp[m.b] || [0, 0, 0];
    const c = heat(0.5 * (dv(da) + dv(db)) / dmax);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1.25, 1.25), new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
    staad.add(mesh); return { mesh, a: String(m.a), b: String(m.b) };
  });
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _x = new THREE.Vector3(1, 0, 0);
  const ghost = new THREE.LineSegments(lg.clone(), new THREE.LineBasicMaterial({ color: dark ? 0x6f86a6 : 0xb8c0cc, transparent: true, opacity: 0.55 })); staad.add(ghost);
  const nodeKeys = Object.keys(D.joints); const npos = new Float32Array(nodeKeys.length * 3);
  const nodes = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(npos, 3)),
    new THREE.PointsMaterial({ color: dark ? 0xffffff : 0x1b2330, size: 1.6, sizeAttenuation: true })); staad.add(nodes);
  for (const s of D.supports) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.2, 5, 4), new THREE.MeshStandardMaterial({ color: 0xf2a541 }));
    cone.position.copy(P[s]).add(new THREE.Vector3(0, -2.5, 0)); staad.add(cone);
  }
  const Lft = parseFloat((D.cases[String(D.worst_case)].title.match(/L ([\d.]+) FT/) || [0, 6.5])[1]);   // D2 spot of the worst case
  const loads = [[120, 156, '1,550 lb'], [Lft * 12, Lft * 12 + 36, '1,050 lb']];  // decking units (rule 11.5): D1 at 10 ft, D2 at L
  const labels = [], vLoad = new THREE.Group(), hLoad = new THREE.Group(); staad.add(vLoad, hLoad);
  for (const [x0, x1, txt, k] of loads.map((l, i) => [...l, i])) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1.2, 42), new THREE.MeshStandardMaterial({ color: 0x9aa7b8, transparent: true, opacity: 0.55 }));
    deck.position.set((x0 + x1) / 2 - 134.4, 22.4 - 26.75, 0); vLoad.add(deck);
    for (const z of [-12, 12]) vLoad.add(new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3((x0 + x1) / 2 - 134.4, 22.4 - 26.75 + 22, z), 20, 0xd7191c, 5, 3));
    labels.push({ p: new THREE.Vector3((x0 + x1) / 2 - 134.4, 22.4 - 26.75 + 25 + 26 * k, 0), text: txt, mode: 'staad', cs: 'v' });
  }
  // sideways pull: 50 lb at 11 ft 6 in from the west end, on the south stringer (rule 11.4)
  hLoad.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(138 - 134.4, 21 - 26.75, 19.5), 24, 0xd7191c, 6, 3.5));
  labels.push({ p: new THREE.Vector3(138 - 134.4, 21 - 26.75 + 5, 46), text: '50 lb sideways', mode: 'staad', cs: 'h' });
  function recolor() {
    defo.forEach((t, i) => { const m = D.members[i], da = dsp[m.a] || [0, 0, 0], db = dsp[m.b] || [0, 0, 0];
      const c = heat(0.5 * (dv(da) + dv(db)) / dmax); t.mesh.material.color.copy(c); });
  }
  function setCase(k) {
    caseKey = k; comp = k === 'v' ? 1 : 2; dsp = D.cases[CASES[k].id].d; dmax = dmaxOf(dsp); recolor();
    vLoad.visible = k === 'v'; hLoad.visible = k === 'h'; t0 = performance.now();
    (opts.caseButtons || []).forEach(b => b.classList.toggle('on', b.dataset.case === k));
    if (opts.legend) opts.legend.innerHTML = (k === 'v' ? 'Shape x40' : 'Shape x150') +
      `<span class="scale"></span>0 to ${dmax.toFixed(2)} in`;
  }
  function deform(s) {
    const pa = lg.attributes.position.array, ga = ghost.geometry.attributes.position.array;
    lineIdx.forEach((j, i) => { const p = P[j], d = dsp[j] || [0, 0, 0];
      pa[3 * i] = p.x + s * d[0]; pa[3 * i + 1] = p.y + s * d[1]; pa[3 * i + 2] = p.z + s * d[2];
      ga[3 * i] = p.x; ga[3 * i + 1] = p.y; ga[3 * i + 2] = p.z; });
    nodeKeys.forEach((j, i) => { const p = P[j], d = dsp[j] || [0, 0, 0]; npos[3 * i] = p.x + s * d[0]; npos[3 * i + 1] = p.y + s * d[1]; npos[3 * i + 2] = p.z + s * d[2]; });
    lg.attributes.position.needsUpdate = true; ghost.geometry.attributes.position.needsUpdate = true; nodes.geometry.attributes.position.needsUpdate = true;
    for (const t of defo) {
      const pa = P[t.a], pb = P[t.b], da = dsp[t.a] || [0, 0, 0], db = dsp[t.b] || [0, 0, 0];
      _a.set(pa.x + s * da[0], pa.y + s * da[1], pa.z + s * da[2]); _b.set(pb.x + s * db[0], pb.y + s * db[1], pb.z + s * db[2]);
      const L = _a.distanceTo(_b); t.mesh.position.copy(_a).add(_b).multiplyScalar(0.5); t.mesh.scale.set(L, 1, 1);
      t.mesh.quaternion.setFromUnitVectors(_x, _b.clone().sub(_a).normalize());
    }
  }
  deform(0);

  // joint links (e.g. the bottom joint build guide)
  for (const j of (opts.joints || [])) labels.push({ p: new THREE.Vector3(j.x - 134.4, j.y - 26.75, j.z), text: j.label, href: j.href, mode: 'steel', ring: true });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(5, 0.6, 12, 48), new THREE.MeshBasicMaterial({ color: 0xf2a541 }));
  if (opts.joints && opts.joints.length) { const j = opts.joints[0]; ring.position.set(j.x - 134.4, j.y - 26.75, j.z - 2); steel.add(ring); }
  const labDivs = labels.map(L => {
    const d = document.createElement(L.href ? 'a' : 'div'); d.className = 'blab'; d.textContent = L.text;
    if (L.href) d.href = L.href;
    Object.assign(d.style, { position: 'absolute', transform: 'translate(-50%, -100%)', whiteSpace: 'nowrap', fontSize: '13px', fontWeight: '700',
      padding: '4px 9px', borderRadius: '999px', zIndex: 3, textDecoration: 'none',
      background: L.href ? '#f2a541' : (dark ? 'rgba(255,255,255,.92)' : '#fff'), color: L.href ? '#0b2545' : '#b0201a',
      boxShadow: '0 2px 8px rgba(0,0,0,.18)', pointerEvents: L.href ? 'auto' : 'none' });
    box.appendChild(d); return d;
  });

  // modes
  let mode = opts.mode || 'steel', t0 = performance.now();
  function setMode(m) {
    mode = m; steel.visible = m === 'steel'; staad.visible = m === 'staad';
    (opts.modeButtons || []).forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    if (opts.legend) opts.legend.style.display = m === 'staad' ? '' : 'none';
    t0 = performance.now();
  }
  (opts.modeButtons || []).forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  (opts.caseButtons || []).forEach(b => b.addEventListener('click', () => { if (mode !== 'staad') setMode('staad'); setCase(b.dataset.case); }));
  let manual = false;
  const setState = st => { showLoad = st === 'after'; manual = false; t0 = performance.now();
    (opts.stateButtons || []).forEach(x => x.classList.toggle('on', x.dataset.state === st)); };
  (opts.stateButtons || []).forEach(b => b.addEventListener('click', () => setState(b.dataset.state)));
  if (opts.slider) opts.slider.addEventListener('input', () => { manual = true; showLoad = true;
    (opts.stateButtons || []).forEach(x => x.classList.toggle('on', x.dataset.state === 'after')); });
  setMode(mode); setCase('v');

  // tooltip
  const tip = opts.tip; const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); let hover = null;
  function onMove(e) {
    if (!tip || mode !== 'steel') return;
    const r = canvas.getBoundingClientRect(); mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera); const hit = ray.intersectObjects(pick, false)[0];
    if (hover && (!hit || hit.object !== hover)) { hover.material = mat(hover.userData.m.role); hover = null; }
    if (hit) {
      hover = hit.object; hover.material = hover.material.clone(); hover.material.emissive = new THREE.Color(0x553300);
      const { m, L } = hit.object.userData;
      tip.innerHTML = `<b>${(ROLE[m.role] || ROLE.other).name}</b>${SEC[m.sec] || m.sec}, ${ftin(L)} between joints${m.pinned ? ', pinned ends (1 bolt)' : ''}`;
      tip.style.display = 'block'; tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px';
    } else tip.style.display = 'none';
  }
  canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerdown', onMove);
  canvas.addEventListener('pointerleave', () => { if (tip) tip.style.display = 'none'; });

  // camera
  const view = opts.view || [0.62, 0.42, -0.78];
  function fit() {
    const w = box.clientWidth, h = box.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    const r = 150, fovV = camera.fov * Math.PI / 180, fovH = 2 * Math.atan(Math.tan(fovV / 2) * camera.aspect);
    const dist = r / Math.sin(Math.min(fovV, fovH) / 2) * (w > 900 ? (opts.zoom || 1.0) : (opts.zoomMobile || opts.zoom || 1.0));
    const v = new THREE.Vector3(...view).normalize(); controls.target.set(0, opts.targetY ?? -4, 0);
    camera.position.copy(controls.target).addScaledVector(v, dist);
  }
  function offset() {                                // push the bridge right (and down) on wide screens, under the title
    const w = box.clientWidth, h = box.clientHeight, wide = w > 900;
    const sx = wide ? (opts.shiftX || 0) : 0, sy = wide ? (opts.shiftY || 0) : (opts.shiftYMobile || 0);
    if (sx || sy) camera.setViewOffset(w, h, -sx * w, -sy * h, w, h); else camera.clearViewOffset();
  }
  new ResizeObserver(() => { const w = box.clientWidth, h = box.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); offset(); }).observe(box);
  fit(); offset();
  const vis = touchLock(box, canvas, controls);
  const v3 = new THREE.Vector3();
  const amp = opts.exaggerate || 40; let base = null;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!vis.visible) return;
    if (mode === 'staad') {                          // load on, load off (elastic); the slider holds any load level
      const f = !showLoad ? 0 : manual ? +opts.slider.value / 100 : 0.5 * (1 - Math.cos((now - t0) / 3600 * 2 * Math.PI));
      deform(CASES[caseKey].amp * f);
      if (opts.slider && !manual) opts.slider.value = Math.round(f * 100);
      if (opts.readout) opts.readout.innerHTML = `<b>${(dmax * f).toFixed(2)} in</b> ${caseKey === 'v' ? 'deflection' : 'sway'} at ${Math.round(f * 100)}% of the ${caseKey === 'v' ? '2,600 lb load' : '50 lb pull'}`;
    }
    ring.scale.setScalar(1 + 0.18 * Math.sin(now / 300)); ring.lookAt(camera.position);
    if (sway) {                                       // slow look left and right around the start view
      const off = camera.position.clone().sub(controls.target), sp = new THREE.Spherical().setFromVector3(off);
      if (base === null) base = sp.theta;
      sp.theta = base + 0.42 * Math.sin(now / 5200); camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sp));
    }
    controls.update(); renderer.render(scene, camera);
    const w = box.clientWidth, h = box.clientHeight;
    labels.forEach((L, i) => { const d = labDivs[i]; if (L.mode !== mode || (L.cs && L.cs !== caseKey)) { d.style.display = 'none'; return; }
      v3.copy(L.p).project(camera); d.style.display = v3.z < 1 ? '' : 'none';
      d.style.left = ((v3.x + 1) / 2 * w) + 'px'; d.style.top = ((1 - v3.y) / 2 * h - 8) + 'px'; });
  }
  requestAnimationFrame(frame);
  return { setMode, data: D, dmax };
}
