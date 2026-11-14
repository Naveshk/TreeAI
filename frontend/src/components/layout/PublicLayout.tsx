import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router";

import { BRAND_NAME, TAGLINE } from "../../config/site";
import { Logo } from "../brand/Logo";
import { CloseIcon, MenuIcon } from "../ui/icons";
import { ButtonLink, cx } from "../ui/primitives";

const NAV_LINKS = [
  { to: "/#about", label: "About" },
  { to: "/#how-it-works", label: "How it works" },
  { to: "/#team", label: "Team" },
  { to: "/workspace", label: "Workspace" },
];

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-teal-400 focus:px-3 focus:py-2 focus:text-navy-950"
    >
      Skip to content
    </a>
  );
}

function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-navy-600/70 bg-navy-900/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" aria-label={`${BRAND_NAME} home`}>
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className="rounded-md px-3 py-2 text-sm text-ink-muted transition-colors hover:text-ink"
            >
              {link.label}
            </NavLink>
          ))}
          <ButtonLink to="/upload" size="sm" className="ml-3">
            Get Started
          </ButtonLink>
        </nav>
        <button
          type="button"
          className="rounded-md p-2 text-ink-muted hover:bg-navy-700 md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>
      <nav
        id="mobile-nav"
        aria-label="Mobile"
        className={cx("border-t border-navy-600 px-4 pb-4 pt-2 md:hidden", !open && "hidden")}
      >
        {NAV_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            onClick={() => setOpen(false)}
            className="block rounded-md px-3 py-2 text-sm text-ink-muted hover:bg-navy-700 hover:text-ink"
          >
            {link.label}
          </Link>
        ))}
        <ButtonLink to="/upload" className="mt-2 w-full" onClick={() => setOpen(false)}>
          Get Started
        </ButtonLink>
      </nav>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-navy-600 bg-navy-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-ink-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <Logo />
          <p className="mt-2">{TAGLINE}</p>
        </div>
        <p>
          Built with FastAPI, scikit-learn, React and D3. Every metric, tree and path comes from a
          real trained Random Forest.
        </p>
      </div>
    </footer>
  );
}

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <SiteHeader />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
