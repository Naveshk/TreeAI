import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { TeamMember } from "../../config/team";
import { TeamAvatar } from "./TeamAvatar";

const member: TeamMember = {
  name: "Ada Lovelace",
  rollNumber: "Roll No. 1",
  photo: { src: "/images/team/ada.jpeg", focus: "50% 30%", zoom: 2 },
};

describe("TeamAvatar", () => {
  it("renders the photograph with object-fit cover and face framing", () => {
    render(<TeamAvatar member={member} />);
    const img = screen.getByRole("img", { name: "Photo of Ada Lovelace" });
    expect(img).toHaveAttribute("src", "/images/team/ada.jpeg");
    expect(img).toHaveClass("object-cover");
    expect(img.style.objectPosition).toBe("50% 30%");
    expect(img.style.transform).toBe("scale(2)");
    expect(screen.queryByText("AL")).not.toBeInTheDocument();
  });

  it("falls back to initials when the image fails to load", () => {
    render(<TeamAvatar member={member} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("shows initials when no photograph is configured", () => {
    render(<TeamAvatar member={{ name: "Alan Turing", rollNumber: "Roll No. 2" }} />);
    expect(screen.getByText("AT")).toBeInTheDocument();
  });
});
