import path from "node:path"
import type { Platform } from "./platform"

/** Absolute-path test using the rules of the given platform (not the host's). */
export const isAbsolutePath = (p: string, platform: Platform): boolean =>
  (platform === "windows" ? path.win32 : path.posix).isAbsolute(p)
