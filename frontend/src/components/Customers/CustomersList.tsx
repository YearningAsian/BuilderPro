"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/hooks/useStore";
import { getActiveSession } from "@/lib/auth";
import { formatDate, truncate } from "@/lib/format";
import type { Customer, CustomerCreate } from "@/types";
import { customerCreateSchema } from "@/types/schemas";

type CustomerFormState = {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
};

const EMPTY_FORM: CustomerFormState = {
  name: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
};

function toFormState(customer?: Customer | null): CustomerFormState {
  if (!customer) return EMPTY_FORM;

  return {
    name: customer.name,
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    address: customer.address ?? "",
    notes: customer.notes ?? "",
  };
}

export function CustomersList() {
  const {
    customers,
    projects,
    createCustomer,
    updateCustomer,
    deleteCustomer,
  } = useStore();

  const [isAdmin, setIsAdmin] = useState(false);
  const [query, setQuery] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerFormState>(EMPTY_FORM);
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

  const filteredCustomers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...customers]
      .filter((customer) => {
        if (!q) return true;
        return [customer.name, customer.email ?? "", customer.phone ?? "", customer.address ?? ""]
          .some((value) => value.toLowerCase().includes(q));
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, query]);

  const customersWithProjects = useMemo(
    () => new Set(projects.map((project) => project.customer_id)).size,
    [projects],
  );
  const selectedCustomer = useMemo(
    () =>
      selectedCustomerId
        ? customers.find((customer) => customer.id === selectedCustomerId) ?? null
        : null,
    [customers, selectedCustomerId],
  );

  const openCreateForm = () => {
    setEditingCustomerId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFormStatus("");
    setIsEditorOpen(true);
  };

  const openEditForm = (customer: Customer) => {
    setEditingCustomerId(customer.id);
    setForm(toFormState(customer));
    setFormError("");
    setFormStatus("");
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setEditingCustomerId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setIsEditorOpen(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setFormStatus("");

    const payload: CustomerCreate = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    };
    const validated = customerCreateSchema.safeParse(payload);
    if (!validated.success) {
      setFormError(validated.error.issues[0]?.message ?? "Please correct the customer details.");
      return;
    }

    setIsSaving(true);
    try {
      if (editingCustomerId) {
        await updateCustomer(editingCustomerId, validated.data);
        setFormStatus("Customer updated successfully.");
      } else {
        const created = await createCustomer(validated.data);
        setFormStatus("Customer created successfully.");
        setForm(EMPTY_FORM);
        setSelectedCustomerId(created.id);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save customer.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (customer: Customer) => {
    const confirmed = window.confirm(`Delete ${customer.name}?`);
    if (!confirmed) return;

    setFormError("");
    setFormStatus("");

    try {
      await deleteCustomer(customer.id);
      setFormStatus(`${customer.name} was removed.`);
      if (editingCustomerId === customer.id) {
        closeEditor();
      }
      if (selectedCustomerId === customer.id) {
        setSelectedCustomerId(null);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to delete customer.");
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage the homeowners, clients, and accounts tied to your projects.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Add customer
          </button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Customer records</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{customers.length}</p>
          <p className="text-sm text-gray-500">Saved customer contacts in this workspace</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Linked to projects</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{customersWithProjects}</p>
          <p className="text-sm text-gray-500">Customers already used on active estimates</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Search</p>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, phone..."
            className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
          />
        </div>
      </div>

      {(formError || formStatus || isEditorOpen) && (
        <section className="card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {editingCustomerId ? "Edit customer" : "New customer"}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Keep contact details ready for estimating and project setup.
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
                <span className="font-medium">Customer name</span>
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
                  {isSaving ? "Saving..." : editingCustomerId ? "Save customer" : "Create customer"}
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
              <th>Projects</th>
              <th>Last added</th>
              <th>Details</th>
              {isAdmin && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="py-12 text-center text-gray-500">
                  No customers found yet.
                </td>
              </tr>
            ) : (
              filteredCustomers.map((customer) => {
                const linkedProjects = projects.filter((project) => project.customer_id === customer.id);
                return (
                  <tr key={customer.id}>
                    <td>
                      <div>
                        <Link href={`/customers/${customer.id}`} className="font-medium text-gray-900 hover:text-orange-600">
                          {customer.name}
                        </Link>
                        <p className="text-xs text-gray-500">#{customer.id.slice(0, 8)}</p>
                      </div>
                    </td>
                    <td>
                      <div className="space-y-1 text-sm text-gray-600">
                        <p>{customer.email || "No email on file"}</p>
                        <p>{customer.phone || "No phone on file"}</p>
                      </div>
                    </td>
                    <td className="text-sm text-gray-600">{truncate(customer.address, 38)}</td>
                    <td>
                      <div className="space-y-1">
                        <p className="font-medium text-gray-900">{linkedProjects.length}</p>
                        <p className="text-xs text-gray-500">{linkedProjects[0]?.name || "No linked project yet"}</p>
                      </div>
                    </td>
                    <td className="text-sm text-gray-500">{formatDate(customer.created_at)}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setSelectedCustomerId(customer.id)}
                        className="rounded-md border border-orange-200 px-2.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50"
                      >
                        View
                      </button>
                    </td>
                    {isAdmin && (
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => openEditForm(customer)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                            Edit
                          </button>
                          <button type="button" onClick={() => void handleDelete(customer)} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
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

      {selectedCustomer && (
        <section className="card p-5 space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{selectedCustomer.name} details</h2>
              <p className="text-sm text-gray-600">
                Review contact info, linked projects, and intake notes for this customer.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/customers/${selectedCustomer.id}`}
                className="rounded-lg border border-orange-300 px-3 py-2 text-sm text-orange-700 hover:bg-orange-50"
              >
                Open full page
              </Link>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => openEditForm(selectedCustomer)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Edit customer
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedCustomerId(null)}
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
                  <dd className="font-medium text-gray-900">{selectedCustomer.email || "No email on file"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Phone</dt>
                  <dd className="font-medium text-gray-900">{selectedCustomer.phone || "No phone on file"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Address</dt>
                  <dd className="font-medium text-gray-900">{selectedCustomer.address || "No address on file"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Created</dt>
                  <dd className="font-medium text-gray-900">{formatDate(selectedCustomer.created_at)}</dd>
                </div>
              </dl>
            </div>

            <div className="space-y-3 rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Linked projects</h3>
              {projects.filter((project) => project.customer_id === selectedCustomer.id).length === 0 ? (
                <p className="text-sm text-gray-500">No linked projects yet.</p>
              ) : (
                <ul className="space-y-2">
                  {projects
                    .filter((project) => project.customer_id === selectedCustomer.id)
                    .map((project) => (
                      <li key={project.id} className="rounded-md border border-gray-100 bg-gray-50 p-3 text-sm">
                        <p className="font-medium text-gray-900">{project.name}</p>
                        <p className="text-xs text-gray-500">
                          {project.status} • Updated {formatDate(project.updated_at)}
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
              {selectedCustomer.notes || "No notes saved for this customer."}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
