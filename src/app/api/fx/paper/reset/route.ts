import { DEFAULT_PAIR } from "../../../../fx/pairs.ts";
import { resetAccount, readState } from "../store.ts";
import { requireAccess } from "../../auth.ts";

export const dynamic = "force-dynamic";

/** Wipe the paper account. Destructive and irreversible, so the client
    confirms before calling it. */
export async function POST(request: Request) {
  if (!(await requireAccess(request))) {
    return Response.json({ error: "Not authorised." }, { status: 403 });
  }
  await resetAccount();
  return Response.json({ state: await readState(DEFAULT_PAIR) });
}
