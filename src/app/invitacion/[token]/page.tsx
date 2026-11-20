import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { AcceptForm } from "@/components/forms";
import { previewInvitation } from "@/lib/queries";

export const metadata = { title: "Invitación", robots: { index: false } };

export default async function InvitacionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await previewInvitation(token);

  if (!preview || preview.state !== "valid") {
    const reason =
      preview?.state === "used"
        ? "Esta invitación ya se usó. Si ya creaste tu contraseña, ingresa con tu correo."
        : preview?.state === "expired"
          ? "Esta invitación venció. Pídele a tu PT que te envíe un link nuevo."
          : preview?.state === "revoked"
            ? "Tu PT canceló esta invitación. Pídele que te envíe un link nuevo."
            : "No encontramos esta invitación. Revisa que el link esté completo o pídele uno nuevo a tu PT.";
    return (
      <AuthShell title="Este link no sirve">
        <p className="text-muted">{reason}</p>
        <p className="mt-6">
          <Link href="/ingresar" className="btn btn-quiet">
            Ir a ingresar
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Hola, ${preview.inviteeName.split(" ")[0]}`}
      intro={
        <>
          <strong className="text-ink">{preview.ptName}</strong> te invitó a su agenda. Crea una contraseña para
          entrar con <strong className="text-ink break-all">{preview.email}</strong>.
        </>
      }
    >
      <AcceptForm token={token} />
    </AuthShell>
  );
}
