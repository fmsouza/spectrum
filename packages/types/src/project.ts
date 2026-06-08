import { z } from "zod"
import { ProjectIdSchema } from "./ids"

/** A named group of sessions. `path` is the absolute cwd; `name` is its basename. */
export const ProjectSchema = z
  .object({
    id: ProjectIdSchema,
    name: z.string().min(1),
    path: z.string().min(1),
    createdAt: z.string().datetime(),
  })
  .strict()

export type Project = z.infer<typeof ProjectSchema>
