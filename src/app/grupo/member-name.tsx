import Link from "next/link";
import { cn } from "@/lib/utils";
import type { MemberRef } from "./group-view-model";

/** Nombre de un miembro enlazado a su perfil. Sin miembro (clave desconocida) queda un guion. */
export function MemberName({
  member,
  className,
}: {
  member: MemberRef | null;
  className?: string;
}) {
  if (!member) return <span className="text-faint">?</span>;
  return (
    <Link
      href={`/euw/${member.slug}`}
      title={`${member.gameName}#${member.tagLine}`}
      className={cn(
        "min-w-0 truncate font-medium underline decoration-transparent underline-offset-2 hover:decoration-current",
        className,
      )}
    >
      {member.gameName}
    </Link>
  );
}

/** Varios miembros (un dúo o un trío) unidos con «+». */
export function MemberNames({
  members,
}: {
  members: readonly (MemberRef | null)[];
}) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5">
      {members.map((member, index) => (
        <span
          key={member?.key ?? `desconocido-${index}`}
          className="inline-flex min-w-0 items-baseline gap-1.5"
        >
          {index > 0 && (
            <span aria-hidden="true" className="text-faint">
              +
            </span>
          )}
          <MemberName member={member} />
        </span>
      ))}
    </span>
  );
}
