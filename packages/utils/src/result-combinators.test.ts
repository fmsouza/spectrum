import { describe, expect, it } from "bun:test"
import { err, ok } from "./result"
import { andThen, map, mapErr, unwrapOr } from "./result-combinators"

describe("map", () => {
  it("transforms the value when the result is Ok", () => {
    expect(map(ok(2), (n: number) => n * 3)).toEqual(ok(6))
  })
  it("passes the error through unchanged when the result is Err", () => {
    expect(map(err("e"), (n: number) => n * 3)).toEqual(err("e"))
  })
})
describe("andThen", () => {
  it("chains into the next Result when Ok", () => {
    expect(andThen(ok(2), (n: number) => ok(n + 1))).toEqual(ok(3))
  })
  it("short-circuits when Err", () => {
    expect(andThen(err("e"), (n: number) => ok(n + 1))).toEqual(err("e"))
  })
})
describe("mapErr", () => {
  it("transforms the error when Err", () => {
    expect(mapErr(err("e"), (s: string) => s.toUpperCase())).toEqual(err("E"))
  })
})
describe("unwrapOr", () => {
  it("returns the value when Ok and the fallback when Err", () => {
    expect(unwrapOr(ok(1), 99)).toBe(1)
    expect(unwrapOr(err("e"), 99)).toBe(99)
  })
})
