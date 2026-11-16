"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message || "Email atau kata sandi tidak valid.");
        return;
      }
      const requested = new URLSearchParams(window.location.search).get("redirectTo") || "/workspace";
      router.replace(requested.startsWith("/") && !requested.startsWith("//") ? requested : "/workspace");
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi layanan autentikasi. Coba kembali.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="authPage"><section className="authCard">
    <Link className="authBrand" href="/">BANYU <span>AGUNG</span></Link>
    <p className="eyebrow">RUANG KERJA PERUSAHAAN</p>
    <h1>Masuk ke sistem</h1>
    <p className="authIntro">Gunakan akun yang telah didaftarkan oleh administrator BANYU AGUNG.</p>
    <form onSubmit={submit} className="authForm">
      <label htmlFor="email">Alamat email</label>
      <input id="email" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="nama@perusahaan.com"/>
      <label htmlFor="password">Kata sandi</label>
      <input id="password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Masukkan kata sandi"/>
      {error && <p className="authError" role="alert">{error}</p>}
      <button className="primary authSubmit" disabled={busy}>{busy ? "Memeriksa..." : "Masuk"}</button>
    </form>
    <Link className="authHelp" href="/auth/forgot-password">Lupa kata sandi?</Link>
    <p className="authFoot">Pendaftaran akun publik dinonaktifkan. Hubungi administrator untuk memperoleh akses.</p>
  </section></main>;
}
