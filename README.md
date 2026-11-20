# KUCHIPOO Uniware Combined Export Setup — payload spelling fix

This update corrects the Uniware Create Export Job payload field to the exact API property name documented by Uniware: `exportColums` (the API uses this spelling, with the `n` missing).

## Included
- Existing Uniware OAuth flow using Vercel environment variables.
- Inventory Snapshot export request with `Item SkuCode` and `Inventory`, no filters.
- Sale Orders export request with `Item SKU Code`, `Invoice Created`, `Channel Name`, and the configured Invoiced In Date Range filter ID.
- Export job status lookup by `jobCode`.
- Safe upstream error diagnostics.

## Deploy
Replace the files in the existing GitHub repository and commit. Keep the same Vercel project; existing environment variables remain attached to that project.

## Important
This corrects the confirmed `exportColumns` vs `exportColums` schema mismatch. It does not claim that Uniware has accepted the request until the live export test succeeds. The Sales filter ID still needs a valid tenant-specific value before Sales export can be created.


## Inventory Snapshot implementation note
The Inventory button now uses Uniware's dedicated REST endpoint `/services/rest/v1/inventory/inventorySnapshot/get` with an empty request body, rather than the Export Job API. The tenant rejected the Export Job column labels (`Item SkuCode`, `Inventory`) as `INVALID_EXPORT_JOB_COLUMN`. The dedicated endpoint returns `inventorySnapshots` with `itemTypeSKU` and `inventory`; duplicate SKU rows are summed. This fetch is synchronous and does not create an export job or wait for a CSV download. Sales Orders still use the asynchronous Export Job API and require the confirmed numeric filter ID.
