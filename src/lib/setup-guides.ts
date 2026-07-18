export type GuideCat = "desktop" | "mobile";

export interface SetupGuideEntry {
  key: string;
  os: string;
  note: string;
  swatch: string;
  cat: GuideCat;
  steps: string[];
  code?: string;
  article: string[];
  // Optional labelled slots for screenshots shown alongside the full guide.
  shots?: { label: string }[];
}

export const SETUP_GUIDES: SetupGuideEntry[] = [
  {
    key: "win11", os: "Windows 11", note: "Settings app", swatch: "#008080", cat: "desktop",
    steps: [
      "Open Settings → Personalization → Background.",
      "Set “Personalize your background” to Solid color.",
      "Click a swatch, or choose Custom color and paste your hex.",
    ],
    article: [
      "Windows 11 keeps a built-in solid-color mode, so you never need a wallpaper image. The custom-color picker accepts any RGB value — the exact hex from any color on this site.",
      "The choice is per-account and syncs if you have Windows backup on, so signing into another PC brings your color with you.",
    ],
    shots: [{ label: "Background settings" }, { label: "Custom color picker" }],
  },
  {
    key: "win10", os: "Windows 10", note: "Settings app", swatch: "#3a6ea5", cat: "desktop",
    steps: [
      "Open Settings → Personalization → Background.",
      "Under Background, choose Solid color.",
      "Pick a swatch or click Custom color for an exact hex.",
    ],
    article: [
      "Windows 10 works almost identically to 11 — the Solid color option lives in the same Background pane, with a Custom color button for precise values.",
    ],
    shots: [{ label: "Background pane" }],
  },
  {
    key: "macos", os: "macOS", note: "Ventura and later", swatch: "#004e98", cat: "desktop",
    steps: [
      "Open System Settings → Wallpaper.",
      "Scroll to Colors and pick a shade, or click the + for a custom color.",
      "Enter your hex in the color picker (RGB / hex tab).",
    ],
    article: [
      "Recent macOS versions moved wallpaper into System Settings. The Colors group offers presets plus a + tile that opens the standard macOS color picker — use its sliders or the hex field for an exact match.",
      "On older macOS (System Preferences → Desktop & Screen Saver), choose the “Solid Colors” collection, or click Custom Color at the bottom.",
    ],
    shots: [{ label: "Wallpaper → Colors" }, { label: "Custom color sheet" }],
  },
  {
    key: "gnome", os: "GNOME · Ubuntu", note: "solid color via terminal", swatch: "#4e9a9a", cat: "desktop",
    steps: [
      "GNOME hides the solid-color option, so use the terminal.",
      "Paste the commands below, swapping in your hex.",
    ],
    code: [
      "gsettings set org.gnome.desktop.background picture-uri ''",
      "gsettings set org.gnome.desktop.background picture-uri-dark ''",
      "gsettings set org.gnome.desktop.background color-shading-type 'solid'",
      "gsettings set org.gnome.desktop.background primary-color '#008080'",
    ].join("\n"),
    article: [
      "Modern GNOME dropped the solid-color control from Settings, but the underlying key still exists. Clearing both picture-uri keys removes any image, and primary-color sets the flat fill.",
      "For a gradient instead, set color-shading-type to 'vertical' or 'horizontal' and add a secondary-color key.",
    ],
    shots: [{ label: "Terminal result" }],
  },
  {
    key: "kde", os: "KDE Plasma", note: "Desktop settings", swatch: "#5a7ea5", cat: "desktop",
    steps: [
      "Right-click the desktop → Configure Desktop and Wallpaper.",
      "Set Wallpaper type to Plain Color.",
      "Click the color box and enter your hex, then Apply.",
    ],
    article: [
      "Plasma is the most flexible of the Linux desktops here — Plain Color is a first-class wallpaper type, with a full color dialog that takes hex input directly.",
    ],
    shots: [{ label: "Wallpaper config" }],
  },
  {
    key: "ios", os: "iOS · iPhone", note: "iOS 16 and later", swatch: "#800080", cat: "mobile",
    steps: [
      "Open Settings → Wallpaper → Add New Wallpaper.",
      "Tap Color at the top of the gallery.",
      "Choose a hue, tap the swatch to fine-tune, then Set.",
    ],
    article: [
      "Since iOS 16 the wallpaper gallery includes a Color option that produces a flat background — no need to save an image. Tapping the large swatch opens a picker where you can dial in an exact color.",
      "You can set it for the Lock Screen, Home Screen, or both from the same flow.",
    ],
    shots: [{ label: "Add wallpaper → Color" }, { label: "Color picker" }],
  },
  {
    key: "android", os: "Android", note: "varies by skin", swatch: "#808000", cat: "mobile",
    steps: [
      "Save a solid-color image (download any hex as a PNG here).",
      "Long-press the home screen → Wallpaper & style.",
      "Pick the saved image from Gallery / Photos and apply.",
    ],
    article: [
      "Stock Android has no built-in solid-color wallpaper, so the reliable route is a solid-color image — download one at your target resolution and set it like any photo.",
      "Some skins add a shortcut: Samsung One UI has a “Color palette” wallpaper, and several launchers expose a solid-color option directly.",
    ],
    shots: [{ label: "Wallpaper & style" }],
  },
];

const haystack = (g: SetupGuideEntry): string =>
  [g.os, g.note, ...g.steps, ...g.article].join(" ").toLowerCase();

export function filterGuides(
  guides: SetupGuideEntry[], opts: { query: string; cat: GuideCat | "all" },
): SetupGuideEntry[] {
  const q = opts.query.trim().toLowerCase();
  return guides.filter((g) =>
    (opts.cat === "all" || g.cat === opts.cat) && (!q || haystack(g).includes(q)));
}

export function guideCounts(
  guides: SetupGuideEntry[], query: string,
): { all: number; desktop: number; mobile: number } {
  const q = query.trim().toLowerCase();
  const m = guides.filter((g) => !q || haystack(g).includes(q));
  return {
    all: m.length,
    desktop: m.filter((g) => g.cat === "desktop").length,
    mobile: m.filter((g) => g.cat === "mobile").length,
  };
}
