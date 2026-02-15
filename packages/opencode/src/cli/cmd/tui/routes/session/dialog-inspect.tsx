import { TextAttributes } from "@opentui/core"
import { useDialog } from "../../ui/dialog"
import { useTheme } from "@tui/context/theme"
import type { Part, AssistantMessage } from "@opencode-ai/sdk/v2"
import { Clipboard } from "../../util/clipboard"
import { useToast } from "../../ui/toast"
import { createMemo, createSignal, Show } from "solid-js"
import { Details } from "../../ui/details"

interface DialogInspectProps {
  message: AssistantMessage
  parts: Part[]
}

type FileAttachment = Extract<Part, { type: "file" }>

// Convert the tool call / return json into a YAML-like format for better readeability.
function toYaml(obj: any, indent = 0): string {
  if (obj === null) return "null"
  if (obj === undefined) return "undefined"
  if (typeof obj !== "object") return String(obj)

  const spaces = " ".repeat(indent)

  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]"
    return obj
      .map((item) => {
        if (typeof item === "object" && item !== null) {
          return `\n${spaces}- ${toYaml(item, indent + 2).trimStart()}`
        }
        return `\n${spaces}- ${String(item)}`
      })
      .join("")
  }

  const keys = Object.keys(obj)
  if (keys.length === 0) return "{}"

  return keys
    .map((key) => {
      const value = obj[key]
      if (typeof value === "object" && value !== null) {
        if (Array.isArray(value) && value.length === 0) return `\n${spaces}${key}: []`
        if (Object.keys(value).length === 0) return `\n${spaces}${key}: {}`
        return `\n${spaces}${key}:${toYaml(value, indent + 2)}`
      }
      if (typeof value === "string" && value.includes("\n")) {
        return `\n${spaces}${key}: |\n${value
          .split("\n")
          .map((l) => spaces + "  " + l)
          .join("\n")}`
      }
      return `\n${spaces}${key}: ${String(value)}`
    })
    .join("")
}

function dataBytes(url: string) {
  if (!url.startsWith("data:")) return
  const comma = url.indexOf(",")
  if (comma === -1) return
  const head = url.slice(0, comma)
  const body = url.slice(comma + 1)
  if (!head.includes(";base64")) return
  const padding = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0
  return Math.max(0, Math.floor((body.length * 3) / 4) - padding)
}

function bytesLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function sourceLabel(url: string) {
  if (!url.startsWith("data:")) return url
  const bytes = dataBytes(url)
  if (bytes === undefined) return "inline data URL"
  return `inline data URL (${bytesLabel(bytes)})`
}

function attachmentLabel(file: FileAttachment) {
  const parts = [file.mime, sourceLabel(file.url)]
  if (file.filename) parts.unshift(file.filename)
  return parts.join(" | ")
}

