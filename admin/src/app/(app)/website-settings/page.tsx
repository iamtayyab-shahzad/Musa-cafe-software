"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  assertImageFieldSafe,
  prepareProductImage,
} from "@/lib/image-upload";
import {
  emptyWebsiteSettings,
  type SiteThemeOption,
  type WebsiteSettings,
} from "@/lib/types";
import { DeliverySettingsPanel } from "@/components/delivery-settings-panel";
import { settingsApi } from "@/services/api";

type WebsiteForm = WebsiteSettings & {
  googleMaps: string;
  facebook: string;
  instagram: string;
};

const SITE_THEME_OPTIONS: {
  id: SiteThemeOption;
  label: string;
  hint: string;
  swatch: string;
}[] = [
  { id: "dark", label: "Night", hint: "Dark", swatch: "#050505" },
  { id: "dim", label: "Soft", hint: "Soft dark", swatch: "#1c1c1f" },
  { id: "light", label: "Day", hint: "Light", swatch: "#f4f4f5" },
  { id: "warm", label: "Warm", hint: "Cream", swatch: "#f7f1e8" },
];

function parseSiteTheme(value: string | undefined): SiteThemeOption {
  if (
    value === "dark" ||
    value === "dim" ||
    value === "light" ||
    value === "warm"
  ) {
    return value;
  }
  return "dark";
}

const emptyForm = (): WebsiteForm => ({
  ...emptyWebsiteSettings(),
  googleMaps: "",
  facebook: "",
  instagram: "",
});

export default function WebsiteSettingsPage() {
  const [form, setForm] = useState<WebsiteForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    settingsApi
      .get()
      .then((s) => {
        if (cancelled) return;
        setForm((prev) => ({
          ...prev,
          restaurantName: s.restaurant_name || "",
          logo: s.logo || "",
          phone: s.phone || "",
          whatsapp: s.whatsapp || "",
          address: s.address || prev.address || "",
          openingTime: s.opening_time || "",
          closingTime: s.closing_time || "",
          googleMaps: s.google_maps || "",
          facebook: s.facebook || "",
          instagram: s.instagram || "",
          defaultSiteTheme: parseSiteTheme(s.default_site_theme),
        }));
      })
      .catch((e) =>
        toast.error(
          e instanceof Error ? e.message : "Failed to load website settings",
        ),
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    try {
      assertImageFieldSafe(form.logo);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Logo image too large");
      return;
    }
    setSaving(true);
    try {
      await settingsApi.update({
        restaurant_name: form.restaurantName,
        logo: form.logo,
        phone: form.phone,
        whatsapp: form.whatsapp,
        address: form.address,
        opening_time: form.openingTime,
        closing_time: form.closingTime,
        google_maps: form.googleMaps,
        facebook: form.facebook,
        instagram: form.instagram,
        default_site_theme: form.defaultSiteTheme,
      });
      toast.success(
        "Website settings saved (brand/contact/social/theme). Content blocks below are not stored yet.",
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to save website settings",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-zinc-400">
        Loading website settings...
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Website Settings"
        description="Content and branding shown on the customer website"
        action={
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="space-y-4">
          <h2 className="text-lg font-bold">Brand & Contact</h2>
          <div className="space-y-2">
            <Label>Restaurant Name</Label>
            <Input
              value={form.restaurantName}
              onChange={(e) =>
                setForm({ ...form, restaurantName: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Logo URL</Label>
            <Input
              value={form.logo}
              onChange={(e) => setForm({ ...form, logo: e.target.value })}
              placeholder="https://... or upload below"
            />
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                void (async () => {
                  try {
                    toast.message("Uploading logo…");
                    const prepared = await prepareProductImage(file);
                    setForm((f) => ({ ...f, logo: prepared.url }));
                    toast.success(
                      `Logo ready (~${Math.round(prepared.bytesApprox / 1024)}KB)`,
                    );
                  } catch (err) {
                    toast.error(
                      err instanceof Error
                        ? err.message
                        : "Logo upload failed",
                    );
                  }
                })();
              }}
            />
              <p className="text-xs text-zinc-500">
                Compressed locally, then uploaded to Cloudinary. Only the URL is
                saved.
              </p>
            {form.logo.startsWith("https://") ? (
              <p className="text-xs text-emerald-600">Cloudinary logo ready</p>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>
                Alternate Phone{" "}
                <span className="font-normal text-zinc-500">(not saved)</span>
              </Label>
              <Input
                value={form.alternatePhone}
                onChange={(e) =>
                  setForm({ ...form, alternatePhone: e.target.value })
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>WhatsApp Number</Label>
            <Input
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Opening Time</Label>
              <Input
                value={form.openingTime}
                onChange={(e) =>
                  setForm({ ...form, openingTime: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Closing Time</Label>
              <Input
                value={form.closingTime}
                onChange={(e) =>
                  setForm({ ...form, closingTime: e.target.value })
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Google Maps URL</Label>
            <Input
              value={form.googleMaps}
              onChange={(e) =>
                setForm({ ...form, googleMaps: e.target.value })
              }
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Facebook</Label>
              <Input
                value={form.facebook}
                onChange={(e) =>
                  setForm({ ...form, facebook: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Instagram</Label>
              <Input
                value={form.instagram}
                onChange={(e) =>
                  setForm({ ...form, instagram: e.target.value })
                }
              />
            </div>
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg font-bold">Default appearance</h2>
          <p className="text-sm text-[var(--muted)]">
            Theme shown the first time a visitor opens the website. After they
            pick a theme themselves, their choice is remembered on that device.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SITE_THEME_OPTIONS.map((opt) => {
              const selected = form.defaultSiteTheme === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    setForm({ ...form, defaultSiteTheme: opt.id })
                  }
                  className={`rounded-lg border p-3 text-left transition ${
                    selected
                      ? "border-orange-500 ring-2 ring-orange-500/40"
                      : "border-[var(--border)] hover:border-orange-500/50"
                  }`}
                >
                  <span
                    className="mb-2 block h-10 w-full rounded-md border border-black/10"
                    style={{ background: opt.swatch }}
                    aria-hidden
                  />
                  <span className="block text-sm font-bold">{opt.label}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {opt.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg font-bold">Website Content</h2>
          <p className="text-sm text-zinc-500">
            These fields are UI-only for now — no matching backend columns yet.
          </p>
          <div className="space-y-2">
            <Label>
              Homepage Banner URL{" "}
              <span className="font-normal text-zinc-500">(not saved)</span>
            </Label>
            <Input
              value={form.homepageBanner}
              onChange={(e) =>
                setForm({ ...form, homepageBanner: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>
              About Section{" "}
              <span className="font-normal text-zinc-500">(not saved)</span>
            </Label>
            <Textarea
              value={form.aboutSection}
              onChange={(e) =>
                setForm({ ...form, aboutSection: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>
              Contact Section{" "}
              <span className="font-normal text-zinc-500">(not saved)</span>
            </Label>
            <Textarea
              value={form.contactSection}
              onChange={(e) =>
                setForm({ ...form, contactSection: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>
              Footer Information{" "}
              <span className="font-normal text-zinc-500">(not saved)</span>
            </Label>
            <Textarea
              value={form.footerInfo}
              onChange={(e) =>
                setForm({ ...form, footerInfo: e.target.value })
              }
            />
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <Card className="space-y-4">
          <DeliverySettingsPanel />
        </Card>
      </div>
    </div>
  );
}
