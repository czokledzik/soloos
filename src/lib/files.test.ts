import { describe, expect, it } from "vitest";
import { contentDisposition, detectMimeType, formatBytes, isInline, isTextFile } from "./files";

const PDF = new TextEncoder().encode("%PDF-1.7\n...");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
const HTML = new TextEncoder().encode("<script>alert(1)</script>");

describe("detectMimeType", () => {
  it("recognises viewable files by their bytes, whatever the browser claimed", () => {
    expect(detectMimeType("application/pdf", PDF)).toBe("application/pdf");
    expect(detectMimeType("", PDF)).toBe("application/pdf");
    expect(detectMimeType("application/octet-stream", PNG)).toBe("image/png");
  });

  it("doesn't let a file claim a viewable type its bytes don't match", () => {
    expect(detectMimeType("application/pdf", HTML)).toBe("application/octet-stream");
    expect(detectMimeType("image/png", HTML)).toBe("application/octet-stream");
  });

  it("keeps other types as given, so they download", () => {
    expect(detectMimeType("text/html", HTML)).toBe("text/html");
    expect(isInline("text/html")).toBe(false);
    expect(detectMimeType("image/svg+xml", HTML)).toBe("image/svg+xml");
    expect(isInline("image/svg+xml")).toBe(false);
    expect(detectMimeType("not a type", HTML)).toBe("application/octet-stream");
  });
});

describe("isTextFile", () => {
  it("covers text types and config-like names", () => {
    expect(isTextFile("notes.bin", "text/plain")).toBe(true);
    expect(isTextFile("creds.json", "application/octet-stream")).toBe(true);
    expect(isTextFile(".env.local", "application/octet-stream")).toBe(true);
    expect(isTextFile("offer.pdf", "application/pdf")).toBe(false);
  });
});

describe("contentDisposition", () => {
  it("keeps Polish names in filename* with an ASCII fallback", () => {
    expect(contentDisposition("Umowa zlecenie – Łódź.pdf", true)).toBe(
      `inline; filename="Umowa zlecenie _ _odz.pdf"; filename*=UTF-8''Umowa%20zlecenie%20%E2%80%93%20%C5%81%C3%B3d%C5%BA.pdf`,
    );
    expect(contentDisposition('a"b.txt', false)).toMatch(/^attachment; filename="a_b.txt"/);
  });
});

it("formatBytes", () => {
  expect([formatBytes(900), formatBytes(534_315), formatBytes(4 * 1024 * 1024)]).toEqual(["900 B", "522 KB", "4.0 MB"]);
});
