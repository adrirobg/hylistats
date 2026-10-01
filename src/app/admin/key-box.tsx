import { Box } from "@/components/hy/box";
import { Btn } from "@/components/hy/btn";
import { Chip } from "@/components/hy/chip";
import { Notice } from "@/components/hy/notice";
import { Input } from "@/components/ui/input";
import type { KeyStatusInfo } from "@/lib/admin/key-service";
import { formatDateTime } from "@/lib/format";
import { saveKeyAction } from "./actions";
import { DefList } from "./def-list";

const STATUS_CHIP: Record<KeyStatusInfo["status"], string> = {
  ok: "border-ok text-ok",
  invalid: "border-danger text-danger",
  unknown: "",
};

/** `Box` «Key de Riot»: estado de la key y formulario «Nueva key» con su resultado. */
export function KeyBox({
  status,
  result,
  message,
}: {
  status: KeyStatusInfo;
  /** Código de `?result=`; `ok` es éxito, cualquier otro es error. */
  result: string | string[] | undefined;
  message: string | null | undefined;
}) {
  const items = [
    { label: "Desde", value: formatDateTime(status.since) },
    ...(status.reason ? [{ label: "Motivo", value: status.reason }] : []),
    { label: "Fuente", value: status.source },
    { label: "Guardada", value: formatDateTime(status.updatedAt) },
    ...(status.expiresHint
      ? [
          {
            label: "Caduca aprox.",
            value: `${formatDateTime(status.expiresHint)} (última key + 24 h)`,
          },
        ]
      : []),
  ];
  return (
    <Box title="Key de Riot" titleAs="h2">
      <div className="mb-3">
        <Chip className={STATUS_CHIP[status.status]}>{status.status}</Chip>
      </div>
      <DefList items={items} />
      <form
        action={saveKeyAction}
        className="mt-4 flex flex-col gap-2 border-t border-line pt-3.5"
      >
        <label htmlFor="admin-key" className="text-sm text-muted-foreground">
          Nueva key
        </label>
        {message && (
          <Notice
            role="status"
            variant={result === "ok" ? "okay" : "danger"}
            className="mb-1 flex-nowrap"
          >
            {message}
          </Notice>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="admin-key"
            type="password"
            name="key"
            autoComplete="off"
            required
            className="sm:h-auto"
          />
          <Btn type="submit" className="shrink-0 justify-center">
            Validar y guardar
          </Btn>
        </div>
      </form>
    </Box>
  );
}
