"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/hooks/useStore";
import { getActiveSession } from "@/lib/auth";
import { formatDate, truncate } from "@/lib/format";
import type { Vendor, VendorCreate } from "@/types";
import { vendorCreateSchema } from "@/types/schemas";

type VendorFormState = {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
};

const EMPTY_FORM: VendorFormState = {
  name: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
};

function toFormState(vendor?: Vendor | null): VendorFormState {
  if (!vendor) return EMPTY_FORM;

  return {
    name: vendor.name,
    email: vendor.email ?? "",
    phone: vendor.phone ?? "",
    address: vendor.address ?? "",
    notes: vendor.notes ?? "",
  };
}

export function VendorsList() {
  const {
    vendors,
    materials,
    createVendor,
    updateVendor,
    deleteVendor,
  } = useStore();

  const [isAdmin, setIsAdmin] = useState(false);
  const [query, setQuery] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [form, setForm] = useState<VendorFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formStatus, setFormStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);

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

  const filteredVendors = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...vendors]
      .filter((vendor) => {
        if (!q) return true;
        return [vendor.name, vendor.email ?? "", vendor.phone ?? "", vendor.address ?? ""]
          .some((value) => value.toLowerCase().includes(q));
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [vendors, query]);

  const vendorsInUse = useMemo(
    () => new Set(materials.map((material) => material.default_vendor_id).filter(Boolean)).size,
    [materials],
  );
  const selectedVendor = useMemo(
    () => (selectedVendorId ? vendors.find((vendor) => vendor.id === selectedVendorId) ?? null : null),
    [vendors, selectedVendorId],
  );

  const openCreateForm = () => {
    setEditingVendorId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFormStatus("");
    setIsEditorOpen(true);
  };

  const openEditForm = (vendor: Vendor) => {
    setEditingVendorId(vendor.id);
    setForm(toFormState(vendor));
    setFormError("");
    setFormStatus("");
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setEditingVendorId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setIsEditorOpen(false);
  };

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
      if (editingVendorId) {
        await updateVendor(editingVendorId, validated.data);
        setFormStatus("Vendor updated successfully.");
      } else {
        const created = await createVendor(validated.data);
        setFormStatus("Vendor created successfully.");
        setForm(EMPTY_FORM);
        setSelectedVendorId(created.id);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save vendor.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (vendor: Vendor) => {
    const confirmed = window.confirm(`Delete ${vendor.name}?`);
    if (!confirmed) return;

    setFormError("");
    setFormStatus("");

    try {
      await deleteVendor(vendor.id);
      setFormStatus(`${vendor.name} was removed.`);
      if (editingVendorId === vendor.id) {
        closeEditor();
      }
      if (selectedVendorId === vendor.id) {
        setSelectedVendorId(null);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to delete vendor.");
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
          <p className="text-sm text-gray-500 mt-1">
            Maintain supplier contacts and preferred purchasing partners for your workspace.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Add vendor
          </button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Vendors saved</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{vendors.length}</p>
          <p className="text-sm text-gray-500">Contacts available for purchasing and pricing</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Assigned to materials</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{vendorsInUse}</p>
          <p className="text-sm text-gray-500">Vendors already linked to catalog materials</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Search</p>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search vendor, email, phone..."
            className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
          />
        </div>
      </div>

      {(formError || formStatus || isEditorOpen) && (
        <section className="card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {editingVendorId ? "Edit vendor" : "New vendor"}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Keep supplier details ready for assigning materials and placing orders.
              </p>
            </div>
            {isEditorOpen && (
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            )}
          </div>

          {formError && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
          {formStatus && <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{formStatus}</p>}

          {isEditorOpen && (
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
              <label className="space-y-1 text-sm text-gray-700 md:col-span-2">
                <span className="font-medium">Vendor name</span>
                <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-sm text-gray-700">
                <span className="font-medium">Email</span>
                <input value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-sm text-gray-700">
                <span className="font-medium">Phone</span>
                <input value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-sm text-gray-700 md:col-span-2">
                <span className="font-medium">Address</span>
                <input value={form.address} onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-sm text-gray-700 md:col-span-2">
                <span className="font-medium">Notes</span>
                <textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <div className="md:col-span-2">
                <button type="submit" disabled={isSaving} className="rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:bg-orange-300">
                  {isSaving ? "Saving..." : editingVendorId ? "Save vendor" : "Create vendor"}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <div className="card overflow-x-auto">
        <table className="bp-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Address</th>
              <th>Materials</th>
              <th>Last added</th>
              <th>Details</th>
              {isAdmin && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {filteredVendors.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="py-12 text-center text-gray-500">
                  No vendors found yet.
                </td>
              </tr>
            ) : (
              filteredVendors.map((vendor) => {
                const linkedMaterials = materials.filter((material) => material.default_vendor_id === vendor.id);
                return (
                  <tr key={vendor.id}>
                    <td>
                      <div>
                        <Link href={`/vendors/${vendor.id}`} className="font-medium text-gray-900 hover:text-orange-600">
                          {vendor.name}
                        </Link>
                        <p className="text-xs text-gray-500">#{vendor.id.slice(0, 8)}</p>
                      </div>
                    </td>
                    <td>
                      <div className="space-y-1 text-sm text-gray-600">
                        <p>{vendor.email || "No email on file"}</p>
                        <p>{vendor.phone || "No phone on file"}</p>
                      </div>
                    </td>
                    <td className="text-sm text-gray-600">{truncate(vendor.address, 38)}</td>
                    <td>
                      <div className="space-y-1">
                        <p className="font-medium text-gray-900">{linkedMaterials.length}</p>
                        <p className="text-xs text-gray-500">{linkedMaterials[0]?.name || "No linked material yet"}</p>
                      </div>
                    </td>
                    <td className="text-sm text-gray-500">{formatDate(vendor.created_at)}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setSelectedVendorId(vendor.id)}
                        className="rounded-md border border-orange-200 px-2.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50"
                      >
                        View
                      </button>
                    </td>
                    {isAdmin && (
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => openEditForm(vendor)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                            Edit
                          </button>
                          <button type="button" onClick={() => void handleDelete(vendor)} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedVendor && (
        <section className="card p-5 space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{selectedVendor.name} details</h2>
              <p className="text-sm text-gray-600">
                Review contact info, assigned materials, and purchasing notes for this vendor.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/vendors/${selectedVendor.id}`}
                className="rounded-lg border border-orange-300 px-3 py-2 text-sm text-orange-700 hover:bg-orange-50"
              >
                Open full page
              </Link>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => openEditForm(selectedVendor)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Edit vendor
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedVendorId(null)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Contact details</h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-gray-500">Email</dt>
                  <dd className="font-medium text-gray-900">{selectedVendor.email || "No email on file"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Phone</dt>
                  <dd className="font-medium text-gray-900">{selectedVendor.phone || "No phone on file"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Address</dt>
                  <dd className="font-medium text-gray-900">{selectedVendor.address || "No address on file"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Created</dt>
                  <dd className="font-medium text-gray-900">{formatDate(selectedVendor.created_at)}</dd>
                </div>
              </dl>
            </div>

            <div className="space-y-3 rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Assigned materials</h3>
              {materials.filter((material) => material.default_vendor_id === selectedVendor.id).length === 0 ? (
                <p className="text-sm text-gray-500">No materials linked to this vendor yet.</p>
              ) : (
                <ul className="space-y-2">
                  {materials
                    .filter((material) => material.default_vendor_id === selectedVendor.id)
                    .map((material) => (
                      <li key={material.id} className="rounded-md border border-gray-100 bg-gray-50 p-3 text-sm">
                        <p className="font-medium text-gray-900">{material.name}</p>
                        <p className="text-xs text-gray-500">
                          {material.category ?? "Uncategorized"} • {material.sku ?? "No SKU"}
                        </p>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Notes</h3>
            <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
              {selectedVendor.notes || "No notes saved for this vendor."}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
