import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SQL } from "bun"

/** Use only explicitly passed configuration, including when the project has a real .env. */
export function isolatedEnv(database = "", openai = false) {
  return { ...process.env, DATABASE_URL: database, DATABASE_URL_UNPOOLED: database,
    OPENAI_API_KEY: openai ? process.env.OPENAI_API_KEY ?? "" : "", ZOCDOC_MODE: "mock", PORT: "3000" }
}

/** A private loopback cluster exercises the same PostgreSQL migration and constraints as Neon. */
export async function startPostgres() {
  if (!Bun.which("initdb") || !Bun.which("pg_ctl")) {
    throw new Error("Install PostgreSQL client and server tools (initdb and pg_ctl) to run the offline database cases.")
  }
  const dir = await mkdtemp(join(tmpdir(), "inifinichat-eval-"))
  const data = join(dir, "data")
  const password = crypto.randomUUID()
  let running = false
  const run = async (cmd: string[], env = isolatedEnv()) => {
    const proc = Bun.spawn(cmd, { env, stdout: "ignore", stderr: "ignore" })
    if (await proc.exited) {
      throw new Error(`${cmd[0]} failed during temporary database setup.`)
    }
  }
  async function stop() {
    if (running) {
      await run(["pg_ctl", "-D", data, "-m", "fast", "-w", "stop"])
    }
    await rm(dir, { recursive: true, force: true })
  }
  try {
    // authenticate even local TCP connections to the isolated cluster
    const passwordFile = join(dir, "password")
    await writeFile(passwordFile, password, { mode: 0o600 })
    await run(["initdb", "-D", data, "-A", "scram-sha-256", "-U", "eval", "--pwfile", passwordFile, "--no-sync", "--locale=C", "-E", "UTF8"])
    const portProbe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() })
    const port = portProbe.port
    await portProbe.stop(true)
    await run(["pg_ctl", "-D", data, "-w", "-t", "15", "-l", join(dir, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -k ''`, "start"])
    running = true
    const url = `postgres://eval:${password}@127.0.0.1:${port}/postgres`
    await run([process.execPath, "--no-env-file", "src/storage/seed.ts"], isolatedEnv(url))
    return { url, stop }
  } catch (error) { await stop(); throw error }
}

/** Restart the actual Bun app and its connection pool without touching the database. */
export async function startProbe(database: string, openai = false) {
  const child = Bun.spawn([process.execPath, "--no-env-file", "evals/probe.ts", ...(openai ? ["--openai"] : [])], {
    env: isolatedEnv(database, openai), stdout: "pipe", stderr: "ignore",
  })
  const stop = async () => { child.kill(); await child.exited }
  try {
    const reader = child.stdout.getReader()
    const timer = setTimeout(() => child.kill(), 12_000)
    try {
      const { value } = await reader.read()
      const origin = new URL(new TextDecoder().decode(value).trim()).origin
      return { origin, stop }
    } finally { clearTimeout(timer); reader.releaseLock() }
  } catch { await stop(); throw new Error("The evaluation app failed to start.") }
}

/** Seed a foreign appointment only in the private, disposable eval database. */
export async function seedOtherOwner(localUrl: string) {
  const db = new SQL({ url: localUrl, max: 1 })
  try {
    await db.begin(async tx => {
      await tx`INSERT INTO inifinichat_demo.patients (id,name) VALUES ('eval-other','Synthetic Eval')`
      await tx`INSERT INTO inifinichat_demo.appointments (id, patient_id, doctor, provider_id, location_id, slot_id, time_zone, starts_at, status, notes)
        SELECT 'eval-other-visit','eval-other',doctor,provider_id,location_id,slot_id,time_zone,starts_at,'canceled',''
        FROM inifinichat_demo.appointments WHERE id='demo-visit'`
    })
  } finally { await db.close() }
}
