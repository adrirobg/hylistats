import { describe, expect, it } from "vitest";
import {
  classifyRetry,
  RATE_LIMIT_MARKER,
  RiotAuthError,
  RiotBadRequestError,
  RiotRateLimitError,
  RiotRetryableError,
} from "./errors";

const context = { host: "europe", path: "/lol/match/v5/matches/:id" };

describe("RiotRateLimitError", () => {
  it("su mensaje empieza por la marca fija y conserva host, ruta y estado", () => {
    const error = new RiotRateLimitError(
      { ...context, status: 429 },
      "límite de peticiones tras 5 intentos",
    );
    expect(error.message.startsWith(RATE_LIMIT_MARKER)).toBe(true);
    expect(error.message).toContain("Riot europe /lol/match/v5/matches/:id");
    expect(error.message).toContain("429");
    expect(error.name).toBe("RiotRateLimitError");
  });

  it("ningún otro error de Riot lleva la marca", () => {
    for (const error of [
      new RiotRetryableError({ ...context, status: 503 }, "tras 5 intentos"),
      new RiotAuthError({ ...context, status: 403 }),
      new RiotBadRequestError({ ...context, status: 400 }),
    ]) {
      expect(error.message).not.toContain(RATE_LIMIT_MARKER);
    }
  });
});

describe("classifyRetry", () => {
  it("rate_limit si el lastError viene de un RiotRateLimitError", () => {
    const { message } = new RiotRateLimitError({ ...context, status: 429 });
    expect(classifyRetry(message)).toBe("rate_limit");
  });

  it("encuentra la marca aunque el mensaje lleve un prefijo (`player-data: …`)", () => {
    const { message } = new RiotRateLimitError({ ...context, status: 429 });
    expect(classifyRetry(`player-data: ${message}`)).toBe("rate_limit");
  });

  it("error para un 5xx, un error de red o cualquier otro texto", () => {
    expect(
      classifyRetry(
        new RiotRetryableError({ ...context, status: 503 }, "tras 5 intentos")
          .message,
      ),
    ).toBe("error");
    expect(classifyRetry("connect ECONNREFUSED 127.0.0.1:5432")).toBe("error");
    expect(classifyRetry("Error: boom")).toBe("error");
  });

  it("no se fía del texto en llano ni del código 429: solo de la marca", () => {
    // Un mensaje anterior a la marca (o uno que solo la imita) no se clasifica como límite.
    expect(
      classifyRetry(
        "Riot europe /x -> 429: límite de peticiones tras 5 intentos",
      ),
    ).toBe("error");
    expect(classifyRetry("rate-limit")).toBe("error");
  });

  it("sin lastError (null o vacío): error", () => {
    expect(classifyRetry(null)).toBe("error");
    expect(classifyRetry("")).toBe("error");
  });
});
