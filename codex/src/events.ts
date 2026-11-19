export function toolEvent(input: any) {
  const name = String(input.tool_name ?? "");
  const args = input.tool_input ?? {};
  const tool = /^(apply_patch|Edit|Write|NotebookEdit)$/.test(name)
    ? "Edit"
    : /^(Bash|exec_command|shell_command|shell|write_stdin)$/.test(name)
      ? "Bash"
      : /^(Read|Glob|Grep|read_file|list_dir)$/.test(name)
        ? "Read"
        : /^(ExitPlanMode|exit_plan_mode)$/.test(name)
          ? "ExitPlanMode"
          : name;
  return {
    tool,
    command: typeof args === "string" ? args : (args.command ?? args.cmd ?? ""),
  };
}
export function toolResult(response: any) {
  if (typeof response === "string") {
    // Codex local shell tools can report an envelope as model-facing text.
    try {
      return toolResult(JSON.parse(response));
    } catch {}
    const exit = response.match(
      /(?:Process exited with code|Exit code:)\s*(-?\d+)/i,
    );
    return { text: response, isError: exit ? Number(exit[1]) !== 0 : false };
  }
  if (!response || typeof response !== "object")
    return { text: "", isError: true };
  const text =
    response.stdout ??
    response.output ??
    response.text ??
    response.content
      ?.filter((x: any) => x.type === "text")
      .map((x: any) => x.text)
      .join("\n") ??
    "";
  const parsed = toolResult(String(text));
  return {
    text: parsed.text,
    isError:
      response.isError === true ||
      response.is_error === true ||
      (response.exit_code != null && response.exit_code !== 0) ||
      (response.exitCode != null && response.exitCode !== 0) ||
      parsed.isError,
    ...(response.session_id && response.exit_code == null
      ? { pending: true, shellSession: String(response.session_id) }
      : {}),
  };
}
