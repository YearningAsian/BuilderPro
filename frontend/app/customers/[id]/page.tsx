"use client";

import { useParams } from "next/navigation";
import { CustomerDetail } from "@/components/Customers/CustomerDetail";

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  return <CustomerDetail customerId={params.id} />;
}
