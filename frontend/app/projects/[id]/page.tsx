"use client";

import { useParams } from "next/navigation";
import { ProjectDetail } from "@/components/Projects/ProjectDetail";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  return <ProjectDetail projectId={params.id} />;
}
