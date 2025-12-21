import Link from "next/link";

export default function Header() {
  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-8 py-4">
        <nav className="flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-blue-600">
            Line Bot 管理後台
          </Link>
          <div className="flex gap-4">
            <Link
              href="/"
              className="px-4 py-2 text-gray-700 hover:text-blue-600 transition-colors"
            >
              統計儀表板
            </Link>
            <Link
              href="/conversations"
              className="px-4 py-2 text-gray-700 hover:text-blue-600 transition-colors"
            >
              對話管理
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}

