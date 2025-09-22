"use client";

import { useParams, useRouter } from "next/navigation";
import EditorChrome from "@/components/editor/EditorChrome";
import TourModal from "@/components/editor/TourModal";
import steps from "@/lib/tourSteps";

export default function TourPage() {
  const router = useRouter();
  const { appId } = useParams<{ appId: string }>();
  return (
    <EditorChrome appName={appId}>
      <TourModal steps={steps} onDone={() => router.push(`/app/${appId}/editor`)} />
    </EditorChrome>
  );
}
