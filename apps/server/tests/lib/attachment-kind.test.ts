import { describe, it, expect } from "vitest";
import { attachmentKind } from "../../src/lib/attachment-kind";

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
