export default function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Settings & Guide</h1>
        <p className="mt-1 text-sm text-zinc-500">How to set up and use +Carton</p>
      </div>

      {/* Step 1 */}
      <section className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-sm font-semibold">1</span>
          <h2 className="text-base font-semibold text-zinc-900">First-time setup — Category Templates</h2>
        </div>
        <p className="text-sm text-zinc-600">
          Before importing any products, configure your categories. This only needs to be done once.
          Every future import inherits these settings automatically.
        </p>
        <ol className="text-sm text-zinc-600 space-y-2 list-decimal list-inside">
          <li>Go to <a href="/category-templates" className="text-indigo-600 hover:underline font-medium">Category Templates</a></li>
          <li>Click <strong>Add category</strong> — create one for each product type (Food Papers, Cups, Tapes, Bags, etc.)</li>
          <li>For each category, fill in:
            <ul className="mt-2 ml-5 space-y-1 list-disc">
              <li><strong>noissue URL path</strong> — e.g. <code className="bg-zinc-100 px-1 rounded text-xs">/shop/food-papers/</code></li>
              <li><strong>Shopify collection ID</strong> — found in Shopify Admin → Collections → click collection → copy ID from URL</li>
              <li><strong>Shopify tag</strong> — e.g. <code className="bg-zinc-100 px-1 rounded text-xs">food-paper</code></li>
            </ul>
          </li>
          <li>Under each category, click <strong>Add size</strong> and enter each size with its pricing tiers:
            <pre className="mt-2 bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-xs text-zinc-700 overflow-x-auto">{`[
  {"min_qty": 50,  "price": 30},
  {"min_qty": 100, "price": 25},
  {"min_qty": 500, "price": 20}
]`}</pre>
          </li>
        </ol>
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <strong>Tip:</strong> Size labels must match exactly what noissue shows on their product page (e.g. <code className="bg-amber-100 px-1 rounded text-xs">190×190mm</code>). The importer matches them case-insensitively.
        </div>
      </section>

      {/* Step 2 */}
      <section className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-sm font-semibold">2</span>
          <h2 className="text-base font-semibold text-zinc-900">Import a single product</h2>
        </div>
        <ol className="text-sm text-zinc-600 space-y-2 list-decimal list-inside">
          <li>Go to <a href="/import" className="text-indigo-600 hover:underline font-medium">Import</a></li>
          <li>Paste a noissue.co product URL — e.g.<br />
            <code className="bg-zinc-100 px-2 py-0.5 rounded text-xs break-all">https://noissue.co/shop/food-papers/custom-coated-paper/</code>
          </li>
          <li>The category is <strong>auto-detected</strong> from the URL — confirm or change it in the dropdown</li>
          <li>A <strong>pricing preview</strong> appears showing all sizes and their tier breakpoints</li>
          <li>If any size shows a yellow warning (<em>"No pricing configured for…"</em>), go to Category Templates and add that size first</li>
          <li>Click <strong>Import</strong> — status updates live: Scraping → Processing → Draft</li>
          <li>Takes approximately 15–30 seconds</li>
        </ol>
      </section>

      {/* Step 3 */}
      <section className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-sm font-semibold">3</span>
          <h2 className="text-base font-semibold text-zinc-900">Review and publish</h2>
        </div>
        <ol className="text-sm text-zinc-600 space-y-2 list-decimal list-inside">
          <li>Go to <a href="/products" className="text-indigo-600 hover:underline font-medium">Products</a></li>
          <li>Click any <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">draft</span> row to expand it</li>
          <li>Review the pricing tiers per variant size</li>
          <li>Click <strong>View in Shopify</strong> to preview the product in your Shopify admin</li>
          <li>Click <strong>Publish</strong> to make it live in your store</li>
        </ol>
      </section>

      {/* Step 4 */}
      <section className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-sm font-semibold">4</span>
          <h2 className="text-base font-semibold text-zinc-900">Bulk import (up to 50 products overnight)</h2>
        </div>
        <ol className="text-sm text-zinc-600 space-y-2 list-decimal list-inside">
          <li>Create a CSV file with two columns:</li>
        </ol>
        <pre className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-xs text-zinc-700 overflow-x-auto">{`url,category
