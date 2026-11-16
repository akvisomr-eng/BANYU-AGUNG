"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!token) { setError("Token pemulihan tidak ditemukan. Minta tautan reset yang baru."); return; }
    if (password.length < 8) { setError("Gunakan minimal 8 karakter."); return; }
    if (password !== confirm) { setError("Konfirmasi kata sandi belum sama."); return; }
    setBusy(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) setError(result.error.message || "Kata sandi belum dapat diperbarui.");
      else router.replace("/auth/sign-in?reset=success");
    } catch { setError("Layanan pemulihan belum dapat dihubungi."); }
    finally { setBusy(false); }
  }

  return <main className="authPage"><section className="authCard">
    <Link className="authBrand" href="/">BANYU <span>AGUNG</span></Link>
    <p className="eyebrow">KEAMANAN AKUN</p><h1>Buat kata sandi baru</h1>
    <form onSubmit={submit} className="authForm">
      <label htmlFor="password">Kata sandi baru</label>
      <input id="password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/>
      <label htmlFor="confirm">Ulangi kata sandi</label>
      <input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/>
      {error && <p className="authError" role="alert">{error}</p>}
      <button className="primary authSubmit" disabled={busy}>{busy ? "Menyimpan..." : "Simpan kata sandi"}</button>
    </form>
    <Link className="authHelp" href="/auth/sign-in">Kembali ke halaman masuk</Link>
  </section></main>;
}
