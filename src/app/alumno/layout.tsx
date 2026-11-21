import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { logout } from "@/app/actions/auth";
import { requireStudent } from "@/lib/session";
import { StudentNav } from "./nav";

export default async function AlumnoLayout({ children }: { children: ReactNode }) {
  const user = await requireStudent();
  return (
    <div className="min-h-dvh">
      <header className="on-dark bg-ink text-paper">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-8">
          <Wordmark href="/alumno" className="text-paper" />
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[12rem] truncate text-sm text-[#c9d1d6] sm:block">{user.name}</span>
            <form action={logout}>
              <button type="submit" className="btn btn-quiet btn-sm !border-[#3a4650] !text-paper">
                <LogOut size={16} aria-hidden />
                Salir
              </button>
            </form>
          </div>
          <div className="w-full">
            <StudentNav />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}
