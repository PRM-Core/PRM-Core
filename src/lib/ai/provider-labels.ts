import type { AiProviderId } from "../db/schema";

// Display name of the one provider there is. A plain module, so the settings
// UI can import it without dragging the server side toward the client bundle.

export const PROVIDER_LABELS: Record<AiProviderId, string> = {
  local: "Model lokalny (w sieci placówki)",
};
