import type { Metadata } from "next";
import { AppHeader } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Staff Roster Planner",
  description:
    "Builds the monthly work schedule for a customer-support company, keeping client brands covered while every member of staff still gets their weekly day off.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <AppHeader />

        <main className="mx-auto w-full max-w-[1480px] flex-1 px-5 py-8">{children}</main>

        <footer className="mx-auto w-full max-w-[1480px] px-5 pb-10">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-5 text-xs text-[var(--faint)]">
            <span>Smart Roster Management System</span>
            <span>All staff and client names are fictional sample data</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
