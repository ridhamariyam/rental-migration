import { SparklesIcon, WrenchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MaintenanceTask } from "@/lib/db/schema";

const TYPE_META: Record<
  MaintenanceTask["taskType"],
  { label: string; className: string; icon: typeof SparklesIcon }
> = {
  cleaning: {
    label: "Cleaning",
    className: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    icon: SparklesIcon,
  },
  maintenance: {
    label: "Maintenance",
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    icon: WrenchIcon,
  },
};

/** Shared cleaning-vs-maintenance color mapping, mirroring
 * `MaintenanceTaskStatusBadge`'s pattern. */
export function MaintenanceTaskTypeBadge({
  taskType,
}: {
  taskType: MaintenanceTask["taskType"];
}) {
  const meta = TYPE_META[taskType];

  return (
    <Badge variant="secondary" className={meta.className}>
      <meta.icon className="size-3" aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}

export function maintenanceTaskTypeLabel(
  taskType: MaintenanceTask["taskType"],
): string {
  return TYPE_META[taskType].label;
}
