import { readFile, mkdir, rm, open, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
const dist = dirname(fileURLToPath(import.meta.url));
const data =
  process.env.CAPPL_PALS_DATA ??
  join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "cappl-pals");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function endpoint() {
  try {
    const info = JSON.parse(
      await readFile(join(data, "endpoint.json"), "utf8"),
    );
    const r = await fetch(`http://127.0.0.1:${info.port}/health`, {
      headers: { Authorization: `Bearer ${info.token}` },
      signal: AbortSignal.timeout(1000),
    });
    if (r.ok) return info;
  } catch {}
}
async function ensure() {
  const existing = await endpoint();
  if (existing) return existing;
  await mkdir(data, { recursive: true, mode: 0o700 });
  const lock = join(data, "startup.lock");
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await mkdir(lock);
      try {
        const ready = await endpoint();
        if (ready) return ready;
        const log = await open(join(data, "daemon.log"), "a", 0o600);
        const child = spawn(process.execPath, [join(dist, "server.mjs")], {
          detached: true,
          stdio: ["ignore", log.fd, log.fd],
          env: { ...process.env, CAPPL_PALS_DATA: data },
        });
        child.unref();
        await log.close();
        for (let wait = 0; wait < 60; wait++) {
          await sleep(100);
          const ready = await endpoint();
          if (ready) return ready;
        }
        throw Error("Companion did not start; see " + join(data, "daemon.log"));
      } finally {
        await rm(lock, { recursive: true, force: true });
      }
    } catch (e: any) {
      if (e.code !== "EEXIST") throw e;
      const info = await stat(lock).catch(() => undefined);
      if (info && Date.now() - info.mtimeMs > 20000)
        await rm(lock, { recursive: true, force: true });
      await sleep(100);
      const ready = await endpoint();
      if (ready) return ready;
    }
  }
  throw Error("Timed out waiting for companion startup");
}
const command = process.argv[2] ?? "open";
try {
  const info = await ensure();
  const request = async (path: string, body: any) => {
    const r = await fetch(`http://127.0.0.1:${info.port}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${info.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const result = await r.json();
    if (!r.ok) throw Error(result.error);
    return result;
  };
  if (command === "hook") {
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    await request("/hook", JSON.parse(input));
    console.log("{}");
  } else if (command === "open") {
    const url = `http://127.0.0.1:${info.port}/?token=${info.token}`;
    const [bin, ...args] =
      process.platform === "darwin"
        ? ["open", url]
        : process.platform === "win32"
          ? ["cmd", "/c", "start", "", url]
          : ["xdg-open", url];
    const child = spawn(bin, args, { stdio: "ignore" });
    child.on("error", () => console.error("Open this address: " + url));
    child.unref();
    console.log(url);
  } else if (command === "stop") process.kill(info.pid, "SIGTERM");
  else if (command === "url")
    console.log(`http://127.0.0.1:${info.port}/?token=${info.token}`);
  else if (command === "language")
    await request("/language", { language: process.argv[3] });
  else if (command === "command") {
    const result = await request("/command", {
      command: process.argv[3],
      args: process.argv.slice(4).join(" "),
      session: process.env.CAPPL_PALS_SESSION,
    });
    console.log(result.text ?? "");
  } else
    throw Error(
      "Usage: cli.mjs open|url|stop|hook|language ko|en|command cappl[-pick|-status|-rules|-sound] [args]",
    );
} catch (e: any) {
  console.error("cappl-pals: " + e.message);
  if (command === "hook") console.log("{}");
  else process.exitCode = 1;
}
