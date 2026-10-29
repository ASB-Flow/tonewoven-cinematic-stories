import { describe, expect, it } from "vitest";
import { numberSegments, parseNumberedTranslation, type Segment } from "@/lib/voiceServer";

const segments: Segment[] = [
  { start: 0, end: 2.5, text: "Your vision determines your future." },
  { start: 2.8, end: 5, text: "Never  give up\non your dreams." },
];

describe("numberSegments", () => {
  it("puts one numbered phrase per line", () => {
    expect(numberSegments(segments)).toBe(
      "[1] Your vision determines your future.\n[2] Never give up on your dreams.",
    );
  });
});

describe("parseNumberedTranslation", () => {
  it("keeps each phrase's timing", () => {
    const result = parseNumberedTranslation(
      "[1] Votre vision détermine votre avenir.\n[2] N'abandonnez jamais vos rêves.",
      segments,
    );
    expect(result).toEqual([
      { start: 0, end: 2.5, text: "Votre vision détermine votre avenir." },
      { start: 2.8, end: 5, text: "N'abandonnez jamais vos rêves." },
    ]);
  });

  it("accepts lines in another order", () => {
    const result = parseNumberedTranslation("[2] Deux.\n[1] Un.", segments);
    expect(result?.map((s) => s.text)).toEqual(["Un.", "Deux."]);
  });

  it("returns null when a phrase is missing", () => {
    expect(parseNumberedTranslation("[1] Votre vision détermine votre avenir.", segments)).toBeNull();
  });

  it("returns null when the markers were dropped", () => {
    expect(parseNumberedTranslation("Votre vision détermine votre avenir. N'abandonnez jamais.", segments)).toBeNull();
  });
});
