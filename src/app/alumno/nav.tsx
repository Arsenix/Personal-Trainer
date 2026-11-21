"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/alumno", label: "Inicio", exact: true },
  { href: "/alumno/reservar", label: "Reservar clase" },
];

export function StudentNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className="flex gap-1">
      {ITEMS.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className="nav-link shrink-0" aria-current={active ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
