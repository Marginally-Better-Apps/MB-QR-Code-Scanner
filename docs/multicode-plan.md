# Multicode scanner plan

## Where the project stands

The native QR scanner is functionally complete for its original scope. It has live on-device detection, safe payload actions, multiple simultaneous results, History, a pixel-level decoder test, and simulator UI checks. A physical-device performance and camera-focus pass remains before claiming release readiness.

## Implemented in this change

1. Ask Vision at runtime for all supported symbologies. The current Xcode 26.5 runtime reports 25 formats, including QR, Micro QR, Aztec, Data Matrix, PDF417, EAN/UPC, Code 128, and GS1 DataBar. All run through the existing one-frame-at-a-time camera pipeline.
2. Keep format identity through preview highlights, deduplication, results, and the version-one History envelope. Existing History entries without a format remain readable as QR entries.
3. Validate GTIN check digits and offer a user-initiated product lookup for EAN-8, EAN-13/UPC-A, UPC-E, ITF-14, and GS1 DataBar. Query the Open Food Facts v3 universal product endpoint across its food, beauty, pet food, and general-product databases. Missing records and network errors get distinct states.
4. Recognize the fixed mandatory fields of IATA-style boarding passes in QR, Aztec, Data Matrix, and PDF417 codes. Show route, flight, and day of year. Do not save, copy, or share the raw ticket.
5. Exercise real QR, Aztec, PDF417, Code 128, and EAN-13 pixels through Vision, preview projection, scan acceptance, and History. Core tests cover format identity, retail validation, legacy History, and boarding-pass redaction.

## Release gate

Use printed examples of all major formats on a physical iPhone and iPad. Include small, rotated, glossy, low-light, and damaged codes, plus known and unknown products. Record time from entering the viewfinder to a result, memory, frame delivery rate, and thermal state during ten minutes of continuous scanning. Compare QR-only and all-format modes on an older supported iPhone and a current one. No real-time or accuracy guarantee should be published until these measurements pass. If the full request proves too slow, schedule common and rare formats across successive frames while keeping a single pending result delivery.

## Later work

- Build a wider fixture corpus, especially Data Matrix, Micro QR, UPC-E, and GS1 variants, and add device camera tests.
- Add GS1 application-identifier parsing for expiration dates, lots, and encoded GTINs without treating arbitrary Code 128 strings as retail products.
- Consider a local product cache only after measuring repeated-lookup needs and defining retention. Keep database coverage explicit: a valid barcode may have no community record.
- Revisit localization and accessibility text for the new format labels and product states.

## References

- Apple Vision `VNDetectBarcodesRequest`: https://developer.apple.com/documentation/vision/vndetectbarcodesrequest
- Open Food Facts API introduction: https://openfoodfacts.github.io/openfoodfacts-server/api/
- Open Food Facts universal product lookup: https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/scanning-cosmetics-pet-food-and-other-products/
- IATA BCBP implementation guide: https://www.iata.org/contentassets/1dccc9ed041b4f3bbdcf8ee8682e75c4/2021_03_02-bcbp-implementation-guide-version-7-.pdf
