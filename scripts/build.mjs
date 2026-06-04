import solidPlugin from "@opentui/solid/bun-plugin"

const targets = [
  { entry: "src/tui.tsx", out: "dist/tui.js" },
  { entry: "src/server.ts", out: "dist/server.js" },
]

for (const t of targets) {
  const result = await Bun.build({
    entrypoints: [t.entry],
    target: "bun",
    format: "esm",
    outdir: "dist",
    naming: t.out.replace(/^dist\//, ""),
    external: [
      "@opencode-ai/plugin",
      "@opencode-ai/sdk",
      "@opentui/solid",
      "@opentui/core",
      "@opentui/keymap",
      "solid-js",
    ],
    plugins: [solidPlugin],
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }
  console.log("ok", t.entry, "->", t.out)
}
