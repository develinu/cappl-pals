import { test, expect } from "bun:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { toolEvent, toolResult } from "../src/events";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fixture(seed: any = {}) {
  const data = await mkdtemp(join(tmpdir(), "cappl-port-"));
  await writeFile(
    join(data, "store.json"),
    JSON.stringify({ sound: "off", language: "en", ...seed }),
  );
  let child: any, info: any;
  async function start() {
    child = spawn("node", [resolve(import.meta.dir, "../dist/server.mjs")], {
      env: { ...process.env, CAPPL_PALS_DATA: data },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let errors = "";
    child.stderr.on("data", (chunk: any) => (errors += chunk));
    for (let i = 0; i < 100; i++) {
      try {
        info = JSON.parse(await readFile(join(data, "endpoint.json"), "utf8"));
        if (info.pid === child.pid) return;
      } catch {}
      await delay(30);
    }
    throw Error(errors || "Daemon did not start");
  }
  await start();
  let calls = 0;
  const api = async (path: string, body?: any, auth = true) => {
    const r = await fetch(`http://127.0.0.1:${info.port}${path}`, {
      method: body ? "POST" : "GET",
      headers: auth
        ? {
            Authorization: `Bearer ${info.token}`,
            "Content-Type": "application/json",
          }
        : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: r.status,
      value: r.status === 403 ? null : await r.json(),
    };
  };
  const hook = async (event: string, extra: any = {}, session = "s1") => {
    const r = await api("/hook", {
      session_id: session,
      hook_event_name: event,
      ...extra,
    });
    expect(r.status).toBe(200);
    return r.value;
  };
  const run = async (
    tool: string,
    input: any,
    response: any,
    session = "s1",
  ) => {
    const tool_use_id = String(++calls);
    await hook(
      "PreToolUse",
      { tool_name: tool, tool_input: input, tool_use_id },
      session,
    );
    await hook(
      "PostToolUse",
      {
        tool_name: tool,
        tool_input: input,
        tool_response: response,
        tool_use_id,
      },
      session,
    );
  };
  const view = async (session = "s1") => {
    const value = (await api("/view?session=" + session)).value;
    value.html = value.html
      .replace(/<svg[\s\S]*?<\/svg>/g, "")
      .replace(/<[^>]*>/g, "");
    return value;
  };
  const press = async (key: string, session = "s1") => {
    await view(session);
    const r = await api("/press", { key, session });
    expect(r.status).toBe(200);
  };
  const command = async (command: string, args = "", session = "s1") =>
    (await api("/command", { command, args, session })).value;
  const stop = async () => {
    const exited = new Promise((r) => child.once("exit", r));
    child.kill();
    await exited;
  };
  return {
    data,
    api,
    hook,
    run,
    view,
    press,
    command,
    restart: async () => {
      await stop();
      await start();
    },
    close: async () => {
      await stop();
      await rm(data, { recursive: true, force: true });
    },
  };
}

test("Codex tool envelopes preserve failures, streamed sessions without treating plan updates as approvals", () => {
  expect(
    toolResult("Process exited with code 1\nOutput:\ncompile failed").isError,
  ).toBe(true);
  expect(toolResult({ output: "ok", exit_code: 1 }).isError).toBe(true);
  expect(toolResult({ session_id: 123, output: "running" }).pending).toBe(true);
  expect(
    toolEvent({ tool_name: "apply_patch", tool_input: { command: "patch" } })
      .tool,
  ).toBe("Edit");
  expect(
    toolEvent({
      tool_name: "update_plan",
      tool_input: { plan: [{ status: "in_progress" }] },
    }).tool,
  ).toBe("update_plan");
  expect(
    toolEvent({
      tool_name: "update_plan",
      tool_input: { plan: [{ status: "completed" }] },
    }).tool,
  ).toBe("update_plan");
});

test("original character, care, wardrobe, growth, quest, language and sound flows work through the adapter", async () => {
  const f = await fixture({ archive: { fame: 0, dust: 1000 } });
  try {
    expect((await f.view()).html).toContain("Pick your partner");
    await f.press("pick-cappl");
    expect((await f.view()).html).toContain("CARO Lv1");
    await f.hook("UserPromptSubmit");
    const daily = JSON.parse(
      await readFile(join(f.data, "store.json"), "utf8"),
    );
    expect(daily["ledger:s1"].dust).toBe(10);
    await f.press("pet");
    await f.press("pet");
    await f.press("pet");
    await f.press("treat");
    expect((await f.view()).html).toContain("CARO");
    await f.press("shop-round-specs");
    expect((await f.view()).html).toContain("take off");
    await f.press("shop-round-specs");
    expect((await f.view()).html).toContain("put on");
    await f.press("trick");
    for (let i = 0; i < 3; i++) {
      await f.run("apply_patch", { command: "patch" }, { output: "Success" });
      await f.run(
        "Bash",
        { command: "pytest -q" },
        { stdout: "12 passed", exit_code: 0 },
      );
      await f.run(
        "Bash",
        { command: "git commit -m fix" },
        { stdout: "[main abcd] fix", exit_code: 0 },
      );
    }
    const state = JSON.parse(
      await readFile(join(f.data, "store.json"), "utf8"),
    );
    expect(state["ledger:s1"].fame).toBe(45);
    expect(state.chestLevel).toBe(2);
    expect(state["ledger:s1"].recent.some((r: any) => r.kind === "chest")).toBe(
      true,
    );
    expect((await f.view()).html).toContain("CARO Lv2");
    await f.press("rules");
    expect((await f.view()).html).toContain("Bounties");
    await f.press("back");
    await f.press("status");
    expect((await f.view()).html).toContain("progress");
    await f.press("back");
    await f.command("cappl-sound");
    expect(
      JSON.parse(await readFile(join(f.data, "store.json"), "utf8")).sound,
    ).toBe("normal");
    await f.api("/language", { language: "ko" });
    expect((await f.view()).html).toContain("골드");
    await f.command("cappl");
    expect((await f.view()).opened).toBe(false);
    await f.command("cappl");
    expect((await f.view()).opened).toBe(true);
    await f.command("cappl-pick", "numo");
    expect((await f.view()).html).toContain("NUMO");
    await f.hook("Stop");
  } finally {
    await f.close();
  }
}, 15000);

test("two sessions share purchases and taper; duplicate hooks do not pay twice; work survives restart", async () => {
  const f = await fixture();
  try {
    await f.command("cappl-pick", "riki");
    await f.run(
      "Bash",
      { command: "pytest" },
      { stdout: "1 failed", exit_code: 1 },
    );
    await f.run("apply_patch", { command: "patch" }, { output: "Success" });
    await f.restart();
    await f.run(
      "Bash",
      { command: "pytest" },
      { stdout: "12 passed", exit_code: 0 },
    );
    const state = JSON.parse(
      await readFile(join(f.data, "store.json"), "utf8"),
    );
    expect(state["ledger:s1"].fame).toBe(13);
    const extra = {
      tool_name: "Bash",
      tool_input: { command: "git commit -m fix" },
      tool_response: { stdout: "[main 1abc] fix", exit_code: 0 },
      tool_use_id: "repeat",
    };
    await f.hook("PostToolUse", extra);
    await f.restart();
    await f.hook("PostToolUse", extra);
    const after = JSON.parse(
      await readFile(join(f.data, "store.json"), "utf8"),
    );
    expect(
      after["ledger:s1"].days[Object.keys(after["ledger:s1"].days)[0]].commit,
    ).toBe(1);
    await f.command("cappl-pick", "caro", "s2");
    expect((await f.command("cappl-status", "", "s1")).text).toContain("CARO");
    await f.run(
      "apply_patch",
      { command: "patch" },
      { output: "Success" },
      "s2",
    );
    await f.run(
      "Bash",
      { command: "pytest" },
      { stdout: "12 passed", exit_code: 0 },
      "s2",
    );
    expect((await f.command("cappl-status", "", "s1")).text).toContain("28");
  } finally {
    await f.close();
  }
}, 15000);

test("long commands award only after their final poll, preserving output across polls", async () => {
  const f = await fixture();
  try {
    await f.run("apply_patch", { command: "patch" }, { output: "Success" });
    await f.run(
      "Bash",
      { command: "pytest" },
      { session_id: 42, output: "starting" },
    );
    await f.run(
      "write_stdin",
      { session_id: 42 },
      { session_id: 42, output: "12 passed" },
    );
    expect((await f.command("cappl-status")).text).toContain("Rep 0");
    await f.restart();
    await f.run(
      "write_stdin",
      { session_id: 42 },
      { exit_code: 0, output: "done" },
    );
    expect((await f.command("cappl-status")).text).toContain("Rep 5");
  } finally {
    await f.close();
  }
}, 15000);

test("loopback APIs require credentials and reject cross-origin actions", async () => {
  const f = await fixture();
  try {
    expect((await f.api("/view", undefined, false)).status).toBe(403);
    const info = JSON.parse(
      await readFile(join(f.data, "endpoint.json"), "utf8"),
    );
    const r = await fetch(
      `http://127.0.0.1:${info.port}/command?token=${info.token}`,
      {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ command: "cappl-sound" }),
      },
    );
    expect(r.status).toBe(403);
  } finally {
    await f.close();
  }
});

