"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The app header.
 *
 * A client component purely so the current section can be highlighted --
 * knowing where you are is the cheapest navigational aid there is, and
 * usePathname needs the client.
 */

const PRIMARY = [
  { href: "/", label: "Start here", match: (p: string) => p === "/" },
  { href: "/roster/company", label: "The schedule", match: (p: string) => p.startsWith("/roster") },
  { href: "/conflicts", label: "Problems", match: (p: string) => p.startsWith("/conflicts") },
];

const SECONDARY = [
  { href: "/brands", label: "Clients", match: (p: string) => p.startsWith("/brands") },
  { href: "/employees", label: "Staff", match: (p: string) => p.startsWith("/employees") },
  { href: "/pods", label: "Teams", match: (p: string) => p.startsWith("/pods") },
  { href: "/processes", label: "Types of work", match: (p: string) => p.startsWith("/processes") },
  { href: "/leave", label: "Request leave", match: (p: string) => p.startsWith("/leave") },
  { href: "/admin", label: "Settings", match: (p: string) => p.startsWith("/admin") },
];

export function AppHeader() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="sticky top-0 z-30 bg-[var(--header)] shadow-[var(--shadow-md)]">
      {/* Top row: identity + the three screens that matter */}
      <div className="mx-auto flex max-w-[1480px] flex-wrap items-center gap-x-8 gap-y-3 px-5 py-3">
        <Link href="/" className="group flex items-center gap-2.5 no-underline hover:no-underline">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent)] text-[13px] font-bold text-white"
          >
            R
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-semibold tracking-tight text-[var(--header-ink)]">
              Roster Planner
            </span>
            <span className="mt-0.5 text-[10.5px] uppercase tracking-[0.1em] text-[var(--header-mute)]">
              Operations
            </span>
          </span>
        </Link>

        <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
          {PRIMARY.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-[13.5px] font-medium no-underline transition-colors hover:no-underline ${
                  active
                    ? "bg-white/[0.12] text-white"
                    : "text-[var(--header-mute)] hover:bg-white/[0.06] hover:text-[var(--header-ink)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Second row: reference and configuration screens */}
      <div className="border-t border-[var(--header-line)]">
        <div className="mx-auto max-w-[1480px] px-5">
          <nav aria-label="Reference" className="scroll-x flex items-center gap-5 py-2">
            {SECONDARY.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`whitespace-nowrap border-b-2 py-1 text-[12.5px] no-underline transition-colors hover:no-underline ${
                    active
                      ? "border-[var(--accent)] font-medium text-white"
                      : "border-transparent text-[var(--header-mute)] hover:text-[var(--header-ink)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
