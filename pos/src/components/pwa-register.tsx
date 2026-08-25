"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function RegisterSW() {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const refreshing = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const localRuntime =
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "localhost";
    if (localRuntime) {
      // The local production server is itself the offline app shell. A service
      // worker here only risks serving HTML from an older local build.
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        );
      return;
    }

    let registration: ServiceWorkerRegistration | null = null;

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registration = reg;
        // Warm via SW message only — SW fetches routes idle (no double fetch).
        if (navigator.onLine) {
          reg.active?.postMessage({ type: "WARM_SHELL" });
        }
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // Kiosk: activate immediately so shops get SW fixes without a click.
              worker.postMessage({ type: "SKIP_WAITING" });
              setShowUpdate(true);
            }
            if (worker.state === "activated" && navigator.onLine) {
              worker.postMessage({ type: "WARM_SHELL" });
            }
          });
        });
        // Already waiting from a prior visit — take over now.
        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        // Periodic update checks
        const id = setInterval(() => {
          void reg.update();
        }, 60 * 60 * 1000);
        return () => clearInterval(id);
      })
      .catch(() => {
        // ignore in unsupported environments
      });

    const onControllerChange = () => {
      if (refreshing.current) return;
      refreshing.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      void registration;
    };
  }, []);

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  const applyUpdate = () => {
    if (!navigator.serviceWorker.controller) {
      window.location.reload();
      return;
    }
    navigator.serviceWorker.getRegistration().then((reg) => {
      reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
    });
  };

  if (!installEvent && !showUpdate) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2">
      {showUpdate ? (
        <div className="rounded-xl border border-orange-500/40 bg-zinc-950 p-3 shadow-lg">
          <p className="text-sm font-semibold text-white">Update available</p>
          <p className="mt-1 text-xs text-zinc-400">
            A new POS version is ready.
          </p>
          <Button className="mt-2 w-full" size="sm" onClick={applyUpdate}>
            Refresh
          </Button>
        </div>
      ) : null}
      {installEvent ? (
        <Button className="shadow-lg" onClick={install} variant="secondary">
          <Download className="h-4 w-4" />
          Install POS App
        </Button>
      ) : null}
    </div>
  );
}