test("a person approves a plan explicitly; completing a plan tool alone earns nothing", async () => {
  const f = await fixture();
  try {
    await f.run(
      "update_plan",
      { plan: [{ status: "completed" }] },
      { output: "Plan updated" },
    );
    expect((await f.command("cappl-status")).text).toContain("Rep 0");
    await f.command("cappl-plan-approved");
    expect((await f.command("cappl-status")).text).toContain("Rep 3");
    await f.run("apply_patch", { command: "patch" }, { output: "Success" });
    await f.command("cappl-plan-approved");
    expect((await f.command("cappl-status")).text).toContain("Rep 3");
  } finally {
    await f.close();
  }
});


test("CLI links load authenticated HTML and the Orca bridge shares the companion server", async () => {
  const f = await fixture();
  const previousData = process.env.CAPPL_PALS_DATA;
  try {
    process.env.CAPPL_PALS_DATA = f.data;
    const { stdout } = await promisify(execFile)("node", [
      resolve(import.meta.dir, "../dist/cli.mjs"), "url",
    ]);
    const response = await fetch(stdout.trim());
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("SUNDUST");
    const handlers = new Map<string, Function>();
    const { default: activate } = await import("../dist/orca/worker.mjs");
    activate({ panels: { handle: (name: string, handler: Function) => handlers.set(name, handler) } });
    const api = (input: any) => handlers.get("cappl.api")!(input, { signal: new AbortController().signal });
    expect((await api({ path: "/view", session: "s1" })).html).toContain("Pick your partner");
    await api({ path: "/command", body: { command: "cappl-pick", args: "caro" }, session: "s1" });
    expect((await f.view()).html).toContain("CARO Lv1");
    await expect(api({ path: "/hook", body: {} })).rejects.toThrow("Unknown companion action");
    await expect(api({ path: "https://example.com/" })).rejects.toThrow("Unknown companion action");
  } finally {
    if (previousData === undefined) delete process.env.CAPPL_PALS_DATA;
    else process.env.CAPPL_PALS_DATA = previousData;
    await f.close();
  }
});
