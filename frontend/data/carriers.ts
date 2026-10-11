// The sandbox's shipping carriers: the id the API uses, the name people see,
// and the only origin a tracking link may point to. The admin shipment form,
// the response reader and the order card all read this one table.
export const CARRIERS = [
  {
    id: "canada-post",
    name: "Canada Post",
    trackingOrigin: "https://www.canadapost-postescanada.ca/",
  },
  { id: "ups", name: "UPS", trackingOrigin: "https://www.ups.com/" },
  { id: "fedex", name: "FedEx", trackingOrigin: "https://www.fedex.com/" },
  {
    id: "purolator",
    name: "Purolator",
    trackingOrigin: "https://www.purolator.com/",
  },
] as const;

export type CarrierId = (typeof CARRIERS)[number]["id"];

export const CARRIER_IDS: readonly CarrierId[] = CARRIERS.map(
  (carrier) => carrier.id,
);

/** The carrier's name, or a neutral label for one this build does not know. */
export function carrierName(id: CarrierId | "unknown"): string {
  return (
    CARRIERS.find((carrier) => carrier.id === id)?.name ?? "Unknown carrier"
  );
}

/** The tracking URL when it points to a known carrier's site, else null. */
export function safeTrackingUrl(url: string | null | undefined): string | null {
  return url &&
    CARRIERS.some((carrier) => url.startsWith(carrier.trackingOrigin))
    ? url
    : null;
}
