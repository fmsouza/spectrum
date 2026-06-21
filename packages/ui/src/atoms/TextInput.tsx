import type { KeyboardEvent, ReactElement } from "react"

export type TextInputType = "text" | "password" | "url" | "number"

export type TextInputProps = {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly onBlur?: () => void
  readonly onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  readonly placeholder?: string
  readonly type?: TextInputType
  readonly id?: string
  readonly disabled?: boolean
}

export const TextInput = ({
  value,
  onChange,
  onBlur,
  onKeyDown,
  placeholder,
  type = "text",
  id,
  disabled = false,
}: TextInputProps): ReactElement => (
  <input
    type={type}
    id={id}
    value={value}
    placeholder={placeholder}
    disabled={disabled}
    onChange={(e) => onChange(e.currentTarget.value)}
    onBlur={onBlur}
    onKeyDown={onKeyDown}
  />
)
