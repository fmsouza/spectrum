export interface OpenClawEvent {
  readonly type: "event"
}

export interface OpenclawRun {
  readonly placeholder: never
}

export interface OpenclawTransport {
  readonly placeholder: never
}

export type OpenclawConnect = () => never
