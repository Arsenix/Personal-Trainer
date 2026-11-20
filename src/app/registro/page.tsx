import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "@/components/forms";
import { getSessionUser, homeFor } from "@/lib/session";

export const metadata = { title: "Crear cuenta de PT" };

export default async function RegistroPage() {
  const user = await getSessionUser();
  if (user) redirect(homeFor(user.role));
  return (
    <AuthShell
      title="Crea tu cuenta de PT"
      intro="Después de registrarte podrás invitar a tus alumnos. Ellos no buscan PT: entran con el link que tú les mandes."
    >
      <RegisterForm />
    </AuthShell>
  );
}
