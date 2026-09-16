"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Save, LoaderCircle, Ban, CheckCircle2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface KwuUnit {
  id: number;
  slug: string;
  name: string;
  description: string;
  how_to_order: string | null;
  price_info: string | null;
  is_active: number;
}

// Edit KWU Page: admin mengelola nama/deskripsi/status aktif unit KWU.
// Khusus unit Laundry, ada field tambahan "Cara Pesan" & "Info Harga" yang
// muncul sebagai banner di Home (karena laundry tidak punya marketplace).
export default function EditKwuPage() {
  const { user } = useAuth();
  const [units, setUnits] = useState<KwuUnit[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  function load() {
    api<{ units: KwuUnit[] }>("/kwu").then((d) => setUnits(d.units)).catch(() => {});
  }

  useEffect(load, []);

  function updateField(id: number, field: keyof KwuUnit, value: string) {
    setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, [field]: value } : u)));
  }

  async function handleSave(e: FormEvent, unit: KwuUnit) {
    e.preventDefault();
    setSavingId(unit.id);
    setMessage("");
    try {
      await api(`/kwu/${unit.id}`, {
        method: "PUT",
        json: {
          name: unit.name,
          description: unit.description,
          how_to_order: unit.how_to_order || undefined,
          price_info: unit.price_info || undefined,
        },
      });
      setMessage(`Unit "${unit.name}" tersimpan.`);
      load();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(unit: KwuUnit) {
    setSavingId(unit.id);
    try {
      await api(`/kwu/${unit.id}`, { method: "PUT", json: { is_active: !unit.is_active } });
      load();
    } finally {
      setSavingId(null);
    }
  }

  if (user && user.role !== "admin") {
    return (
      <main className="min-h-screen">
        <Navbar />
        <p className="text-center py-10 text-fog font-body">Halaman ini khusus admin.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-20 md:pb-8">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-brand-600 font-sub">
          <ArrowLeft size={16} aria-hidden="true" /> Kembali ke Dashboard
        </Link>
        <h1 className="text-2xl text-brand-700">Edit Unit KWU</h1>

        {message && <p className="text-sm font-body text-brand-600">{message}</p>}

        <div className="space-y-4">
          {units.map((unit) => (
            <form key={unit.id} onSubmit={(e) => handleSave(e, unit)} className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-sub text-fog">{unit.slug}</span>
                <button
                  type="button"
                  onClick={() => toggleActive(unit)}
                  className={`text-xs font-sub flex items-center gap-1 px-2 py-1 rounded-full ${
                    unit.is_active ? "bg-emerald-100 text-emerald-700" : "bg-ember/10 text-ember-600"
                  }`}
                >
                  {unit.is_active ? <CheckCircle2 size={12} aria-hidden="true" /> : <Ban size={12} aria-hidden="true" />}
                  {unit.is_active ? "Aktif" : "Nonaktif"}
                </button>
              </div>

              <div>
                <label className="block text-sm font-sub mb-1 text-steel">Nama unit</label>
                <input value={unit.name} onChange={(e) => updateField(unit.id, "name", e.target.value)} className="input-field" />
              </div>

              <div>
                <label className="block text-sm font-sub mb-1 text-steel">Deskripsi</label>
                <textarea rows={2} value={unit.description || ""} onChange={(e) => updateField(unit.id, "description", e.target.value)} className="input-field" />
              </div>

              {unit.slug === "kwu_laundry" && (
                <>
                  <div>
                    <label className="block text-sm font-sub mb-1 text-steel">Cara pesan (ditampilkan di banner Home)</label>
                    <textarea rows={5} value={unit.how_to_order || ""} onChange={(e) => updateField(unit.id, "how_to_order", e.target.value)} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-sub mb-1 text-steel">Info harga</label>
                    <textarea rows={2} value={unit.price_info || ""} onChange={(e) => updateField(unit.id, "price_info", e.target.value)} className="input-field" />
                  </div>
                </>
              )}

              <button type="submit" disabled={savingId === unit.id} className="btn-primary flex items-center gap-2 text-sm">
                {savingId === unit.id ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
                Simpan
              </button>
            </form>
          ))}
          {units.length === 0 && <p className="text-fog font-body text-sm">Belum ada unit KWU.</p>}
        </div>
      </div>
    </main>
  );
}
