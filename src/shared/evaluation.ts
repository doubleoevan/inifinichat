import { z } from "zod"

// store measured outcomes separately from a reviewer's assessment
export const evalResultSchema = z.object({
  id: z.string(), title: z.string(), input: z.string(), expected: z.string(),
  status: z.enum(["passed", "failed", "skipped"]), mode: z.string(),
  actual: z.array(z.string()), error: z.string().nullable(), durationMs: z.number().nonnegative(),
  timings: z.array(z.object({ stage: z.string(), ms: z.number().nonnegative() })),
})
export const evalReportSchema = z.object({
  version: z.literal(1), runId: z.string(), generatedAt: z.iso.datetime(), cases: z.array(evalResultSchema),
})
export type EvalResult = z.infer<typeof evalResultSchema>
export type EvalReport = z.infer<typeof evalReportSchema>
