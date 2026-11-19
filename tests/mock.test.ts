import { expect, test } from "bun:test"
import { doctors, slots } from "@/fixtures/demo"
import { mockZocdoc } from "@/zocdoc/mock"

test("combines doctor name or specialty with location", async () => {
  expect(await mockZocdoc.searchProviders({ query: "primary", zip: "94110" })).toEqual([doctors[0]])
  expect(await mockZocdoc.searchProviders({ query: "chen", zip: "94612" })).toEqual([])
})

test("returns only the selected doctor's available times", async () => {
  expect(await mockZocdoc.getAvailability({ doctorId: doctors[1].id, locationId: doctors[1].locationId })).toEqual([slots[1]])
  expect(await mockZocdoc.getAvailability({ doctorId: "unknown", locationId: "none" })).toEqual([])
})
