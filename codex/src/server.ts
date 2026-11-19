import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { Engine } from "./engine";
import { toolEvent, toolResult } from "./events";
const dist = dirname(fileURLToPath(import.meta.url));
const root = dirname(dist);
const data = process.env.CAPPL_PALS_DATA!;
await mkdir(data, { recursive: true, mode: 0o700 });
let values: Record<string, any>;
try {
  values = JSON.parse(await readFile(join(data, "store.json"), "utf8"));
} catch (e: any) {
  if (e.code !== "ENOENT") throw e;
  values = {};
}
let queue = Promise.resolve<any>(undefined);
export function serial<T>(fn: () => Promise<T>): Promise<T> {
  const task = queue.then(fn);
  queue = task.catch((e) => console.error(e));
  return task;
}
let saveQueue = Promise.resolve();
const save = () => {
  const snapshot = JSON.stringify(values);
  const job = saveQueue.then(async () => {
    const path = join(data, "store.json");
    await writeFile(`${path}.tmp`, snapshot, { mode: 0o600 });
    await rename(`${path}.tmp`, path);
  });
  saveQueue = job.catch(() => {});
  return job;
};
const store = {
  keys: async () => Object.keys(values),
  get: async (key: string) => structuredClone(values[key]),
  set: async (key: string, value: any) => {
    values[key] = structuredClone(value);
    await save();
  },
  delete: async (key: string) => {
    delete values[key];
    await save();
  },
};
const engines = new Map<string, Engine>();
const seen = new Set<string>(values.hookReceipts ?? []);
const commands = new Set([
  "cappl",
  "cappl-pick",
  "cappl-status",
  "cappl-rules",
  "cappl-sound",
  "cappl-plan-approved",
]);
const background = (fn: () => Promise<any>) => {
  void serial(fn);
};
async function engine(id: string) {
  if (!id || id.length > 256) throw new Error("Invalid session id");
  let instance = engines.get(id);
  if (!instance) {
    instance = new Engine(id, store, root, values.language ?? "ko", background);
    engines.set(id, instance);
    await instance.init(join(dist, "pal.mjs"));
  }
  return instance;
}
async function hook(input: any) {
  const id = input.session_id;
  const e = await engine(id);
  const name = input.hook_event_name;
  const key = input.tool_use_id ? `${id}:${name}:${input.tool_use_id}` : "";
  if (key && seen.has(key)) return {};
  const event = toolEvent(input);
  const callId =
    input.tool_use_id ?? `${input.turn_id}:${event.tool}:${event.command}`;
  if (name === "UserPromptSubmit") {
    await e.emit("prompt.submit", {});
    await e.emit("turn.start", {});
  }
  if (name === "PreModelRequest" && !input.agent_id)
    await e.emit("turn.start", {});
  if (name === "PreToolUse") await e.preTool(callId, event);
  if (name === "PostToolUse") {
    const result = toolResult(input.tool_response);
    // A long shell command is completed by write_stdin, not the launch response.
    if (result.pending) {
      const prior = pendingShell.get(result.shellSession!);
      if (prior) {
        prior.text += "\n" + result.text;
        await e.postTool(callId, event, { deny: "poll only" });
      } else
        pendingShell.set(result.shellSession!, {
          engine: e,
          callId,
          event,
          text: result.text,
        });
    } else if (
      event.tool === "Bash" &&
      input.tool_input?.session_id &&
      pendingShell.has(String(input.tool_input.session_id))
    ) {
      const prior = pendingShell.get(String(input.tool_input.session_id))!;
      await prior.engine.postTool(prior.callId, prior.event, {
        ...result,
        text: prior.text + "\n" + result.text,
      });
      pendingShell.delete(String(input.tool_input.session_id));
      await e.postTool(callId, event, { deny: "poll only" });
    } else await e.postTool(callId, event, result);
  }
  if (name === "PermissionRequest")
    await e.emit("classic.Notification", { notification_type: "permission" });
  if (name === "Stop") await e.emit("turn.complete", {});
  if (name === "Interrupt" || name === "SessionEnd") {
    await e.interrupt();
    for (const [key, pending] of pendingShell)
      if (pending.engine === e) pendingShell.delete(key);
  }
  await e.persist();
  if (key) {
    seen.add(key);
    if (seen.size > 10000) seen.delete(seen.values().next().value!);
  }
  await store.set("hookReceipts", [...seen]);
  await store.set(
    "pendingShell",
    Object.fromEntries(
      [...pendingShell].map(([key, value]) => [
        key,
        {
          session: value.engine.id,
          callId: value.callId,
          event: value.event,
          text: value.text,
        },
      ]),
    ),
  );
  return {};
}
const pendingShell = new Map<
  string,
  { engine: Engine; callId: string; event: any; text: string }
>();
for (const [key, saved] of Object.entries(values.pendingShell ?? {}) as [
  string,
  any,
][]) {
  pendingShell.set(key, {
    engine: await engine(saved.session),
    callId: saved.callId,
    event: saved.event,
    text: saved.text,
  });
}
const token = randomBytes(32).toString("hex");
const panel = await readFile(join(dist, "panel.html"), "utf8");
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, "http://127.0.0.1");
    // No CORS. All endpoints require a private bearer or the browser's per-install token.
    if (
      req.headers.authorization !== `Bearer ${token}` &&
      url.searchParams.get("token") !== token
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (
      req.headers.origin &&
      req.headers.origin !==
        `http://127.0.0.1:${(server.address() as any).port}`
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'",
    );
    if (url.pathname === "/" && req.method === "GET") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(panel);
      return;
    }
    if (url.pathname === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, sessions: [...engines.keys()] }));
      return;
    }
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw) > 8 * 1024 * 1024)
        throw new Error("Request too large");
    }
    const body = raw ? JSON.parse(raw) : {};
    const result = await serial(async () => {
      if (url.pathname === "/hook" && req.method === "POST") return hook(body);
      const id =
        body.session ??
        url.searchParams.get("session") ??
        [...engines.keys()].at(-1) ??
        "companion";
      const e = await engine(id);
      if (url.pathname === "/view" && req.method === "GET")
        return {
          ...(await e.render()),
          sessions: [...engines.keys()],
          session: id,
          language: values.language ?? "ko",
        };
      if (url.pathname === "/press" && req.method === "POST") {
        await e.press(body.key);
        await e.persist();
        return { ok: true };
      }
      if (url.pathname === "/command" && req.method === "POST") {
        if (!commands.has(body.command)) throw new Error("Unknown command");
        const reply = await e.command(body.command, body.args ?? "");
        await e.persist();
        return reply;
      }
      if (url.pathname === "/language" && req.method === "POST") {
        if (!["en", "ko"].includes(body.language))
          throw new Error("Unknown language");
        await store.set("language", body.language);
        for (const instance of engines.values()) {
          instance.language = body.language;
          instance.setLanguage(body.language);
        }
        return { ok: true };
      }
      throw new Error("Unknown endpoint");
    });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(result));
  } catch (e: any) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
});
server.listen(0, "127.0.0.1", async () => {
  const endpoint = {
    port: (server.address() as any).port,
    token,
    pid: process.pid,
    root,
  };
  await writeFile(join(data, "endpoint.json"), JSON.stringify(endpoint), {
    mode: 0o600,
  });
});
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, async () => {
    for (const e of engines.values()) e.dispose();
    server.close();
    await unlink(join(data, "endpoint.json")).catch(() => {});
    process.exit(0);
  });
