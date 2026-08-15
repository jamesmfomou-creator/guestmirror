"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { BRAND_NAME } from "@/lib/brand";

const PROPERTY_TYPES = ["Appartement", "Maison", "Studio", "Chambre privée", "Loft", "Autre"];

interface InfoData {
  city: string;
  property_type: string;
  guest_capacity: string;
  nightly_price: string;
}

export function OptionalInfoCard({ analysisId }: { analysisId: string }) {
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<InfoData>({
    city: "",
    property_type: "",
    guest_capacity: "",
    nightly_price: "",
  });

  if (dismissed) return null;

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/analyses/${analysisId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: data.city || null,
          property_type: data.property_type || null,
          guest_capacity: data.guest_capacity || null,
          nightly_price: data.nightly_price || null,
        }),
      });
    } finally {
      setSaving(false);
      setDismissed(true);
    }
  }

  return (
    <div className="mx-auto mb-14 max-w-xl">
      <div className="card p-6 sm:p-7">
        <h2 className="text-lg font-semibold">Aide {BRAND_NAME} à affiner ton analyse</h2>
        <p className="mt-1.5 text-sm text-muted">
          Quelques informations facultatives pour personnaliser davantage tes recommandations.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-muted-2">Ville / destination</label>
            <input
              type="text"
              value={data.city}
              onChange={(e) => setData({ ...data, city: e.target.value })}
              placeholder="Marseille"
              className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-2">Type de logement</label>
            <select
              value={data.property_type}
              onChange={(e) => setData({ ...data, property_type: e.target.value })}
              className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              <option value="">Sélectionner</option>
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-2">Nombre de voyageurs</label>
            <input
              type="number"
              min={1}
              max={20}
              value={data.guest_capacity}
              onChange={(e) => setData({ ...data, guest_capacity: e.target.value })}
              placeholder="4"
              className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-2">Prix moyen par nuit</label>
            <input
              type="number"
              min={0}
              value={data.nightly_price}
              onChange={(e) => setData({ ...data, nightly_price: e.target.value })}
              placeholder="95 €"
              className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
          <Button variant="outline" onClick={() => setDismissed(true)}>
            Continuer sans préciser
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Enregistrement…" : "Ajouter ces informations"}
          </Button>
        </div>
      </div>
    </div>
  );
}
