/**
 * Sign-up (screens/SignUpPage.tsx). Supabase answers a sign-up for an email that already has an
 * account like a new one — but sends no email. The page used to say "check your email" for a
 * message that never came; now it says the account exists and offers sign-in / reset.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sb = vi.hoisted(() => ({ signUp: vi.fn(), resend: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { signUp: sb.signUp, resend: sb.resend } },
  getSupabaseConfigDiagnostic: () => ({ isConfigured: true }),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ status: "unauthenticated", signInWithOAuth: vi.fn() }) }));

import SignUpPage from "@/screens/SignUpPage";

function fill() {
  render(
    <MemoryRouter>
      <SignUpPage />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: "owner@example.com" } });
  const passwords = screen.getAllByLabelText(/password/i);
  for (const p of passwords) fireEvent.change(p, { target: { value: "s3cret-pass" } });
  fireEvent.click(screen.getByRole("button", { name: /create account/i }));
}

beforeEach(() => {
  sb.signUp.mockReset();
  sb.resend.mockReset();
});

describe("SignUpPage", () => {
  it("an email that already has an account → says so, with sign in and reset (no phantom 'check your email')", async () => {
    sb.signUp.mockResolvedValue({ data: { user: { id: "u1", identities: [] }, session: null }, error: null });
    fill();
    expect(await screen.findByText(/you already have an account/i)).toBeInTheDocument();
    expect(screen.queryByText(/check your email/i)).toBeNull();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/signin");
    expect(screen.getByRole("link", { name: /reset password/i })).toHaveAttribute("href", "/forgot-password");
  });

  it("a new email → check your email, with a resend button", async () => {
    sb.signUp.mockResolvedValue({ data: { user: { id: "u2", identities: [{ id: "i1" }] }, session: null }, error: null });
    sb.resend.mockResolvedValue({ error: null });
    fill();
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /resend the email/i }));
    await waitFor(() => expect(sb.resend).toHaveBeenCalledWith({ type: "signup", email: "owner@example.com" }));
    expect(await screen.findByText(/sent again/i)).toBeInTheDocument();
  });
});
