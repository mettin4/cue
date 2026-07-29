import { z } from "zod";

import { resolveActingAccount } from "@/lib/api/auth";
import { clientIp, rateLimit, requireApiSecret } from "@/lib/api/guard";
import { handleRoute, jsonOk } from "@/lib/api/http";
import { listContacts, saveContact } from "@/lib/cue/contacts";

/**
 * Lists the acting account's contacts. Secret authed.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    rateLimit(`contacts:${clientIp(request)}`);
    requireApiSecret(request);

    const actor = await resolveActingAccount(request);
    const contacts = await listContacts(actor.id);

    return jsonOk({
      items: contacts.map((c) => ({ id: c.id, name: c.name, email: c.email })),
    });
  });
}

const bodySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

/**
 * Saves a contact for the acting account. Secret authed.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    rateLimit(`contacts:${clientIp(request)}`);
    requireApiSecret(request);

    const actor = await resolveActingAccount(request);
    const body = bodySchema.parse(await request.json());

    const contact = await saveContact(actor.id, body.name, body.email);

    return jsonOk({ id: contact.id, name: contact.name, email: contact.email });
  });
}
