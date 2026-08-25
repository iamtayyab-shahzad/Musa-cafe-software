import { describe, expect, it } from "vitest";
import { isLeaderHeartbeatFresh, POS_LEADER_STALE_MS } from "@/lib/pos-single-instance";

describe("POS single instance", () => {
  it("treats a recent heartbeat as a live leader", () => {
    const now = 1_000_000;
    expect(isLeaderHeartbeatFresh(now - 500, now)).toBe(true);
  });

  it("treats a stale/missing heartbeat as a dead window (new one may take over)", () => {
    const now = 1_000_000;
    expect(isLeaderHeartbeatFresh(null, now)).toBe(false);
    expect(isLeaderHeartbeatFresh(now - POS_LEADER_STALE_MS - 1, now)).toBe(
      false,
    );
  });
});
