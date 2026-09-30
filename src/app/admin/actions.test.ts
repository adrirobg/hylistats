import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { closeDb } from "@/db";
import { groupMembers, profiles, settings } from "@/db/schema";
import { addGroupMemberByRiotId } from "@/domain/group";
import { ADMIN_COOKIE, adminSessionValue } from "@/lib/admin/auth";
import { getTestDb, truncateAll } from "../../../tests/helpers/db";
import {
  addGroupMemberAction,
  loginAction,
  logoutAction,
  removeGroupMemberAction,
  saveKeyAction,
} from "./actions";

// Fuera de una petición de Next no hay `cookies()` ni `redirect()` reales: se sustituyen por
// un almacén en memoria y una excepción con la URL (como hace `redirect`, que lanza).
const mocks = vi.hoisted(() => {
  class Redirect extends Error {
    constructor(readonly url: string) {
      super(`redirect ${url}`);
    }
  }
  return {
    Redirect,
    jar: new Map<string, string>(),
    set: vi.fn(),
    remove: vi.fn(),
    validateKey: vi.fn(),
  };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = mocks.jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string, options: unknown) => {
      mocks.jar.set(name, value);
      mocks.set(name, value, options);
    },
    delete: (name: string) => {
      mocks.jar.delete(name);
      mocks.remove(name);
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new mocks.Redirect(url);
  },
}));
vi.mock("@/lib/riot/client", () => ({
  getRiotClient: () => ({ validateKey: mocks.validateKey }),
}));

const db = getTestDb();
const TOKEN = "test-admin-token-123";
const KEY = "RGAPI-test-secret-000";

/** Ejecuta una action y devuelve la URL a la que redirige. */
async function redirectOf(run: () => Promise<void>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof mocks.Redirect) return error.url;
    throw error;
  }
  throw new Error("la action no ha redirigido");
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

async function savedKey() {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  return row.riotApiKey;
}

beforeEach(async () => {
  await truncateAll();
  vi.stubEnv("ADMIN_TOKEN", TOKEN);
  mocks.jar.clear();
  mocks.set.mockClear();
  mocks.remove.mockClear();
  mocks.validateKey.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(closeDb);

describe("loginAction", () => {
  it("token correcto: cookie de sesión httpOnly/strict de 30 días y vuelta a /admin", async () => {
    const url = await redirectOf(() => loginAction(form({ token: TOKEN })));

    expect(url).toBe("/admin");
    expect(mocks.set).toHaveBeenCalledExactlyOnceWith(
      ADMIN_COOKIE,
      adminSessionValue(),
      {
        httpOnly: true,
        sameSite: "strict",
        secure: false, // NODE_ENV = test
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
      },
    );
  });

  it("secure en producción", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await redirectOf(() => loginAction(form({ token: TOKEN })));
    expect(mocks.set.mock.calls[0][2]).toMatchObject({ secure: true });
  });

  it.each([
    ["token incorrecto", form({ token: "otro" })],
    ["sin token", form({})],
  ])("%s: sin cookie y con aviso", async (_name, data) => {
    expect(await redirectOf(() => loginAction(data))).toBe(
      "/admin?error=token",
    );
    expect(mocks.set).not.toHaveBeenCalled();
  });
});

describe("saveKeyAction", () => {
  it("sin sesión no valida ni guarda", async () => {
    const url = await redirectOf(() => saveKeyAction(form({ key: KEY })));
    expect(url).toBe("/admin");
    expect(mocks.validateKey).not.toHaveBeenCalled();
    expect(await savedKey()).toBeNull();
  });

  it("con una cookie que no es la sesión tampoco", async () => {
    mocks.jar.set(ADMIN_COOKIE, TOKEN);
    await redirectOf(() => saveKeyAction(form({ key: KEY })));
    expect(mocks.validateKey).not.toHaveBeenCalled();
  });

  it("con sesión: valida, guarda y redirige con el código de resultado (sin la key)", async () => {
    mocks.jar.set(ADMIN_COOKIE, adminSessionValue());
    mocks.validateKey.mockResolvedValue("ok");

    const url = await redirectOf(() => saveKeyAction(form({ key: KEY })));

    expect(url).toBe("/admin?result=ok");
    expect(url).not.toContain(KEY);
    expect(await savedKey()).toBe(KEY);
  });

  it.each([
    ["invalid", "invalid"],
    ["error", "error"],
  ] as const)("validador %s: no guarda y avisa", async (validation, code) => {
    mocks.jar.set(ADMIN_COOKIE, adminSessionValue());
    mocks.validateKey.mockResolvedValue(validation);
    const url = await redirectOf(() => saveKeyAction(form({ key: KEY })));
    expect(url).toBe(`/admin?result=${code}`);
    expect(await savedKey()).toBeNull();
  });

  it("formato inválido o sin key: invalid_format sin llamar a Riot", async () => {
    mocks.jar.set(ADMIN_COOKIE, adminSessionValue());
    expect(await redirectOf(() => saveKeyAction(form({ key: "nope" })))).toBe(
      "/admin?result=invalid_format",
    );
    expect(await redirectOf(() => saveKeyAction(form({})))).toBe(
      "/admin?result=invalid_format",
    );
    expect(mocks.validateKey).not.toHaveBeenCalled();
  });
});

describe("acciones del grupo", () => {
  async function insertProfile() {
    const [p] = await db
      .insert(profiles)
      .values({
        gameName: "Hylimichi",
        tagLine: "EUW",
        riotIdNorm: "hylimichi#euw",
        status: "active",
      })
      .returning();
    return p;
  }

  it("sin sesión no añade ni quita", async () => {
    const p = await insertProfile();
    expect(
      await redirectOf(() =>
        addGroupMemberAction(form({ riotId: "Hylimichi#EUW" })),
      ),
    ).toBe("/admin");
    expect(await db.select().from(groupMembers)).toHaveLength(0);

    await addGroupMemberByRiotId(db, "Hylimichi#EUW");
    expect(
      await redirectOf(() =>
        removeGroupMemberAction(form({ profileId: String(p.id) })),
      ),
    ).toBe("/admin");
    expect(await db.select().from(groupMembers)).toHaveLength(1);
  });

  it("con sesión: añade, duplicado, no registrado y quita, con código de resultado", async () => {
    mocks.jar.set(ADMIN_COOKIE, adminSessionValue());
    const p = await insertProfile();
    const add = (riotId: string) =>
      redirectOf(() => addGroupMemberAction(form({ riotId })));

    expect(await add("Hylimichi#EUW")).toBe("/admin?group=added");
    expect(await add("hylimichi#euw")).toBe("/admin?group=already");
    expect(await add("Nadie#EUW")).toBe("/admin?group=not_registered");
    expect(await add("sin tag")).toBe("/admin?group=invalid");
    expect(await db.select().from(groupMembers)).toHaveLength(1);

    const remove = (profileId: string) =>
      redirectOf(() => removeGroupMemberAction(form({ profileId })));
    expect(await remove(String(p.id))).toBe("/admin?group=removed");
    expect(await remove(String(p.id))).toBe("/admin?group=not_member");
    expect(await remove("abc")).toBe("/admin?group=error");
    expect(await db.select().from(groupMembers)).toHaveLength(0);
  });
});

describe("logoutAction", () => {
  it("borra la cookie y vuelve a /admin", async () => {
    mocks.jar.set(ADMIN_COOKIE, adminSessionValue());
    expect(await redirectOf(logoutAction)).toBe("/admin");
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(ADMIN_COOKIE);
    expect(mocks.jar.has(ADMIN_COOKIE)).toBe(false);
  });
});
