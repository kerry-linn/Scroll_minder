"use client";

import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { signIn, signUp } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AuthFormProps {
  mode: "login" | "register";
}

export function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      toast.error("Please fill in all fields.");
      return;
    }

    setPending(true);
    const result =
      mode === "login"
        ? await signIn(trimmedEmail, password)
        : await signUp(trimmedEmail, password);
    setPending(false);

    if (!result.success) {
      toast.error(result.error);
    }
  }

  const isLogin = mode === "login";

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-sm font-semibold tracking-widest uppercase text-foreground/70">
            ScrollMinder
          </h1>
          <p className="text-xs text-muted-foreground">
            {isLogin ? "Sign in to your workspace" : "Create your workspace"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            required
          />
          <Input
            type="password"
            placeholder="Password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
            required
          />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending
              ? isLogin
                ? "Signing in…"
                : "Creating account…"
              : isLogin
                ? "Sign in"
                : "Create account"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          {isLogin ? (
            <>
              No account?{" "}
              <Link
                href="/register"
                className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
              >
                Register
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
              >
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
