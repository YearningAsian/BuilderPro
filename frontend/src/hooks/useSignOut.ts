"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { signOutUser } from "@/lib/auth";

export function useSignOut() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const signOut = useCallback(async () => {
    if (isSigningOut) return;

    setIsSigningOut(true);
    try {
      await signOutUser();
      queryClient.clear();
      sessionStorage.setItem("builderpro_flash_message", "You have been signed out.");
      router.replace("/signin?signed_out=1");
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  }, [isSigningOut, queryClient, router]);

  return { signOut, isSigningOut };
}
