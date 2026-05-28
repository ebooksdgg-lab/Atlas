"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/connect",   label: "Conectar número" },
  { href: "/settings",  label: "Configuración" },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex flex-col w-56 shrink-0 border-r border-border bg-card h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <span className="text-base font-semibold tracking-tight">Atlas</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/")
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
              }`}
            >
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Sign out */}
      <div className="px-3 py-4 border-t border-border">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full flex items-center px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
