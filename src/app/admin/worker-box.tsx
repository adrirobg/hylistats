import { Box } from "@/components/hy/box";
import { Chip } from "@/components/hy/chip";
import { formatDateTime } from "@/lib/format";
import type { WorkerState, WorkerStatus } from "@/worker/main";
import { DefList } from "./def-list";

const STATE_CHIP: Record<WorkerState, string> = {
  running: "border-ok text-ok",
  idle: "border-ok text-ok",
  paused: "border-danger text-danger",
  stopped: "border-danger text-danger",
  starting: "",
  waiting_lock: "",
};

/** `Box` «Worker»: estado del worker, última actividad, job actual y último error. */
export function WorkerBox({ worker }: { worker: WorkerStatus }) {
  const items = [
    { label: "Última actividad", value: formatDateTime(worker.lastActivityAt) },
    { label: "Job actual", value: worker.currentJobId ?? "-" },
    ...(worker.lastError
      ? [{ label: "Último error", value: worker.lastError }]
      : []),
  ];
  return (
    <Box title="Worker" titleAs="h2">
      <div className="mb-3">
        <Chip className={STATE_CHIP[worker.state]}>{worker.state}</Chip>
      </div>
      <DefList items={items} />
    </Box>
  );
}
