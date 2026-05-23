import { describe, it, expect } from "bun:test"
import { createSequentialIdGen, createCryptoIdGen } from "./id"

describe("createSequentialIdGen", () => {
  it("produces deterministic prefixed ids when called repeatedly", () => {
    const gen = createSequentialIdGen()
    expect(gen.next("p")).toBe("p_1")
    expect(gen.next("p")).toBe("p_2")
  })
})
describe("createCryptoIdGen", () => {
  it("produces a unique prefixed id each time next() is called", () => {
    const gen = createCryptoIdGen()
    expect(gen.next("s")).not.toBe(gen.next("s"))
  })
})
