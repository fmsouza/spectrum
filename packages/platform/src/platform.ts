export type Platform = "macos" | "linux" | "windows" | "unknown"

/** Map a Node platform string to our `Platform`. Defaults to the host's `process.platform`. */
export const detectPlatform = (
  p: NodeJS.Platform = process.platform,
): Platform => {
  switch (p) {
    case "darwin":
      return "macos"
    case "linux":
      return "linux"
    case "win32":
      return "windows"
    default:
      return "unknown"
  }
}
