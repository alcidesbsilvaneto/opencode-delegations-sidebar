import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import type { Session, SessionStatus, SubtaskPart, Part, Message } from "@opencode-ai/sdk/v2"
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"

const PLUGIN_ID = "opencode-delegations-sidebar"

type Row = {
  id: string
  title: string
  agent: string
  description: string
  prompt: string
  created: number
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
const SPINNER_INTERVAL_MS = 80
const PLACEHOLDER_COPY = "No active delegations"

function truncate(value: string, max: number): string {
  if (max <= 0) return ""
  const flat = value.replace(/\s+/g, " ").trim()
  if (flat.length <= max) return flat
  return flat.slice(0, Math.max(0, max - 1)).trimEnd() + "\u2026"
}

function statusOf(api: TuiPluginApi, sessionID: string): SessionStatus | undefined {
  try {
    return api.state.session.status(sessionID)
  } catch {
    return undefined
  }
}

function statusStyle(api: TuiPluginApi, sessionID: string) {
  const theme = () => api.theme.current
  const s = statusOf(api, sessionID)
  if (!s) return { color: theme().textMuted, glyph: "\u25CB", busy: false }
  if (s.type === "busy") return { color: theme().warning, glyph: "\u25D0", busy: true }
  if (s.type === "retry") return { color: theme().error, glyph: "\u2717", busy: false }
  return { color: theme().success, glyph: "\u25CF", busy: false }
}

function RowItem(props: { api: TuiPluginApi; item: Row; onNavigate: (id: string) => void }) {
  const theme = () => props.api.theme.current
  const style = createMemo(() => statusStyle(props.api, props.item.id))
  const subline = createMemo(() => {
    const description = props.item.description?.trim()
    if (description) return truncate(description, 36)
    return truncate(props.item.prompt, 36)
  })
  const showSpinner = createMemo(() => style().busy)

  return (
    <box flexDirection="column" onMouseDown={() => props.onNavigate(props.item.id)}>
      <box flexDirection="row" gap={1}>
        <Show
          when={showSpinner()}
          fallback={
            <text fg={style().color} flexShrink={0}>
              {style().glyph}
            </text>
          }
        >
          <BusyGlyph color={style().color} />
        </Show>
        <text fg={theme().text} wrapMode="none">
          <b>{props.item.agent || "subagent"}</b>
          <span style={{ fg: theme().textMuted }}> {truncate(props.item.title, 24)}</span>
        </text>
      </box>
      <Show when={subline()}>
        <text fg={theme().textMuted}>  {subline()}</text>
      </Show>
    </box>
  )
}

function BusyGlyph(props: { color: ReturnType<() => TuiPluginApi["theme"]["current"]> extends infer T ? T extends { warning: infer C } ? C : never : never }) {
  const [frame, setFrame] = createSignal(0)
  createEffect(() => {
    const id = setInterval(() => setFrame((i) => (i + 1) % SPINNER_FRAMES.length), SPINNER_INTERVAL_MS)
    onCleanup(() => clearInterval(id))
  })
  return (
    <text fg={props.color} flexShrink={0}>
      {SPINNER_FRAMES[frame()]}
    </text>
  )
}

type MessageWithParts = { info: Message; parts: Array<Part> }

function isSubtask(part: Part): part is SubtaskPart {
  return part.type === "subtask"
}

function collectSubtaskParts(messages: Array<MessageWithParts>): SubtaskPart[] {
  const out: SubtaskPart[] = []
  for (const m of messages) {
    if (m.info.role !== "assistant") continue
    for (const p of m.parts) {
      if (isSubtask(p)) out.push(p)
    }
  }
  return out
}

function buildRows(children: Array<Session>, subtasks: SubtaskPart[]): Row[] {
  return children.map((child, i) => {
    const sub = subtasks[i]
    return {
      id: child.id,
      title: child.title,
      agent: sub?.agent ?? "subagent",
      description: sub?.description ?? "",
      prompt: sub?.prompt ?? "",
      created: child.time?.created ?? 0,
    }
  })
}

function DelegationsView(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const [rows, setRows] = createSignal<Row[]>([])
  const [open, setOpen] = createSignal(true)
  const [loaded, setLoaded] = createSignal(false)

  const navigate = (id: string) => {
    props.api.route.navigate("session", { sessionID: id })
  }

  createEffect(() => {
    const parentID = props.session_id
    if (!parentID) {
      setRows([])
      setLoaded(true)
      return
    }

    let cancelled = false

    const refresh = async () => {
      const [childrenRes, msgRes] = await Promise.all([
        props.api.client.session
          .children({ sessionID: parentID })
          .catch(() => undefined),
        props.api.client.session
          .messages({ sessionID: parentID })
          .catch(() => undefined),
      ])
      if (cancelled) return

      const children = (childrenRes?.data ?? []) as Array<Session>
      const messages = (msgRes?.data ?? []) as Array<MessageWithParts>
      const subtasks = collectSubtaskParts(messages)
      const next = buildRows(children, subtasks)
      setRows(next)
      setLoaded(true)
    }

    refresh()

    const offCreated = props.api.event.on("session.created", (e) => {
      if (e.properties.info.parentID === parentID) refresh()
    })
    const offUpdated = props.api.event.on("session.updated", (e) => {
      if (e.properties.info.parentID === parentID) refresh()
    })
    const offDeleted = props.api.event.on("session.deleted", (e) => {
      if (e.properties.info.parentID === parentID) refresh()
    })
    const offPart = props.api.event.on("message.part.updated", (e) => {
      if (e.properties.sessionID === parentID && isSubtask(e.properties.part)) refresh()
    })

    onCleanup(() => {
      cancelled = true
      offCreated()
      offUpdated()
      offDeleted()
      offPart()
    })
  })

  return (
    <box>
      <box
        flexDirection="row"
        gap={1}
        onMouseDown={() => rows().length > 2 && setOpen((x) => !x)}
      >
        <Show when={rows().length > 2}>
          <text fg={theme().text}>{open() ? "\u25BC" : "\u25B6"}</text>
        </Show>
        <text fg={theme().text}>
          <b>Delegations</b>
          <Show when={rows().length > 0}>
            <span style={{ fg: theme().textMuted }}> ({rows().length})</span>
          </Show>
        </text>
      </box>
      <Show
        when={rows().length > 0 && (rows().length <= 2 || open())}
        fallback={
          <Show when={loaded() && rows().length === 0}>
            <text fg={theme().textMuted}>  {PLACEHOLDER_COPY}</text>
          </Show>
        }
      >
        <For each={rows()}>
          {(item) => <RowItem api={props.api} item={item} onNavigate={navigate} />}
        </For>
      </Show>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 150,
    slots: {
      sidebar_content(_ctx, props) {
        if (!props.session_id) return null
        return <DelegationsView api={api} session_id={props.session_id} />
      },
    },
  })
}

const module: TuiPluginModule = { id: PLUGIN_ID, tui }
export const id = PLUGIN_ID
export { tui }
export default module
