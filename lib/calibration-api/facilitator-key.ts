/**
 * Resolve the facilitator API key without leaking it to clients.
 * An offering override wins; otherwise use the sample bot's stored key.
 */
import { getAppById } from "@/lib/app-store/store";
import type { AppConfig } from "@/lib/app-store/types";
import type { Offering } from "@/lib/calibration-store/types";

export type GetAppByIdFn = (
  id: string,
  ownerId?: string
) => Promise<AppConfig | null | undefined>;

export async function resolveFacilitatorApiKey(
  offering: Pick<Offering, "facilitatorApiKey" | "sampleAppId" | "operatorUserId">,
  deps: { getAppById?: GetAppByIdFn } = {}
): Promise<string> {
  const override = offering.facilitatorApiKey?.trim();
  if (override) return override;
  const loadApp = deps.getAppById ?? getAppById;
  const app = await loadApp(offering.sampleAppId, offering.operatorUserId);
  return app?.apiKey?.trim() ?? "";
}

export function publicOffering<T extends { facilitatorApiKey?: string }>(
  offering: T
): Omit<T, "facilitatorApiKey"> {
  const { facilitatorApiKey: _omitted, ...rest } = offering;
  return rest;
}
