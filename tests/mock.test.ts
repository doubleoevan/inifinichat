import { expect, test } from "bun:test"
import { doctors, slots } from "@/fixtures/demo"
import { mockZocdoc } from "@/zocdoc/mock"

test("combines doctor name or specialty with location", async () => {
  expect(await mockZocdoc.search({ query: "primary", location: "FRANCISCO" })).toEqual([doctors[0]])
  expect(await mockZocdoc.search({ query: "chen", location: "Oakland" })).toEqual([])
})

test("returns only the selected doctor's available times", async () => {
  expect(await mockZocdoc.availability(doctors[1].id)).toEqual([slots[1]])
  expect(await mockZocdoc.availability("unknown")).toEqual([])
})
