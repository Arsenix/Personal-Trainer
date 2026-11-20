import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PT Agenda", template: "%s · PT Agenda" },
  description:
    "Agenda para personal trainers independientes: publica tus horas, tus alumnos reservan con sus créditos del mes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-CL">
      <body>{children}</body>
    </html>
  );
}
