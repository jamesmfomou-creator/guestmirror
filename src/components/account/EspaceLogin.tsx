"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmailCodeVerify } from "@/components/access/EmailCodeVerify";

// Login to Mon espace: the address used for the purchase, then a 6-digit code
// sent to it (same routes and limits as every other email proof). No password.
// The server sets the httpOnly session cookie; rights are read server side.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EspaceLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const valid = EMAIL_RE.test(email.trim());

  return (
    <div className="card mx-auto w-full max-w-md p-5 text-left sm:p-7">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Connexion</h2>
      <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">
        Indique l&apos;adresse email utilisée lors de ton achat ou de ton analyse. Tu reçois un code à 6 chiffres : pas de
        mot de passe à créer.
      </p>
      <label htmlFor="espace-email" className="mt-5 block text-[13px] font-medium text-foreground">
        Adresse email
      </label>
      <input
        id="espace-email"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="ton@email.com"
        className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-3 text-base focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
      <div className="mt-4">
        {valid ? (
          <EmailCodeVerify
            key={email.trim().toLowerCase()}
            requestBody={{ email: email.trim(), purpose: "account" }}
            verifyBody={(code) => ({ email: email.trim(), code })}
            requestLabel="Recevoir mon code de connexion"
            onVerified={() => router.refresh()}
          />
        ) : (
          <p className="text-[13px] text-muted-2">Saisis ton adresse pour recevoir ton code.</p>
        )}
      </div>
      <p className="mt-5 border-t border-border pt-4 text-[12.5px] leading-relaxed text-muted-2">
        Si cette adresse a déjà utilisé GuestMirror, le code arrive en quelques secondes (pense à vérifier tes spams).
      </p>
    </div>
  );
}
