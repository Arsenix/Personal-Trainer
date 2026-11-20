import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "pt" | "student";
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const role = (session.user as { role?: string }).role;
  if (role !== "pt" && role !== "student") return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email, role };
}

export async function requirePt(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/ingresar");
  if (user.role !== "pt") redirect("/alumno");
  return user;
}

export async function requireStudent(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/ingresar");
  if (user.role !== "student") redirect("/pt");
  return user;
}

export function homeFor(role: SessionUser["role"]): string {
  return role === "pt" ? "/pt" : "/alumno";
}
