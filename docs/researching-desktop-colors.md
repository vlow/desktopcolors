# Researching an OS's background colors from source

How to go from *"what solid background colors could a user of &lt;system&gt; pick?"* to a
finished [`src/content/os/<slug>.json`](../src/content/os) entry, using the system's own
source code and version history as the evidence.

This is the research method that produced the KDE 1 entry
([`kde-1.json`](../src/content/os/kde-1.json)). It is written to be re-run against another
KDE release, another desktop environment, or any OS whose sources are available. For what
to do with the values once you have them, see
[`adding-os-data.md`](adding-os-data.md).

## What counts as an answer

Before searching, decide which of these you are collecting — they live in different places
in a codebase and mixing them silently corrupts the entry:

| Class | What it is | Typical location |
|---|---|---|
| **Palette** | The swatches offered in the color picker — the actual "predefined choices" | The **toolkit / shared library**, not the settings app |
| **Shipped default** | What a fresh install showed before the user touched anything | A packaged config file, plus a hardcoded fallback in code |
| **Historical default** | What the screenshots everyone remembers actually show | Only in **version-control history** |
| **Adjacent, exclude** | Widget/window colors, login-screen colors, per-app backgrounds | Color-scheme files, display-manager configs |

The last row is the one that goes wrong most often. A "background" key in a theme file is
usually the *widget* background, not the desktop root window.

## Prerequisites

- A checkout of the **desktop/shell** sources (the settings app that owns the background).
- A checkout of the **toolkit or base library** the settings app links against. The palette
  is almost always there; without it the research is incomplete.
- Both with **full history**, not a release tarball. History is where the interesting
  defaults are. For KDE 1: `invent.kde.org/historical/kde1-kdebase` and
  `.../kde1-kdelibs` (6193 commits, CVS-converted back to 1997).

If only tarballs exist, the method still works up to step 4, and steps 4–5 degrade to
"diff consecutive releases by hand".

## The method

### 1. Find the module that owns the background

Locate the settings module by directory name, then read its UI construction — not just its
config I/O. The UI tells you whether the user got a free picker or a fixed list.

```bash
ls kcontrol/                                   # settings modules
grep -rn "color" --include="*.h" <module>/     # entry points
```

**Deliverable:** the file and line where the background color widget is created.

### 2. Follow the widget into the toolkit

This is the step people skip. A settings app usually shows a *button*, and the palette
lives one library down.

```bash
grep -rn "ColorButton\|ColorDialog\|getColor" --include="*.cpp" .   # in the app
grep -rn "getColor" --include="*.cpp" <lib>/                        # in the library
```

Read the dialog's constructor and write down **every** swatch it assigns, in order.
Then check for **unassigned cells**: a grid sized N×M but filled with fewer than N·M
colors leaves live, clickable swatches holding whatever the widget's own background is.

Also check for **decoy palettes** in the same file — arrays that exist for dithering,
previewing or icon quantization and are never user-selectable. Confirm the difference by
reading the call sites, not the array name.

**Deliverable:** the ordered palette, plus a note on any cell you excluded and why.

### 3. Harvest shipped defaults, code and data

Two independent sources, and they can disagree:

```bash
grep -rn "DEFAULT_.*COLOR\|readColorEntry\|readEntry( \"Color" --include="*.cpp" --include="*.h" .
ls config/ && cat config/*rc          # what packaging actually installs
grep -rn "COLOR" <module>/config-*.h  # centralized default headers
```

Cross-check against the build files (`Makefile.am`, `*.spec`, `debian/`) to confirm a
config file was *installed* rather than merely present in the tree — an uninstalled file
is not a default.

**Deliverable:** the code fallback, the shipped config value, and which one won.

### 4. Mine the history — the step that finds the screenshots

The default that a generation of screenshots shows is frequently **not** the one in the
final release. Search content across all history rather than reading logs:

```bash
git log --all --oneline -S "<hex-without-#>" -i               # when a value appeared/vanished
git log --all --oneline -S "DEFAULT_COLOR_1" -- <file>        # lifetime of a constant
git log --all --diff-filter=A --name-only --format="COMMIT %h %ad %s" --date=short -- "*rc*"
git show <commit>:<path>                                      # a file as of that commit
git log --oneline --follow -- <path>                          # across renames
```

Read the commit **messages**: maintainers explain default changes, and those sentences are
the best `note` and `description` material you will find.

**Deliverable:** a dated timeline of what the default was, per release window.

### 5. Resolve rendering semantics before recording a gradient

A gradient in a config file is two hex values and an orientation keyword. Which end is
which is decided in code, and the arguments are often swapped between caller and callee.

1. Find the fill function's implementation and determine which parameter lands on the
   **first scanline**.
2. Find each caller and check the argument order — different components in the same
   project may pass them differently.
3. Note quantization: many old fills band the ramp to N colors depending on display depth,
   so the "colors" a screenshot contains are not only the two endpoints.

**Deliverable:** for every gradient, "`#xxxxxx` at top → `#yyyyyy` at bottom", derived,
not assumed.

### 6. Confirm against the shipped documentation

The handbook/manual of the era states what the dialog offered. If it says *"a color
selection dialog"*, that confirms free choice; if it enumerates named colors, the palette
may be data-driven and you missed a file.

```bash
grep -rn -i -A12 "one color\|background color" doc/**/*.sgml
```

### 7. Record it

Follow [`adding-os-data.md`](adding-os-data.md). Mapping from the research to the schema:

- **Palette swatches** → plain `colors` entries, no `note`.
- **Shipped default** → the single `"default": true` entry.
- **Historical / gradient endpoints** → `colors` entries with a `note` naming the exact
  role (`"Used as top color in the desktop 2 gradient."`).
