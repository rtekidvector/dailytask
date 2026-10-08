import webpush from "web-push";
import { eq } from "drizzle-orm";
import type { Db } from "./db/index.js";
import { meta, members, pushSubs } from "./db/schema.js";

export function createPush(db: Db, ownerEmail: string, appUrl: string) {
  // VAPID keys are generated once and kept in the database.
  const get = (k: string) => db.select().from(meta).where(eq(meta.k, k)).get()?.v;
  let pub = get("vapid_pub"), priv = get("vapid_priv");
  if (!pub || !priv) {
    ({ publicKey: pub, privateKey: priv } = webpush.generateVAPIDKeys());
    db.insert(meta).values([{ k: "vapid_pub", v: pub }, { k: "vapid_priv", v: priv }]).run();
  }
  webpush.setVapidDetails("mailto:" + ownerEmail, pub, priv);

  /** Push to every device of every listed person. Failures never throw: a notification must not break the request. */
  async function send(emails: Iterable<string>, title: string, body: string, tag = "") {
    const payload = JSON.stringify({ title, body, tag, url: appUrl });
    for (const email of new Set(emails)) {
      for (const row of db.select().from(pushSubs).where(eq(pushSubs.email, email)).all()) {
        try { await webpush.sendNotification(row.sub, payload, { TTL: 86400, urgency: "high" }); }
        catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) db.delete(pushSubs).where(eq(pushSubs.endpoint, row.endpoint)).run();
          else console.warn("push", code ?? (e as Error).message);
        }
      }
    }
  }
  /** The owner, admins of all units, and admins of this person's unit (except the person themself). */
  function managersOf(email: string): string[] {
    const team = db.select({ email: members.email, group: members.group, isAdmin: members.isAdmin, adminGroups: members.adminGroups }).from(members).all();
    const group = team.find(m => m.email === email)?.group ?? "";
    const out = [ownerEmail];
    for (const m of team) {
      if (!m.isAdmin || m.email === email) continue;
      if (!m.adminGroups.length || m.adminGroups.includes(group)) out.push(m.email);
    }
    return out;
  }
  return { publicKey: pub, send, managersOf, ownerEmail };
}
export type Push = ReturnType<typeof createPush>;
