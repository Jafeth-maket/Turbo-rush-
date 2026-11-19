// ============================================================
//  TURBO RUSH - AUTOS JAPONESES + PERSONALIZACIÓN
//  Construye los autos del jugador y de los bots con cajas
//  deformadas (sin archivos de modelos) y aplica la pintura,
//  llantas, alerones, kits, neón, etc. que elijas en el garaje.
// ============================================================
const CARS = (() => {
  const T = THREE;

  /* ---------------- Utilidades ---------------- */
  const geos = new Map();
  function geo(key, make) {
    let g = geos.get(key);
    if (!g) { g = make(); g.userData.keep = true; geos.set(key, g); }
    return g;
  }
  const mats = new Map();
  function lam(color, opts = {}) {
    const k = "L" + color + (opts.map ? opts.map.uuid : "") + (opts.emi || "") + (opts.tr || "");
    let m = mats.get(k);
    if (!m) {
      m = new T.MeshLambertMaterial({ color, map: opts.map || null });
      if (opts.emi) m.emissive = new T.Color(color).multiplyScalar(opts.emi);
      if (opts.tr) { m.transparent = true; m.opacity = opts.tr; }
      mats.set(k, m);
    }
    return m;
  }
  function bas(color, opacity) {
    const k = "B" + color + (opacity || 1);
    let m = mats.get(k);
    if (!m) {
      m = new T.MeshBasicMaterial({ color });
      if (opacity) { m.transparent = true; m.opacity = opacity; }
      mats.set(k, m);
    }
    return m;
  }
  function add(parent, g, m, x, y, z) {
    const o = new T.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o;
  }
  const box = (w, h, d) => geo(`box${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)}`, () => new T.BoxGeometry(w, h, d));
  const cylZ = (r, len, seg = 14) => geo(`cz${r.toFixed(3)},${len.toFixed(3)}`, () => new T.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

  // interpolación por tramos: pts = [[u, valor], ...]
  function pw(pts, u) {
    if (u <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (u <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; return lerp(a[1], b[1], (u - a[0]) / (b[0] - a[0])); }
    }
    return pts[pts.length - 1][1];
  }

  // Caja deformada: f(u) -> {y0, y1, w0, w1} (altura abajo/arriba y ancho abajo/arriba) a lo largo del auto.
  function shaped(key, z0, z1, N, f, xo = 0) {
    return geo(key, () => {
      const g = new T.BoxGeometry(1, 1, 1, 1, 1, N), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const sx = p.getX(i) > 0 ? 1 : -1, top = p.getY(i) > 0, u = Math.max(0, Math.min(1, p.getZ(i) + 0.5));
        const s = f(u);
        p.setXYZ(i, xo + sx * (top ? s.w1 : s.w0), top ? s.y1 : s.y0, z0 + u * (z1 - z0));
      }
      p.needsUpdate = true; g.computeVertexNormals();
      return g;
    });
  }

  /* ---------------- Texturas de pintura ---------------- */
  const texCache = {};
  function paintTex(kind) {
    if (texCache[kind]) return texCache[kind];
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d");
    if (kind === "metal") {                       // partículas metálicas
      x.fillStyle = "#fff"; x.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 380; i++) { const v = 150 + Math.random() * 105 | 0; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(Math.random() * 64, Math.random() * 64, 1.5, 1.5); }
    } else if (kind === "pearl") {                // perlado: degradado que cambia de tono
      const gr = x.createLinearGradient(0, 0, 64, 64);
      gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.35, "#bfeaff"); gr.addColorStop(0.7, "#ffd3f3"); gr.addColorStop(1, "#ffffff");
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    } else {                                      // cromo: bandas de reflejo
      const gr = x.createLinearGradient(0, 0, 0, 64);
      [[0, "#ffffff"], [0.3, "#9fb3c8"], [0.5, "#303a46"], [0.55, "#e8eef5"], [1, "#8d98a6"]].forEach(([o, col]) => gr.addColorStop(o, col));
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    }
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace;
    if (kind === "metal") t.repeat.set(6, 3);
    texCache[kind] = t; return t;
  }
  const FINISH = ["", "metal", "pearl", "chrome"];
  function paint(color, finish) {
    const k = FINISH[finish] || "";
    if (!k) return lam(color);
    if (k === "chrome") return lam(new T.Color(color).lerp(new T.Color("#ffffff"), 0.55).getHex(), { map: paintTex(k), emi: 0.18 });
    return lam(color, { map: paintTex(k), emi: k === "pearl" ? 0.1 : 0 });
  }

  /* ---------------- Catálogos ---------------- */
  const PALETTE = ["#e53935", "#ff6d00", "#fbc02d", "#76ff03", "#00c853", "#00bfa5", "#00e5ff", "#1e88e5",
                   "#283593", "#8e24aa", "#ff4081", "#f5f5f5", "#b0b6bf", "#424242", "#111111", "#a1887f"];
  const RIM_COLORS = ["#c7ccd4", "#f5f5f5", "#1a1a1a", "#d4af37", "#b87333", "#e53935", "#1e88e5", "#00e5ff", "#76ff03", "#ff4081"];
  // estilos de rin: n = rayos (0 = disco), sw = grosor, lip = labio más grande
  const RIMS = [
    { nombre: "Clásica 5",   n: 5,  sw: 0.075 },
    { nombre: "Rally 6",     n: 6,  sw: 0.10 },
    { nombre: "Racing 10",   n: 10, sw: 0.04 },
    { nombre: "Malla 14",    n: 14, sw: 0.03 },
    { nombre: "Doble 8",     n: 8,  sw: 0.065 },
    { nombre: "Disco turbo", n: 0,  sw: 0 }
  ];
  const RIM_SIZES = [0.20, 0.24, 0.28, 0.31];     // radio del rin (la llanta mide 0.38): más grande = llanta más delgada
  const GLASS = [0x4a7fa3, 0x0f2030, 0x050709];
  const DROP = [0, 0.04, 0.08, 0.11];
  const KEEP_DARK = 0x101114;

  /* ---------------- Modelos (siluetas) ---------------- */
  // top: altura de la línea de cintura a lo largo (u: 0 = trompa, 1 = cola) | cab: cabina (parabrisas, techo, luneta)
  const MODELS = {
    hatch: {   // compacto deportivo, cabina cuadrada y faros escamoteables
      L: 4.2, hw: 0.93, y0: 0.30, tw: 0.30, taperF: 0.15, taperR: 0.07, wb: [-1.30, 1.28],
      top: [[0, 0.50], [0.05, 0.58], [0.14, 0.64], [0.40, 0.70], [0.5, 0.73], [0.93, 0.78], [1, 0.72]],
      cab: { c0: 0.41, c1: 0.96, ws: 0.13, rw: 0.10, roof: 1.28 }, head: "pop", tail: "bar"
    },
    coupe: {   // coupé bajo con caída fastback
      L: 4.3, hw: 0.93, y0: 0.28, tw: 0.31, taperF: 0.17, taperR: 0.10, wb: [-1.38, 1.32],
      top: [[0, 0.40], [0.06, 0.50], [0.15, 0.57], [0.36, 0.65], [0.5, 0.70], [0.85, 0.72], [1, 0.64]],
      cab: { c0: 0.45, c1: 0.90, ws: 0.15, rw: 0.22, roof: 1.17 }, head: "slim", tail: "slim"
    },
    gtr: {     // coupé ancho y musculoso, cuatro luces redondas atrás
      L: 4.4, hw: 1.0, y0: 0.29, tw: 0.34, taperF: 0.12, taperR: 0.08, wb: [-1.40, 1.36],
      top: [[0, 0.54], [0.05, 0.65], [0.12, 0.71], [0.40, 0.77], [0.5, 0.80], [0.9, 0.84], [1, 0.80]],
      cab: { c0: 0.40, c1: 0.88, ws: 0.10, rw: 0.12, roof: 1.30 }, head: "round", tail: "round4"
    },
    sedan: {   // sedán largo de drift
      L: 4.5, hw: 0.94, y0: 0.30, tw: 0.31, taperF: 0.14, taperR: 0.08, wb: [-1.45, 1.40],
      top: [[0, 0.52], [0.05, 0.62], [0.13, 0.68], [0.38, 0.74], [0.5, 0.77], [0.9, 0.82], [1, 0.76]],
      cab: { c0: 0.38, c1: 0.80, ws: 0.12, rw: 0.10, roof: 1.30 }, head: "slim", tail: "slim"
    },
    super: {   // superdeportivo de motor central, cabina adelantada
      L: 4.4, hw: 1.0, y0: 0.25, tw: 0.36, taperF: 0.20, taperR: 0.10, wb: [-1.45, 1.20],
      top: [[0, 0.34], [0.08, 0.44], [0.3, 0.56], [0.5, 0.62], [0.7, 0.70], [0.88, 0.74], [1, 0.66]],
      cab: { c0: 0.30, c1: 0.74, ws: 0.18, rw: 0.20, roof: 1.07 }, head: "slim", tail: "bar"
    }
  };

  function defaultCustom(def) {
    return {
      color: def.color || "#e53935", acabado: 0, techo: null, acento: "#14161b",
      llanta: 0, llantaColor: "#c7ccd4", llantaTam: 1, pinza: null,
      aleron: 0, kit: 0, cofre: 0, suspension: 0,
      franja: 0, franjaColor: "#ffffff", vidrio: 1, neon: null, faros: "#fff3b0", escape: 0, llama: "#ffa000"
    };
  }

  /* ---------------- Ruedas ---------------- */
  function wheelProto(cu, M, lod) {
    const rs = RIMS[cu.llanta] || RIMS[0], rr = RIM_SIZES[cu.llantaTam] ?? RIM_SIZES[1];
    const tw = M.tw + (cu.kit >= 3 ? 0.06 : 0), x0 = tw / 2;
    const c = new T.Group(), rimM = lam(cu.llantaColor, { emi: 0.35 }), dark = lam(KEEP_DARK);
    add(c, geo("tire" + tw, () => new T.CylinderGeometry(0.38, 0.38, tw, 18).rotateZ(Math.PI / 2)), lam(0x151515), 0, 0, 0);
    add(c, geo("lip" + rr, () => new T.CylinderGeometry(rr, rr, 0.05, 22).rotateZ(Math.PI / 2)), rimM, x0 - 0.015, 0, 0);
    add(c, geo("dsc" + rr, () => new T.CylinderGeometry(rr * 0.82, rr * 0.82, 0.02, 20).rotateZ(Math.PI / 2)), rs.n ? dark : rimM, x0 + 0.012, 0, 0);
    if (!lod && cu.pinza && rs.n) {
      add(c, box(0.022, rr * 0.34, rr * 0.55), lam(cu.pinza, { emi: 0.4 }), x0 + 0.02, rr * 0.45, -rr * 0.15);
    }
    const sl = rr * 0.8, n = lod ? Math.min(rs.n, 6) : rs.n;
    if (n) {
      if (n % 2 === 0) {
        for (let k = 0; k < n / 2; k++) add(c, box(0.02, rs.sw, sl * 2), rimM, x0 + 0.026, 0, 0).rotation.x = k * Math.PI / (n / 2);
      } else {
        for (let k = 0; k < n; k++) {
          const pv = new T.Group(); pv.position.x = x0 + 0.026; pv.rotation.x = k * Math.PI * 2 / n;
          add(pv, box(0.02, rs.sw, sl), rimM, 0, 0, sl / 2); c.add(pv);
        }
      }
      if (cu.llanta === 4) add(c, geo("dbl" + rr, () => new T.CylinderGeometry(rr * 0.5, rr * 0.5, 0.02, 16).rotateZ(Math.PI / 2)), rimM, x0 + 0.03, 0, 0);
    } else {                                           // disco turbo: ranuras oscuras
      for (let k = 0; k < 4; k++) add(c, box(0.02, 0.035, rr * 1.3), dark, x0 + 0.024, 0, 0).rotation.x = k * Math.PI / 4;
    }
    add(c, geo("hub" + rr, () => new T.CylinderGeometry(rr * 0.2, rr * 0.2, 0.05, 12).rotateZ(Math.PI / 2)), rimM, x0 + 0.04, 0, 0);
    return c;
  }

  /* ---------------- Construcción del auto ---------------- */
  function build(def, custom, opts = {}) {
    const M = MODELS[def.modelo] || MODELS.hatch;
    const cu = Object.assign(defaultCustom(def), custom || {});
    const lod = !!opts.lod, L = M.L, hl = L / 2;
    const drop = DROP[cu.suspension] || 0, wide = cu.kit >= 3 ? 1.07 : 1;
    const g = new T.Group(), shell = new T.Group();
    g.add(shell); shell.position.y = -drop;
    const topAt = (u) => pw(M.top, u);
    const wAt = (u) => {
      const wf = u < M.taperF ? smooth(u / M.taperF) : 1, wr = u > 1 - M.taperR ? smooth((1 - u) / M.taperR) : 1;
      return M.hw * wide * (0.76 + 0.24 * Math.min(wf, wr));
    };
    const body = paint(cu.color, cu.acabado);
    const roofM = cu.techo ? paint(cu.techo, cu.acabado) : body;
    const acc = lam(cu.acento), dark = lam(KEEP_DARK);
    const key = `${def.modelo}|${cu.kit >= 3 ? 1 : 0}`;
    const { c0, c1, ws, rw, roof } = M.cab;

    // carrocería
    add(shell, shaped("body|" + key, -hl, hl, 30, (u) => ({ y0: M.y0, y1: topAt(u), w0: wAt(u), w1: wAt(u) * 0.93 })), body, 0, 0, 0);

    // cabina (cristales) + techo
    const cabPts = [[c0, topAt(c0)], [c0 + ws, roof], [c1 - rw, roof], [c1, topAt(c1)]];
    const zc0 = -hl + c0 * L, zc1 = -hl + c1 * L;
    const cabF = (ul) => {
      const u = c0 + ul * (c1 - c0), w = wAt(u) * 0.9;
      return { y0: topAt(u) - 0.04, y1: pw(cabPts, u), w0: w, w1: w * 0.8 };
    };
    add(shell, shaped("cab|" + key, zc0, zc1, 16, cabF), lam(GLASS[cu.vidrio] ?? GLASS[1]), 0, 0, 0);
    const rz0 = -hl + (c0 + ws) * L, rz1 = -hl + (c1 - rw) * L, rm = (c0 + ws + c1 - rw) / 2;
    const roofW = wAt(rm) * 0.9 * 0.8 * 2 + 0.02;
    add(shell, box(roofW, 0.05, rz1 - rz0), roofM, 0, roof + 0.012, (rz0 + rz1) / 2);
    // espejos
    for (const sx of [-1, 1]) add(shell, box(0.07, 0.09, 0.15), acc, sx * (wAt(c0) * 0.9 + 0.1), topAt(c0) + 0.06, zc0 + 0.2);

    // cofre
    const hoodMid = (0.1 + c0 - 0.02) / 2, hz = -hl + hoodMid * L, hy = topAt(hoodMid);
    const slope = -Math.atan((topAt(c0 - 0.03) - topAt(0.12)) / ((c0 - 0.15) * L));
    if (cu.cofre === 3) {
      add(shell, shaped("hood|" + key, -hl + 0.10 * L, -hl + (c0 - 0.015) * L, 8, (u) => {
        const uu = 0.10 + u * (c0 - 0.115); return { y0: topAt(uu) - 0.005, y1: topAt(uu) + 0.014, w0: wAt(uu) * 0.92, w1: wAt(uu) * 0.9 };
      }), lam(0x16181d), 0, 0, 0);
    }
    if (cu.cofre === 1 || cu.cofre === 3) {
      for (const sx of [-1, 1]) {
        const v = add(shell, box(0.34, 0.02, 0.5), dark, sx * 0.36, hy + 0.024, hz); v.rotation.x = slope;
        for (let k = -1; k <= 1; k++) add(shell, box(0.34, 0.025, 0.02), acc, sx * 0.36, hy + 0.035 + k * 0.0, hz + k * 0.14).rotation.x = slope;
      }
    }
    if (cu.cofre === 2) {                              // toma de aire
      const sc = add(shell, box(0.6, 0.13, 0.62), acc, 0, hy + 0.06, hz + 0.08); sc.rotation.x = slope;
      add(shell, box(0.5, 0.08, 0.03), dark, 0, hy + 0.06, hz - 0.24).rotation.x = slope;
    }

    // franjas
    if (cu.franja) {
      const sm = lam(cu.franjaColor), fz0 = -hl + 0.03 * L, fz1 = -hl + (c0 - 0.012) * L, bz0 = -hl + (c1 + 0.012) * L, bz1 = -hl + 0.97 * L;
      const strips = cu.franja === 1 ? [[-0.14, 0.05], [0.14, 0.05]] : cu.franja === 2 ? [[0, 0.17]] : [];
      for (const [xo, hwid] of strips) {
        const part = (id, za, zb, ua, ub) => add(shell, shaped(`str${id}|${key}|${xo}`, za, zb, 8, (u) => {
          const uu = lerp(ua, ub, u); return { y0: topAt(uu) + 0.002, y1: topAt(uu) + 0.012, w0: hwid, w1: hwid };
        }, xo), sm, 0, 0, 0);
        part("f", fz0, fz1, 0.03, c0 - 0.012); part("b", bz0, bz1, c1 + 0.012, 0.97);
        add(shell, box(hwid * 2, 0.012, rz1 - rz0), sm, xo, roof + 0.045, (rz0 + rz1) / 2);
      }
      if (cu.franja === 3) {                           // franjas laterales
        const ym = (M.y0 + topAt(0.5)) / 2;
        for (const sx of [-1, 1]) for (const dy of [-0.03, 0.04]) add(shell, box(0.04, 0.035, L * 0.62), sm, sx * wAt(0.5) * 0.965, ym + dy, 0);
      }
    }

    // kit aerodinámico
    if (cu.kit >= 1) {
      add(shell, box(wAt(0.04) * 1.8, 0.04, 0.18), acc, 0, M.y0 + 0.015, -hl + 0.04);
      for (const sx of [-1, 1]) add(shell, box(0.07, 0.1, L * 0.36), acc, sx * (wAt(0.5) + 0.005), M.y0 + 0.06, (M.wb[0] + M.wb[1]) / 2);
    }
    if (cu.kit >= 2) {
      add(shell, box(wAt(0.96) * 1.5, 0.07, 0.28), acc, 0, M.y0 + 0.03, hl - 0.05);
      add(shell, box(wAt(0.9) * 1.7, 0.035, 0.22), acc, 0, topAt(0.95) + 0.02, hl - 0.14);
    }
    if (cu.kit >= 3) {                                  // ensanchado: aletas sobre las ruedas
      for (const sx of [-1, 1]) for (const wz of M.wb) add(shell, box(0.14, 0.2, 1.05), body, sx * (wAt(0.5) + 0.02), 0.55, wz);
    }

    // luces
    const hb = bas(parseInt(cu.faros.slice(1), 16)), tailM = bas(0xff2030);
    const hyN = topAt(0.03) - 0.09;
    if (M.head === "pop") {
      for (const sx of [-1, 1]) {
        add(shell, box(0.5, 0.02, 0.26), dark, sx * 0.5, topAt(0.12) + 0.01, -hl + 0.12 * L);
        add(shell, box(0.34, 0.1, 0.05), hb, sx * 0.62, hyN - 0.02, -hl + 0.015);
      }
    } else if (M.head === "round") {
      for (const sx of [-1, 1]) add(shell, cylZ(0.14, 0.06), hb, sx * 0.62, hyN, -hl + 0.02);
    } else {
      for (const sx of [-1, 1]) add(shell, box(0.5, 0.075, 0.06), hb, sx * 0.55, hyN, -hl + 0.015);
    }
    add(shell, box(0.8, 0.1, 0.05), dark, 0, M.y0 + 0.12, -hl + 0.01);                 // entrada de aire
    add(shell, box(0.42, 0.11, 0.03), bas(0xffffff), 0, M.y0 + 0.07, -hl + 0.005);     // placa
    const ty = topAt(0.97) - 0.13;
    if (M.tail === "bar") add(shell, box(wAt(0.97) * 1.75, 0.08, 0.05), tailM, 0, ty, hl - 0.01);
    else if (M.tail === "round4") for (const sx of [-1, 1]) for (const dx of [0.36, 0.64]) add(shell, cylZ(0.09, 0.05), tailM, sx * dx, ty, hl - 0.015);
    else for (const sx of [-1, 1]) add(shell, box(0.62, 0.09, 0.05), tailM, sx * 0.55, ty, hl - 0.01);
    add(shell, box(0.42, 0.11, 0.03), bas(0xffffff), 0, ty - 0.17, hl - 0.005);

    // alerón
    if (cu.aleron >= 1) {
      const wz = hl - (cu.aleron === 1 ? 0.22 : 0.4), wy = topAt(0.93);
      if (cu.aleron === 1) add(shell, box(wAt(0.9) * 1.6, 0.04, 0.3), acc, 0, wy + 0.04, wz);
      else {
        const hgt = [0, 0, 0.3, 0.5, 0.5][cu.aleron], wd = wAt(0.9) * (cu.aleron === 2 ? 1.85 : 2.0);
        for (const sx of [-1, 1]) {
          add(shell, box(0.06, hgt, 0.1), acc, sx * 0.52, wy + hgt / 2, wz);
          add(shell, box(0.04, 0.2, 0.55), acc, sx * wd / 2, wy + hgt + 0.06, wz);        // placas laterales
        }
        add(shell, box(wd, 0.06, cu.aleron === 2 ? 0.36 : 0.5), acc, 0, wy + hgt + 0.06, wz);
        if (cu.aleron === 4) add(shell, box(wd * 0.96, 0.05, 0.3), acc, 0, wy + hgt + 0.2, wz + 0.04);
      }
    }

    // escape + llamas del nitro
    const ex = cu.escape === 0 ? [0.5] : cu.escape === 1 ? [-0.5, 0.5] : [-0.62, -0.34, 0.34, 0.62];
    const er = cu.escape === 2 ? 0.065 : 0.055, exM = lam(cu.escape === 2 ? 0xc8ced6 : 0x8a8f96, { emi: 0.3 });
    for (const x of ex) add(shell, cylZ(er, 0.2), exM, x, M.y0 + 0.07, hl + 0.02);
    const flameM = bas(parseInt(cu.llama.slice(1), 16));
    g.userData.flames = (ex.length > 2 ? [-0.5, 0.5] : ex.length > 1 ? ex : [-0.5, 0.5]).map((x) => {
      const f = add(g, geo("flame", () => new T.ConeGeometry(0.28, 1.8, 8).rotateX(Math.PI / 2)), flameM, x, 0.5, hl + 0.85);
      f.visible = false; return f;
    });

    // neón
    if (cu.neon) {
      const nc = parseInt(cu.neon.slice(1), 16);
      add(g, box(wAt(0.5) * 1.7, 0.03, L * 0.9), bas(nc, 0.75), 0, 0.12 - drop * 0.5, 0);
      add(g, box(wAt(0.5) * 2.5, 0.01, L * 1.2), bas(nc, 0.16), 0, 0.03, 0);
    }

    // ruedas + arcos
    const proto = wheelProto(cu, M, lod), wheels = [];
    const wx = M.hw * wide - 0.1;
    for (const sx of [-1, 1]) {
      for (const wz of M.wb) {
        const k = Math.max(0.4, Math.min(1, (topAt((wz + hl) / L) - 0.4) / 0.46));
        const arch = add(shell, geo("arch", () => new T.CylinderGeometry(0.46, 0.46, 0.04, 18, 1, false, 0, Math.PI).rotateZ(Math.PI / 2)), dark, sx * (wAt((wz + hl) / L) + 0.012), 0.4, wz);
        arch.scale.y = k;
        const holder = new T.Group(); holder.position.set(sx * wx, 0.38, wz);
        const spin = new T.Group(), content = proto.clone(); content.scale.x = sx;
        spin.add(content); holder.add(spin); g.add(holder); wheels.push(spin);
      }
    }
    g.userData.wheels = wheels;
    return g;
  }

  // libera la geometría que no está en la caché (al reemplazar el auto de la vista previa)
  function dispose(obj) {
    obj.traverse((o) => { if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); });
  }

  return { build, dispose, defaultCustom, MODELS, RIMS, RIM_SIZES, PALETTE, RIM_COLORS, FINISH };
})();
