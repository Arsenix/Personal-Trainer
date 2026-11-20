import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/forms";
import { getSessionUser, homeFor } from "@/lib/session";

export const metadata = { title: "Ingresar" };

export default async function IngresarPage() {
  const user = await getSessionUser();
  if (user) redirect(homeFor(user.role));
  return (
    <AuthShell title="Ingresar">
      <LoginForm />
    </AuthShell>
  );
}
