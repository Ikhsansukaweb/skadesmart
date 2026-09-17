"use client";

import { useEffect, useState, FormEvent } from "react";
import { LoaderCircle, UserPlus } from "lucide-react";
import SubPageShell from "@/components/dashboard/SubPageShell";
import StatusBadge from "@/components/StatusBadge";
import StudentSearchInput from "@/components/StudentSearchInput";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface StudentResult {
  id: number;
  nisn: string;
  full_name: string;
  class_name: string;
  role: string;
}

interface IncomingOrder {
  id: number;
  buyer_name: string;
  buyer_class: string;
  buyer_nisn: string;
  weight_kg: number | null;
  total_price: number;
  status: string;
  payment_status: string;
  note: string | null;
}

const NEXT_STATUS: Record<string, string[]> = {
  dicuci: ["bisa_diambil", "dibatalkan"],
  bisa_diambil: ["selesai"],
};

const STATUS_LABEL: Record<string, string> = {
  bisa_diambil: "Tandai Bisa Diambil",
  selesai: "Tandai Selesai",
  dibatalkan: "Batalkan",
};

const ACTIVE_STATUSES = ["dicuci", "bisa_diambil"];

export default function LaundryOrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<IncomingOrder[]>([]);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const [student, setStudent] = useState<StudentResult | null>(null);
  const [weightKg, setWeightKg] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [paid, setPaid] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");

  function load() {
    api<{ orders: IncomingOrder[] }>("/orders/incoming")
      .then((d) => setOrders(d.orders.filter((o: any) => ACTIVE_STATUSES.includes(o.status))))
      .catch(() => {});
  }

  useEffect(load, []);

  async function handleCreateOrder(e: FormEvent) {
    e.preventDefault();
    if (!student) {
      setFormError("Pilih siswa dulu dari rekomendasi pencarian.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    setFormMessage("");
    try {
      await api("/orders/laundry", {
        method: "POST",
        json: {
          buyer_nisn: student.nisn,
          weight_kg: weightKg ? Number(weightKg) : undefined,
          total_price: Number(totalPrice),
          payment_status: paid ? "sudah_bayar" : "belum_bayar",
          note: note || undefined,
        },
      });
      setFormMessage(`Pesanan untuk ${student.full_name} berhasil dibuat.`);
      setStudent(null);
      setWeightKg("");
      setTotalPrice("");
      setPaid(false);
      setNote("");
      load();
    } catch (err: any) {
      setFormError(err.message || "Gagal membuat pesanan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id: number, status: string) {
    setUpdatingId(id);
    try {
      await api(`/orders/${id}/laundry-status`, { method: "PUT", json: { status } });
      load();
    } finally {
      setUpdatingId(null);
    }
  }

  async function togglePayment(id: number, current: string) {
    setUpdatingId(id);
    try {
      await api(`/orders/${id}/payment`, {
        method: "PUT",
        json: { payment_status: current === "sudah_bayar" ? "belum_bayar" : "sudah_bayar" },
      });
      load();
    } finally {
      setUpdatingId(null);
    }
  }

  if (user && user.role !== "kwu_laundry" && user.role !== "admin") {
    return (
      <main className="min-h-screen">
        <p className="text-center py-10 text-fog font-body">Halaman ini khusus staf KWU Laundry.</p>
      </main>
    );
  }

  return (
    <SubPageShell role="kwu_laundry" title="Pesanan Aktif">
      <form onSubmit={handleCreateOrder} className="card p-5 space-y-3">
        <h2 className="font-sub font-medium flex items-center gap-2 text-peran-aksi">
          <UserPlus size={16} aria-hidden="true" /> Input Pesanan Baru
        </h2>
        <p className="text-xs text-peran-kedua font-body">
          Isi setelah siswa menyerahkan pakaian langsung di tempat. Cari nama siswanya, NISN & kelas
          otomatis terisi.
        </p>

        <div>
          <label className="block text-sm font-sub mb-1 text-peran-kedua">Nama siswa</label>
          <StudentSearchInput selected={student} onSelect={setStudent} onClear={() => setStudent(null)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="weight" className="block text-sm font-sub mb-1 text-peran-kedua">
              Berat (kg)
            </label>
            <input
              id="weight"
              type="number"
              min={0}
              step="0.1"
              required
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label htmlFor="total_price" className="block text-sm font-sub mb-1 text-peran-kedua">
              Total harga (Rp)
            </label>
            <input
              id="total_price"
              type="number"
              min={0}
              required
              value={totalPrice}
              onChange={(e) => setTotalPrice(e.target.value)}
              className="input-field"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm font-sub text-peran-kedua">
          <input
            type="checkbox"
            checked={paid}
            onChange={(e) => setPaid(e.target.checked)}
            className="w-4 h-4 accent-peran-aksi"
          />
          Sudah dibayar sekarang
        </label>

        <div>
          <label htmlFor="note" className="block text-sm font-sub mb-1 text-peran-kedua">
            Catatan (opsional)
          </label>
          <textarea
            id="note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="input-field"
            placeholder="Misal: 3 kemeja, 2 celana, jangan pakai pelembut"
          />
        </div>

        {formError && (
          <p role="alert" className="text-sm text-peran-aksen font-body">
            {formError}
          </p>
        )}
        {formMessage && <p className="text-sm text-peran-aksi font-body">{formMessage}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {submitting && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
          Terima Pesanan
        </button>
      </form>

      <div className="space-y-3">
        {orders.map((o) => (
          <div key={o.id} className="card p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-sub font-medium text-peran-utama">{o.buyer_name}</h3>
                <p className="text-sm text-peran-kedua font-body">
                  {o.buyer_class} - {o.buyer_nisn}
                </p>
              </div>
              <StatusBadge status={o.status} />
            </div>
            <p className="text-sm font-body text-peran-kedua">
              {o.weight_kg ? `${o.weight_kg} kg` : "-"}
            </p>
            {o.note && <p className="text-sm text-peran-kedua font-body italic">{o.note}</p>}

            <div className="flex items-center justify-between">
              <span className="font-heading font-semibold text-peran-aksi">
                Rp{o.total_price.toLocaleString("id-ID")}
              </span>
              <button
                onClick={() => togglePayment(o.id, o.payment_status)}
                disabled={updatingId === o.id}
                className={`text-xs font-sub px-2 py-1 rounded-full ${
                  o.payment_status === "sudah_bayar"
                    ? "bg-peran-naik-lembut text-peran-naik"
                    : "bg-peran-peringatan-lembut text-peran-peringatan"
                }`}
              >
                {o.payment_status === "sudah_bayar" ? "Sudah bayar" : "Belum bayar - tandai lunas"}
              </button>
            </div>

            {NEXT_STATUS[o.status]?.length > 0 && (
              <div className="flex gap-2 pt-1 flex-wrap">
                {NEXT_STATUS[o.status].map((s) => (
                  <button
                    key={s}
                    onClick={() => updateStatus(o.id, s)}
                    disabled={updatingId === o.id}
                    className={
                      s === "dibatalkan"
                        ? "btn-secondary text-sm flex items-center gap-2"
                        : "btn-primary text-sm flex items-center gap-2"
                    }
                  >
                    {updatingId === o.id && (
                      <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                    )}
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {orders.length === 0 && (
          <p className="text-peran-samar font-body text-sm">Belum ada pesanan aktif.</p>
        )}
      </div>
    </SubPageShell>
  );
}
