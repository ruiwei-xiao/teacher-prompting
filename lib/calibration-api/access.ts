/**
 * Calibration ACL: resolve the signed-in caller as team member, offering
 * operator, or denied. Later space/operator/score routes reuse this guard.
 *
 * Member takes precedence when an operator has also checked in and been
 * matched onto the team. Viewing as operator never creates a check-in.
 */
import { getOffering, getTeam } from "@/lib/calibration-store/store";
import type { Offering, Team } from "@/lib/calibration-store/types";

export type CallerRole = "member" | "operator" | "denied";

export type CallerResolution =
  | { role: "member"; userId: string; offering: Offering; team: Team }
  | { role: "operator"; userId: string; offering: Offering; team: Team | null }
  | { role: "denied"; userId: string }
  | { role: "not_found" };

export type CallerScope = { teamId: string } | { offeringId: string };

/**
 * Resolve a signed-in caller against a team or offering.
 * Unauthenticated callers are rejected by handlers (401) before this runs.
 */
export async function resolveCaller(
  userId: string,
  scope: CallerScope
): Promise<CallerResolution> {
  if ("teamId" in scope) {
    const team = await getTeam(scope.teamId);
    if (!team) {
      return { role: "not_found" };
    }
    const offering = await getOffering(team.offeringId);
    if (!offering) {
      return { role: "not_found" };
    }
    if (team.members.some((member) => member.userId === userId)) {
      return { role: "member", userId, offering, team };
    }
    if (offering.operatorUserId === userId) {
      return { role: "operator", userId, offering, team };
    }
    return { role: "denied", userId };
  }

  const offering = await getOffering(scope.offeringId);
  if (!offering) {
    return { role: "not_found" };
  }
  if (offering.operatorUserId === userId) {
    return { role: "operator", userId, offering, team: null };
  }
  return { role: "denied", userId };
}
