"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("akvisomr@gmail.com");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: window.location.origin + "/auth/reset-password",
      });
      if (result.error) setError(result.error.message || "Permintaan reset kata sandi gagal.");
      else setMessage("Jika email terdaftar dan pengiriman email aktif, instruksi pemulihan akan dikirim ke alamat tersebut.");
    } catch {
      setError("Layanan pemulihan belum dapat dihubungi. Silakan coba kembali.");
    } finally { setBusy(false); }
  }

  return <main className="authPage"><section className="authCard">
    <Link className="authBrand" href="/">BANYU <span>AGUNG</span></Link>
    <p className="eyebrow">PEMULIHAN AKUN</p><h1>Atur ulang kata sandi</h1>
    <p className="authIntro">Masukkan email akun. Kami akan meminta layanan autentikasi mengirim instruksi pemulihan.</p>
    <form onSubmit={submit} className="authForm">
      <label htmlFor="email">Alamat email</label>
      <input id="email" type="email" required value={email} onChange={e=>setEmail(e.target.value)}/>
      {error && <p className="authError" role="alert">{error}</p>}
      {message && <p className="authSuccess" role="status">{message}</p>}
      <button className="primary authSubmit" disabled={busy}>{busy ? "Mengirim..." : "Kirim instruksi"}</button>
    </form>
    <Link className="authHelp" href="/auth/sign-in">Kembali ke halaman masuk</Link>
  </section></main>;
}
