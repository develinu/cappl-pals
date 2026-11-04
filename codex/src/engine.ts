import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const exec = promisify(execFile);
export type VNode = {
  type: string;
  props: Record<string, any>;
  children: any[];
};
(globalThis as any).__capplJSX = (
  type: any,
  props: any,
  ...children: any[]
): VNode => ({
  type,
  props: props ?? {},
  children: children
    .flat(Infinity)
    .filter((x) => x !== null && x !== undefined && x !== false),
});
export class Engine {
  state = new Map<string, any>();
  handlers: { event: string; filter: any; fn: any }[] = [];
  timers: ReturnType<typeof setTimeout>[] = [];
  buttons = new Map<string, () => unknown>();
  toasts: { id: number; text: string }[] = [];
  opened = true;
  private sequence = 0;
  private actions = new Map<string, () => unknown>();
  snapshotRuntime: () => any = () => ({});
  setLanguage: (language: string) => void = () => {};
  private paused = new Map<
    string,
    { event: any; resolve: (result: any) => void; done: Promise<any> }
  >();
  constructor(
    public id: string,
    public store: any,
    public root: string,
    public language: string,
    public schedule: (fn: () => Promise<any>) => void,
  ) {}
  async init(bundle: string) {
    const { register, setLanguage, snapshotRuntime, restoreRuntime } =
      await import(
        `${pathToFileURL(bundle).href}?session=${encodeURIComponent(this.id)}`
      );
    this.snapshotRuntime = snapshotRuntime;
    this.setLanguage = setLanguage;
    register(
      (event: string, filter: any, fn: any) => {
        if (typeof filter === "function") {
          fn = filter;
          filter = {};
        }
        this.handlers.push({ event, filter, fn });
      },
      { language: this.language },
    );
    await this.emit("session.start", {});
    const saved = await this.store.get(`session:${this.id}`);
    if (saved) {
      restoreRuntime(saved.runtime);
      this.setLanguage(this.language);
      for (const [key, value] of saved.state)
        if (!["totals", "wallet", "log", "character"].includes(key))
          this.state.set(key, value);
    }
  }
  get api() {
    const timer = (ms: number, fn: any, repeat = false) => {
      const callback = () =>
        this.schedule(async () => {
          await fn();
        });
      const handle = repeat
        ? setInterval(callback, ms)
        : setTimeout(callback, ms);
      handle.unref();
      this.timers.push(handle);
      return handle;
    };
    return {
      state: this.state,
      store: this.store,
      session: { id: async () => this.id },
      settings: { read: async () => this.language },
      command: { register: async () => ({}) },
      plugin: { root: this.root },
      clock: {
        now: async () => Date.now(),
        after: timer,
        every: (ms: number, fn: any) => timer(ms, fn, true),
        sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)),
      },
      process: {
        run: async (argv: string[], opts: any) => {
          try {
            const result = await exec(argv[0], argv.slice(1), {
              timeout: opts?.timeoutMs ?? 10000,
            });
            return { ...result, exitCode: 0 };
          } catch (e: any) {
            return {
              stdout: e.stdout ?? "",
              stderr: e.stderr ?? "",
              exitCode: typeof e.code === "number" ? e.code : 1,
            };
          }
        },
      },
      audio: {
        play: async ({ asset }: any) => {
          await exec("afplay", [join(this.root, asset)], { timeout: 10000 });
        },
      },
      ui: {
        open: async () => {
          this.opened = true;
          return { isPlaced: true };
        },
        close: async () => {
          this.opened = false;
        },
        panes: async () => [
          { id: "cappl-pals", isPlaced: true, isShown: this.opened },
        ],
        focus: async () => {},
        scroll: async () => {},
        blit: async () => ({}),
        toast: (text: string) => {
          this.toasts.push({ id: ++this.sequence, text });
          this.toasts = this.toasts.slice(-10);
        },
        resolve: () => ({
          Box: "Box",
          Text: "Text",
          Button: "Button",
          Svg: "Svg",
        }),
      },
    };
  }
  async emit(
    event: string,
    data: any,
    terminal = async (e: any) => e,
  ): Promise<any> {
    const handlers = this.handlers.filter(
      (h) =>
        h.event === event &&
        Object.entries(h.filter).every(([key, value]) => data[key] === value),
    );
    const next = async (index: number, value: any): Promise<any> =>
      index < handlers.length
        ? handlers[index].fn(this.api, value, (e: any) => next(index + 1, e))
        : terminal(value);
    return next(0, data);
  }
  async command(command: string, args = "") {
    if (command === "cappl-plan-approved")
      return this.emit("tool.call", { tool: "ExitPlanMode" }, async () => ({
        text: "Plan approval recorded / 계획 승인 기록됨",
        isError: false,
      }));
    return this.emit("command.run", { command, args });
  }
  async preTool(id: string, event: any) {
    if (this.paused.has(id)) return;
    let resume!: (result: any) => void;
    let entered!: () => void;
    const ready = new Promise<void>((r) => (entered = r));
    const result = new Promise((r) => (resume = r));
    const done = this.emit("tool.call", event, async () => {
      entered();
      return result;
    });
    this.paused.set(id, { event, resolve: resume, done });
    await Promise.race([ready, done]);
  }
  async postTool(id: string, event: any, result: any) {
    const pending = this.paused.get(id);
    if (pending) {
      pending.resolve(result);
      await pending.done;
      this.paused.delete(id);
    } else await this.emit("tool.call", event, async () => result);
  }
  async interrupt() {
    for (const [id, pending] of this.paused) {
      pending.resolve({ deny: "interrupted" });
      await pending.done;
      this.paused.delete(id);
    }
    await this.emit("turn.abort", {});
  }
  async render() {
    const tree = await this.emit("ui.render", {
      component: "Pane",
      requestId: "cappl-pals",
      surface: "desktop",
      props: {},
    });
    this.buttons.clear();
    const escape = (text: any) =>
      String(text).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c]!,
      );
    const draw = (node: any): string => {
      if (Array.isArray(node)) return node.map(draw).join("");
      if (node === null || node === undefined || node === false) return "";
      if (typeof node !== "object") return escape(node);
      const { type, props: p, children } = node as VNode;
      if (type === "Svg")
        return `<div class="sprite" data-key="${escape(p.key ?? "")}">${p.source}</div>`;
      if (type === "Button") {
        const key = p.key;
        this.buttons.set(key, p.onPress);
        return `<button data-key="${escape(key)}">${escape(p.label)}</button>`;
      }
      const tag = type === "Text" ? "span" : "div";
      const color = /^#[0-9a-f]{6}$/i.test(p.color ?? "")
        ? `color:${p.color};`
        : "";
      const style =
        type === "Text"
          ? `${color}${p.bold ? "font-weight:700;" : ""}${p.dimColor ? "opacity:.65;" : ""}`
          : `display:flex;flex-direction:${p.flexDirection === "row" ? "row" : "column"};gap:4px;`;
      return `<${tag} style="${style}">${children.map(draw).join("")}</${tag}>`;
    };
    const html = this.opened
      ? draw(tree)
      : '<button data-command="cappl">Open SUNDUST / 열기</button>';
    // Bind clicks to the rendered action, not to the newest render from another tab.
    this.actions.clear();
    for (const [key, action] of this.buttons) this.actions.set(key, action);
    return { html, toasts: this.toasts, opened: this.opened };
  }
  async press(key: string) {
    const action = this.actions.get(key);
    if (!action) throw new Error("Unknown or stale button; refresh the panel");
    return action();
  }
  async persist() {
    await this.store.set(`session:${this.id}`, {
      runtime: this.snapshotRuntime(),
      state: [...this.state],
    });
  }
  dispose() {
    for (const timer of this.timers) {
      clearInterval(timer);
      clearTimeout(timer);
    }
  }
}
