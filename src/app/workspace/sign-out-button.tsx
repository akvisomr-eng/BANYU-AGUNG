"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    try {
      await authClient.signOut();
      router.replace("/auth/sign-in");
      router.refresh();
    } finally { setBusy(false); }
  }
  return <button className="signOutButton" onClick={signOut} disabled={busy}>{busy ? "Keluar..." : "Keluar"}</button>;
}
