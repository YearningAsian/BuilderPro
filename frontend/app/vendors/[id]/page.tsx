"use client";

import { useParams } from "next/navigation";
import { VendorDetail } from "@/components/Vendors/VendorDetail";

export default function VendorDetailPage() {
  const params = useParams<{ id: string }>();
  return <VendorDetail vendorId={params.id} />;
}
