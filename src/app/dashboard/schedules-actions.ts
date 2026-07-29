"use server";

import { requireFullUser } from "@/lib/auth/current-user";
import { deleteSchedule, setScheduleActive } from "@/lib/cue/schedules";

/**
 * Managing recurring payments. The account comes from the signed in session and
 * a full sign in is required, so a scoped session cannot change anything.
 */

export async function pauseScheduleAction(id: string): Promise<{ ok: boolean }> {
  const user = await requireFullUser();
  const updated = await setScheduleActive(user.id, id, false);
  return { ok: Boolean(updated) };
}

export async function resumeScheduleAction(id: string): Promise<{ ok: boolean }> {
  const user = await requireFullUser();
  const updated = await setScheduleActive(user.id, id, true);
  return { ok: Boolean(updated) };
}

export async function deleteScheduleAction(id: string): Promise<{ ok: boolean }> {
  const user = await requireFullUser();
  const ok = await deleteSchedule(user.id, id);
  return { ok };
}
