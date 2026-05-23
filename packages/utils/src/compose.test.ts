import { describe, expect, it } from "bun:test"
import { flow, pipe } from "./compose"

const inc = (n: number): number => n + 1
const double = (n: number): number => n * 2

describe("pipe", () => {
  it("threads a value left-to-right through the functions", () => {
    expect(pipe(3, inc, double)).toBe(8)
  })
})
describe("flow", () => {
  it("composes functions into a single left-to-right function", () => {
    expect(flow(inc, double)(3)).toBe(8)
  })
})
