import { beforeEach, describe, expect, it } from "vitest";
import {
  bumpGroupVersion,
  bumpProfileVersions,
  groupVersion,
  profileVersion,
} from "./data-version";

const store = globalThis as typeof globalThis & {
  __hylistatsDataVersions?: unknown;
};

/** Un "reinicio": el proceso nuevo empieza sin contadores y con otro id de arranque. */
function restart() {
  delete store.__hylistatsDataVersions;
}

beforeEach(restart);

describe("versión de datos", () => {
  it("sube solo la de los perfiles indicados, una vez cada uno, y la del grupo si se pide", () => {
    const [a, b, c, g] = [
      profileVersion(1),
      profileVersion(2),
      profileVersion(3),
      groupVersion(),
    ];
    bumpProfileVersions([1, 2, 2], { group: false });
    expect(profileVersion(1)).not.toBe(a);
    expect(profileVersion(2)).not.toBe(b);
    expect(profileVersion(3)).toBe(c);
    expect(groupVersion()).toBe(g);

    const b1 = profileVersion(2);
    bumpProfileVersions([2], { group: false });
    const b2 = profileVersion(2);
    expect(b2).not.toBe(b1);
    // Un id repetido en la misma subida cuenta una vez: (0) -> 1 -> 2.
    expect(b2.endsWith(".2")).toBe(true);

    bumpProfileVersions([3], { group: true });
    expect(profileVersion(3)).not.toBe(c);
    expect(groupVersion()).not.toBe(g);
  });

  it("subir el grupo no toca la de ningún perfil", () => {
    const [a, g] = [profileVersion(1), groupVersion()];
    bumpGroupVersion();
    expect(profileVersion(1)).toBe(a);
    expect(groupVersion()).not.toBe(g);
  });

  it("es estable mientras no se sube (varias lecturas, sin efectos)", () => {
    expect(profileVersion(7)).toBe(profileVersion(7));
    expect(groupVersion()).toBe(groupVersion());
    bumpProfileVersions([], { group: false });
    expect(groupVersion()).toBe(groupVersion());
  });

  it("tras un reinicio cambia aunque los contadores vuelvan a 0 (id de arranque)", () => {
    const [a, g] = [profileVersion(1), groupVersion()];
    restart();
    expect(profileVersion(1)).not.toBe(a);
    expect(groupVersion()).not.toBe(g);
  });

  it("vive en globalThis: otra copia del módulo ve los mismos contadores", async () => {
    bumpProfileVersions([5], { group: true });
    const copy = await import(`./data-version?copia=${Date.now()}`);
    expect(copy.profileVersion(5)).toBe(profileVersion(5));
    expect(copy.groupVersion()).toBe(groupVersion());
  });
});
