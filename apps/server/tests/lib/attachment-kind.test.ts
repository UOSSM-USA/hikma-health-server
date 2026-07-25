import { describe, it, expect } from "vitest";
import { attachmentKind, readAttachments } from "../../src/lib/attachment-kind";

describe("attachmentKind", () => {
  it("classifies the accepted upload types", () => {
    expect(attachmentKind("image/png")).toBe("image");
    expect(attachmentKind("image/jpeg")).toBe("image");
    expect(attachmentKind("application/pdf")).toBe("pdf");
  });

  it("treats any image/* subtype as an image", () => {
    expect(attachmentKind("image/gif")).toBe("image");
    expect(attachmentKind("image/webp")).toBe("image");
  });

  // Old events carry no mimetype; they must degrade to a generic file link
  // rather than an <img> that would render a broken image.
  it("falls back to a generic file for absent or unknown types", () => {
    expect(attachmentKind(null)).toBe("file");
    expect(attachmentKind(undefined)).toBe("file");
    expect(attachmentKind("")).toBe("file");
    expect(attachmentKind("application/octet-stream")).toBe("file");
    expect(attachmentKind("text/html")).toBe("file");
  });

  // "image/png" is an image but a name that merely contains "image" is not.
  it("only matches the image/ prefix, not substrings", () => {
    expect(attachmentKind("multipart/image")).toBe("file");
    expect(attachmentKind("x-image/png")).toBe("file");
  });
});

describe("readAttachments", () => {
  it("joins resource ids to their display metadata by id", () => {
    expect(
      readAttachments({
        value: ["res1", "res2"],
        attachments: [
          { id: "res2", fileName: "referral.pdf", mimetype: "application/pdf" },
          { id: "res1", fileName: "scan.jpg", mimetype: "image/jpeg" },
        ],
      }),
    ).toEqual([
      { id: "res1", fileName: "scan.jpg", mimetype: "image/jpeg" },
      { id: "res2", fileName: "referral.pdf", mimetype: "application/pdf" },
    ]);
  });

  // `value` is the authority on which files the field has, so ordering and
  // membership follow it — stale or partial metadata cannot add or drop a file.
  it("follows value for order and membership, not attachments", () => {
    const result = readAttachments({
      value: ["res2", "res1"],
      attachments: [{ id: "res3", fileName: "ghost.pdf", mimetype: null }],
    });
    expect(result.map((attachment) => attachment.id)).toEqual(["res2", "res1"]);
  });

  it("yields null metadata for an id with no matching record", () => {
    expect(readAttachments({ value: ["res1"] })).toEqual([
      { id: "res1", fileName: null, mimetype: null },
    ]);
  });

  it("reads absent, empty, or non-array values as no attachments", () => {
    expect(readAttachments(undefined)).toEqual([]);
    expect(readAttachments(null)).toEqual([]);
    expect(readAttachments({})).toEqual([]);
    expect(readAttachments({ value: [] })).toEqual([]);
    expect(readAttachments({ value: "res1" })).toEqual([]);
    expect(readAttachments({ value: null })).toEqual([]);
  });

  it("drops non-string and empty ids", () => {
    expect(
      readAttachments({ value: ["res1", "", 42, null, undefined] }),
    ).toEqual([{ id: "res1", fileName: null, mimetype: null }]);
  });

  it("ignores malformed metadata records", () => {
    expect(
      readAttachments({
        value: ["res1"],
        attachments: [
          null,
          { id: 7 },
          { id: "res1", fileName: 42, mimetype: {} },
        ],
      }),
    ).toEqual([{ id: "res1", fileName: null, mimetype: null }]);
  });
});

describe("readAttachments - adversarial", () => {
  // A repeated id would render twice under the same React key. `value` is a
  // set of resource ids, so duplicates must collapse.
  it("collapses duplicate ids", () => {
    const result = readAttachments({ value: ["res1", "res1", "res2", "res1"] });
    expect(result.map((a) => a.id)).toEqual(["res1", "res2"]);
  });

  it("keeps the first metadata match for a duplicated id", () => {
    const result = readAttachments({
      value: ["res1", "res1"],
      attachments: [{ id: "res1", fileName: "a.jpg", mimetype: "image/jpeg" }],
    });
    expect(result).toEqual([
      { id: "res1", fileName: "a.jpg", mimetype: "image/jpeg" },
    ]);
  });

  // form_data is stored as unvalidated jsonb, so a crafted payload can nest
  // arbitrarily. The reader must not recurse or blow the stack.
  it("survives a deeply nested attachments payload", () => {
    let nested: unknown = "leaf";
    for (let i = 0; i < 10_000; i++) nested = { id: nested };
    expect(() =>
      readAttachments({ value: ["res1"], attachments: [nested] }),
    ).not.toThrow();
  });

  it("stays linear on a large value array", () => {
    const value = Array.from({ length: 50_000 }, (_, i) => `res${i}`);
    const started = performance.now();
    const result = readAttachments({ value });
    expect(result).toHaveLength(50_000);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  // A prototype-polluting key must not become a real attachment.
  it("does not treat inherited or polluted keys as attachments", () => {
    const hostile = JSON.parse(
      '{"value":["res1"],"attachments":[{"__proto__":{"fileName":"pwn"},"id":"res1"}]}',
    );
    const result = readAttachments(hostile);
    expect(result[0]?.fileName).toBeNull();
    expect(({} as Record<string, unknown>).fileName).toBeUndefined();
  });

  it("never returns a non-string id, whatever the input shape", () => {
    const result = readAttachments({
      value: [{}, [], 0, false, "", null, undefined, "ok"],
    });
    expect(
      result.every((a) => typeof a.id === "string" && a.id.length > 0),
    ).toBe(true);
    expect(result).toHaveLength(1);
  });
});
