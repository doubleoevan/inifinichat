import { createRoot } from "react-dom/client"
import { CareDesk } from "./care-desk"

// mount the single patient workspace
const root = document.getElementById("root")
if (root) createRoot(root).render(<CareDesk />)
