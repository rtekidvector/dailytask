import { z } from "zod";

const schema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1),
  OWNER_EMAIL: z.string().email().transform(s => s.toLowerCase()),
  PUBLIC_URL: z.string().url(),
  DATA_DIR: z.string().default("./data"),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("127.0.0.1"),
  WEB_DIR: z.string().default("../web/dist"),
  DEV_AUTO_LOGIN: z.string().email().optional(),
  ALLOW_DEV_LOGIN: z.string().optional().transform(v => v === "1"),
});
export type Env = z.infer<typeof schema>;

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const r = schema.safeParse(source);
  if (!r.success) {
    console.error("Konfigurasi belum lengkap:", r.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "));
    process.exit(1);
  }
  return r.data;
}
