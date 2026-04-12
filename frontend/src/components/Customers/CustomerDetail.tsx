"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/hooks/useStore";
import { getActiveSession } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Customer, CustomerCreate } from "@/types";
import { customerCreateSchema } from "@/types/schemas";

type CustomerFormState = {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
};

function toFormState(customer: Customer): CustomerFormState {
  return {
    name: customer.name,
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    address: customer.address ?? "",
    notes: customer.notes ?? "",
  };
}

export function CustomerDetail({ customerId }: { customerId: string }) {
  const router = useRouter();
  const {
    customers,
    projects,
    isLoading,
    getCustomerById,
    getMaterialById,
    getVendorById,
    updateCustomer,
    deleteCustomer,
  } = useStore();
  const customer = getCustomerById(customerId);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formStatus, setFormStatus] = useState("");
  const [form, setForm] = useState<CustomerFormState>({
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
    if (!customer) return;
    setForm(toFormState(customer));
  }, [customer]);

  const linkedProjects = useMemo(
    () => projects.filter((project) => project.customer_id === customerId),
    [customerId, projects],
  );

  const customerOrder = useMemo(
    () => [...customers].sort((a, b) => a.name.localeCompare(b.name)),
    [customers],
  );

  const navigation = useMemo(() => {
    const index = customerOrder.findIndex((entry) => entry.id === customerId);
    if (index < 0) {
      return { previousId: null as string | null, nextId: null as string | null };
    }

    return {
      previousId: customerOrder[index - 1]?.id ?? null,
      nextId: customerOrder[index + 1]?.id ?? null,
    };
  }, [customerId, customerOrder]);

  const customerSummary = useMemo(() => {
    const activeProjects = linkedProjects.filter((project) => project.status === "active").length;
    const totalEstimate = linkedProjects.reduce(
      (sum, project) => sum + project.items.reduce((itemSum, item) => itemSum + item.line_subtotal, 0),
      0,
    );

    return {
      activeProjects,
      totalEstimate,
    };
  }, [linkedProjects]);

  const relatedVendors = useMemo(() => {
    const spendByVendor = new Map<string, { id: string; name: string; spend: number }>();

    for (const project of linkedProjects) {
      for (const item of project.items) {
        const material = getMaterialById(item.material_id);
        if (!material?.default_vendor_id) continue;

        const vendor = getVendorById(material.default_vendor_id);
        const existing = spendByVendor.get(material.default_vendor_id);
        const nextSpend = (existing?.spend ?? 0) + item.line_subtotal;

        spendByVendor.set(material.default_vendor_id, {
          id: material.default_vendor_id,
          name: vendor?.name ?? "Unknown vendor",
          spend: nextSpend,
        });
      }
    }

    return Array.from(spendByVendor.values())
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5);
  }, [getMaterialById, getVendorById, linkedProjects]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (isTypingTarget) {
        return;
      }

      if (event.key === "ArrowLeft" && navigation.previousId) {
        event.preventDefault();
        router.push(`/customers/${navigation.previousId}`);
        return;
      }

      if (event.key === "ArrowRight" && navigation.nextId) {
        event.preventDefault();
        router.push(`/customers/${navigation.nextId}`);
        return;
      }

      if ((event.key === "e" || event.key === "E") && isAdmin && customer) {
        event.preventDefault();
        setFormError("");
        setFormStatus("");
        setForm(toFormState(customer));
        setIsEditing((current) => !current);
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [customer, isAdmin, navigation.nextId, navigation.previousId, router]);

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-4">
        <nav className="text-sm text-gray-400">
          <Link href="/customers" className="hover:text-orange-500 transition-colors">
            Customers
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-700">Loading</span>
        </nav>
        <div className="card p-6 text-center">
          <p className="text-lg font-medium text-gray-900">Loading customer...</p>
          <p className="mt-2 text-sm text-gray-500">Fetching the latest workspace record.</p>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6 lg:p-8 space-y-4">
        <nav className="text-sm text-gray-400">
          <Link href="/customers" className="hover:text-orange-500 transition-colors">
            Customers
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-700">Not found</span>
        </nav>
        <div className="card p-6 text-center">
          <p className="text-lg font-medium text-gray-900">Customer not found</p>
          <p className="mt-2 text-sm text-gray-500">
            This customer may have been removed or is outside your active workspace.
          </p>
        </div>
      </div>
    );
  }

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
      await updateCustomer(customer.id, validated.data);
      setFormStatus("Customer updated successfully.");
      setIsEditing(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save customer.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(`Delete ${customer.name}?`);
    if (!confirmed) return;

    setFormError("");
    setFormStatus("");
    setIsDeleting(true);

    try {
      await deleteCustomer(customer.id);
      router.push("/customers");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to delete customer.");
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <nav className="text-sm text-gray-400">
        <Link href="/customers" className="hover:text-orange-500 transition-colors">
          Customers
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-700">{customer.name}</span>
      </nav>

      <section className="card p-5 space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
            <p className="mt-1 text-sm text-gray-500">
              Customer record with linked project history and intake notes.
            </p>
            <p className="mt-1 text-xs text-gray-400">Shortcuts: Left/Right to navigate, E to edit.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/customers"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              All customers
            </Link>
            {navigation.previousId && (
              <Link
                href={`/customers/${navigation.previousId}`}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Previous
              </Link>
            )}
            {navigation.nextId && (
              <Link
                href={`/customers/${navigation.nextId}`}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Next
              </Link>
            )}
            <Link
              href="/projects"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              New project
            </Link>
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setFormError("");
                    setFormStatus("");
                    setForm(toFormState(customer));
                    setIsEditing((current) => !current);
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {isEditing ? "Hide editor" : "Edit customer"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={isDeleting}
                  className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-red-200 disabled:text-red-300"
                >
                  {isDeleting ? "Deleting..." : "Delete customer"}
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
                <dd className="font-medium text-gray-900">
                  {customer.email ? (
                    <a href={`mailto:${customer.email}`} className="text-orange-700 hover:underline">
                      {customer.email}
                    </a>
                  ) : (
                    "No email on file"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Phone</dt>
                <dd className="font-medium text-gray-900">
                  {customer.phone ? (
                    <a href={`tel:${customer.phone}`} className="text-orange-700 hover:underline">
                      {customer.phone}
                    </a>
                  ) : (
                    "No phone on file"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Address</dt>
                <dd className="font-medium text-gray-900">{customer.address || "No address on file"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Created</dt>
                <dd className="font-medium text-gray-900">{formatDate(customer.created_at)}</dd>
              </div>
            </dl>
          </div>

          <div className="space-y-3 rounded-lg border border-gray-200 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Customer summary</h2>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-gray-100 bg-gray-50 p-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-gray-500">Linked projects</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{linkedProjects.length}</p>
              </div>
              <div className="rounded-md border border-gray-100 bg-gray-50 p-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-gray-500">Active projects</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{customerSummary.activeProjects}</p>
              </div>
            </div>
            <div className="rounded-md border border-gray-100 bg-gray-50 p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Total estimate value</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{formatCurrency(customerSummary.totalEstimate)}</p>
            </div>
            <div className="rounded-md border border-gray-100 bg-gray-50 p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Related vendors</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{relatedVendors.length}</p>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-gray-200 p-4 lg:col-span-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Linked projects</h2>
            {linkedProjects.length === 0 ? (
              <p className="text-sm text-gray-500">No linked projects yet.</p>
            ) : (
              <ul className="space-y-2">
                {linkedProjects.map((project) => (
                  <li key={project.id} className="rounded-md border border-gray-100 bg-gray-50 p-3 text-sm">
                    <Link href={`/projects/${project.id}`} className="font-medium text-gray-900 hover:text-orange-600">
                      {project.name}
                    </Link>
                    <p className="text-xs text-gray-500">
                      {project.status} • {project.items.length} item(s) • Updated {formatDate(project.updated_at)}
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
            {customer.notes || "No notes saved for this customer."}
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Top vendor relationships</h2>
          {relatedVendors.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No vendor spend relationships found yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {relatedVendors.map((vendor) => (
                <li key={vendor.id} className="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                  <Link href={`/vendors/${vendor.id}`} className="font-medium text-gray-900 hover:text-orange-600">
                    {vendor.name}
                  </Link>
                  <span className="font-semibold text-gray-700">{formatCurrency(vendor.spend)}</span>
                </li>
              ))}
            </ul>
          )}
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
              <span className="font-medium">Customer name</span>
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
                {isSaving ? "Saving..." : "Save customer"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm(toFormState(customer));
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
