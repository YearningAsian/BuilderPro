"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/hooks/useStore";
import { getActiveSession } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Vendor, VendorCreate } from "@/types";
import { vendorCreateSchema } from "@/types/schemas";

type VendorFormState = {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
};

function toFormState(vendor: Vendor): VendorFormState {
  return {
    name: vendor.name,
    email: vendor.email ?? "",
    phone: vendor.phone ?? "",
    address: vendor.address ?? "",
    notes: vendor.notes ?? "",
  };
}

export function VendorDetail({ vendorId }: { vendorId: string }) {
  const router = useRouter();
  const { materials, getVendorById, updateVendor, deleteVendor } = useStore();
  const vendor = getVendorById(vendorId);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formStatus, setFormStatus] = useState("");
  const [form, setForm] = useState<VendorFormState>({
    name: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
  });

  useEffect(() => {
    const syncSession = () => setIsAdmin(getActiveSession()?.role === "admin");

    syncSession();
    window.addEventListener("focus", syncSession);
    window.addEventListener("storage", syncSession);

    return () => {
      window.removeEventListener("focus", syncSession);
      window.removeEventListener("storage", syncSession);
    };
  }, []);

  useEffect(() => {
    if (!vendor) return;
    setForm(toFormState(vendor));
  }, [vendor]);

  const linkedMaterials = useMemo(
    () => materials.filter((material) => material.default_vendor_id === vendorId),
    [materials, vendorId],
  );

  if (!vendor) {
    return (
      <div className="p-6 lg:p-8 space-y-4">
        <nav className="text-sm text-gray-400">
          <Link href="/vendors" className="hover:text-orange-500 transition-colors">
            Vendors
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-700">Not found</span>
        </nav>
        <div className="card p-6 text-center">
          <p className="text-lg font-medium text-gray-900">Vendor not found</p>
          <p className="mt-2 text-sm text-gray-500">
            This vendor may have been removed or is outside your active workspace.
          </p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setFormStatus("");

    const payload: VendorCreate = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    };
    const validated = vendorCreateSchema.safeParse(payload);
    if (!validated.success) {
      setFormError(validated.error.issues[0]?.message ?? "Please correct the vendor details.");
      return;
    }

    setIsSaving(true);
    try {
      await updateVendor(vendor.id, validated.data);
      setFormStatus("Vendor updated successfully.");
      setIsEditing(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save vendor.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(`Delete ${vendor.name}?`);
    if (!confirmed) return;

    setFormError("");
    setFormStatus("");
    setIsDeleting(true);

    try {
      await deleteVendor(vendor.id);
      router.push("/vendors");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to delete vendor.");
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <nav className="text-sm text-gray-400">
        <Link href="/vendors" className="hover:text-orange-500 transition-colors">
          Vendors
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-700">{vendor.name}</span>
      </nav>

      <section className="card p-5 space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{vendor.name}</h1>
            <p className="mt-1 text-sm text-gray-500">
              Vendor record with linked materials and purchasing notes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setFormError("");
                    setFormStatus("");
                    setForm(toFormState(vendor));
                    setIsEditing((current) => !current);
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {isEditing ? "Hide editor" : "Edit vendor"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={isDeleting}
                  className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-red-200 disabled:text-red-300"
                >
                  {isDeleting ? "Deleting..." : "Delete vendor"}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-gray-200 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Contact details</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Email</dt>
                <dd className="font-medium text-gray-900">{vendor.email || "No email on file"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Phone</dt>
                <dd className="font-medium text-gray-900">{vendor.phone || "No phone on file"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Address</dt>
                <dd className="font-medium text-gray-900">{vendor.address || "No address on file"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Created</dt>
                <dd className="font-medium text-gray-900">{formatDate(vendor.created_at)}</dd>
              </div>
            </dl>
          </div>

          <div className="space-y-3 rounded-lg border border-gray-200 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Assigned materials</h2>
            {linkedMaterials.length === 0 ? (
              <p className="text-sm text-gray-500">No materials linked to this vendor yet.</p>
            ) : (
              <ul className="space-y-2">
                {linkedMaterials.map((material) => (
                  <li key={material.id} className="rounded-md border border-gray-100 bg-gray-50 p-3 text-sm">
                    <p className="font-medium text-gray-900">{material.name}</p>
                    <p className="text-xs text-gray-500">
                      {material.category ?? "Uncategorized"} • {formatCurrency(material.unit_cost)}/{material.unit_type}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
            {vendor.notes || "No notes saved for this vendor."}
          </p>
        </div>

        {(isEditing || formError || formStatus) && isAdmin && (
          <form className="grid gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 md:grid-cols-2" onSubmit={handleSubmit}>
            {formError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2">
                {formError}
              </p>
            )}
            {formStatus && (
              <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 md:col-span-2">
                {formStatus}
              </p>
            )}
            <label className="space-y-1 text-sm text-gray-700 md:col-span-2">
              <span className="font-medium">Vendor name</span>
              <input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </label>
            <label className="space-y-1 text-sm text-gray-700">
              <span className="font-medium">Email</span>
              <input
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </label>
            <label className="space-y-1 text-sm text-gray-700">
              <span className="font-medium">Phone</span>
              <input
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </label>
            <label className="space-y-1 text-sm text-gray-700 md:col-span-2">
              <span className="font-medium">Address</span>
              <input
                value={form.address}
                onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </label>
            <label className="space-y-1 text-sm text-gray-700 md:col-span-2">
              <span className="font-medium">Notes</span>
              <textarea
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                rows={4}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </label>
            <div className="md:col-span-2 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:bg-orange-300"
              >
                {isSaving ? "Saving..." : "Save vendor"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm(toFormState(vendor));
                  setFormError("");
                  setFormStatus("");
                  setIsEditing(false);
                }}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
