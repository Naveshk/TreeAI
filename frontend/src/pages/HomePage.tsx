import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router";

import { HeroVisual } from "../components/home/HeroVisual";
import { TeamAvatar } from "../components/home/TeamAvatar";
import {
  ChartIcon,
  SlidersIcon,
  TableIcon,
  TargetIcon,
  TreeIcon,
  UploadIcon,
} from "../components/ui/icons";
import { ButtonLink } from "../components/ui/primitives";
import { BRAND_NAME, TAGLINE } from "../config/site";
import { TEAM } from "../config/team";

const STEPS = [
  { icon: UploadIcon, title: "Upload a dataset", text: "Drop in a CSV or start from Iris, Wine or Diabetes. The file is validated and profiled on the server." },
  { icon: TableIcon, title: "Explore the data", text: "Inspect column types, missing values, duplicates, statistics and which columns can be predicted." },
  { icon: SlidersIcon, title: "Configure the forest", text: "Choose the target, the features, the train/test split and the Random Forest hyperparameters." },
  { icon: ChartIcon, title: "Train and evaluate", text: "scikit-learn trains on the training split only; metrics come from the held-out test split." },
  { icon: TargetIcon, title: "Make predictions", text: "Enter new values in a form generated from the model's features and get real predictions." },
  { icon: TreeIcon, title: "Explore individual trees", text: "Open any tree in the forest, follow your input's actual path and see how the votes combine." },
];

const FEATURES = [
  { title: "Real trees, not diagrams", text: "Every node, threshold and leaf is read from the fitted scikit-learn estimator." },
  { title: "Actual prediction paths", text: "Paths come from the model's own decision_path, so the highlighted route is exactly what the tree did." },
  { title: "Honest evaluation", text: "The split happens before any preprocessing is fitted, so test metrics are free of data leakage." },
  { title: "Votes made visible", text: "See each tree's vote and how scikit-learn averages probabilities into the final prediction." },
];

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 border-t border-navy-600/60">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-300">{eyebrow}</p>
        <h2 id={`${id}-title`} className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">
          {title}
        </h2>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const location = useLocation();
  useEffect(() => {
    if (!location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView?.({ behavior: "smooth" });
  }, [location.hash]);

  return (
    <>
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(45,212,191,0.12),transparent_55%)]"
          aria-hidden="true"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
          <div>
            <p className="inline-flex rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-xs font-medium text-teal-200">
              Interactive Random Forest learning platform
            </p>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-ink sm:text-5xl">{BRAND_NAME}</h1>
            <p className="mt-4 text-xl font-medium text-teal-200">{TAGLINE}</p>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-muted">
              A Random Forest is a team of decision trees. {BRAND_NAME} lets you train one on your
              own data and then open it up: inspect any individual tree, follow the exact path a
              prediction takes, and see how the trees&apos; answers combine into the final result.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to="/upload" size="lg">
                Get Started
              </ButtonLink>
              <ButtonLink to="/#how-it-works" size="lg" variant="secondary">
                How it works
              </ButtonLink>
            </div>
          </div>
          <div className="rounded-2xl border border-navy-600 bg-navy-850 p-6">
            <HeroVisual />
            <p className="mt-4 text-center text-xs text-ink-faint">
              Each tree follows its own path; the forest combines their answers.
            </p>
          </div>
        </div>
      </section>

      <Section id="about" eyebrow="Introduction" title="Look inside the forest">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-4 text-base leading-relaxed text-ink-muted">
            <p>
              Random Forests are among the most widely used machine-learning models, yet they are
              usually treated as a black box: data goes in, a prediction comes out.
            </p>
            <p>
              Under the hood, a forest is simply many decision trees. Each tree is trained on a
              random sample of the rows and considers random subsets of the features, so the trees
              disagree in useful ways. Looking at individual trees shows <em>why</em> the forest
              predicts what it does and how robust that prediction is.
            </p>
          </div>
          <div id="objective" className="rounded-xl border border-navy-600 bg-navy-800 p-6">
            <h3 className="text-lg font-semibold text-ink">Our objective</h3>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              To make Random Forests understandable by connecting every step of the workflow, from
              raw data to final prediction, to the real model: no simulated trees, no invented
              numbers. Students can experiment with their own datasets and see exactly how
              hyperparameters, features and individual trees shape the result.
            </p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <li key={f.title} className="rounded-lg bg-navy-900/60 p-3">
                  <p className="text-sm font-medium text-teal-200">{f.title}</p>
                  <p className="mt-1 text-xs text-ink-muted">{f.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section id="how-it-works" eyebrow="Workflow" title="How it works">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="rounded-xl border border-navy-600 bg-navy-800 p-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-teal-400/10 text-teal-300">
                    <Icon />
                  </span>
                  <span className="text-xs font-semibold text-ink-faint">Step {index + 1}</span>
                </div>
                <h3 className="mt-4 font-semibold text-ink">{step.title}</h3>
                <p className="mt-1.5 text-sm text-ink-muted">{step.text}</p>
              </li>
            );
          })}
        </ol>
        <div className="mt-10 flex justify-center">
          <ButtonLink to="/upload" size="lg">
            Start with a dataset
          </ButtonLink>
        </div>
      </Section>

      <Section id="team" eyebrow="Team" title="The people behind the project">
        <ul className="grid gap-4 sm:grid-cols-3">
          {TEAM.map((member) => (
            <li
              key={member.rollNumber}
              className="rounded-xl border border-navy-600 bg-navy-800 px-6 py-8 text-center"
            >
              <TeamAvatar member={member} />
              <h3 className="mt-5 font-semibold text-ink">{member.name}</h3>
              <p className="mt-1 text-sm text-ink-muted">{member.rollNumber}</p>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
