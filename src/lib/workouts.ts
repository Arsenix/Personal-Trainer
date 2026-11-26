import { withUser } from "./db";

/** Ids de los días de una rutina, en orden (la base solo se los deja ver a su alumno o a su PT). */
export async function routineDayIds(userId: string, routineId: string): Promise<string[]> {
  return withUser(userId, async (c) => {
    const { rows } = await c.query("select id from routine_days where routine_id = $1 order by position", [routineId]);
    return rows.map((r) => r.id as string);
  });
}
