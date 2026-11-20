/** The website look picker (quick setup + Settings → Your website). */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SiteLookPicker } from "@/components/website/SiteLookPicker";

describe("SiteLookPicker", () => {
  it("shows 'Pick for me' with what it means for the trade, and the three looks as radios", () => {
    render(<SiteLookPicker value={{ theme: "auto", color: null }} autoTheme="classic" onChange={() => {}} />);
    const looks = within(screen.getByRole("radiogroup", { name: "Look" })).getAllByRole("radio");
    expect(looks).toHaveLength(4);
    expect(screen.getByRole("radio", { name: /Pick for me/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Pick for me/ }).textContent).toContain("For you: Classic.");
    for (const name of [/^Bold/, /^Clean/, /^Classic/]) expect(screen.getByRole("radio", { name })).toHaveAttribute("aria-checked", "false");
  });

  it("picking a look or a colour reports the whole style; brand colours = null", () => {
    const onChange = vi.fn();
    const { rerender } = render(<SiteLookPicker value={{ theme: "auto", color: null }} autoTheme="clean" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /^Bold/ }));
    expect(onChange).toHaveBeenLastCalledWith({ theme: "bold", color: null });
    fireEvent.click(screen.getByRole("radio", { name: "Colour #0f766e" }));
    expect(onChange).toHaveBeenLastCalledWith({ theme: "auto", color: "#0f766e" });
    rerender(<SiteLookPicker value={{ theme: "bold", color: "#0f766e" }} autoTheme="clean" onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "Colour #0f766e" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: /My brand colours/ }));
    expect(onChange).toHaveBeenLastCalledWith({ theme: "bold", color: null });
  });

  it("disabled for people who can't change it", () => {
    render(<SiteLookPicker value={{ theme: "auto", color: null }} autoTheme="clean" onChange={() => {}} disabled />);
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
  });
});
