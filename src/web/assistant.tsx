import { useEffect, useState } from "react"
import { ArrowUpRight, MessageCircle } from "lucide-react"
import type { ChatReply } from "@/shared/contracts"
import { readJson } from "./lib/api"

interface Turn { question: string; answer: string }

/**
 * Sends individual scheduling questions to the server-side OpenAI adapter.
 */
export function Assistant() {
  const [enabled, setEnabled] = useState(false)
  const [message, setMessage] = useState("")
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("Checking connection…")

  // check configuration without invoking the provider
  useEffect(() => {
    readJson<{ chatConfigured: boolean }>("/api/status").then(status => {
      setEnabled(status.chatConfigured)
      setNotice(status.chatConfigured ? "" : "Set OPENAI_API_KEY in .env to enable chat.")
    }).catch(() => setNotice("The assistant is unavailable."))
  }, [])

  async function handleAsk(): Promise<void> {
    const question = message.trim()
    if (!enabled || busy || !question) return

    // retain the draft on failure so the patient can retry
    setBusy(true)
    setNotice("")
    try {
      const response = await readJson<ChatReply>("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question }),
      })
      setTurns(previous => [...previous, { question, answer: response.reply }])
      setMessage("")
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : "Message failed.")
    } finally { setBusy(false) }
  }

  return (
    <aside className="assistant panel" aria-labelledby="assistant-heading">
      {/* conversation */}
      <div className="assistant-icon"><MessageCircle size={22} /></div>
      <h2 id="assistant-heading">Scheduling assistant</h2>
      <p className="intro">Ask about finding a doctor or preparing for your visit.</p>
      <div className="turns" aria-live="polite">{turns.map((turn, index) =>
        <div key={index}><p className="question">{turn.question}</p><p>{turn.answer}</p></div>,
      )}</div>
      {/* message composer */}
      <form onSubmit={event => { event.preventDefault(); void handleAsk() }}>
        <label htmlFor="message" className="sr-only">Your scheduling question</label>
        <textarea id="message" placeholder="Ask a scheduling question…" rows={3} maxLength={1500}
          value={message} disabled={!enabled || busy} onChange={event => setMessage(event.target.value)} />
        <button className="primary" type="submit" disabled={!enabled || busy || !message.trim()}>{busy ? "Sending…" : "Send message"}<ArrowUpRight size={16} /></button>
      </form>
      <small role="status">{notice}</small>
    </aside>
  )
}
