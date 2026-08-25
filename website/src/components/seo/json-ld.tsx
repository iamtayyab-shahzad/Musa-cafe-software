import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { restaurant } from "@/data/krunchies";

/** Convert "11:00 AM" / "11:00 PM" style strings to 24h HH:MM for schema.org. */
function to24h(time: string): string | null {
  const match = time
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2];
  const period = match[3].toUpperCase();
  if (period === "PM" && hour < 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

/**
 * Server-only JSON-LD for Organization + Restaurant.
 * Renders a static script tag — no client JS, no bundle impact.
 */
export function JsonLd() {
  const opens = to24h(restaurant.openingTime || "11:00 AM") || "11:00";
  const closes = to24h(restaurant.closingTime || "11:00 PM") || "23:00";
  const logoUrl = `${SITE_URL}/icons/icon-192.png?v=4`;
  const phone = restaurant.phone
    ? `+92${restaurant.phone.replace(/^0/, "").replace(/\D/g, "")}`
    : undefined;

  const organization = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: logoUrl,
    },
    ...(restaurant.whatsapp
      ? {
          contactPoint: [
            {
              "@type": "ContactPoint",
              contactType: "customer service",
              telephone: phone,
              availableLanguage: ["English", "Urdu"],
            },
          ],
        }
      : {}),
  };

  const restaurantSchema = {
    "@type": "Restaurant",
    "@id": `${SITE_URL}/#restaurant`,
    name: SITE_NAME,
    url: SITE_URL,
    image: logoUrl,
    logo: logoUrl,
    ...(phone ? { telephone: phone } : {}),
    servesCuisine: ["Pizza", "Burgers", "Fast Food", "Pakistani"],
    priceRange: "$$",
    acceptsReservations: false,
    ...(restaurant.address
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: restaurant.address,
            addressCountry: "PK",
          },
        }
      : {
          address: {
            "@type": "PostalAddress",
            addressCountry: "PK",
          },
        }),
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ],
        opens,
        closes,
      },
    ],
    hasMenu: `${SITE_URL}/menu`,
    potentialAction: {
      "@type": "OrderAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/menu`,
        actionPlatform: [
          "http://schema.org/DesktopWebPlatform",
          "http://schema.org/MobileWebPlatform",
        ],
      },
      deliveryMethod: [
        "http://purl.org/goodrelations/v1#DeliveryModeOwnFleet",
        "http://purl.org/goodrelations/v1#DeliveryModePickUp",
      ],
    },
  };

  const graph = {
    "@context": "https://schema.org",
    "@graph": [organization, restaurantSchema],
  };

  return (
    <script
      type="application/ld+json"
      // Static SEO payload only — safe JSON from our constants/data.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
