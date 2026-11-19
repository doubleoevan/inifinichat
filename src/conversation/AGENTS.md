# Conversation

Keep OpenAI credentials and requests on the Bun server. Dialogue is untrusted user input. Send one bounded request with a fresh delimiter, structured output, no tools and zero retries.

The model proposes criteria or references. `src/server/chat.ts` resolves them against the patient's own appointments and free slots, then writes the user-facing reply. Keep contact fields, appointments and local notes out of the model context.

Run `bun test tests/chat-intent.test.ts` for offline validation and clarification cases.
