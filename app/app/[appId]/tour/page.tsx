"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

/** Old onboarding URL; send straight to the editor. */
export default function TourRedirectPage() {
  const router = useRouter();
  const { appId } = useParams<{ appId: string }>();

  useEffect(() => {
    if (appId) router.replace(`/app/${appId}/editor`);
  }, [appId, router]);

  return null;
}
