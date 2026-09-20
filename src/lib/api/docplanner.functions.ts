import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "./require-user";
import { getCredentials } from "@/lib/credentials/store.server";
import { docplannerHost } from "@/lib/docplanner/config";

/** What the Docplanner card may know: whether keys are there and for which service. */
export interface DocplannerStatus {
  configured: boolean;
  host: string;
}

export const getDocplannerStatus = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async (): Promise<DocplannerStatus> => {
    const c = await getCredentials(
      "DOCPLANNER_DOMAIN",
      "DOCPLANNER_CLIENT_ID",
      "DOCPLANNER_CLIENT_SECRET",
    );
    return {
      configured: !!c.DOCPLANNER_CLIENT_ID && !!c.DOCPLANNER_CLIENT_SECRET,
      host: docplannerHost(c.DOCPLANNER_DOMAIN) ?? "",
    };
  });
