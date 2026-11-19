import { listDemoDoctors, mockZocdoc } from "@/zocdoc/mock"
import { startApp } from "./app"
import { config } from "./config"

// listen on the configured loopback port with the in-process provider
const server = startApp({ port: config.PORT, directory: { adapter: mockZocdoc, listDoctors: listDemoDoctors } })
console.log(`Inifinichat listening on ${server.url}`)
