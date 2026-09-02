import { z } from "zod";
import type { DesktopStyle } from "./desktopStyle";

const IconKind = z.enum(["computer", "folder", "trash", "drive", "disk"]);
export type IconKind = z.infer<typeof IconKind>;

const WindowBody = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("gridIcons"), icons: z.array(IconKind).nonempty(), cols: z.number().int().positive() }),
  z.object({ kind: z.literal("rows"), widths: z.array(z.number().positive()).nonempty() }),
  z.object({ kind: z.literal("panes"), count: z.literal(2) }),
]);
export type WindowBody = z.infer<typeof WindowBody>;

const Anchor = z.enum(["top", "bottom"]); // deskIcons vertical anchor; default "top"

export const ChromePart = z.discriminatedUnion("part", [
  z.object({
    part: z.literal("deskIcons"),
    side: z.enum(["left", "right"]),
    anchor: Anchor.optional(),
    icons: z.array(z.object({ kind: IconKind, label: z.string().min(1) })).nonempty(),
  }),
  z.object({ part: z.literal("window"), left: z.number(), top: z.number(), w: z.number().positive(), body: WindowBody }),
  z.object({ part: z.literal("beosWindow"), left: z.number(), top: z.number(), w: z.number().positive(), body: WindowBody }),
  z.object({ part: z.literal("platinumWindow"), left: z.number(), top: z.number(), w: z.number().positive(), body: WindowBody }),
  z.object({ part: z.literal("cdeWindow"), left: z.number(), top: z.number(), w: z.number().positive(), body: WindowBody }),
  z.object({ part: z.literal("gemWindow"), left: z.number(), top: z.number(), w: z.number().positive(), body: WindowBody }),
  z.object({ part: z.literal("openLookWindow"), left: z.number(), top: z.number(), w: z.number().positive(), body: WindowBody }),
  z.object({ part: z.literal("rioWindow"), left: z.number(), top: z.number(), w: z.number().positive(), body: WindowBody }),
  z.object({ part: z.literal("taskbar") }),
  z.object({ part: z.literal("menuBar") }),
  z.object({ part: z.literal("topBar") }),
  z.object({ part: z.literal("dock") }),
  z.object({ part: z.literal("frontPanel") }),
  z.object({ part: z.literal("beosTab") }),
  z.object({ part: z.literal("bleskos") }),
  z.object({ part: z.literal("rootMenu") }),
  z.object({ part: z.literal("workspaceBar") }),
  z.object({ part: z.literal("basicScreen") }),
]);
export type ChromePart = z.infer<typeof ChromePart>;

export const ChromeSpec = z.array(ChromePart);
export type ChromeSpec = z.infer<typeof ChromeSpec>;

// Per-family chrome, as validated data. `modern` is null → the bespoke legacy
// scene (see ModernScene in DesktopPreview.tsx). The exhaustive Record means a
// new DesktopStyle fails to compile until it is given chrome here.
export const CHROME_SPECS: Record<DesktopStyle, ChromeSpec | null> = {
  modern: null,
  win9x: [
    { part: "deskIcons", side: "left", icons: [{ kind: "computer", label: "My Computer" }, { kind: "folder", label: "Documents" }] },
    { part: "window", left: 28, top: 8, w: 54, body: { kind: "gridIcons", icons: ["drive", "folder", "folder", "computer", "folder", "disk"], cols: 3 } },
    { part: "deskIcons", side: "right", anchor: "bottom", icons: [{ kind: "trash", label: "Recycle Bin" }] },
    { part: "taskbar" },
  ],
  win31: [
    { part: "window", left: 16, top: 8, w: 68, body: { kind: "panes", count: 2 } },
  ],
  platinum: [
    { part: "menuBar" },
    { part: "deskIcons", side: "right", icons: [{ kind: "drive", label: "Macintosh HD" }, { kind: "trash", label: "Trash" }] },
    { part: "platinumWindow", left: 20, top: 12, w: 52, body: { kind: "gridIcons", icons: ["drive", "folder", "folder", "disk", "folder", "trash"], cols: 3 } },
  ],
  beos: [
    { part: "beosTab" },
    { part: "deskIcons", side: "left", icons: [{ kind: "drive", label: "BeOS" }, { kind: "trash", label: "Trash" }] },
    { part: "beosWindow", left: 26, top: 11, w: 46, body: { kind: "gridIcons", icons: ["folder", "folder", "drive", "folder", "disk", "folder", "folder", "trash"], cols: 4 } },
  ],
  amiga: [
    { part: "topBar" },
    { part: "deskIcons", side: "right", icons: [{ kind: "disk", label: "Workbench" }, { kind: "drive", label: "Work" }, { kind: "trash", label: "Trash" }] },
    { part: "window", left: 10, top: 12, w: 46, body: { kind: "gridIcons", icons: ["disk", "drive", "folder"], cols: 3 } },
  ],
  kde: [
    { part: "window", left: 22, top: 9, w: 52, body: { kind: "rows", widths: [72, 88, 60, 80] } },
    { part: "dock" },
  ],
  cde: [
    { part: "deskIcons", side: "left", icons: [{ kind: "folder", label: "Home" }] },
    { part: "cdeWindow", left: 22, top: 8, w: 46, body: { kind: "gridIcons", icons: ["folder", "folder", "drive", "folder", "disk", "folder"], cols: 3 } },
    { part: "frontPanel" },
  ],
  gem: [
    { part: "menuBar" },
    { part: "deskIcons", side: "right", icons: [{ kind: "disk", label: "Floppy Disk" }, { kind: "drive", label: "Hard Disk" }, { kind: "trash", label: "Trash" }] },
    { part: "gemWindow", left: 12, top: 11, w: 46, body: { kind: "gridIcons", icons: ["folder", "folder", "disk", "folder", "drive", "folder"], cols: 3 } },
  ],
  bleskos: [
    { part: "bleskos" },
  ],
  blackbox: [
    { part: "rootMenu" },
    { part: "workspaceBar" },
  ],
  c64: [
    { part: "basicScreen" },
  ],
  // OPEN LOOK / olwm: no panel of any kind — windows simply sit on the root,
  // overlapping, with the Waste basket as the one desktop icon.
  openlook: [
    { part: "deskIcons", side: "left", anchor: "bottom", icons: [{ kind: "trash", label: "Waste" }] },
    { part: "openLookWindow", left: 20, top: 3, w: 34, body: { kind: "rows", widths: [70, 42] } },
    { part: "openLookWindow", left: 44, top: 17, w: 44, body: { kind: "gridIcons", icons: ["folder", "folder", "folder", "folder"], cols: 4 } },
  ],
  // rio draws no panel, no dock and no desktop icons — the bare wallpaper with
  // windows on it is the whole shell. Two windows side by side rather than the
  // stack a real rio screen accumulates: overlap reads as clutter at preview
  // scale, and the tag line is the thing worth showing unobscured.
  plan9: [
    { part: "rioWindow", left: 3, top: 3, w: 52, body: { kind: "rows", widths: [94, 82, 88, 70, 90, 76, 86, 62, 80] } },
    { part: "rioWindow", left: 59, top: 3, w: 36, body: { kind: "rows", widths: [84, 66, 78, 58, 72, 62, 76] } },
  ],
  generic: [
    { part: "deskIcons", side: "left", icons: [{ kind: "computer", label: "Computer" }, { kind: "folder", label: "Files" }] },
    { part: "dock" },
  ],
};
