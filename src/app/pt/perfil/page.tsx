import { notFound } from "next/navigation";
import { ProfileForm } from "@/components/forms";
import { getPtProfile } from "@/lib/queries";
import { requirePt } from "@/lib/session";

export const metadata = { title: "Perfil y cobro" };

export default async function PerfilPage() {
  const user = await requirePt();
  const profile = await getPtProfile(user.id);
  if (!profile) notFound();
  return (
    <div className="grid gap-8">
      <header>
        <h1>Perfil y cobro</h1>
        <p className="mt-2 max-w-xl text-muted">
          El alumno te paga por transferencia y sube el comprobante. Aquí dejas tus datos para que sepa a dónde.
        </p>
      </header>
      <div className="panel panel-pad">
        <ProfileForm profile={profile} />
      </div>
    </div>
  );
}
