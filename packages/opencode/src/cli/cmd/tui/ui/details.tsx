import { TextAttributes } from "@opentui/core"
import { createSignal, Show, type JSX } from "solid-js"
import { useTheme } from "../context/theme"

interface DetailsProps {
  summary: string
  children: JSX.Element
  defaultOpen?: boolean
}

export function Details(props: DetailsProps) {
  const { theme } = useTheme()
  const [open, setOpen] = createSignal(props.defaultOpen ?? false)
  const [hover, setHover] = createSignal(false)

  return (
    <box flexDirection="column">
      <box
        flexDirection="row"
        gap={1}
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={hover() ? theme.backgroundMenu : undefined}
        onMouseOver={() => setHover(true)}
        onMouseOut={() => setHover(false)}
        onMouseUp={() => setOpen((prev) => !prev)}
      >
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          {open() ? "▼" : "▶"}
        </text>
        <text fg={hover() ? theme.text : theme.textMuted} attributes={TextAttributes.BOLD}>
          {props.summary}
        </text>
      </box>
      <Show when={open()}>
        <box marginTop={1} flexDirection="column">
          {props.children}
        </box>
      </Show>
    </box>
  )
}
