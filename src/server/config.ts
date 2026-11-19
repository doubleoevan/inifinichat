import { z } from "zod"

// restrict credentials to connections the Bun SQL driver understands
const databaseUrl = z.string().url().refine(value => /^postgres(ql)?:\/\//.test(value))
const optionalUrl = z.preprocess(value => value || undefined, databaseUrl.optional())
const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  ZOCDOC_MODE: z.literal("mock").default("mock"),
  DATABASE_URL: optionalUrl,
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().trim().min(1).default("gpt-4.1-mini"),
})

// report field names only; validation failures can involve credentials
const parsed = environmentSchema.safeParse(process.env)
if (!parsed.success) {
  const fields = parsed.error.issues.map(issue => issue.path.join("."))
  throw new Error(`Invalid server configuration: ${fields.join(", ")}`)
}
export const config = parsed.data