https://noissue.co/shop/food-papers/custom-coated-paper/,Food Papers
https://noissue.co/shop/cups/custom-cups/,Cups
https://noissue.co/shop/custom-tapes/,Tapes`}</pre>
        <ol start={2} className="text-sm text-zinc-600 space-y-2 list-decimal list-inside">
          <li>Go to <a href="/import" className="text-indigo-600 hover:underline font-medium">Import</a> → switch to the <strong>Bulk Import</strong> tab</li>
          <li>Drag and drop your CSV file (or click to browse)</li>
          <li>Invalid rows (wrong URL, unknown category) are flagged — fix them before proceeding</li>
          <li>Click <strong>Start Bulk Import</strong> — runs in the background, safe to close the tab</li>
          <li>You will receive an email at <strong>aaron@canteracap.com</strong> when the job finishes with a summary</li>
          <li>Track progress any time in <a href="/bulk-jobs" className="text-indigo-600 hover:underline font-medium">Bulk Jobs</a></li>
        </ol>
      </section>

      {/* Step 5 */}
      <section className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-sm font-semibold">5</span>
          <h2 className="text-base font-semibold text-zinc-900">Update an existing product (Re-sync)</h2>
        </div>
        <p className="text-sm text-zinc-600">Use this when noissue updates their product description, adds new sizes, or changes images.</p>
        <ol className="text-sm text-zinc-600 space-y-2 list-decimal list-inside">
          <li>Go to <a href="/products" className="text-indigo-600 hover:underline font-medium">Products</a> → click <strong>Re-sync</strong> on any row</li>
          <li>The system fetches the latest data from noissue (~15 seconds)</li>
          <li>A diff appears showing exactly what changed — old value vs new value per field</li>
          <li>Tick only the fields you want to update (Title, Description, Images, Variants, SEO)</li>
          <li>Click <strong>Apply selected</strong> — only those fields are updated in Shopify</li>
        </ol>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
          <strong>Note:</strong> Your pricing tiers are never overwritten by re-sync — they come from your Category Templates, not from noissue.
        </div>
      </section>

      {/* Step 6 */}
      <section className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-sm font-semibold">6</span>
          <h2 className="text-base font-semibold text-zinc-900">Undo a mistake</h2>
        </div>
        <ol className="text-sm text-zinc-600 space-y-2 list-decimal list-inside">
          <li>Go to <a href="/products" className="text-indigo-600 hover:underline font-medium">Products</a> → click <strong>Delete</strong> on any row</li>
          <li>Confirm the dialog — the product is removed from Shopify immediately</li>
          <li>The import record stays in your history (it is never deleted)</li>
          <li>Click <strong>Re-import</strong> on the deleted row to start a fresh import from the same URL</li>
        </ol>
      </section>

      {/* Step 7 */}
      <section className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-sm font-semibold">7</span>
          <h2 className="text-base font-semibold text-zinc-900">Check history and audit trail</h2>
        </div>
        <ul className="text-sm text-zinc-600 space-y-3">
          <li>
            <a href="/activity-log" className="text-indigo-600 hover:underline font-medium">Activity Log</a>
            {' '}— every action (import, publish, re-sync, delete) with field-level before/after detail and timestamp
          </li>
          <li>
            <a href="/bulk-jobs" className="text-indigo-600 hover:underline font-medium">Bulk Jobs</a>
            {' '}— full history of all CSV batch runs; click any job to drill into per-URL status and error messages
          </li>
        </ul>
      </section>

      {/* Managing users */}
      <section className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-zinc-100 text-zinc-600 text-sm font-semibold">⚙</span>
          <h2 className="text-base font-semibold text-zinc-900">Managing users</h2>
        </div>
        <p className="text-sm text-zinc-600">
          Users are managed directly in your Supabase dashboard — no UI needed here.
        </p>
        <ol className="text-sm text-zinc-600 space-y-2 list-decimal list-inside">
          <li>Go to <strong>supabase.com</strong> → your project → <strong>Authentication → Users</strong></li>
          <li>Click <strong>Add user</strong> → enter their email and a temporary password</li>
          <li>Share the login URL with them — they can change their password after signing in</li>
          <li>To remove access: click the user → <strong>Delete user</strong></li>
        </ol>
      </section>
    </div>
  )
}
