# Demo fixtures

Own the synthetic records in `demo.ts`. Keep patient and appointment IDs stable for existing databases. Import only shared contracts. Run `bun test tests/mock.test.ts` from the repository root.

The fixed directory covers primary care and pediatrics in ZIP 94110, dermatology in 94612, and cardiology in 94115. Mountain View (94041) offers primary care and cardiology. San Mateo (94401) offers primary care and dermatology. Searching `Chen` in 94110 returns Maya and Mina. Maya has three candidate times and Mina has none.

Candidate slots last 30 minutes during April 16–18, 2030, Pacific time. Fixtures supply absolute UTC starts and the doctor location’s IANA time zone. The seeded April 10 appointment stays in patient history outside this search window.
