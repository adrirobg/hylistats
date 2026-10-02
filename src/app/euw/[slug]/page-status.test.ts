import { describe, expect, it } from "vitest";
import type { ProfileView } from "./data";
import { profilePageStatus } from "./page-status";

// Solo los campos que lee `profilePageStatus`: el resto de `ProfileView` no interviene.
function view(overrides: Partial<ProfileView> = {}): ProfileView {
  return {
    versions: { version: "boot.3", groupVersion: "boot.7" },
    lastSyncedAt: new Date(5_000),
    sync: null,
    lastJobError: null,
    paused: false,
    ...overrides,
  } as ProfileView;
}

describe("profilePageStatus", () => {
  it("el mismo JSON que el estado, con las versiones leídas antes de cargar", () => {
    expect(profilePageStatus(view(), 9_000, null)).toEqual({
      now: 9_000,
      kind: "profile",
      version: "boot.3",
      groupVersion: "boot.7",
      profile: {
        lastSyncedAt: 5_000,
        sync: null,
        lastJobErrorAt: null,
        paused: false,
      },
      group: null,
    });
  });

  it("job en curso, último error y pausa en epoch ms", () => {
    const status = profilePageStatus(
      view({
        sync: {
          kind: "backfill",
          phase: "fetching",
          fetched: 10,
          total: 40,
          retryAt: new Date(7_000),
          reason: "rate_limit",
          queue: null,
        },
        lastJobError: { at: new Date(4_000) },
        paused: true,
      }),
      9_000,
      null,
    );
    expect(status.profile).toEqual({
      lastSyncedAt: 5_000,
      sync: {
        kind: "backfill",
        phase: "fetching",
        fetched: 10,
        total: 40,
        retryAt: 7_000,
        reason: "rate_limit",
        queue: null,
      },
      lastJobErrorAt: 4_000,
      paused: true,
    });
  });

  it("en la vista del grupo lleva el estado de los miembros", () => {
    const status = profilePageStatus(view(), 9_000, {
      members: 6,
      active: 2,
      oldestSync: {
        gameName: "Beto",
        tagLine: "EUW",
        lastSyncedAt: null,
      } as never,
    });
    expect(status.group).toEqual({
      members: 6,
      active: 2,
      oldest: { gameName: "Beto", tagLine: "EUW", lastSyncedAt: null },
    });
  });
});
