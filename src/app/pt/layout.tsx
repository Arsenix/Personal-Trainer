import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { logout } from "@/app/actions/auth";
import { requirePt } from "@/lib/session";
import { PtNav } from "./nav";

export default async function PtLayout({ children }: { children: ReactNode }) {
  const user = await requirePt();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="on-dark flex flex-col gap-4 bg-ink px-4 py-4 text-paper md:sticky md:top-0 md:h-dvh md:gap-8 md:px-4 md:py-6">
        <div className="flex items-center justify-between">
          <Wordmark href="/pt" className="text-paper" />
          <form action={logout} className="md:hidden">
            <button type="submit" className="btn btn-quiet btn-sm !border-[#3a4650] !text-paper" aria-label="Salir">
              <LogOut size={16} aria-hidden />
            </button>
          </form>
        </div>
        <PtNav />
        <div className="mt-auto hidden md:block">
          <p className="truncate px-3 text-sm font-semibold">{user.name}</p>
          <p className="truncate px-3 text-xs text-[#9aa7b0]">{user.email}</p>
          <form action={logout} className="mt-3">
            <button type="submit" className="nav-link w-full">
              <LogOut size={19} strokeWidth={1.75} aria-hidden />
              Salir
            </button>
          </form>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}
