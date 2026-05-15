export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <nav className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-6">
          <span className="font-semibold text-zinc-900 text-lg">+Carton</span>
          <a
            href="/import"
            className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            Import
          </a>
          <a
            href="/products"
            className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            Products
          </a>
          <a
            href="/category-templates"
            className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            Category Templates
          </a>
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
