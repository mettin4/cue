"use server";

import { deleteSchedule, setScheduleActive } from "@/lib/cue/schedules";

/**
 * Demo affordances for managing recurring payments. There is no sign in yet, so
 * these act for the account id the dashboard is viewing. Real auth replaces that
 * in a later phase.
 */

export async function pauseScheduleAction(
  userId: string,
  id: string,
): Promise<{ ok: boolean }> {
  const updated = await setScheduleActive(userId, id, false);
  return { ok: Boolean(updated) };
}

export async function resumeScheduleAction(
  userId: string,
  id: string,
): Promise<{ ok: boolean }> {
  const updated = await setScheduleActive(userId, id, true);
  return { ok: Boolean(updated) };
}

export async function deleteScheduleAction(
  userId: string,
  id: string,
): Promise<{ ok: boolean }> {
  const ok = await deleteSchedule(userId, id);
  return { ok };
}
