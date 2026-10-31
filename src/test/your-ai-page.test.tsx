/** The "Your AI" page: switches grouped in plain words, Customize links, name and tone, roles. */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { YourAiView } from "@/lib/your-ai-api";

// Settles straight away, like a finished save.
const mutate = vi.fn((_patch: unknown, opts?: { onSettled?: () => void }) => opts?.onSettled?.());
const state: { role: string; view: YourAiView } = { role: "owner", view: null as never };

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ session: { organizations: [{ id: "org-1", name: "Jane's Roofing", slug: "jr", membershipRole: state.role }] } }),
}));
vi.mock("@/lib/org-context", () => ({ useOrg: () => ({ organizationId: "org-1", companyId: null }) }));
vi.mock("@/lib/api-hooks", () => ({ useCompanies: () => ({ data: [{ id: "co-1", name: "Jane's Roofing" }] }) }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/your-ai-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/your-ai-api")>();
  return {
    ...actual,
    useYourAi: () => ({ data: state.view, isLoading: false, isError: false, refetch: vi.fn() }),
    useUpdateYourAi: () => ({ mutate, isPending: false }),
  };
});

import YourAiPage from "@/screens/YourAiPage";

function view(): YourAiView {
  return {
    companyId: "co-1",
    persona: { name: null, tone: null, defaultName: "Marina" },
    switches: [
      {
        key: "texts",
        group: "customers",
        label: "Answer customer texts",
        description: "Replies to customers by text.",
        customize: "/settings?section=front-desk&focus=texts",
        choices: [
          { value: "standard", label: "On its own" },
          { value: "ask_first", label: "Ask me first" },
        ],
        on: true,
        choice: "standard",
      },
      { key: "quote_follow_ups", group: "paid", label: "Follow up on quotes", description: "Texts customers.", customize: "/settings?section=front-desk&focus=estimator", on: false },
      { key: "reviews", group: "growing", label: "Ask for reviews", description: "Asks for a review.", customize: "/settings?section=reviews", on: false, needs: "Add your review link first" },
      { key: "lead_calls", group: "customers", label: "Call new leads right away", description: "Phones web leads.", customize: null, on: false },
    ],
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <YourAiPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mutate.mockClear();
  state.role = "owner";
  state.view = view();
});

describe("YourAiPage", () => {
  it("groups switches under plain headings; groups with nothing are left out", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Talking to customers" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Getting paid" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Growing" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Running jobs" })).toBeNull();
  });

  it("flipping a switch sends just that switch", () => {
    renderPage();
    fireEvent.click(screen.getByRole("switch", { name: "Follow up on quotes" }));
    expect(mutate).toHaveBeenCalledWith({ switch: "quote_follow_ups", on: true }, expect.anything());
  });

  it("texts: the 'ask me first' choice shows while on and sends the choice", () => {
    renderPage();
    const row = within(screen.getByTestId("your-ai-texts"));
    fireEvent.click(row.getByRole("radio", { name: "Ask me first" }));
    expect(mutate).toHaveBeenCalledWith({ switch: "texts", on: true, choice: "ask_first" }, expect.anything());
  });

  it("Customize goes to the detailed setting; none where there's nothing more to set; what's missing is shown", () => {
    renderPage();
    expect(within(screen.getByTestId("your-ai-quote_follow_ups")).getByRole("link", { name: /Customize/ })).toHaveAttribute("href", "/settings?section=front-desk&focus=estimator&company=co-1");
    expect(within(screen.getByTestId("your-ai-lead_calls")).queryByRole("link", { name: /Customize/ })).toBeNull();
    expect(within(screen.getByTestId("your-ai-reviews")).getByText("Add your review link first")).toBeInTheDocument();
  });

  it("name and tone: placeholder is the default name; saving sends the persona", () => {
    renderPage();
    const input = screen.getByLabelText("Name");
    expect(input).toHaveAttribute("placeholder", "Marina");
    fireEvent.change(input, { target: { value: "Sam" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mutate).toHaveBeenCalledWith({ persona: { name: "Sam", tone: null } }, expect.anything());
    fireEvent.click(screen.getByRole("radio", { name: "Professional" }));
    expect(mutate).toHaveBeenLastCalledWith({ persona: { name: null, tone: "professional" } }, expect.anything());
  });

  it("no tone set shows Standard; an automation doing the same job is named with a link", () => {
    state.view.switches[2] = { ...state.view.switches[2], alsoDoneBy: "Review request" };
    renderPage();
    expect(screen.getByRole("radio", { name: "Standard" })).toHaveAttribute("aria-checked", "true");
    const reviews = within(screen.getByTestId("your-ai-reviews"));
    expect(reviews.getByText(/“Review request” automation does this too/)).toBeInTheDocument();
    expect(reviews.getByRole("link", { name: /Automations/ })).toHaveAttribute("href", "/automations");
  });

  it("members see the switches but can't change them", () => {
    state.role = "member";
    renderPage();
    expect(screen.getByText(/Only owners and admins/)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Follow up on quotes" })).toBeDisabled();
    expect(screen.getByLabelText("Name")).toBeDisabled();
  });
});
