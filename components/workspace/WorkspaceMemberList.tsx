"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkspaceRole } from "@/lib/workspace-store/types";
import { MY_BOTS_HREF } from "@/lib/workspace-ui/nav";
import {
  buildChangeRoleBody,
  buildRemoveMemberBody,
  buildTransferOwnershipBody,
  canChangeMemberRole,
  canManageMembers,
  canRemoveMember,
  canSelfLeave,
  canTransferOwnership,
  filterMembersByQuery,
  memberDisplayLabel,
  membersApiHref,
  parseMembersListResponse,
  parseMembersMutationResponse,
  type AssignableMemberRole,
  type WorkspaceMemberListItem,
} from "@/lib/workspace-ui/members";

function roleLabel(role: WorkspaceRole): string {
  if (role === "owner") return "Owner";
  if (role === "facilitator") return "Facilitator";
  return "Participant";
}

export default function WorkspaceMemberList({
  workspaceId,
  role,
  currentUserId,
}: {
  workspaceId: string;
  role: WorkspaceRole;
  currentUserId: string;
}) {
  const router = useRouter();
  const [members, setMembers] = useState<WorkspaceMemberListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [demoteTo, setDemoteTo] = useState<AssignableMemberRole>("facilitator");
  const [confirmLeave, setConfirmLeave] = useState(false);

  const manage = canManageMembers(role);
  const mayTransfer = canTransferOwnership(role);
  const mayLeave = canSelfLeave(role);

  async function loadMembers() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(membersApiHref(workspaceId));
      const body = await res.json().catch(() => ({}));
      const parsed = parseMembersListResponse(res.status, body);
      if (!parsed.ok) {
        setError(parsed.error);
        setMembers([]);
        return;
      }
      setMembers(parsed.members);
    } catch {
      setError("Failed to load members");
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!workspaceId) {
      setError("Missing workspace id");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(membersApiHref(workspaceId));
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        const parsed = parseMembersListResponse(res.status, body);
        if (!parsed.ok) {
          setError(parsed.error);
          setMembers([]);
          return;
        }
        setMembers(parsed.members);
      } catch {
        if (!cancelled) {
          setError("Failed to load members");
          setMembers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const visibleMembers = useMemo(
    () => filterMembersByQuery(members, search),
    [members, search],
  );

  const transferCandidates = useMemo(
    () =>
      members.filter((m) => m.userId !== currentUserId && m.role !== "owner"),
    [members, currentUserId],
  );

  async function runMutation(
    targetUserId: string,
    request: () => Promise<Response>,
    successMessage: string,
    options?: { leftWorkspace?: boolean },
  ): Promise<boolean> {
    setBusyUserId(targetUserId);
    setActionError("");
    setActionSuccess("");
    try {
      const res = await request();
      const body = await res.json().catch(() => ({}));
      const parsed = parseMembersMutationResponse(res.status, body);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      if (options?.leftWorkspace) {
        router.push(MY_BOTS_HREF);
        router.refresh();
        return true;
      }
      setActionSuccess(successMessage);
      await loadMembers();
      return true;
    } catch (e: unknown) {
      setActionError(
        e instanceof Error ? e.message : "Failed to update members",
      );
      return false;
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRoleChange(
    target: WorkspaceMemberListItem,
    nextRole: AssignableMemberRole,
  ) {
    if (
      !canChangeMemberRole({
        actorRole: role,
        targetRole: target.role,
        isSelf: target.userId === currentUserId,
      })
    ) {
      return;
    }
    if (target.role === nextRole) return;

    const label = memberDisplayLabel(target);
    await runMutation(
      target.userId,
      () =>
        fetch(membersApiHref(workspaceId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildChangeRoleBody(target.userId, nextRole)),
        }),
      `Updated role for ${label} to ${roleLabel(nextRole)}.`,
    );
  }

  async function handleRemove(target: WorkspaceMemberListItem) {
    if (
      !canRemoveMember({
        actorRole: role,
        targetRole: target.role,
        isSelf: target.userId === currentUserId,
      })
    ) {
      return;
    }

    const label = memberDisplayLabel(target);
    await runMutation(
      target.userId,
      () =>
        fetch(membersApiHref(workspaceId), {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildRemoveMemberBody(target.userId)),
        }),
      `Removed ${label}. They no longer have Workspace access.`,
    );
  }

  async function handleTransfer() {
    if (!mayTransfer || !transferTargetId) return;

    const ok = await runMutation(
      transferTargetId,
      () =>
        fetch(membersApiHref(workspaceId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildTransferOwnershipBody(transferTargetId, demoteTo),
          ),
        }),
      `Ownership transferred. You are now a ${roleLabel(demoteTo)}.`,
    );
    if (ok) {
      setTransferTargetId("");
      router.refresh();
    }
  }

  async function handleSelfLeave() {
    if (!mayLeave || !currentUserId) return;

    await runMutation(
      currentUserId,
      () =>
        fetch(membersApiHref(workspaceId), {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildRemoveMemberBody(currentUserId)),
        }),
      "You left this Workspace.",
      { leftWorkspace: true },
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
          Members
        </h2>
      </div>

      <label className="block max-w-xl">
        <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">
          Search members
        </span>
        <input
          type="search"
          className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          placeholder="Filter by email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search members"
        />
      </label>

      {loading ? (
        <p className="text-sm text-slate-600 dark:text-zinc-300">
          Loading members…
        </p>
      ) : error ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-600 dark:text-zinc-400">
            Showing {visibleMembers.length} of {members.length} members
          </p>

          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/40">
            {visibleMembers.length === 0 ? (
              <li className="px-4 py-6 text-sm text-slate-600 dark:text-zinc-400">
                No members match this search.
              </li>
            ) : (
              visibleMembers.map((m) => {
                const isSelf = m.userId === currentUserId;
                const label = memberDisplayLabel(m);
                const mayChange = canChangeMemberRole({
                  actorRole: role,
                  targetRole: m.role,
                  isSelf,
                });
                const mayRemove = canRemoveMember({
                  actorRole: role,
                  targetRole: m.role,
                  isSelf,
                });
                const busy = busyUserId === m.userId;

                return (
                  <li
                    key={m.userId}
                    className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-zinc-100">
                        {label}
                        {isSelf ? (
                          <span className="ml-2 text-xs font-normal text-slate-500 dark:text-zinc-400">
                            (you)
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
                        Joined {new Date(m.joinedAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {mayChange ? (
                        <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-zinc-300">
                          <span className="sr-only">Role for {label}</span>
                          <select
                            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                            value={m.role}
                            disabled={busy}
                            onChange={(e) =>
                              void handleRoleChange(
                                m,
                                e.target.value as AssignableMemberRole,
                              )
                            }
                          >
                            <option value="facilitator">Facilitator</option>
                            <option value="participant">Participant</option>
                          </select>
                        </label>
                      ) : (
                        <span className="inline-flex h-9 items-center rounded-lg bg-slate-100 px-3 text-sm font-medium text-slate-700 dark:bg-zinc-800 dark:text-zinc-200">
                          {roleLabel(m.role)}
                        </span>
                      )}

                      {mayRemove ? (
                        <button
                          type="button"
                          onClick={() => void handleRemove(m)}
                          disabled={busy}
                          className="inline-flex h-9 items-center rounded-lg border border-red-300 px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                        >
                          {busy ? "Removing…" : "Remove"}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </>
      )}

      {actionError ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {actionError}
        </p>
      ) : null}
      {actionSuccess ? (
        <p
          className="text-sm text-emerald-700 dark:text-emerald-300"
          role="status"
        >
          {actionSuccess}
        </p>
      ) : null}

      {mayTransfer ? (
        <section className="space-y-3 border-t border-slate-200 pt-6 dark:border-zinc-800">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-100">
              Transfer ownership
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
              Make another member the sole Owner. You will be demoted to the
              role you choose.
            </p>
          </div>
          {transferCandidates.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-zinc-400">
              Invite another member before transferring ownership.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                  New Owner
                </span>
                <select
                  className="mt-1 block h-10 min-w-[12rem] rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                  value={transferTargetId}
                  onChange={(e) => setTransferTargetId(e.target.value)}
                  disabled={Boolean(busyUserId)}
                >
                  <option value="">Select member…</option>
                  {transferCandidates.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {memberDisplayLabel(m)} ({roleLabel(m.role)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                  Demote yourself to
                </span>
                <select
                  className="mt-1 block h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                  value={demoteTo}
                  onChange={(e) =>
                    setDemoteTo(e.target.value as AssignableMemberRole)
                  }
                  disabled={Boolean(busyUserId)}
                >
                  <option value="facilitator">Facilitator</option>
                  <option value="participant">Participant</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => void handleTransfer()}
                disabled={!transferTargetId || Boolean(busyUserId)}
                className="inline-flex h-10 items-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyUserId === transferTargetId
                  ? "Transferring…"
                  : "Transfer ownership"}
              </button>
            </div>
          )}
        </section>
      ) : null}

      {mayLeave ? (
        <section className="space-y-3 border-t border-slate-200 pt-6 dark:border-zinc-800">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-100">
              Leave Workspace
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
              Leaving removes this Workspace from your list and ends your
              access.
            </p>
          </div>
          {!confirmLeave ? (
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              disabled={Boolean(busyUserId)}
              className="inline-flex h-10 items-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Leave Workspace…
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleSelfLeave()}
                disabled={Boolean(busyUserId)}
                className="inline-flex h-10 items-center rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyUserId === currentUserId ? "Leaving…" : "Confirm leave"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmLeave(false)}
                disabled={Boolean(busyUserId)}
                className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          )}
        </section>
      ) : manage && role === "owner" ? (
        <p className="border-t border-slate-200 pt-6 text-sm text-slate-600 dark:border-zinc-800 dark:text-zinc-400">
          As Owner, transfer ownership before you can leave this Workspace.
        </p>
      ) : null}
    </div>
  );
}
