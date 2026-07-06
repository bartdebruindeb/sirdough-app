"use client";
import { useEffect, useRef } from "react";

/**
 * Small read-only map with a single marker, shown in the order form so a customer
 * can see where their order goes (their delivery address, or the pickup shop).
 * Reuses the same Leaflet/cartocdn/cdnjs sources as BezorgenMap — all already in the CSP.
 */
export function LocationMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      // @ts-expect-error - leaflet internals
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });
      if (!map.current) {
        map.current = L.map(el.current, { zoomControl: false, scrollWheelZoom: false, attributionControl: false });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", { subdomains: "abcd", maxZoom: 19 }).addTo(map.current);
      }
      map.current.setView([lat, lng], 15);
      // Clear the previous marker (keep the tile layer, which has _url) and re-add.
      map.current.eachLayer((layer: any) => { if (!layer._url) map.current.removeLayer(layer); });
      L.marker([lat, lng]).addTo(map.current).bindPopup(label);
      setTimeout(() => map.current?.invalidateSize(), 80);
    })();
    return () => { cancelled = true; };
  }, [lat, lng, label]);

  // Tear the map down on unmount so a remount doesn't hit "container already initialized".
  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);

  return (
    <>
      <style>{`@import url("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css");`}</style>
      <div ref={el} style={{ height: 160, width: "100%", borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }} />
    </>
  );
}
