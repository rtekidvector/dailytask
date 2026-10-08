import { db, signIn, signOutUser as rawSignOut, onUser, idToken, pushSupported, registerPush, unregisterPush } from "./fb.js";
import { OWNER_EMAIL, DEFAULT_TEAM, WORKER_URL } from "./config.js";

(() => {
  const app = document.getElementById("app");
  const DAYN = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const STATUS = { todo: "Belum", doing: "Dikerjakan", done: "Selesai" };
  const NEXT = { todo: "doing", doing: "done", done: "todo" };
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const today = () => ymd(new Date());
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const fmtLong = s => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(parse(s));
  const fmtShort = s => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short" }).format(parse(s));
  const hue = str => { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";

  const S = {
    mode: "loading", meId: null, owner: false,
    teamRaw: [], teamLoaded: false, editMember: null, photoDraft: undefined, tab: "pantau", ro: false, meName: "",
    items: {}, keyDoc: {}, itemsLoaded: {}, docLoaded: {},
    date: today(), winFrom: addDays(today(), -30),
    showAdd: false, addSel: new Set(), addRoutine: false, addDays: new Set([1, 2, 3, 4, 5, 6]), addHot: false,
    arm: null, toast: "", readOnly: false, recapDays: 7, editNote: null, showRecap: false, proofFor: null, proofDraft: {}, busy: false, lightbox: null, addProof: true,
  };
  const fmtTime = ms => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
  const askedToday = key => { const kd = S.keyDoc[key]; return !!(kd && kd.askAt && ymd(new Date(kd.askAt)) === today()); };
  // Idle = nothing unfinished for today (including leftovers from earlier days).
  const isIdle = key => !!S.itemsLoaded[key] && !(S.items[key] || []).some(t => t.date <= today() && t.status !== "done");
  Object.defineProperty(S, "team", { get: () => S.teamRaw, configurable: true });
  const subs = {};
  const ensured = new Set();

  // ---------- helpers ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "style") el.setAttribute("style", v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    for (const c of kids.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  let toastT;
  function toast(msg) { S.toast = msg; render(); clearTimeout(toastT); toastT = setTimeout(() => { S.toast = ""; render(); }, 3200); }
  async function safe(fn, okMsg) {
    try { await fn(); if (okMsg) toast(okMsg); }
    catch (e) {
      const code = e && e.code;
      if (code === "permission-denied") toast("Kamu tidak punya izin untuk perubahan ini. Hubungi pemilik aplikasi.");
      else if (code === "resource-exhausted") toast("Batas harian database tercapai. Coba lagi besok atau hubungi pemilik.");
      else if (code === "unavailable") toast("Sedang offline. Perubahan akan tersimpan saat internet kembali.");
      else toast("Gagal menyimpan. Periksa koneksi lalu coba lagi.");
      console.warn(e);
    }
  }
  // Each person is keyed by their (lower-case) Google email.
  const keyOf = m => m.id;
  const myMember = () => S.team.find(m => m.id === S.meId);
  const keyFor = keyOf;
  // Roles: the owner and admins without a unit limit control everything ("boss");
  // an admin limited to units (e.g. HCS) manages only the people in those units.
  const myAdminGroups = () => { const m = myMember(); return m && m.isAdmin && Array.isArray(m.adminGroups) ? m.adminGroups : []; };
  const isManager = () => S.owner || !!(myMember() && myMember().isAdmin);
  const isBoss = () => S.owner || (isManager() && !myAdminGroups().length);
  const inScope = m => isBoss() || myAdminGroups().includes(m.group || "");
  const units = () => [...new Set(S.team.map(m => m.group).filter(Boolean))].sort();
  const myUnits = () => isBoss() ? units() : myAdminGroups();
  // Admins are kept out of the workforce lists; the optional unit filter narrows them further.
  const workers = () => S.team.filter(m => !m.isAdmin && inScope(m) && (!S.unit || (m.group || "") === S.unit));
  // People a manager may see in Kelola tim.
  const manageable = () => S.team.filter(m => isBoss() || m.id === S.meId || (!m.isAdmin && inScope(m)));
  const sortTasks = arr => arr.slice().sort((a, b) => {
    const st = { todo: 0, doing: 0, done: 1 };
    const da = a.start || a.due || "99:99", dbb = b.start || b.due || "99:99";
    return (st[a.status] - st[b.status]) || (da < dbb ? -1 : da > dbb ? 1 : 0) || ((b.hot ? 1 : 0) - (a.hot ? 1 : 0)) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || ((a.createdAt || 0) - (b.createdAt || 0));
  });
  const at = (date, hm) => { const d = parse(date); const [hh, mm] = hm.split(":").map(Number); d.setHours(hh, mm, 0, 0); return d.getTime(); };
  const deadline = t => t.due ? at(t.date, t.due) : null;
  const startAt = t => t.start ? at(t.date, t.start) : null;
  const dur = ms => { const m = Math.round(ms / 60000); if (m < 60) return m + " menit"; if (m < 1440) return Math.floor(m / 60) + " jam" + (m % 60 ? " " + (m % 60) + " mnt" : ""); return Math.floor(m / 1440) + " hari"; };
  function timeTags(t) {
    const dl = deadline(t), st = startAt(t), now = Date.now();
    const out = [];
    if (st || dl) out.push(h("span", { class: "tag due" }, "⏰ " + (t.start && t.due ? `${t.start}–${t.due}` : t.start ? "mulai " + t.start : "s/d " + t.due)));
    if (t.status === "done" && t.doneAt && dl) {
      const diff = t.doneAt - dl;
      out.push(diff <= 60000 ? h("span", { class: "tag on" }, "Tepat waktu") : h("span", { class: "tag late" }, "Telat " + dur(diff)));
    } else if (t.status !== "done" && dl && now > dl) {
      out.push(h("span", { class: "tag hot" }, "Terlambat " + dur(now - dl)));
    } else if (t.status === "todo" && st && now > st) {
      out.push(h("span", { class: "tag late" }, "Belum mulai · lewat " + dur(now - st)));
    }
    // Actual times, recorded when the status changes.
    if (t.startedAt) out.push(h("span", { class: "tag off" }, "Mulai " + fmtTime(t.startedAt)));
    if (t.status === "done" && t.doneAt) out.push(h("span", { class: "tag off" }, "Selesai " + fmtTime(t.doneAt)));
    return out;
  }
  function tasksFor(key) {
    const all = S.items[key] || [];
    const day = all.filter(t => t.date === S.date);
    const late = S.date === today() ? all.filter(t => t.date < S.date && t.status !== "done") : [];
    return { day: sortTasks(day), late: sortTasks(late) };
  }
  const tally = list => {
    const c = { todo: 0, doing: 0, done: 0 };
    for (const t of list) c[t.status in c ? t.status : "todo"]++;
    return c;
  };

  // ---------- subscriptions ----------
  let teamUnsub = null;
  function subTeam() {
    teamUnsub = db.collection("team").onSnapshot(snap => {
      S.teamRaw = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.name).localeCompare(String(b.name)));
      S.teamLoaded = true;
      syncSubs();
      markSeen();
      render();
    }, err => { console.warn(err); S.teamLoaded = true; render(); });
  }
  // Record (once a day) that this person has opened the app, so the owner sees who has signed in.
  let seenDone = false;
  function markSeen() {
    const m = myMember();
    if (seenDone || !m || S.owner) return;
    seenDone = true;
    if (m.seenAt && ymd(new Date(m.seenAt)) === today()) return;
    db.doc("team/" + m.id).update({ seenAt: Date.now() }).catch(e => console.warn(e));
  }
  function wantedKeys() {
    const m = myMember();
    if (isManager()) return S.team.filter(m => isBoss() || (!m.isAdmin && inScope(m))).map(keyOf);
    return m ? [S.meId] : [];
  }
  function subscribeKey(key) {
    const s = {};
    s.items = db.collection(`tasks/${key}/items`).where("date", ">=", S.winFrom).onSnapshot(snap => {
      S.items[key] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!snap.metadata.fromCache) S.itemsLoaded[key] = true;
      setTimeout(() => ensureRoutines(key), 0);
      render();
    }, err => console.warn(err));
    s.doc = db.doc(`tasks/${key}`).onSnapshot(snap => {
      S.keyDoc[key] = snap.exists ? snap.data() : {};
      if (!snap.metadata.fromCache) watchAsk(key, S.keyDoc[key]);
      if (!snap.metadata.fromCache) S.docLoaded[key] = true;
      setTimeout(() => ensureRoutines(key), 0);
      render();
    }, err => console.warn(err));
    subs[key] = s;
  }
  function syncSubs(force) {
    const want = new Set(wantedKeys());
    for (const k of Object.keys(subs)) {
      if (!want.has(k) || force) { subs[k].items(); subs[k].doc(); delete subs[k]; if (!want.has(k)) { delete S.items[k]; delete S.keyDoc[k]; } S.itemsLoaded[k] = false; }
    }
    for (const k of want) if (!subs[k]) subscribeKey(k);
  }

  // Create today's copies of daily routines, once per person per day.
  async function ensureRoutines(key) {
    const d = today();
    if (!(isManager() || key === S.meId)) return;
    if (S.readOnly || !S.itemsLoaded[key] || !S.docLoaded[key] || ensured.has(key + "|" + d)) return;
    ensured.add(key + "|" + d);
    const routines = (S.keyDoc[key] && S.keyDoc[key].routines) || [];
    const dow = parse(d).getDay();
    const have = new Set((S.items[key] || []).map(t => t.id));
    for (const r of routines) {
      if (!(r.days || []).includes(dow)) continue;
      const id = `r-${r.id}-${d}`;
      if (have.has(id)) continue;
      try {
        await db.doc(`tasks/${key}/items/${id}`).set({ title: r.title, note: r.note || "", date: d, start: r.start || null, due: r.due || null, status: "todo", hot: !!r.hot, needProof: r.needProof !== false, routine: r.id, by: "owner", createdAt: Date.now() });
      } catch (e) { console.warn(e); break; }
    }
  }

  // ---------- actions ----------
  function setDate(d) {
    S.date = d;
    if (d < S.winFrom) { S.winFrom = addDays(d, -14); syncSubs(true); }
    render();
  }
  function cycle(key, t) {
    const next = NEXT[t.status] || "doing";
    if (!isManager() && next === "done") { S.proofFor = key + "/" + t.id; render(); return; }
    safe(async () => {
      await db.doc(`tasks/${key}/items/${t.id}`).update({ status: next, doneAt: next === "done" ? Date.now() : null, ...(next === "done" ? { returnedAt: null } : {}), ...(next === "doing" && !t.startedAt ? { startedAt: Date.now() } : {}) });
      if (next === "done") ping("done", key, t.id);
    });
  }
  // Proof photos live in their own documents (proofs/<email>/items/<taskId>) and load on demand.
  const proofCache = {};
  function proofSrc(p, key, id) {
    if (!p || !p.photo) return null;
    const k = key + "/" + id;
    if (proofCache[k] === undefined) {
      proofCache[k] = null;
      db.doc(`proofs/${key}/items/${id}`).get()
        .then(d => { proofCache[k] = d.exists ? d.data().data : false; render(); })
        .catch(() => { proofCache[k] = false; render(); });
    }
    return proofCache[k] || null;
  }
  async function shrink(file, maxDim, q) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const sc = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return await new Promise(r => c.toBlob(r, "image/jpeg", q));
    } finally { URL.revokeObjectURL(url); }
  }
  const toDataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  async function pickProof(tag, file) {
    if (!file) return;
    try {
      const blob = await shrink(file, 1400, 0.72);
      if (!blob) throw new Error("no blob");
      const old = S.proofDraft[tag]; if (old) URL.revokeObjectURL(old.preview);
      S.proofDraft[tag] = { blob, file, preview: URL.createObjectURL(blob) };
      render();
    } catch (e) { toast("Foto tidak bisa dibaca. Coba screenshot atau foto format JPG/PNG."); }
  }
  function closeProof(tag) {
    const d = S.proofDraft[tag]; if (d) URL.revokeObjectURL(d.preview);
    delete S.proofDraft[tag]; S.proofFor = null; render();
  }
  async function submitProof(key, t, withoutProof) {
    const tag = key + "/" + t.id;
    const draft = S.proofDraft[tag];
    const linkEl = document.getElementById("pl-" + t.id), noteEl = document.getElementById("pn-" + t.id);
    let link = (linkEl && linkEl.value || "").trim();
    const note = (noteEl && noteEl.value || "").trim();
    if (link && !/^https?:\/\//i.test(link)) link = "https://" + link;
    if (!withoutProof && !draft && !link) return toast("Lampirkan foto/screenshot atau link sebagai bukti");
    S.busy = true; render();
    await safe(async () => {
      let proof = null;
      if (!withoutProof) {
        proof = { at: Date.now() };
        if (link) proof.link = link.slice(0, 500);
        if (draft) {
          let small = await shrink(draft.file, 1200, 0.62);
          let data = await toDataURL(small);
          if (data.length > 650000) { small = await shrink(draft.file, 800, 0.55); data = await toDataURL(small); }
          await db.doc(`proofs/${key}/items/${t.id}`).set({ data, at: Date.now() });
          proofCache[key + "/" + t.id] = data;
          proof.photo = true;
        }
      }
      const upd = { status: "done", doneAt: Date.now(), returnedAt: null };
      if (proof) upd.proof = proof;
      if (note) { upd.report = note; upd.reportAt = Date.now(); }
      await db.doc(`tasks/${key}/items/${t.id}`).update(upd);
      ping("done", key, t.id);
      closeProof(tag);
    }, withoutProof ? "Tugas selesai" : "Tugas selesai dengan bukti");
    S.busy = false; render();
  }
  function sendBack(key, t) {
    const tag = "bk/" + key + "/" + t.id;
    if (S.arm !== tag) { S.arm = tag; render(); setTimeout(() => { if (S.arm === tag) { S.arm = null; render(); } }, 3000); return; }
    S.arm = null;
    safe(async () => { await db.doc(`tasks/${key}/items/${t.id}`).update({ status: "doing", doneAt: null, returnedAt: Date.now() }); ping("back", key, t.id); }, "Tugas dikembalikan. Tulis alasannya di catatan.");
  }
  function del(key, t) {
    const tag = key + "/" + t.id;
    if (S.arm !== tag) { S.arm = tag; render(); setTimeout(() => { if (S.arm === tag) { S.arm = null; render(); } }, 3000); return; }
    S.arm = null;
    safe(async () => {
      await db.doc(`tasks/${key}/items/${t.id}`).delete();
      if (t.proof && t.proof.photo) { try { await db.doc(`proofs/${key}/items/${t.id}`).delete(); } catch (_) {} }
    }, "Tugas dihapus");
  }
  const newTask = (title, extra) => ({ title, note: "", date: S.date, status: "todo", hot: false, createdAt: Date.now(), ...extra });
  function quickAdd(key, inputId, by) {
    const el = document.getElementById(inputId);
    const title = (el && el.value || "").trim();
    if (!title) { el && el.focus(); return; }
    el.value = "";
    const tEl = document.getElementById(inputId + "-t"); const due = (tEl && tEl.value) || null; if (tEl) tEl.value = "";
    const sEl = document.getElementById(inputId + "-s"); const start = (sEl && sEl.value) || null; if (sEl) sEl.value = "";
    safe(async () => { const r = await db.collection(`tasks/${key}/items`).add(newTask(title, { by, start, due, needProof: by === "owner" })); if (by === "owner") { await clearAsk(key); ping("new", key, r.id); } });
  }
  async function clearAsk(key) {
    const kd = S.keyDoc[key];
    if (kd && kd.askAt) await db.doc(`tasks/${key}`).update({ askAt: null });
  }
  const askWork = () => safe(async () => { await db.doc(`tasks/${S.meId}`).set({ askAt: Date.now() }, { merge: true }); ping("ask", S.meId); }, "Permintaan tugas terkirim ke admin");
  function openNote(key, t) {
    S.editNote = key + "/" + t.id; render();
    const el = document.getElementById("rep-" + t.id);
    if (el) { el.value = t.report || ""; el.focus(); }
  }
  function saveNote(key, t) {
    const el = document.getElementById("rep-" + t.id);
    const v = (el && el.value || "").trim();
    S.editNote = null;
    safe(() => db.doc(`tasks/${key}/items/${t.id}`).update({ report: v, reportAt: v ? Date.now() : null }), v ? "Catatan disimpan" : "Catatan dihapus");
  }
  function openAddFor(m) {
    S.showAdd = true; S.addSel = new Set([m.id]); render();
    setTimeout(() => { const el = document.getElementById("add-title"); if (el) { el.scrollIntoView({ block: "center" }); el.focus(); } }, 0);
  }
  async function submitAdd() {
    const title = document.getElementById("add-title").value.trim();
    const note = document.getElementById("add-note").value.trim();
    const dateEl = document.getElementById("add-date");
    const date = (dateEl && dateEl.value) || S.date;
    const due = (document.getElementById("add-time") || {}).value || null;
    const start = (document.getElementById("add-start") || {}).value || null;
    if (start && due && start >= due) return toast("Jam selesai harus setelah jam mulai");
    if (!S.addSel.size) return toast("Pilih minimal satu orang");
    if (!title) { document.getElementById("add-title").focus(); return toast("Tulis judul tugasnya dulu"); }
    if (S.addRoutine && !S.addDays.size) return toast("Pilih hari untuk tugas rutin");
    const people = S.team.filter(m => S.addSel.has(m.id));
    await safe(async () => {
      for (const m of people) {
        const key = keyOf(m);
        if (S.addRoutine) {
          const cur = (S.keyDoc[key] && S.keyDoc[key].routines) || [];
          const r = { id: Math.random().toString(36).slice(2, 9), title, note, hot: S.addHot, needProof: S.addProof, start, due, days: [...S.addDays].sort() };
          await db.doc(`tasks/${key}`).set({ ...(S.keyDoc[key] || {}), routines: [...cur, r] });
          const d = today();
          if (r.days.includes(parse(d).getDay())) await db.doc(`tasks/${key}/items/r-${r.id}-${d}`).set({ title, note, date: d, start, due, status: "todo", hot: S.addHot, needProof: S.addProof, routine: r.id, by: "owner", createdAt: Date.now() });
        } else {
          const r = await db.collection(`tasks/${key}/items`).add({ title, note, date, start, due, status: "todo", hot: S.addHot, needProof: S.addProof, by: "owner", createdAt: Date.now() });
          ping("new", key, r.id);
        }
        if (!S.addRoutine || (S.keyDoc[key] && S.keyDoc[key].askAt)) await clearAsk(key);
      }
    }, S.addRoutine ? "Tugas rutin disimpan" : `Tugas dibagikan ke ${people.length} orang`);
    S.addTime = ""; ["add-title", "add-note", "add-time", "add-start"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    S.addSel.clear(); S.addHot = false; S.addRoutine = false; S.addProof = true; S.showAdd = false;
    render();
  }
  function removeRoutine(key, rid) {
    const tag = "rt/" + key + "/" + rid;
    if (S.arm !== tag) { S.arm = tag; render(); setTimeout(() => { if (S.arm === tag) { S.arm = null; render(); } }, 3000); return; }
    S.arm = null;
    const cur = (S.keyDoc[key] && S.keyDoc[key].routines) || [];
    safe(() => db.doc(`tasks/${key}`).set({ ...(S.keyDoc[key] || {}), routines: cur.filter(r => r.id !== rid) }), "Tugas rutin dihentikan");
  }
  async function moveTasks(from, to) {
    if (!from || from === to) return;
    const snap = await db.collection(`tasks/${from}/items`).get();
    for (const d of snap.docs) {
      await db.doc(`tasks/${to}/items/${d.id}`).set({ ...d.data() });
      await db.doc(`tasks/${from}/items/${d.id}`).delete();
    }
    const pf = await db.collection(`proofs/${from}/items`).get();
    for (const d of pf.docs) {
      await db.doc(`proofs/${to}/items/${d.id}`).set({ ...d.data() });
      await db.doc(`proofs/${from}/items/${d.id}`).delete();
    }
    const kd = await db.doc(`tasks/${from}`).get();
    if (kd.exists) { await db.doc(`tasks/${to}`).set({ ...kd.data() }); await db.doc(`tasks/${from}`).delete(); }
  }
  const cleanEmail = v => (v || "").trim().toLowerCase();
  const validEmail = v => /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(v);
  function addMember() {
    const name = document.getElementById("mem-name").value.trim();
    const role = document.getElementById("mem-role").value.trim();
    const email = cleanEmail(document.getElementById("mem-email").value);
    const group = ((document.getElementById("mem-group") || {}).value || "").trim().toUpperCase();
    if (!name) return toast("Tulis nama anggota");
    if (!isBoss() && !myAdminGroups().includes(group)) return toast("Pilih unit yang kamu kelola");
    if (!validEmail(email)) return toast("Tulis email Google anggota dengan benar");
    if (S.team.some(m => m.id === email)) return toast("Email itu sudah dipakai anggota lain");
    const order = Math.max(0, ...S.team.map(m => m.order || 0)) + 1;
    ["mem-name", "mem-role", "mem-email"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    safe(() => db.doc("team/" + email).set({ name, role, order, ...(group ? { group } : {}) }), `${name} ditambahkan`);
  }
  async function saveSetup() {
    const rows = DEFAULT_TEAM.map((p, i) => ({ ...p, email: cleanEmail((document.getElementById("se-" + i) || {}).value) }));
    const filled = rows.filter(r => r.email);
    const bad = filled.find(r => !validEmail(r.email));
    if (bad) return toast(`Email untuk ${bad.name} belum benar`);
    if (!filled.length) return toast("Isi minimal satu email");
    const dup = filled.find((r, i) => filled.findIndex(x => x.email === r.email) !== i);
    if (dup) return toast(`Email ${dup.email} dipakai dua kali`);
    S.busy = true; render();
    await safe(async () => {
      let order = 0;
      for (const r of filled) await db.doc("team/" + r.email).set({ name: r.name, role: r.role, order: ++order, ...(r.isAdmin ? { isAdmin: true } : {}) });
    }, `${filled.length} anggota tim disimpan`);
    S.busy = false; render();
  }
  function removeMember(m) {
    const tag = "rm/" + m.id;
    if (S.arm !== tag) { S.arm = tag; render(); setTimeout(() => { if (S.arm === tag) { S.arm = null; render(); } }, 3000); return; }
    S.arm = null;
    safe(() => db.doc("team/" + m.id).delete(), `${m.name} dihapus dari tim`);
  }
  // ---------- pieces ----------
  // ---------- reorder (drag & drop, works with mouse and touch) ----------
  let drag = null, pendingRender = false;
  function dragStart(e, id) {
    if (e.button !== undefined && e.button !== 0) return;
    const handle = e.currentTarget;
    const row = handle.closest(".mrow");
    const rows = [...app.querySelectorAll(".mlist .mrow[data-id]")];
    drag = { id, row, rows, startY: e.clientY, target: null, after: false };
    row.classList.add("dragging");
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    handle.addEventListener("pointermove", dragMove);
    handle.addEventListener("pointerup", dragEnd, { once: true });
    handle.addEventListener("pointercancel", dragCancel, { once: true });
    e.preventDefault();
  }
  function dragMove(e) {
    if (!drag) return;
    drag.row.style.transform = `translateY(${e.clientY - drag.startY}px)`;
    drag.rows.forEach(r => r.classList.remove("drop-before", "drop-after"));
    let target = null, after = false;
    for (const r of drag.rows) {
      if (r === drag.row) continue;
      const b = r.getBoundingClientRect();
      if (e.clientY >= b.top && e.clientY <= b.bottom) { target = r; after = e.clientY > b.top + b.height / 2; break; }
    }
    if (!target) {
      const first = drag.rows[0].getBoundingClientRect(), last = drag.rows[drag.rows.length - 1].getBoundingClientRect();
      if (e.clientY < first.top) { target = drag.rows[0]; after = false; }
      else if (e.clientY > last.bottom) { target = drag.rows[drag.rows.length - 1]; after = true; }
    }
    if (target && target !== drag.row) target.classList.add(after ? "drop-after" : "drop-before");
    drag.target = target; drag.after = after;
    // Scroll the page when dragging near the screen edge.
    if (e.clientY < 60) window.scrollBy(0, -12); else if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 12);
  }
  function dragCleanup(handleEl) {
    if (!drag) return;
    drag.row.style.transform = ""; drag.row.classList.remove("dragging");
    drag.rows.forEach(r => r.classList.remove("drop-before", "drop-after"));
    if (handleEl) handleEl.removeEventListener("pointermove", dragMove);
  }
  function dragCancel(e) { dragCleanup(e.currentTarget); drag = null; if (pendingRender) { pendingRender = false; render(); } }
  function dragEnd(e) {
    const d = drag; dragCleanup(e.currentTarget); drag = null;
    if (d && d.target && d.target !== d.row) {
      const ids = S.teamRaw.map(m => m.id).filter(x => x !== d.id);
      let at = ids.indexOf(d.target.dataset.id);
      if (d.after) at += 1;
      ids.splice(at, 0, d.id);
      applyOrder(ids);
    } else if (pendingRender) { pendingRender = false; render(); }
  }
  function moveBy(id, delta) {
    const ids = S.teamRaw.map(m => m.id);
    const i = ids.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    applyOrder(ids);
    setTimeout(() => { const el = app.querySelector(`.mrow[data-id="${CSS.escape(id)}"] .handle`); if (el) el.focus(); }, 0);
  }
  function applyOrder(ids) {
    const changed = [];
    const byId = Object.fromEntries(S.teamRaw.map(m => [m.id, m]));
    ids.forEach((id, i) => { const m = byId[id]; if (m && m.order !== i + 1) { changed.push([id, i + 1]); m.order = i + 1; } });
    S.teamRaw = ids.map(id => byId[id]).filter(Boolean);
    pendingRender = false; render();
    if (!changed.length) return;
    safe(async () => { for (const [id, order] of changed) await db.doc("team/" + id).update({ order }); }, "Urutan tim disimpan");
  }

  function avatar(m, big) {
    if (m.photo) return h("img", { class: "avatar" + (big ? " big" : ""), src: m.photo, alt: "" });
    const hh = hue(m.role || m.name || "");
    return h("div", { class: "avatar" + (big ? " big" : ""), style: `background: hsl(${hh} 52% 42%)`, "aria-hidden": "true" }, initials(m.name || "?"));
  }
  async function squarePhoto(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const side = Math.min(img.naturalWidth, img.naturalHeight), out = 256;
      const c = document.createElement("canvas"); c.width = c.height = out;
      c.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
      return c.toDataURL("image/jpeg", 0.8);
    } finally { URL.revokeObjectURL(url); }
  }
  function openEdit(id, m) {
    S.editMember = id; S.photoDraft = undefined; render();
    const n = document.getElementById("pe-name"), r = document.getElementById("pe-role"), em = document.getElementById("pe-email"), gr = document.getElementById("pe-group");
    if (gr) gr.value = m.group || "";
    if (n) { n.value = m.name || ""; n.focus(); }
    if (r) r.value = m.role || "";
    if (em) em.value = m.id || "";
  }
  function profileForm(m) {
    const photo = S.photoDraft === undefined ? m.photo : S.photoDraft;
    const close = () => { S.editMember = null; S.photoDraft = undefined; render(); };
    return h("form", { class: "pform", onsubmit: e => { e.preventDefault(); saveProfile(m); } },
      h("div", { class: "prow" },
        avatar({ ...m, photo }, true),
        h("div", { class: "chips" },
          h("label", { class: "btn small filebtn" }, h("input", { type: "file", accept: "image/*", id: "pe-photo", onchange: async e => {
            const f = e.target.files[0]; if (!f) return;
            try { S.photoDraft = await squarePhoto(f); render(); } catch (_) { toast("Foto tidak bisa dibaca. Coba format JPG atau PNG."); }
          } }), photo ? "Ganti foto" : "Tambah foto"),
          photo && h("button", { class: "btn small ghost", type: "button", onclick: () => { S.photoDraft = null; render(); } }, "Hapus foto"))),
      h("div", { class: "row" },
        h("label", { class: "field" }, h("span", {}, "Nama"), h("input", { class: "input", id: "pe-name", maxlength: "40" })),
        h("label", { class: "field" }, h("span", {}, "Divisi"), h("input", { class: "input", id: "pe-role", maxlength: "60" })),
        isManager() && m.id !== S.meId && h("label", { class: "field" }, h("span", {}, "Email Google"), h("input", { class: "input", id: "pe-email", type: "email", maxlength: "120" })),
        isManager() && m.id !== S.meId && unitField("pe-group")),
      h("div", { class: "actions" },
        h("button", { class: "btn small ghost", type: "button", onclick: close }, "Batal"),
        h("button", { class: "btn small primary", type: "submit" }, "Simpan profil")));
  }
  function saveProfile(m) {
    const name = (document.getElementById("pe-name").value || "").trim();
    const role = (document.getElementById("pe-role").value || "").trim();
    if (!name) return toast("Nama tidak boleh kosong");
    const photo = (S.photoDraft === undefined ? m.photo : S.photoDraft) || null;
    const emEl = document.getElementById("pe-email"), grEl = document.getElementById("pe-group");
    const email = emEl ? cleanEmail(emEl.value) : m.id;
    const group = grEl ? (grEl.value || "").trim().toUpperCase() : (m.group || "");
    if (grEl && !isBoss() && !myAdminGroups().includes(group)) return toast("Pilih unit yang kamu kelola");
    if (!validEmail(email)) return toast("Email belum benar");
    if (email !== m.id && S.team.some(x => x.id === email)) return toast("Email itu sudah dipakai anggota lain");
    S.editMember = null; S.photoDraft = undefined;
    safe(async () => {
      if (email !== m.id) {
        const { id, ...rest } = m;
        if (!isBoss()) { delete rest.isAdmin; delete rest.adminGroups; }
        await db.doc("team/" + email).set({ ...rest, name, role, photo, group, seenAt: null });
        await moveTasks(m.id, email);
        await db.doc("team/" + m.id).delete();
      } else {
        await db.doc("team/" + m.id).update(grEl ? { name, role, photo, group } : { name, role, photo });
      }
    }, "Profil disimpan");
  }
  function dateNav() {
    const isToday = S.date === today();
    return h("div", { class: "datenav" },
      h("button", { class: "iconbtn", "aria-label": "Hari sebelumnya", onclick: () => setDate(addDays(S.date, -1)) }, "‹"),
      h("div", { class: "lbl" }, h("small", {}, isToday ? "Hari ini" : S.date < today() ? "Lewat" : "Mendatang"), fmtShort(S.date)),
      h("button", { class: "iconbtn", "aria-label": "Hari berikutnya", onclick: () => setDate(addDays(S.date, 1)) }, "›"),
      !isToday && h("button", { class: "btn small", onclick: () => setDate(today()) }, "Hari ini"));
  }
  function jumpTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function mainNav() {
    return h("nav", { class: "mainnav", "aria-label": "Menu utama" },
      h("button", { class: "active", onclick: () => jumpTo("overview") }, "Dashboard"),
      h("button", { onclick: () => { S.showRecap = true; render(); setTimeout(() => jumpTo("analytics"), 0); } }, "Analitik"),
      h("button", { onclick: () => jumpTo("workboard") }, "Pekerjaan"),
      !S.ro && h("button", { onclick: () => jumpTo("manage") }, "Tim"));
  }
  function metricCard(icon, label, value, note, tone) {
    return h("article", { class: "metric " + tone },
      h("div", { class: "metric-top" }, h("span", { class: "metric-icon", "aria-hidden": "true" }, icon), h("span", { class: "metric-label" }, label)),
      h("strong", {}, value),
      h("small", {}, note));
  }
  function bar(c, total) {
    const p = n => total ? (n / total * 100).toFixed(2) + "%" : "0";
    return h("div", { class: "stackbar", role: "img", "aria-label": `${c.done} selesai, ${c.doing} dikerjakan, ${c.todo} belum` },
      h("i", { class: "s-done", style: `width:${p(c.done)}` }), h("i", { class: "s-doing", style: `width:${p(c.doing)}` }));
  }
  function proofPanel(key, t) {
    const tag = key + "/" + t.id, d = S.proofDraft[tag];
    return h("div", { class: "proofpanel" },
      h("b", {}, "Bukti tugas selesai"),
      h("p", { class: "foot" }, "Unggah foto atau screenshot hasil kerja, atau tempel link (Drive, Instagram, TikTok, marketplace). Untuk video, pakai link."),
      d ? h("div", { class: "pv" }, h("img", { src: d.preview, alt: "Pratinjau bukti" }), h("button", { class: "linkbtn", type: "button", onclick: () => { URL.revokeObjectURL(d.preview); delete S.proofDraft[tag]; render(); } }, "Ganti foto"))
        : h("label", { class: "drop" }, h("input", { type: "file", accept: "image/*", id: "pf-" + t.id, onchange: e => pickProof(tag, e.target.files[0]) }), h("span", {}, "📷 Pilih foto / screenshot")),
      h("input", { class: "input", id: "pl-" + t.id, type: "url", inputmode: "url", placeholder: "atau tempel link hasil kerja", maxlength: "500", "aria-label": "Link bukti" }),
      h("textarea", { class: "input", id: "pn-" + t.id, rows: "2", maxlength: "600", placeholder: "Catatan singkat (opsional)", "aria-label": "Catatan" }),
      h("div", { class: "actions" },
        h("button", { class: "btn small ghost", type: "button", onclick: () => closeProof(tag) }, "Batal"),
        !t.needProof && h("button", { class: "btn small", type: "button", disabled: S.busy, onclick: () => submitProof(key, t, true) }, "Selesai tanpa bukti"),
        h("button", { class: "btn small primary", type: "button", disabled: S.busy, onclick: () => submitProof(key, t, false) }, S.busy ? "Mengunggah…" : "Tandai selesai")));
  }
  function taskRow(key, t, { canDelete, isLate }) {
    const tag = key + "/" + t.id;
    return h("li", { class: "task", "data-status": t.status },
      h("button", { class: "status " + t.status, onclick: () => cycle(key, t), disabled: S.readOnly || S.ro, title: S.ro ? STATUS[t.status] : "Ketuk untuk ganti status", "aria-label": `Status: ${STATUS[t.status]}. Ketuk untuk ganti.` }, STATUS[t.status] || "Belum"),
      h("div", { class: "tt" },
        h("b", {}, t.title),
        t.note && h("p", {}, t.note),
        h("div", { class: "meta" },
          timeTags(t),
          t.hot && h("span", { class: "tag hot" }, "Penting"),
          isLate && h("span", { class: "tag late" }, "Dari " + fmtShort(t.date)),
          t.routine && h("span", { class: "tag rut" }, "Rutin"),
          t.by === "self" && h("span", { class: "tag off" }, "Dibuat sendiri"),
          t.returnedAt && t.status !== "done" && h("span", { class: "tag late" }, "Dikembalikan admin"),
          t.status !== "done" && t.needProof && h("span", { class: "tag off" }, "Wajib bukti"),
          t.status === "done" && (t.proof ? h("span", { class: "tag on" }, "✓ Ada bukti") : t.needProof ? h("span", { class: "tag late" }, "Tanpa bukti") : null)),
        t.proof && h("div", { class: "proof" },
          proofSrc(t.proof, key, t.id) && h("button", { class: "thumb", onclick: () => { S.lightbox = proofSrc(t.proof, key, t.id); render(); }, "aria-label": "Lihat foto bukti" }, h("img", { src: proofSrc(t.proof, key, t.id), alt: "Bukti: " + t.title, loading: "lazy" })),
          h("div", { class: "pmeta" },
            h("span", {}, "Bukti · " + fmtTime(t.proof.at)),
            t.proof.photo && !proofSrc(t.proof, key, t.id) && h("span", {}, proofCache[key + "/" + t.id] === false ? "Foto tidak ditemukan" : "Memuat foto…"),
            t.proof.link && h("a", { href: t.proof.link, target: "_blank", rel: "noopener noreferrer" }, (() => { try { return new URL(t.proof.link).hostname.replace(/^www\./, "") + " ↗"; } catch (_) { return "Buka link ↗"; } })()),
            isManager() && t.status === "done" && t.by !== "self" && h("button", { class: "linkbtn", style: "color:var(--warn)", onclick: () => sendBack(key, t) }, S.arm === "bk/" + tag ? "Yakin kembalikan?" : "Kembalikan"))),
        S.proofFor === tag && proofPanel(key, t),
        t.report && S.editNote !== tag && h("div", { class: "report" }, h("span", {}, "Catatan" + (t.reportAt ? " · " + fmtTime(t.reportAt) : "")), h("p", {}, t.report)),
        S.editNote === tag
          ? h("form", { class: "noteform", onsubmit: e => { e.preventDefault(); saveNote(key, t); } },
              h("textarea", { class: "input", id: "rep-" + t.id, rows: "2", maxlength: "600", placeholder: "Progres, kendala, atau link hasil kerja", "aria-label": "Catatan untuk " + t.title }),
              h("div", { class: "actions" },
                h("button", { class: "btn small ghost", type: "button", onclick: () => { S.editNote = null; render(); } }, "Batal"),
                h("button", { class: "btn small primary", type: "submit" }, "Simpan catatan")))
          : !S.readOnly && !S.ro && S.proofFor !== tag && h("button", { class: "linkbtn notebtn", onclick: () => openNote(key, t) }, t.report ? "Ubah catatan" : "+ Catatan")),
      canDelete ? h("button", { class: "del" + (S.arm === tag ? " arm" : ""), onclick: () => del(key, t), "aria-label": "Hapus tugas" }, S.arm === tag ? "Hapus?" : "✕") : h("span"));
  }

  function adminTabs() {
    const t = (id, label) => h("button", { "aria-pressed": String(S.tab === id), onclick: () => { S.tab = id; render(); } }, label);
    return h("div", { class: "seg", role: "group", "aria-label": "Tampilan" }, t("pantau", "Pantau tim"), t("saya", "Tugas saya"));
  }
  function unitField(id) {
    if (!isBoss()) return h("label", { class: "field" }, h("span", {}, "Unit"),
      h("select", { class: "input", id }, myAdminGroups().map(g => h("option", { value: g }, g))));
    return h("label", { class: "field" }, h("span", {}, "Unit (mis. HCS, HCM)"),
      h("input", { class: "input", id, list: "unit-list", maxlength: "20", placeholder: "Kosongkan kalau tidak ada", style: "text-transform:uppercase" }),
      h("datalist", { id: "unit-list" }, units().map(g => h("option", { value: g }))));
  }
  function toggleAdmin(m) {
    // A new admin starts limited to their own unit when they have one; the boss can widen it.
    const upd = m.isAdmin ? { isAdmin: false, adminGroups: [] } : { isAdmin: true, adminGroups: m.group ? [m.group] : [] };
    safe(() => db.doc("team/" + m.id).update(upd), m.isAdmin ? `${m.name} bukan admin lagi` : `${m.name} sekarang admin` + (m.group ? ` untuk unit ${m.group}` : ""));
  }
  function setScope(m, g) {
    const cur = Array.isArray(m.adminGroups) ? m.adminGroups : [];
    const next = g === "*" ? [] : cur.includes(g) ? cur.filter(x => x !== g) : [...cur, g];
    safe(() => db.doc("team/" + m.id).update({ adminGroups: next }), next.length ? `${m.name} mengelola ${next.join(", ")}` : `${m.name} mengelola semua unit`);
  }
  function scopeChips(m) {
    const cur = Array.isArray(m.adminGroups) ? m.adminGroups : [];
    return h("div", { class: "scope" }, h("span", {}, "Kelola:"),
      h("button", { class: "chip", "aria-pressed": String(!cur.length), onclick: () => setScope(m, "*") }, "Semua unit"),
      units().map(g => h("button", { class: "chip", "aria-pressed": String(cur.includes(g)), onclick: () => setScope(m, g) }, g)));
  }
  // ---------- notifications ----------
  // Tell the push Worker that something happened; it verifies the event against the database before sending.
  async function ping(type, email, id) {
    if (!WORKER_URL) return;
    try {
      const t = await idToken();
      if (t) fetch(WORKER_URL + "/notify", { method: "POST", keepalive: true, headers: { authorization: "Bearer " + t, "content-type": "application/json" }, body: JSON.stringify({ type, email, id }) }).catch(() => {});
    } catch (_) {}
  }
  const askSeen = {};
  const canNotify = () => "Notification" in window;
  function watchAsk(key, data) {
    if (!isManager() || key === S.meId) return;
    const a = (data && data.askAt) || 0;
    if (askSeen[key] === undefined) { askSeen[key] = a; return; }
    if (a > askSeen[key]) {
      askSeen[key] = a;
      if (Date.now() - a < 15 * 60000) notifyAsk(key);
    }
  }
  async function notifyAsk(key) {
    const m = S.team.find(x => keyOf(x) === key);
    if (!m) return;
    const title = `${m.name} minta tugas`;
    toast(`✋ ${title}`);
    if (!canNotify() || Notification.permission !== "granted") return;
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, { body: "Semua tugasnya sudah selesai. Ketuk untuk memberi tugas baru.", icon: "./icons/icon-192.png", badge: "./icons/icon-192.png", tag: "ask-" + key, data: { url: "./" } });
    } catch (e) { try { new Notification(title); } catch (_) {} }
  }
  // Push: register this device once permission is granted; refresh the token on every sign-in.
  const pushOK = { v: false };
  pushSupported().then(v => { pushOK.v = v; render(); });
  async function enablePush() {
    try {
      if (await Notification.requestPermission() !== "granted") return render();
      await registerPush(S.meId);
      toast("Notifikasi aktif di perangkat ini");
    } catch (e) {
      console.warn(e);
      toast(e && e.message === "no-vapid" ? "Kunci push belum diisi di config.js" : "Notifikasi gagal diaktifkan. Coba lagi.");
    }
    render();
  }
  const signOutUser = async () => { if (S.meId && canNotify() && Notification.permission === "granted") await unregisterPush(S.meId); return rawSignOut(); };
  function notifyCard() {
    if (!canNotify() || !pushOK.v || Notification.permission !== "default" || S.notifOff) return null;
    return h("section", { class: "tip" },
      h("b", {}, "🔔 Aktifkan notifikasi"),
      h("p", {}, isManager() ? "Dapatkan pemberitahuan saat tugas selesai atau ada yang minta tugas." : "Dapatkan pemberitahuan saat ada tugas baru, tugas dikembalikan, dan pengingat tenggat."),
      h("div", { class: "chips" },
        h("button", { class: "btn primary small", onclick: enablePush }, "Aktifkan"),
        h("button", { class: "btn small ghost", onclick: () => { S.notifOff = true; render(); } }, "Nanti")));
  }

  // ---------- owner ----------
  function ownerView() {
    let all = [];
    for (const m of workers()) { const { day, late } = tasksFor(keyFor(m)); all = all.concat(day, late); }
    const c = tally(all), total = all.length;
    const pct = total ? Math.round(c.done / total * 100) : 0;

    const header = h("header", { class: "top" }, h("div", { class: "top-in" },
      S.ro ? h("div", { class: "brand me" }, avatar(myMember()), h("div", {}, h("h1", {}, "Pantau Tim"), h("p", {}, "Admin · " + workers().length + " orang"))) : h("div", { class: "brand" }, h("h1", {}, "Tugas Harian Tim Kreatif"), h("p", {}, fmtLong(S.date) + " · " + workers().length + " orang" + (isBoss() ? "" : " · Admin " + myAdminGroups().join(", ")))),
      mainNav(), S.ro && adminTabs(),
      dateNav(), userChip()));

    const summary = h("section", { class: "dashboard-overview", id: "overview", "aria-label": "Ringkasan dashboard" },
      h("div", { class: "welcome-card" },
        h("div", {}, h("span", { class: "eyebrow" }, "WORKSPACE HARI INI"), h("h2", {}, "Selamat datang kembali"),
          h("p", {}, total ? `${c.done} dari ${total} tugas tim telah selesai. Pantau ritme kerja dan bantu tim menuntaskan prioritas.` : "Mulai hari dengan membagikan tugas dan menyusun prioritas tim."),
          h("div", { class: "actions hero-actions" },
            !S.ro && h("button", { class: "btn primary", onclick: () => { S.showAdd = true; render(); setTimeout(() => document.getElementById("add-title")?.focus(), 0); } }, "+ Buat tugas"),
            h("button", { class: "btn", onclick: () => { S.showRecap = true; render(); setTimeout(() => jumpTo("analytics"), 0); } }, "Lihat laporan"))),
        h("div", { class: "progress-orbit", style: `--progress:${pct * 3.6}deg` }, h("div", {}, h("strong", {}, pct + "%"), h("span", {}, "Tercapai")))),
      h("div", { class: "metric-grid" },
        metricCard("✓", "Selesai", c.done, total ? `${pct}% dari semua tugas` : "Belum ada tugas", "success"),
        metricCard("↗", "Dikerjakan", c.doing, "Sedang aktif sekarang", "info"),
        metricCard("○", "Belum dimulai", c.todo, c.todo ? "Perlu tindak lanjut" : "Semua terkendali", "neutral"),
        metricCard("!", "Anggota tanpa tugas", workers().filter(m => isIdle(keyFor(m))).length, `Dari ${workers().length} anggota`, "warning")));

    const addPanel = S.showAdd ? h("section", { class: "panel", "aria-label": "Tambah tugas" },
      h("h2", {}, "Tugas baru"),
      h("div", { class: "field" }, h("span", {}, "Untuk siapa"),
        h("div", { class: "chips" },
          h("button", { class: "chip", "aria-pressed": String(S.addSel.size === workers().length && workers().length > 0), onclick: () => { if (S.addSel.size === workers().length) S.addSel.clear(); else workers().forEach(m => S.addSel.add(m.id)); render(); } }, "Semua"),
          workers().map(m => h("button", { class: "chip", "aria-pressed": String(S.addSel.has(m.id)), onclick: () => { S.addSel.has(m.id) ? S.addSel.delete(m.id) : S.addSel.add(m.id); render(); } }, m.name)))),
      h("label", { class: "field" }, h("span", {}, "Tugas"), h("input", { class: "input", id: "add-title", placeholder: "Contoh: Foto produk pashmina warna baru", maxlength: "160", onkeydown: e => { if (e.key === "Enter") submitAdd(); } })),
      h("label", { class: "field" }, h("span", {}, "Catatan (opsional)"), h("textarea", { class: "input", id: "add-note", rows: "2", maxlength: "600", placeholder: "Detail, link brief, atau target" })),
      h("div", { class: "row" },
        !S.addRoutine && h("label", { class: "field" }, h("span", {}, "Tanggal"), h("input", { class: "input", id: "add-date", type: "date", value: S.date })),

        h("label", { class: "check" }, h("input", { type: "checkbox", id: "add-hot", checked: S.addHot, onchange: e => { S.addHot = e.target.checked; } }), "Penting"),
        h("label", { class: "check" }, h("input", { type: "checkbox", id: "add-pf", checked: S.addProof, onchange: e => { S.addProof = e.target.checked; } }), "Wajib bukti"),
        h("label", { class: "check" }, h("input", { type: "checkbox", id: "add-rt", checked: S.addRoutine, onchange: e => { S.addRoutine = e.target.checked; render(); } }), "Ulangi rutin")),
      h("div", { class: "field" }, h("span", {}, "⏰ Jam kerja (opsional)"),
        h("div", { class: "row", style: "gap:10px" },
          h("label", { class: "tl" }, h("span", {}, "Mulai"), h("input", { class: "input timein", id: "add-start", type: "time" })),
          h("label", { class: "tl" }, h("span", {}, "Selesai"), h("input", { class: "input timein", id: "add-time", type: "time" }))),
        h("div", { class: "chips" },
          [["Pagi", "08:00", "12:00"], ["Siang", "13:00", "17:00"], ["Sore", "15:00", "17:00"], ["Malam", "19:00", "21:00"], ["Tanpa jam", "", ""]].map(([lbl, a, b]) =>
            h("button", { class: "chip", type: "button", onclick: () => { document.getElementById("add-start").value = a; document.getElementById("add-time").value = b; } }, a ? `${lbl} ${a}–${b}` : lbl)))),
      S.addRoutine && h("div", { class: "field" }, h("span", {}, "Muncul otomatis setiap"),
        h("div", { class: "chips" }, [1, 2, 3, 4, 5, 6, 0].map(d => h("button", { class: "chip", "aria-pressed": String(S.addDays.has(d)), onclick: () => { S.addDays.has(d) ? S.addDays.delete(d) : S.addDays.add(d); render(); } }, DAYN[d])))),
      h("div", { class: "actions" },
        h("button", { class: "btn ghost", onclick: () => { S.showAdd = false; render(); } }, "Batal"),
        h("button", { class: "btn primary", onclick: submitAdd }, S.addRoutine ? "Simpan tugas rutin" : "Bagikan tugas"))) : null;

    const grid = workers().length ? h("section", { class: "grid", id: "workboard", "aria-label": "Tugas per orang" }, workers().map(personCard))
      : h("div", { class: "panel" }, h("h2", {}, "Daftar tim masih kosong"), h("p", { class: "muted" }, "Tambahkan anggota lewat Kelola tim di bawah."));

    const manage = h("details", { class: "manage", id: "manage", open: S.manageOpen, ontoggle: e => { S.manageOpen = e.target.open; } },
      h("summary", {}, "Kelola tim"),
      h("p", { class: "foot", style: "margin:8px 0" }, isBoss()
        ? "Setiap orang masuk dengan akun Google sesuai email yang terdaftar di sini dan hanya melihat tugasnya sendiri. Admin \"Semua unit\" punya kendali penuh; admin satu unit hanya mengelola orang di unit itu."
        : `Kamu mengelola unit ${myAdminGroups().join(", ")}. Orang di unit lain tidak terlihat di sini.`),
      h("p", { class: "foot", style: "margin:0 0 6px" }, "Tarik ikon ⠿ untuk mengatur urutan. Urutan ini juga dipakai di kartu tugas dan rekap."),
      h("div", { class: "mlist" }, manageable().map(m => [h("div", { class: "mrow", "data-id": m.id },
        h("button", { class: "handle", type: "button", "aria-label": `Geser ${m.name}. Pakai panah atas atau bawah.`, title: "Tarik untuk memindah",
          onpointerdown: e => dragStart(e, m.id), onkeydown: e => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); moveBy(m.id, e.key === "ArrowUp" ? -1 : 1); } } }, "⠿"),
        avatar(m),
        h("div", { class: "who" }, h("b", {}, m.name), h("small", {}, m.role || "—"), h("small", {}, m.id)),
        m.group && h("span", { class: "tag due" }, m.group),
        m.isAdmin && h("span", { class: "tag rut" }, (m.adminGroups && m.adminGroups.length) ? "Admin " + m.adminGroups.join("/") : "Admin penuh"),
        m.seenAt ? h("span", { class: "tag on", title: "Terakhir buka " + fmtShort(ymd(new Date(m.seenAt))) }, "Sudah masuk") : h("span", { class: "tag off" }, "Belum masuk"),
        isBoss() && m.id !== S.meId && h("button", { class: "btn small", onclick: () => toggleAdmin(m) }, m.isAdmin ? "Cabut admin" : "Jadikan admin"),
        h("button", { class: "btn small", onclick: () => S.editMember === m.id ? (S.editMember = null, render()) : openEdit(m.id, m) }, S.editMember === m.id ? "Tutup" : "Ubah"),
        m.id !== S.meId && h("button", { class: "btn small danger", onclick: () => removeMember(m) }, S.arm === "rm/" + m.id ? "Yakin hapus?" : "Hapus"),
        isBoss() && m.isAdmin && m.id !== S.meId && units().length > 0 && scopeChips(m)),
        S.editMember === m.id && profileForm(m)])),
      h("div", { class: "row", style: "border-top:1px solid var(--line); padding-top:12px" },
        h("label", { class: "field" }, h("span", {}, "Nama"), h("input", { class: "input", id: "mem-name", maxlength: "40" })),
        h("label", { class: "field" }, h("span", {}, "Divisi"), h("input", { class: "input", id: "mem-role", maxlength: "60" })),
        h("label", { class: "field" }, h("span", {}, "Email Google"), h("input", { class: "input", id: "mem-email", type: "email", maxlength: "120", onkeydown: e => { if (e.key === "Enter") addMember(); } })),
        unitField("mem-group"),
        h("button", { class: "btn", onclick: addMember }, "Tambah anggota")));

    if (S.ro) return [header, h("main", { class: "wrap" }, summary, idleNotice(), S.showRecap && recapView(), grid,
      h("p", { class: "foot" }, "Data diperbarui langsung. Anggota tim lain tidak bisa melihat halaman pantauan ini."))];
    if (!S.team.length) return [header, setupView()];
    const unitBar = myUnits().length > 1 ? h("div", { class: "chips unitbar", role: "group", "aria-label": "Filter unit" },
      h("button", { class: "chip", "aria-pressed": String(!S.unit), onclick: () => { S.unit = ""; render(); } }, "Semua unit"),
      myUnits().map(g => h("button", { class: "chip", "aria-pressed": String(S.unit === g), onclick: () => { S.unit = g; render(); } }, g))) : null;
    return [header, h("main", { class: "wrap" }, installCard(), notifyCard(), unitBar, summary, idleNotice(), addPanel, S.showRecap && recapView(), grid, manage)];
  }

  function idleNotice() {
    const idle = workers().filter(m => isIdle(keyFor(m)));
    if (!idle.length) return null;
    const asking = idle.filter(m => askedToday(keyFor(m)));
    return h("section", { class: "warnbox big", "aria-label": "Orang tanpa tugas" },
      h("span", { class: "warnico", "aria-hidden": "true" }, "!"),
      h("div", { class: "txt" },
        h("b", {}, `${idle.length} orang tidak punya tugas aktif hari ini` + (asking.length ? `, ${asking.length} sudah minta tugas` : "")),
        h("div", { class: "idle-list", style: "margin-top:6px" }, idle.map(m => S.ro ? h("span", { class: "chip" }, (askedToday(keyFor(m)) ? "✋ " : "") + m.name)
          : h("button", { class: "chip", onclick: () => openAddFor(m), title: "Beri tugas untuk " + m.name },
          (askedToday(keyFor(m)) ? "✋ " : "") + m.name + " +")))));
  }

  function recapView() {
    const n = S.recapDays, t = today();
    const days = Array.from({ length: n }, (_, i) => addDays(S.date, i - n + 1));
    const cellOf = (list, d) => { const l = list.filter(x => x.date === d); return { total: l.length, done: l.filter(x => x.status === "done").length }; };
    const shade = c => {
      if (!c.total) return null;
      const p = c.done / c.total;
      return `background: color-mix(in srgb, var(--accent) ${Math.round(10 + p * 80)}%, var(--surface)); color: ${p >= .55 ? "var(--accent-ink)" : "var(--ink)"}`;
    };
    const cellBtn = (label, c, d) => h("button", {
      class: "cell" + (c.total ? "" : " none") + (d === S.date ? " sel" : ""), style: shade(c),
      title: `${label}, ${fmtShort(d)}: ${c.total ? `${c.done} dari ${c.total} selesai` : "tidak ada tugas"}`,
      "aria-label": `${label}, ${fmtShort(d)}: ${c.total ? `${c.done} dari ${c.total} selesai` : "tidak ada tugas"}`,
      onclick: () => setDate(d) }, c.total ? `${c.done}/${c.total}` : "–");
    const totCell = (done, total) => h("td", { class: "tot" }, h("b", {}, total ? Math.round(done / total * 100) + "%" : "–"), h("small", {}, `${done}/${total}`));
    let gDone = 0, gTot = 0;
    const colTotals = days.map(() => ({ done: 0, total: 0 }));
    const rows = workers().map(m => {
      const key = keyFor(m), list = S.items[key] || [];
      const cells = days.map((d, i) => { const c = cellOf(list, d); colTotals[i].done += c.done; colTotals[i].total += c.total; return c; });
      const done = cells.reduce((a, c) => a + c.done, 0), total = cells.reduce((a, c) => a + c.total, 0);
      gDone += done; gTot += total;
      const warn = S.date === t && isIdle(key);
      return h("tr", {},
        h("th", { class: "who", scope: "row" }, h("b", {}, m.name, warn && h("span", { class: "warnico", title: askedToday(key) ? "Minta tugas" : "Tidak ada tugas aktif", "aria-label": "Tidak ada tugas aktif" }, "!")), h("span", {}, m.role || "")),
        cells.map((c, i) => h("td", {}, cellBtn(m.name, c, days[i]))),
        totCell(done, total));
    });
    const steps = [0, .25, .5, .75, 1];
    return h("section", { class: "recap", id: "analytics", "aria-label": "Rekap" },
      h("div", { class: "recap-h" },
        h("div", {}, h("h2", {}, "Rekap per orang"), h("p", {}, `${fmtShort(days[0])} – ${fmtShort(days[n - 1])} · angka = selesai/total tugas. Ketuk kotak untuk membuka hari itu.`)),
        h("div", { class: "seg", role: "group", "aria-label": "Rentang rekap" },
          [7, 14].map(k => h("button", { "aria-pressed": String(S.recapDays === k), onclick: () => { S.recapDays = k; if (addDays(S.date, -k) < S.winFrom) { S.winFrom = addDays(S.date, -k - 7); syncSubs(true); } render(); } }, `${k} hari`)))),
      h("div", { class: "mxwrap" }, h("table", { class: "mx" },
        h("thead", {}, h("tr", {}, h("th", { class: "who", scope: "col" }, "Orang"),
          days.map(d => h("th", { scope: "col", class: d === t ? "today" : null }, DAYN[parse(d).getDay()], h("small", {}, parse(d).getDate()))),
          h("th", { scope: "col", class: "tot" }, "Total"))),
        h("tbody", {}, rows),
        h("tfoot", {}, h("tr", {}, h("th", { class: "who", scope: "row" }, h("b", {}, "Semua")),
          colTotals.map((c, i) => h("td", {}, cellBtn("Semua", c, days[i]))), totCell(gDone, gTot))))),
      h("div", { class: "legend" },
        h("span", {}, "0%", h("span", { class: "ramp", "aria-hidden": "true" }, steps.map(p => h("i", { style: `background: color-mix(in srgb, var(--accent) ${Math.round(10 + p * 80)}%, var(--surface))` }))), "100% selesai"),
        h("span", {}, h("i", { class: "nobox", "aria-hidden": "true" }), "tidak ada tugas"),
        h("span", { style: "display:inline-flex;gap:6px;align-items:center" }, h("span", { class: "warnico", "aria-hidden": "true" }, "!"), "tidak ada tugas aktif hari ini")));
  }

  function personCard(m) {
    const key = keyFor(m);
    const { day, late } = tasksFor(key);
    const all = day.concat(late), c = tally(all);
    const routines = (S.keyDoc[key] && S.keyDoc[key].routines) || [];
    const qid = "q-" + m.id;
    return h("article", { class: "card" },
      h("div", { class: "card-h" }, avatar(m),
        h("div", { class: "nm" }, h("h3", {}, m.name), h("p", {}, [m.role, m.group].filter(Boolean).join(" · "))),
        m.seenAt ? h("span", { class: "tag on", title: "Sudah pernah membuka aplikasi" }, "Sudah masuk") : h("span", { class: "tag off", title: "Belum membuka aplikasi" }, "Belum masuk")),
      h("div", { class: "meter" }, bar(c, all.length), h("span", {}, `${c.done}/${all.length} selesai`)),
      S.date === today() && isIdle(key) && h("div", { class: "warnbox" },
        h("span", { class: "warnico", "aria-hidden": "true" }, "!"),
        h("div", { class: "txt" }, h("b", {}, askedToday(key) ? `Minta tugas sejak ${fmtTime(S.keyDoc[key].askAt)}` : "Tidak ada tugas aktif"),
          askedToday(key) ? `${m.name} sudah menyelesaikan semua tugasnya.` : "Semua tugas selesai atau belum diberi tugas.")),
      late.length ? [h("div", { class: "sub" }, "Belum selesai sebelumnya"), h("ul", { class: "tasks" }, late.map(t => taskRow(key, t, { canDelete: !S.ro, isLate: true })))] : null,
      day.length ? h("ul", { class: "tasks" }, day.map(t => taskRow(key, t, { canDelete: !S.ro })))
        : (!late.length && h("p", { class: "empty" }, S.itemsLoaded[key] ? "Belum ada tugas di tanggal ini." : "Memuat…")),
      routines.length ? h("div", { class: "routines" }, h("span", {}, "Rutin:"), routines.map(r => h("span", { class: "rt" },
        `${r.title}${r.start || r.due ? " " + [r.start, r.due].filter(Boolean).join("–") : ""} · ${(r.days || []).length === 7 ? "tiap hari" : [1, 2, 3, 4, 5, 6, 0].filter(d => (r.days || []).includes(d)).map(d => DAYN[d]).join(" ")}`,
        !S.ro && h("button", { "aria-label": "Hentikan tugas rutin " + r.title, onclick: () => removeRoutine(key, r.id) }, S.arm === "rt/" + key + "/" + r.id ? "Yakin?" : "×")))) : null,
      !S.ro && h("form", { class: "quick", onsubmit: e => { e.preventDefault(); quickAdd(key, qid, "owner"); } },
        h("input", { class: "input", id: qid, placeholder: `Tugas untuk ${m.name}…`, maxlength: "160", "aria-label": `Tambah tugas untuk ${m.name}` }),
        h("label", { class: "tl" }, h("span", {}, "Mulai"), h("input", { class: "input timein", id: qid + "-s", type: "time", "aria-label": `Jam mulai tugas ${m.name}` })),
        h("label", { class: "tl" }, h("span", {}, "Selesai"), h("input", { class: "input timein", id: qid + "-t", type: "time", "aria-label": `Jam selesai tugas ${m.name}` })),
        h("button", { class: "btn", type: "submit" }, "Tambah")));
  }

  // ---------- member ----------
  function memberView() {
    const m = myMember();
    if (!S.teamLoaded) return loading();
    if (!m) return notRegistered();
    if (m.isAdmin) return ownerView();
    const key = S.meId;
    const { day, late } = tasksFor(key);
    const all = day.concat(late), c = tally(all);
    const header = h("header", { class: "top" }, h("div", { class: "top-in", style: "max-width:680px" },
      m.isAdmin && adminTabs(),
      h("div", { class: "brand me" }, avatar(m),
        h("div", {}, h("h1", {}, "Halo, " + m.name), h("p", {}, m.role || "", " · ", h("button", { class: "linkbtn", onclick: () => S.editMember === "me" ? (S.editMember = null, render()) : openEdit("me", m) }, "Ubah profil")))),
      dateNav(), userChip()));
    const isToday = S.date === today();
    return [header, h("main", { class: "wrap narrow" },
      S.editMember === "me" && h("section", { class: "hello" }, h("h2", { style: "font-size:1.1rem" }, "Profil kamu"), profileForm(m)),
      installCard(), notifyCard(),
      h("section", { class: "hello" },
        h("p", { class: "muted" }, fmtLong(S.date)),
        h("div", { class: "big" }, `${c.done} dari ${all.length}`, h("span", {}, " tugas selesai")),
        bar(c, all.length)),
      isToday && isIdle(key) && h("section", { class: "warnbox big", role: "status" },
        h("span", { class: "warnico", "aria-hidden": "true" }, "!"),
        askedToday(key)
          ? h("div", { class: "txt" }, h("b", {}, `Permintaan terkirim jam ${fmtTime(S.keyDoc[key].askAt)}`), "Admin sudah diberi tahu. Tugas baru akan muncul di sini otomatis.")
          : h("div", { class: "txt" }, h("b", {}, "Kamu tidak punya tugas aktif"), all.length ? "Semua tugas hari ini sudah selesai. Minta tugas berikutnya ke admin." : "Belum ada tugas untukmu hari ini. Minta tugas ke admin."),
        !askedToday(key) && !S.readOnly && h("button", { class: "btn primary", onclick: askWork }, "Minta tugas ke admin")),
      late.length ? h("section", { class: "list" }, h("h2", {}, "Belum selesai dari hari sebelumnya"),
        h("ul", { class: "tasks" }, late.map(t => taskRow(key, t, { canDelete: t.by === "self", isLate: true })))) : null,
      h("section", { class: "list" }, h("h2", {}, isToday ? "Tugas hari ini" : "Tugas " + fmtShort(S.date)),
        day.length ? h("ul", { class: "tasks" }, day.map(t => taskRow(key, t, { canDelete: t.by === "self" })))
          : h("p", { class: "empty" }, S.itemsLoaded[key] ? "Belum ada tugas. Tugas dari atasan akan muncul di sini, atau tambahkan sendiri di bawah." : "Memuat…"),
        !S.readOnly && h("form", { class: "quick", style: "padding:6px", onsubmit: e => { e.preventDefault(); quickAdd(key, "own", "self"); } },
          h("input", { class: "input", id: "own", placeholder: "Tambah tugasku sendiri…", maxlength: "160", "aria-label": "Tambah tugas sendiri" }),
          h("label", { class: "tl" }, h("span", {}, "Mulai"), h("input", { class: "input timein", id: "own-s", type: "time", "aria-label": "Jam mulai (opsional)" })),
          h("label", { class: "tl" }, h("span", {}, "Selesai"), h("input", { class: "input timein", id: "own-t", type: "time", "aria-label": "Jam selesai (opsional)" })),
          h("button", { class: "btn", type: "submit" }, "Tambah"))),
      h("p", { class: "foot" }, "Ketuk status untuk menggantinya: Belum → Dikerjakan → Selesai. Atasan dan admin melihat progres ini; anggota tim lain tidak bisa melihat tugasmu."))];
  }
  function userChip() {
    return h("div", { class: "userchip" },
      h("span", { title: S.meId }, S.meId),
      h("button", { class: "linkbtn", onclick: () => signOutUser() }, "Keluar"));
  }
  function notRegistered() {
    return h("div", { class: "center" }, h("div", {},
      h("h1", { style: "font-size:1.5rem" }, "Email belum terdaftar"),
      h("p", { class: "muted" }, "Kamu masuk sebagai ", h("b", {}, S.meId), ". Email ini belum ada di daftar tim."),
      h("p", { class: "muted" }, "Kirim email ini ke pemilik aplikasi supaya ditambahkan, lalu buka aplikasi lagi. Atau keluar dan masuk dengan akun Google lain."),
      h("div", {}, h("button", { class: "btn", onclick: () => signOutUser() }, "Keluar dan ganti akun"))));
  }
  function setupView() {
    return h("main", { class: "wrap narrow" },
      h("section", { class: "hello" },
        h("h2", { style: "font-size:1.3rem" }, "Isi email tim"),
        h("p", { class: "muted" }, "Tulis email Google setiap orang. Email ini dipakai untuk masuk ke aplikasi, dan setiap orang hanya melihat tugasnya sendiri. Yang belum tahu emailnya boleh dikosongkan dan ditambahkan nanti di Kelola tim.")),
      h("section", { class: "list", style: "padding:14px; gap:10px" },
        DEFAULT_TEAM.map((p, i) => h("label", { class: "setup-row" },
          avatar(p),
          h("span", { class: "who" }, h("b", {}, p.name), h("small", {}, p.role + (p.isAdmin ? " · kendali penuh seperti pemilik" : ""))),
          h("input", { class: "input", id: "se-" + i, type: "email", placeholder: "nama@gmail.com", autocomplete: "off", "aria-label": "Email " + p.name }))),
        h("div", { class: "actions" }, h("button", { class: "btn primary", disabled: S.busy, onclick: saveSetup }, S.busy ? "Menyimpan…" : "Simpan tim"))));
  }
  // ---------- install (PWA) ----------
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; render(); });
  window.addEventListener("appinstalled", () => { installEvt = null; toast("Aplikasi terpasang"); });
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  function tipHidden() { try { return localStorage.getItem("tipInstall") === "1"; } catch (_) { return S.tipOff; } }
  function hideTip() { S.tipOff = true; try { localStorage.setItem("tipInstall", "1"); } catch (_) {} render(); }
  function installCard() {
    if (isStandalone() || S.tipOff || tipHidden()) return null;
    if (installEvt) return h("section", { class: "tip" },
      h("b", {}, "Pasang aplikasi di HP-mu"),
      h("p", {}, "Supaya bisa dibuka dari ikon di layar utama, tanpa mencari link lagi."),
      h("div", { class: "chips" },
        h("button", { class: "btn primary small", onclick: async () => { const ev = installEvt; installEvt = null; ev.prompt(); try { await ev.userChoice; } catch (_) {} render(); } }, "Pasang aplikasi"),
        h("button", { class: "btn small ghost", onclick: hideTip }, "Nanti saja")));
    return h("section", { class: "tip" },
      h("b", {}, "Pasang aplikasi di HP-mu"),
      isIOS()
        ? h("p", {}, "Di Safari, ketuk tombol Bagikan ⬆ lalu pilih ", h("em", {}, "Tambah ke Layar Utama"), ".")
        : h("p", {}, "Di Chrome, ketuk menu ⋮ lalu pilih ", h("em", {}, "Instal aplikasi"), " atau ", h("em", {}, "Tambahkan ke layar utama"), "."),
      h("div", {}, h("button", { class: "btn small", onclick: hideTip }, "Mengerti, sembunyikan")));
  }
  function loading() { return h("div", { class: "center" }, h("div", {}, h("p", { class: "muted" }, "Memuat tugas…"))); }
  function loginView() {
    return h("div", { class: "center login" }, h("div", {},
      h("img", { src: "./icons/icon-192.png", alt: "", width: "72", height: "72", style: "border-radius:18px; margin:0 auto" }),
      h("h1", { style: "font-size:1.7rem" }, "Tugas Harian Tim Kreatif"),
      h("p", { class: "muted" }, "Masuk dengan akun Google yang emailnya sudah didaftarkan pemilik."),
      h("div", {}, h("button", { class: "btn primary big", disabled: S.busy, onclick: async () => {
        S.busy = true; render();
        try { await signIn(); } catch (e) { console.warn(e); if (!e || e.code !== "auth/popup-closed-by-user") toast("Gagal masuk. Coba lagi."); }
        S.busy = false; render();
      } }, S.busy ? "Membuka Google…" : "Masuk dengan Google")),
      installCard()));
  }

  // ---------- render ----------
  function render() {
    if (drag) { pendingRender = true; return; }
    const keep = {};
    app.querySelectorAll("input[id], textarea[id]").forEach(el => { if (el.type !== "checkbox") keep[el.id] = el.value; });
    const a = document.activeElement, aid = a && a.id, sel = a && "selectionStart" in a ? [a.selectionStart, a.selectionEnd] : null;
    let view;
    if (S.mode === "loading") view = loading();
    else if (S.mode === "login") view = loginView();
    else if (S.mode === "owner") view = S.teamLoaded ? ownerView() : loading();
    else view = memberView();
    app.replaceChildren(...[].concat(view), ...(S.toast ? [h("div", { class: "toast", role: "status" }, S.toast)] : []),
      ...(S.lightbox ? [h("div", { class: "lightbox", role: "dialog", "aria-label": "Foto bukti", onclick: () => { S.lightbox = null; render(); } }, h("img", { src: S.lightbox, alt: "Foto bukti" }), h("button", { class: "iconbtn", "aria-label": "Tutup" }, "✕"))] : []));
    for (const [id, v] of Object.entries(keep)) { const el = document.getElementById(id); if (el && el.type !== "checkbox" && el.type !== "date") el.value = v; else if (el && el.type === "date" && v) el.value = v; }
    if (aid) { const el = document.getElementById(aid); if (el) { el.focus(); try { if (sel && el.setSelectionRange) el.setSelectionRange(sel[0], sel[1]); } catch (_) {} } }
  }
  // ---------- boot ----------
  document.addEventListener("keydown", e => { if (e.key === "Escape" && S.lightbox) { S.lightbox = null; render(); } });
  render();
  let tick = null;
  function resetState() {
    for (const k of Object.keys(subs)) { subs[k].items(); subs[k].doc(); delete subs[k]; }
    if (teamUnsub) { teamUnsub(); teamUnsub = null; }
    Object.assign(S, { teamRaw: [], teamLoaded: false, items: {}, keyDoc: {}, itemsLoaded: {}, docLoaded: {}, editMember: null, showAdd: false });
    seenDone = false; ensured.clear();
  }
  onUser(u => {
    resetState();
    if (!u || !u.email) { S.mode = "login"; S.meId = null; return render(); }
    S.meId = u.email.toLowerCase();
    S.owner = S.meId === OWNER_EMAIL.toLowerCase();
    S.mode = S.owner ? "owner" : "member";
    subTeam();
    if (canNotify() && Notification.permission === "granted") pushSupported().then(ok => ok && registerPush(S.meId)).catch(e => console.warn("push", e));
    render();
    if (!tick) {
      // Roll the day over if the app stays open past midnight, and refresh "late" labels each minute.
      let last = today();
      tick = setInterval(() => { const t = today(); if (t !== last) { if (S.date === last) S.date = t; last = t; for (const k of Object.keys(subs)) ensureRoutines(k); } if (!S.busy) render(); }, 60000);
    }
  });
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(e => console.warn("sw", e)));
})();
