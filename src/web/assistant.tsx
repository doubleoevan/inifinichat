import { useEffect, useRef, useState } from "react"
import { ArrowUpRight, MessageCircle } from "lucide-react"
import { chatReplySchema, limits, type ChatReply, type ChatRequest } from "@/shared/contracts"
import { Textarea } from "./components/ui/textarea"
import { readJson, sendJson } from "./lib/api"

type ChatIntent = NonNullable<ChatReply["intent"]>
interface Turn { question: string; response: ChatReply }
interface AssistantProps { onIntent: (intent: ChatIntent, signal: AbortSignal) => Promise<void> }

const intentLabels = { clarify: "", search: "Show matching doctors", book: "Review booking", cancel: "Review cancellation", reschedule: "Review new time", "edit-notes": "Review local notes" }

/** Keeps the latest conversation history within the API's count and byte limits. */
function chatBody(message: string, turns: Turn[]): ChatRequest {
  const history: NonNullable<ChatRequest["history"]> = []
  for (const turn of turns.slice(-limits.historyTurns)) {
    history.push({ role: "user", text: turn.question }, { role: "assistant", text: turn.response.reply.slice(0, limits.message) })
  }

  // keep the pending message intact and trim the oldest context first
  const recent = history.slice(-limits.historyTurns)
  const encoder = new TextEncoder()
  while (recent.length && encoder.encode(JSON.stringify({ message, history: recent })).length > limits.bodyBytes) {
    recent.shift()
  }
  return { message, history: recent }
}

/** Offers selectable scheduling drafts and keeps the transcript in page memory. */
export function Assistant({ onIntent }: AssistantProps) {
  const [enabled, setEnabled] = useState(false)
  const [message, setMessage] = useState("")
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("Checking connection…")
  const active = useRef<AbortController | null>(null)
  const resolving = useRef<AbortController | null>(null)

  // check the chat service without invoking a model
  useEffect(() => {
    const controller = new AbortController()
    readJson("/api/status", { signal: controller.signal }).then(status => {
      if (controller.signal.aborted) {
        return
      }
      const ready = typeof status === "object" && status !== null && "chatConfigured" in status && status.chatConfigured === true
      setEnabled(ready)
      setNotice(ready ? "" : "Chat is unavailable. You can still use Find a doctor.")
    }).catch(() => {
      if (!controller.signal.aborted) {
        setNotice("Chat is unavailable. You can still use Find a doctor.")
      }
    })
    return () => { controller.abort(); active.current?.abort(); resolving.current?.abort() }
  }, [])

  function handleStop(): void {
    // invalidate the old request before enabling another
    active.current?.abort()
    active.current = null
    setBusy(false)
    setNotice("Message stopped.")
  }

  function handleClear(): void {
    handleStop()
    resolving.current?.abort()
    setTurns([])
    setMessage("")
    setNotice("")
  }

  async function handleAsk(): Promise<void> {
    const question = message.trim()
    if (!enabled || active.current || !question) {
      return
    }

    // compare controller identity before publishing a response or status
    const controller = new AbortController()
    active.current = controller
    setBusy(true)
    setNotice("")
    try {
      const response = chatReplySchema.parse(await sendJson({ url: "/api/chat", method: "POST", body: chatBody(question, turns), signal: controller.signal }))
      if (active.current !== controller) {
        return
      }
      setTurns(previous => [...previous, { question, response }])
      setMessage("")
    } catch (failure) {
      if (active.current === controller) {
        setNotice(failure instanceof Error ? failure.message : "Message failed. You can use the scheduling forms.")
      }
    } finally {
      if (active.current === controller) {
        active.current = null
        setBusy(false)
      }
    }
  }

  async function handleIntent(intent: ChatIntent): Promise<void> {
    // cancel earlier draft lookups before opening the newest selection
    resolving.current?.abort()
    const controller = new AbortController()
    resolving.current = controller
    setNotice("Checking current availability…")
    try {
      await onIntent(intent, controller.signal)
      if (!controller.signal.aborted) {
        setNotice("")
      }
    } catch {
      if (!controller.signal.aborted) {
        setNotice("This selection is unavailable. Check your appointments or find another time.")
      }
    }
  }

  return <aside className="assistant panel" aria-labelledby="assistant-heading">
    {/* scheduling conversation and draft selections */}
    <div className="assistant-icon"><MessageCircle size={22} /></div>
    <h2 id="assistant-heading">Scheduling assistant</h2>
    <p className="intro">Ask about a doctor, an available time, or an appointment.</p>
    <div className="turns" aria-live="polite">{turns.map(({ question, response }, index) =>
      <div key={index}><p className="question">{question}</p><p>{response.reply}</p>
        {response.intent?.kind === "clarify" && response.intent.question !== response.reply && <p>{response.intent.question}</p>}
        {response.intent && response.intent.kind !== "clarify" && <button className="secondary" onClick={() => {
          if (response.intent) {
            void handleIntent(response.intent)
          }
        }}>
          {intentLabels[response.intent.kind]}
        </button>}
      </div>)}</div>
    {/* message composer and chat-local controls */}
    <form onSubmit={event => { event.preventDefault(); void handleAsk() }}>
      <label htmlFor="message" className="sr-only">Your scheduling question</label>
      <Textarea id="message" placeholder="Ask a scheduling question…" rows={3} maxLength={limits.message}
        value={message} disabled={!enabled || busy} onChange={event => setMessage(event.target.value)} />
      <div className="action-row">
        {busy ? <button key="stop" type="button" className="secondary" onClick={event => { event.preventDefault(); handleStop() }}>Stop reply</button> :
          <button key="send" className="primary" type="submit" disabled={!enabled || !message.trim()}>Send message<ArrowUpRight size={16} /></button>}
        {(turns.length > 0 || busy || message) && <button type="button" className="text-button" onClick={handleClear}>Clear chat</button>}
      </div>
    </form>
    <small role="status">{notice}</small>
  </aside>
}