- **A hex that serves two roles** → **one** entry with **one** combined note. The site keys
  swatches by hex; a repeated hex in one file renders as a duplicate swatch.
- **Excluded classes** (widget colors, login screen) → not in `colors`. If they are
  interesting, they belong in the PR description.

## Command cookbook

```bash
# repo has real history?
git log --oneline | wc -l && git log --oneline --reverse | head -3

# every hardcoded hex in code
grep -rnE '"#[0-9a-fA-F]{6}"' --include="*.cpp" --include="*.h" .

# named-constant colors (toolkit globals: darkCyan, lightGray, …)
grep -rni "darkcyan\|lightgray\|readColorEntry" --include="*.cpp" .

# color values in shipped data files (add -a: old rc files are often Latin-1
# and grep otherwise treats them as binary and prints nothing)
grep -a "^background=" *.rc

# which release contains a commit
git branch -a --contains <commit>
```

## Pitfalls

- **The palette is not in the app.** Concluding "there are no predefined colors" after
  reading only the settings module is the default failure mode. Check the toolkit.
- **Widget background ≠ desktop background.** Color-scheme files are full of
  `background=` keys that never touched the root window.
- **Login screen ≠ desktop.** Display-manager configs have their own, often more memorable,
  background — worth documenting, not worth listing as a desktop color.
- **Binary-ish files silently vanish from grep.** Latin-1 `.rc`/`.kcsrc` files need
  `grep -a`, or matches disappear with no error.
- **zsh eats `=` and unquoted globs.** `echo ===` and `--include=*.cpp` both fail; quote
  the patterns and avoid a leading `=`.
- **The commented-out default.** Blocks of `/* config->writeEntry("Color1", ...) */` look
  authoritative and never ran. Check whether the code is live.
- **Toolkit color constants aren't in the checkouts.** `darkCyan` & co. resolve to values
  defined in the toolkit's own sources. If the toolkit isn't available, mark those hexes as
  derived from external knowledge and say so in the PR rather than presenting them as read
  from the tree.

## Worked example: KDE 1 (the trail, for reuse and regression)

| Step | Finding | Evidence |
|---|---|---|
| 1 | Background module = `kcontrol/display/backgnd.cpp`; UI is One Color / Two Color + free picker, no preset list | `backgnd.cpp:249-296` |
| 2 | `KColorButton` → `KColorDialog` in kdelibs; **17** "System Colors" swatches, in an 18-cell grid — cell 17 is never assigned and yields the widget background | `kdeui/kcolorbtn.cpp:52`, `kdeui/kcolordlg.cpp:300-321`, `:180-181` |
| 2 | Decoy: `standardPalette[17]` in the same file is dither-only | `kcolordlg.cpp:47-77`, used at `:116`, `:163` |
| 2 | 18 user-persisted custom slots, `[Custom Colors] Color0..17`; unset = `lightGray` and is ignored on click | `kcolordlg.cpp:666-703`, `:634-641` |
| 3 | Code default `#4682B4` SteelBlue | `kwmmodules/kbgndwm/config-kbgndwm.h:12-13` |
| 4 | Pre-1998-04 code default was `#CCCCCC`; changed to SteelBlue in a commit that names the earlier darkcyan as the thing users hated | `b776d62c2` (1998-04-12) |
| 4 | **The teal desktop gradient**: shipped `config/kdisplayrc`, installed 1998-06-24 → 1998-11-10, `[Desktop2] Gradient #00bfaf / #008080`, `[Desktop1] #000080 / #0004ff` | `038bd5e8d`, `14c6b7cda`, `git show 14c6b7cda^:config/kdisplayrc` |
| 5 | `Portrait` = vertical; `bg.cpp` passes `(color2, color1)` and `kpixmap.cpp` puts arg 2 on the top scanline → **`#00bfaf` top → `#008080` bottom** | `bg.cpp:353-356`, `kdecore/kpixmap.cpp:187-227` |
| 5 | Login screen is the *other* teal gradient, cyan `#00ffff` top → navy `#000080` bottom, and the caller does **not** swap | `kdm/config/kdmrc.in:5-7`, `kdm/kdmdesktop.cpp:155-156` |
| 6 | Handbook confirms a free color dialog | `doc/kcontrol/kcmdisplay/kdisplay.sgml:114-118` |

Palette recorded, in dialog order: `#ff0000` `#00ff00` `#0000ff` `#00ffff` `#ff00ff`
`#ffff00` `#800000` `#008000` `#000080` `#008080` `#800080` `#808000` `#ffffff` `#c0c0c0`
`#a0a0a4` `#808080` `#000000`.

## Adapting to another system

The five questions transfer; only the filenames change. For a new target, first answer:

1. Which component **paints the root window**? (KDE 1: a `kwm` module; later KDE: `kdesktop`
   / `plasmashell`; Xfce: `xfdesktop`; GNOME 2+: `gnome-settings-daemon` / `nautilus`.)
2. Which component **configures** it, and does it show a picker or a list?
3. Where does the **toolkit** keep its palette? (Qt/GTK named colors, a Windows-style
   system palette, a picker with fixed "basic colors".)
4. Where do **packaged defaults** live? (`.rc`/`.ini` under a config dir; GSettings/dconf
   schema `<default>` values; a registry `.INF`/`.reg`; a `defaults.plist`.)
5. Does the project have **history deep enough** to reach the era in the screenshots?

Treat those as hypotheses to confirm in the tree, not as facts — the point of the method is
that every hex in a finished entry traces to a file, a line, and where relevant a commit.
