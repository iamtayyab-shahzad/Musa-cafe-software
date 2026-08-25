import { shop } from "@/lib/shop";

/**
 * Prefer one sync engine per browser profile so two tills on the same PC
 * do not double-push the offline queue. Two separate computers are both
 * leaders and both sync to the API.
 */

export const POS_INSTANCE_CHANNEL = `${shop.storageKeyPrefix}-pos-single`;
export const POS_LEADER_STORAGE_KEY = `${shop.storageKeyPrefix}-pos-leader-beat`;
export const POS_HEARTBEAT_MS = 1500;
export const POS_LEADER_STALE_MS = 4000;
export const POS_CLAIM_WAIT_MS = 600;

export function isLeaderHeartbeatFresh(
  beatMs: number | null,
  nowMs: number,
  staleMs = POS_LEADER_STALE_MS,
): boolean {
  if (beatMs == null || !Number.isFinite(beatMs)) return false;
  return nowMs - beatMs < staleMs;
}

type ChannelMsg =
  | { type: "hello"; id: string }
  | { type: "pong"; id: string };

export type PosInstanceRole = "leader" | "duplicate";

export function claimPosSingleInstance(): {
  ready: Promise<PosInstanceRole>;
  release: () => void;
} {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `pos-${Date.now()}`;
  let role: PosInstanceRole | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let channel: BroadcastChannel | null = null;
  let released = false;

  const writeBeat = () => {
    try {
      localStorage.setItem(POS_LEADER_STORAGE_KEY, String(Date.now()));
    } catch {
      /* ignore quota / private mode */
    }
  };

  const readBeat = (): number | null => {
    try {
      const raw = localStorage.getItem(POS_LEADER_STORAGE_KEY);
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  };

  const becomeLeader = () => {
    role = "leader";
    writeBeat();
    heartbeat = setInterval(writeBeat, POS_HEARTBEAT_MS);
    if (channel) {
      channel.onmessage = (ev: MessageEvent<ChannelMsg>) => {
        const msg = ev.data;
        if (!msg || msg.type !== "hello" || msg.id === id) return;
        try {
          channel?.postMessage({ type: "pong", id } satisfies ChannelMsg);
        } catch {
          /* ignore */
        }
        try {
          window.focus();
        } catch {
          /* ignore */
        }
      };
    }
  };

  const ready = new Promise<PosInstanceRole>((resolve) => {
    if (typeof window === "undefined") {
      resolve("leader");
      return;
    }

    try {
      channel = new BroadcastChannel(POS_INSTANCE_CHANNEL);
    } catch {
      channel = null;
    }

    let settled = false;
    let seenPeerId: string | null = null;
    const finish = (next: PosInstanceRole) => {
      if (settled || released) return;
      settled = true;
      if (next === "leader") becomeLeader();
      else role = "duplicate";
      resolve(next);
    };

    if (channel) {
      channel.onmessage = (ev: MessageEvent<ChannelMsg>) => {
        const msg = ev.data;
        if (!msg || msg.id === id) return;
        if (msg.type === "pong") {
          finish("duplicate");
          return;
        }
        if (msg.type === "hello") {
          seenPeerId = msg.id;
        }
      };
      try {
        channel.postMessage({ type: "hello", id } satisfies ChannelMsg);
      } catch {
        /* ignore */
      }
    }

    window.setTimeout(() => {
      if (settled) return;
      if (isLeaderHeartbeatFresh(readBeat(), Date.now())) {
        finish("duplicate");
        return;
      }
      // Two windows launched together: the lower id keeps the session.
      if (seenPeerId && seenPeerId < id) {
        finish("duplicate");
        return;
      }
      finish("leader");
    }, POS_CLAIM_WAIT_MS);
  });

  const release = () => {
    released = true;
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    if (role === "leader") {
      try {
        const beat = localStorage.getItem(POS_LEADER_STORAGE_KEY);
        if (beat) localStorage.removeItem(POS_LEADER_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
    try {
      channel?.close();
    } catch {
      /* ignore */
    }
    channel = null;
  };

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", release);
  }

  return { ready, release };
}

export function closeDuplicatePosWindow() {
  try {
    window.close();
  } catch {
    /* browsers often ignore close() unless they opened the window */
  }
}
