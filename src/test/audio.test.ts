import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { splitTextIntoChunks } from "@/lib/audio";

describe("splitTextIntoChunks", () => {
  it("keeps a short text in one chunk", () => {
    expect(splitTextIntoChunks("Bonjour. Ça va ?", 100)).toEqual(["Bonjour. Ça va ?"]);
  });

  it("splits on sentence boundaries without losing text", () => {
    const text = "Première phrase. Deuxième phrase! Troisième phrase? Fin sans point";
    const chunks = splitTextIntoChunks(text, 35);
    expect(chunks.every((c) => c.length <= 35)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(text);
  });

  it("hard-cuts a sentence longer than the limit", () => {
    const chunks = splitTextIntoChunks("a".repeat(25), 10);
    expect(chunks).toEqual(["a".repeat(10), "a".repeat(10), "a".repeat(5)]);
  });
});
