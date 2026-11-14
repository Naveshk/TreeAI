import { ButtonLink } from "../components/ui/primitives";

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-sm font-semibold text-teal-300">404</p>
      <h1 className="mt-2 text-3xl font-semibold text-ink">Page not found</h1>
      <p className="mt-3 text-ink-muted">The page you are looking for does not exist.</p>
      <div className="mt-8 flex justify-center gap-3">
        <ButtonLink to="/">Go home</ButtonLink>
        <ButtonLink to="/workspace" variant="secondary">
          Open workspace
        </ButtonLink>
      </div>
    </div>
  );
}
