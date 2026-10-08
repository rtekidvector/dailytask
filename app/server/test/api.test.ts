import { beforeEach, describe, expect, it } from "vitest";
import { ensureRoutines, runReminders } from "../src/jobs.js";
import { members, tasks } from "../src/db/schema.js";
import { wib } from "@shared/time";
import { JPEG, OWNER, setup } from "./helpers.js";

describe("api", () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => { t = setup(); });

  it("rejects anonymous requests and writes without the x-app header", async () => {
    expect((await t.call(null, "GET", "/tasks")).status).toBe(401);
    expect((await t.call("a@x.id", "POST", "/ask", undefined, { "x-app": "0" })).status).toBe(400);
  });

  it("logs in through Google and sets an httpOnly cookie", async () => {
    const r = await t.call(null, "POST", "/auth/google", { credential: "google:a@x.id" });
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toMatch(/th_session=.*HttpOnly/i);
  });

  it("manager assigns a task; the person sees it, others do not", async () => {
    const r = await t.call(OWNER, "POST", "/tasks", { emails: ["a@x.id"], title: "Foto produk", due: "17:00" });
    expect(r.status).toBe(201);
    const mine = await (await t.call("a@x.id", "GET", "/tasks?from=2000-01-01")).json();
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ title: "Foto produk", by: "owner", status: "todo" });
    expect(await (await t.call("b@x.id", "GET", "/tasks?from=2000-01-01")).json()).toHaveLength(0);
    expect(t.sent.some(s => s.title === "Tugas baru" && s.to[0] === "a@x.id")).toBe(true);
  });

  it("unit admin cannot assign outside their unit", async () => {
    expect((await t.call("hcs@x.id", "POST", "/tasks", { emails: ["b@x.id"], title: "x" })).status).toBe(403);
    expect((await t.call("hcs@x.id", "POST", "/tasks", { emails: ["a@x.id"], title: "x" })).status).toBe(201);
  });

  it("member cannot forge an admin task or assign to others", async () => {
    expect((await t.call("a@x.id", "POST", "/tasks", { emails: ["b@x.id"], title: "x" })).status).toBe(403);
    const r = await t.call("a@x.id", "POST", "/tasks", { emails: ["a@x.id"], title: "Punyaku", needProof: true });
    const [row] = t.db.select().from(tasks).all();
    expect(r.status).toBe(201);
    expect(row).toMatchObject({ by: "self", needProof: false });
  });

  it("proof is required to finish an assigned task and the server sets the timestamps", async () => {
    const { ids } = await (await t.call(OWNER, "POST", "/tasks", { emails: ["a@x.id"], title: "T" })).json();
    expect((await t.call("a@x.id", "PATCH", `/tasks/${ids[0]}/status`, { status: "done" })).status).toBe(400);
    const empty = new FormData();
    expect((await t.call("a@x.id", "POST", `/tasks/${ids[0]}/complete`, empty)).status).toBe(400);
    const fd = new FormData();
    fd.set("photo", new File([JPEG], "p.jpg", { type: "image/jpeg" })); fd.set("note", "beres");
    expect((await t.call("a@x.id", "POST", `/tasks/${ids[0]}/complete`, fd)).status).toBe(200);
    const [row] = t.db.select().from(tasks).all();
    expect(row).toMatchObject({ status: "done", hasPhoto: true, report: "beres" });
    expect(row!.doneAt).toBeGreaterThan(Date.now() - 5000);
    expect((await t.call("a@x.id", "GET", `/tasks/${ids[0]}/proof`)).status).toBe(200);
    expect((await t.call("b@x.id", "GET", `/tasks/${ids[0]}/proof`)).status).toBe(404);
    expect(t.sent.some(s => s.title.includes("menyelesaikan"))).toBe(true);
  });

  it("rejects non-JPEG uploads", async () => {
    const { ids } = await (await t.call(OWNER, "POST", "/tasks", { emails: ["a@x.id"], title: "T" })).json();
    const fd = new FormData(); fd.set("photo", new File([new Uint8Array([1, 2, 3, 4, 5])], "x.png"));
    expect((await t.call("a@x.id", "POST", `/tasks/${ids[0]}/complete`, fd)).status).toBe(400);
  });

  it("manager returns a finished task", async () => {
    const { ids } = await (await t.call(OWNER, "POST", "/tasks", { emails: ["a@x.id"], title: "T", needProof: false })).json();
    const fd = new FormData(); fd.set("skipProof", "1");
    await t.call("a@x.id", "POST", `/tasks/${ids[0]}/complete`, fd);
    expect((await t.call("a@x.id", "POST", `/tasks/${ids[0]}/return`)).status).toBe(403);
    expect((await t.call("hcs@x.id", "POST", `/tasks/${ids[0]}/return`)).status).toBe(200);
    expect(t.db.select().from(tasks).get()).toMatchObject({ status: "doing", doneAt: null });
  });

  it("comments: visible people can write, only the author or a manager can delete", async () => {
    const { ids } = await (await t.call(OWNER, "POST", "/tasks", { emails: ["a@x.id"], title: "T" })).json();
    expect((await t.call("b@x.id", "POST", `/tasks/${ids[0]}/comments`, { text: "hi" })).status).toBe(404);
    const c = await (await t.call("a@x.id", "POST", `/tasks/${ids[0]}/comments`, { text: "siap" })).json();
    const list = await (await t.call("a@x.id", "GET", "/tasks?from=2000-01-01")).json();
    expect(list[0].comments[0]).toMatchObject({ text: "siap", by: "A" });
    expect((await t.call("b@x.id", "DELETE", `/tasks/${ids[0]}/comments/${c.id}`)).status).toBe(403);
    expect((await t.call("hcs@x.id", "DELETE", `/tasks/${ids[0]}/comments/${c.id}`)).status).toBe(200);
  });

  it("routines create today's task once and renaming an email keeps the tasks", async () => {
    const dow = new Date().getDay();
    await t.call(OWNER, "POST", "/tasks", { emails: ["a@x.id"], title: "Rutin", routineDays: [0, 1, 2, 3, 4, 5, 6] });
    const date = wib().date;
    expect(ensureRoutines(t.db, date)).toBe(0);              // already created at creation time
    expect(t.db.select().from(tasks).all()).toHaveLength(1);
    expect(ensureRoutines(t.db, "2099-01-04")).toBe(1);       // another day -> a new copy
    expect(ensureRoutines(t.db, "2099-01-04")).toBe(0);       // idempotent
    expect(dow).toBeGreaterThanOrEqual(0);
    expect((await t.call(OWNER, "POST", "/team/a@x.id/move", { email: "new@x.id" })).status).toBe(200);
    expect(t.db.select().from(tasks).all().every(x => x.email === "new@x.id")).toBe(true);
  });

  it("team: only a boss makes admins; members edit just their own name/role", async () => {
    expect((await t.call("hcs@x.id", "PATCH", "/team/a@x.id", { isAdmin: true })).status).toBe(403);
    expect((await t.call("a@x.id", "PATCH", "/team/a@x.id", { name: "Aa" })).status).toBe(200);
    expect((await t.call("a@x.id", "PATCH", "/team/a@x.id", { isAdmin: true })).status).toBe(403);
    expect((await t.call("a@x.id", "PATCH", "/team/b@x.id", { name: "x" })).status).toBe(403);
    expect((await t.call(OWNER, "PATCH", "/team/a@x.id", { isAdmin: true })).status).toBe(200);
    expect(t.db.select().from(members).all().find(m => m.email === "a@x.id")).toMatchObject({ isAdmin: true, adminGroups: ["HCS"] });
  });

  it("ask-for-work notifies managers", async () => {
    expect((await t.call("a@x.id", "POST", "/ask")).status).toBe(200);
    const s = t.sent.find(x => x.title.includes("minta tugas"));
    expect(s?.to).toEqual(expect.arrayContaining([OWNER, "vero@x.id", "hcs@x.id"]));
    expect(s?.to).not.toContain("a@x.id");
  });

  it("deadline reminder fires once, 30 minutes before", async () => {
    const date = wib().date;
    t.db.insert(tasks).values({ id: "t1", email: "a@x.id", date, title: "Deadline", due: "10:00", createdAt: 1 }).run();
    const before = Date.parse(`${date}T09:40:00+07:00`);
    await runReminders(t.db, t.push, before);
    await runReminders(t.db, t.push, before + 60000);
    expect(t.sent.filter(s => s.title === "Tenggat sebentar lagi")).toHaveLength(1);
    await runReminders(t.db, t.push, Date.parse(`${date}T10:05:00+07:00`));
    expect(t.sent.filter(s => s.title === "Tugas terlambat")).toHaveLength(1);
  });
});
