import { Box } from "@/components/hy/box";
import { Btn } from "@/components/hy/btn";
import { Notice } from "@/components/hy/notice";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { GroupMember } from "@/domain/group";
import { formatDateTime } from "@/lib/format";
import { addGroupMemberAction, removeGroupMemberAction } from "./actions";

type NoticeVariant = "okay" | "trust" | "danger";

/** Tono del resultado de `?group=`: éxito, neutro o error. */
function noticeVariant(group: string | string[] | undefined): NoticeVariant {
  if (group === "added" || group === "removed") return "okay";
  if (group === "already" || group === "not_member") return "trust";
  return "danger";
}

/** `Box` «Grupo»: miembros en tabla con «Quitar» y formulario de añadir al pie. */
export function GroupBox({
  members,
  group,
  message,
}: {
  members: GroupMember[];
  /** Código de `?group=`. */
  group: string | string[] | undefined;
  message: string | null | undefined;
}) {
  return (
    <Box
      title="Grupo"
      titleAs="h2"
      hint={`${members.length} ${members.length === 1 ? "miembro" : "miembros"}`}
    >
      {message && (
        <Notice
          role="status"
          variant={noticeVariant(group)}
          className="mb-3 flex-nowrap"
        >
          {message}
        </Notice>
      )}
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin miembros.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-line hover:bg-transparent">
              <TableHead className="text-muted-foreground">Riot ID</TableHead>
              <TableHead className="text-muted-foreground">
                Última sync
              </TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow
                key={m.profileId}
                className="border-line hover:bg-transparent"
              >
                <TableCell className="font-medium whitespace-normal break-words">
                  {m.gameName}#{m.tagLine}
                </TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">
                  {formatDateTime(m.lastSyncedAt)}
                </TableCell>
                <TableCell className="text-right">
                  <form action={removeGroupMemberAction}>
                    <input type="hidden" name="profileId" value={m.profileId} />
                    <Btn
                      type="submit"
                      size="small"
                      aria-label={`Quitar a ${m.gameName}#${m.tagLine}`}
                    >
                      Quitar
                    </Btn>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <form
        action={addGroupMemberAction}
        className="mt-4 flex flex-col gap-2 border-t border-line pt-3.5"
      >
        <label
          htmlFor="admin-riot-id"
          className="text-sm text-muted-foreground"
        >
          Riot ID del perfil registrado
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="admin-riot-id"
            type="text"
            name="riotId"
            placeholder="Nombre#TAG"
            autoComplete="off"
            required
            className="sm:h-auto"
          />
          <Btn type="submit" className="shrink-0 justify-center">
            Añadir al grupo
          </Btn>
        </div>
      </form>
    </Box>
  );
}
