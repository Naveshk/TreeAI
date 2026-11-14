import type { ClassProbability } from "../../api/types";
import { formatPercent } from "../../lib/format";
import { classColor } from "../../lib/misc";
import { BarList } from "../ui/widgets";

/** Real class probabilities from the model, in the model's class order. */
export function ProbabilityList({
  probabilities,
  classes,
  predicted,
  label = "Class probabilities",
}: {
  probabilities: ClassProbability[];
  classes: string[];
  predicted: string;
  label?: string;
}) {
  return (
    <BarList
      label={label}
      max={1}
      format={(v) => formatPercent(v)}
      items={probabilities.map((p) => ({
        label: p.label,
        value: p.probability,
        color: classColor(classes.indexOf(p.label)),
        highlight: p.label === predicted,
      }))}
    />
  );
}
