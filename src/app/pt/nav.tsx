"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, CalendarDays, LayoutDashboard, ClipboardList, Clock3, MapPin, Tags, UserCog, Users } from "lucide-react";

const ITEMS = [
  { href: "/pt", label: "Resumen", icon: LayoutDashboard, exact: true },
  { href: "/pt/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/pt/alumnos", label: "Alumnos", icon: Users },
  { href: "/pt/rutinas", label: "Rutinas", icon: ClipboardList },
  { href: "/pt/planes", label: "Planes", icon: Tags },
  { href: "/pt/disponibilidad", label: "Disponibilidad", icon: Clock3 },
  { href: "/pt/lugares", label: "Lugares", icon: MapPin },
  { href: "/pt/perfil", label: "Perfil y cobro", icon: UserCog },
  { href: "/pt/actividad", label: "Actividad", icon: Activity },
];

export function PtNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="nav-link shrink-0"
            aria-current={active ? "page" : undefined}
          >
            <Icon size={19} strokeWidth={1.75} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