function PartView(props: { part: Part; theme: any; syntax: any; toolCount: number }) {
  const { part, theme, syntax } = props

  if (part.type === "text") {
    return (
      <box flexDirection="column" borderColor={theme.borderSubtle} borderStyle="single" padding={1}>
        <text attributes={TextAttributes.BOLD} fg={theme.textMuted}>
          Text
        </text>
        <text fg={theme.text}>{part.text}</text>
      </box>
    )
  }

  if (part.type === "patch") {
    return (
      <box flexDirection="column" borderColor={theme.borderSubtle} borderStyle="single" padding={1}>
        <text attributes={TextAttributes.BOLD} fg={theme.textMuted}>
          Patch ({part.hash.substring(0, 7)})
        </text>
        <text fg={theme.text}>Updated files:</text>
        <box flexDirection="column" marginLeft={2}>
          {part.files.map((f) => (
            <text fg={theme.text}>- {f}</text>
          ))}
        </box>
      </box>
    )
  }

  if (part.type === "tool") {
    const attachments = part.state.status === "completed" ? (part.state.attachments ?? []) : []
    return (
      <box
        flexDirection="column"
        borderColor={theme.borderSubtle}
        borderStyle="single"
        paddingLeft={1}
        paddingRight={1}
      >
        <Details
          summary={`Tool Use: ${part.tool} (${part.state.status})`}
          defaultOpen={part.state.status === "error" || props.toolCount === 1}
        >
          <box flexDirection="column">
            <box>
              <text fg={theme.textMuted}>Input:</text>
              <text fg={theme.text}>{toYaml(part.state.input).trim()}</text>
            </box>
            <Show when={part.state.status === "completed" && (part.state as any).output}>
              <box marginTop={1}>
                <text fg={theme.textMuted}>Output:</text>
                <text fg={theme.text}>{(part.state as any).output}</text>
              </box>
            </Show>
            <Show when={attachments.length > 0}>
              <box marginTop={1} flexDirection="column">
                <text fg={theme.textMuted}>Attachments:</text>
                <box flexDirection="column" marginLeft={2}>
                  {attachments.map((file, idx) => (
                    <text fg={theme.text}>
                      {idx + 1}. {attachmentLabel(file)}
                    </text>
                  ))}
                </box>
              </box>
            </Show>
            <Show when={part.state.status === "error" && (part.state as any).error}>
              <box marginTop={1}>
                <text fg={theme.error}>Error:</text>
                <text fg={theme.error}>{(part.state as any).error}</text>
              </box>
            </Show>
          </box>
        </Details>
      </box>
    )
  }

  if (part.type === "reasoning") {
    return (
      <box flexDirection="column" borderColor={theme.borderSubtle} borderStyle="single" padding={1}>
        <text attributes={TextAttributes.BOLD} fg={theme.textMuted}>
          Reasoning
        </text>
        <text fg={theme.text}>{part.text}</text>
      </box>
    )
  }

  if (part.type === "file") {
    return (
      <box flexDirection="column" borderColor={theme.borderSubtle} borderStyle="single" padding={1}>
        <text attributes={TextAttributes.BOLD} fg={theme.textMuted}>
          File Attachment
        </text>
        <text fg={theme.text}>Name: {part.filename || "Unknown"}</text>
        <text fg={theme.textMuted}>Mime: {part.mime}</text>
        <text fg={theme.textMuted}>Source: {sourceLabel(part.url)}</text>
      </box>
    )
  }

  return (
    <box flexDirection="column" borderColor={theme.borderSubtle} borderStyle="single" padding={1}>
      <text attributes={TextAttributes.BOLD} fg={theme.textMuted}>
        {part.type}
      </text>
      <code
        filetype="json"
        content={JSON.stringify(part, null, 2)}
        syntaxStyle={syntax()}
        drawUnstyledText={true}
        fg={theme.text}
      />
    </box>
  )
}

export function DialogInspect(props: DialogInspectProps) {
  const { theme, syntax } = useTheme()
  const dialog = useDialog()
  const toast = useToast()
  const toolCount = createMemo(() => props.parts.filter((part) => part.type === "tool").length)

  // State for raw mode
  const [showRaw, setShowRaw] = createSignal(false)

  // Set dialog size to large
  dialog.setSize("xlarge")

  const handleCopy = () => {
    Clipboard.copy(JSON.stringify(props.parts, null, 2))
      .then(() => toast.show({ message: "Message copied to clipboard", variant: "success" }))
      .catch(() => toast.show({ message: "Failed to copy message", variant: "error" }))
  }

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} height="100%">
      <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Message Inspection ({props.message.id})
        </text>
        <box onMouseUp={() => dialog.clear()}>
          <text fg={theme.textMuted}>[esc]</text>
        </box>
      </box>

      <scrollbox flexGrow={1} border={["bottom", "top"]} borderColor={theme.borderSubtle}>
        <Show
          when={!showRaw()}
          fallback={
            <code
              filetype="json"
              content={JSON.stringify(props.parts, null, 2)}
              syntaxStyle={syntax()}
              drawUnstyledText={true}
              fg={theme.text}
            />
          }
        >
          <box flexDirection="column">
            {props.parts
              .filter((p) => !["step-start", "step-finish", "reasoning"].includes(p.type))
              .map((part) => (
                <PartView part={part} theme={theme} syntax={syntax} toolCount={toolCount()} />
              ))}
          </box>
        </Show>
      </scrollbox>

      <box flexDirection="row" justifyContent="flex-end" paddingBottom={1} flexShrink={0} gap={1}>
        <box
          paddingLeft={2}
          paddingRight={2}
          borderStyle="single"
          borderColor={theme.borderSubtle}
          onMouseUp={() => setShowRaw((prev) => !prev)}
        >
          <text fg={theme.text}>{showRaw() ? "Show Parsed" : "Show Raw"}</text>
        </box>
        <box paddingLeft={2} paddingRight={2} borderStyle="single" borderColor={theme.border} onMouseUp={handleCopy}>
          <text fg={theme.text}>Copy</text>
        </box>
      </box>
    </box>
  )
}
