---
name: PumaBass
description: A note highway for the Rocksmith 2014 songs you own, played from the sofa; the rhythm-game standard in greykit's Tactical colours.
colors:
  stage-navy: "#05070f"
  panel-navy: "#0a0e1a"
  panel-navy-2: "#0d1424"
  rule-navy: "#1b2540"
  lit-slate: "#47609c"
  row-hover: "#0f1628"
  highway-black: "#0d0f14"
  tile-top: "#121b2e"
  tile-bottom: "#0b1220"
  default-top: "#18304a"
  default-bottom: "#0f2034"
  pick-top: "#0d2431"
  pick-bottom: "#0a1823"
  sheet-top: "#0f172a"
  sheet-bottom: "#0a0e1a"
  headline-white: "#dbe4fb"
  read-ink: "#a9b4d2"
  dim-ink: "#7d8aa8"
  steel: "#94a0c4"
  live-cyan: "#54f2ff"
  bar-top: "#7af5ff"
  bar-bottom: "#45e3f2"
  bar-ink-2: "#16384a"
  bar-faint: "#2bb3c4"
  bar-warn: "#5a3a00"
  edge-white: "#ffffff"
  amber: "#ffb000"
  danger-red: "#ff5266"
  good-green: "#4ade6a"
  own-violet: "#b47dff"
  string-e: "#e8413c"
  string-a: "#f2c623"
  string-d: "#2e8ff0"
  string-g: "#f5892a"
  string-b: "#3fc75e"
  string-high-e: "#b351e8"
typography:
  display:
    fontFamily: "Saira Condensed, Arial Narrow, sans-serif"
    fontSize: "72px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Saira Condensed, Arial Narrow, sans-serif"
    fontSize: "40px"
    fontWeight: 800
    lineHeight: 1
  title:
    fontFamily: "Saira Condensed, Arial Narrow, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    letterSpacing: "0.02em"
  name:
    fontFamily: "Saira Condensed, Arial Narrow, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    letterSpacing: "0.01em"
  subhead:
    fontFamily: "Saira Condensed, Arial Narrow, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    letterSpacing: "0.06em"
  body:
    fontFamily: "Saira, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.45
  body-lead:
    fontFamily: "Saira, Segoe UI, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1.4
  label:
    fontFamily: "Saira, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    letterSpacing: "0.1em"
  key:
    fontFamily: "Saira, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
rounded:
  pip: "2px"
  key: "4px"
  check: "5px"
  tile: "6px"
  panel: "12px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
components:
  button:
    backgroundColor: "{colors.tile-top}"
    textColor: "{colors.headline-white}"
    rounded: "{rounded.tile}"
    padding: "5px 12px"
    height: "36px"
  button-primary:
    backgroundColor: "{colors.default-top}"
    textColor: "{colors.headline-white}"
    rounded: "{rounded.tile}"
    padding: "5px 12px"
  button-selected:
    backgroundColor: "{colors.pick-top}"
    textColor: "{colors.headline-white}"
    rounded: "{rounded.tile}"
  button-focus:
    backgroundColor: "{colors.bar-top}"
    textColor: "{colors.stage-navy}"
    rounded: "{rounded.tile}"
  menu-tile:
    backgroundColor: "{colors.tile-top}"
    textColor: "{colors.headline-white}"
    typography: "{typography.name}"
    rounded: "{rounded.tile}"
    padding: "0 18px"
    height: "52px"
  song-row:
    textColor: "{colors.headline-white}"
    rounded: "{rounded.tile}"
    padding: "0 14px"
    height: "60px"
  song-row-focus:
    backgroundColor: "{colors.bar-top}"
    textColor: "{colors.stage-navy}"
  key-cap:
    textColor: "{colors.read-ink}"
    typography: "{typography.key}"
    rounded: "{rounded.key}"
    padding: "0 6px"
  chip:
    backgroundColor: "{colors.panel-navy}"
    textColor: "{colors.headline-white}"
    rounded: "{rounded.tile}"
    padding: "4px 12px"
  panel:
    backgroundColor: "{colors.panel-navy}"
    rounded: "{rounded.panel}"
  sheet:
    backgroundColor: "{colors.sheet-top}"
    rounded: "{rounded.panel}"
    padding: "16px 20px 20px"
  input:
    backgroundColor: "{colors.tile-top}"
    textColor: "{colors.headline-white}"
    rounded: "{rounded.tile}"
    padding: "5px 10px"
    height: "36px"
---

# Design System: PumaBass

## Overview

**Creative North Star: "The Lit Stage"**

PumaBass looks like a rhythm game made with care, played from a sofa three metres from a TV. A dark stage (navy ground, a truss, amps either side, a highway running into the distance) sits behind everything; on it stand glossy navy tiles lit from above, heavy condensed caps leaning forward into the music, and one bright cyan selection bar that always says where you are. It is the category standard (the canon rhythm-game menu and song list) played straight, in greykit's Tactical palette.

The system is dense where the player scans (the song list) and huge where the player only needs one fact (PAUSED, the score, the tuner's note). Everything is drawn for ten-foot legibility first: a couch zoom draws any big screen as a 1280 x 720 window, so a 1080p TV gets every element at 1.5x together. The highway and the music are the star; chrome sits over the highway's edges in fades of the stage navy and stays out of the way.

The world refuses the terminal costume (monospace everywhere, hairline boxes) and any ambiguity between "focused" and "selected". Cyan is the one live colour; amber speaks only for difficulty and tunings; Rocksmith's string colours live only on the highway and its echoes (the stage backdrop, the tuner's strings).

**Key Characteristics:**
- Navy stage ground with a cyan truss light; tiles as gradients lit from above with a 6% white top highlight.
- Saira Condensed 800, uppercase, skewed -10deg for headings, menu labels, group headings and the one big thing on a screen.
- Song names upright Saira Condensed 700 in mixed case; everything read in Saira 500.
- The focus bar: a cyan gradient bar, navy text, a white edge stripe on the left, lifted and slightly scaled.
- Every key shown on the control it presses, in a small key cap.
- Built on greykit canon: the token block and the title/sheet markup are shared with the portfolio and restyled, never edited.

## Colors

A cold navy stage with a single electric cyan, amber as the one secondary voice, and Rocksmith's string colours fenced off on the highway.

### Primary
- **Live Cyan** (live-cyan): the one live colour. Group headings, the wordmark's "Bass", the PumaBass brand mark on the song list, section names, the playhead glow, the loop region, the title rule, toast borders, the selected outline. Never a fill except as the focus bar.
- **Focus Bar Cyan** (bar-top to bar-bottom): the vertical gradient of the focus bar and nothing else. Text on it is Stage Navy; secondary text on it is Bar Ink 2 (bar-ink-2), difficulty pips off are Bar Faint (bar-faint), a non-standard tuning on it is Bar Warn (bar-warn).
- **Edge White** (edge-white): the 6px stripe at the left of the focus bar, and the 3px ring that marks focus on ranges, checkboxes and disclosure summaries.

### Secondary
- **Amber** (amber): difficulty pips, non-standard tunings, the "not scored" chip, warnings, the amps' LEDs and the tuner's needle while off pitch.

### Tertiary
- **Good Green** (good-green): in tune, the countdown's "go", level meters, the end screen's cheer (the amps' LEDs turn green when a song is played through).
- **Danger Red** (danger-red): a favourite heart, danger buttons.
- **Own Violet** (own-violet): marks a part the player recorded audio for.

### Neutral
- **Stage Navy** (stage-navy): the page ground and the ink on the focus bar.
- **Panel Navy** (panel-navy), **Panel Navy 2** (panel-navy-2): panels, chips, tracks behind progress and meters.
- **Tile Top / Tile Bottom** (tile-top, tile-bottom): every button, input and select, as a top-lit gradient.
- **Default Top / Default Bottom** (default-top, default-bottom): the brighter tile of the default action.
- **Pick Top / Pick Bottom** (pick-top, pick-bottom): the faintly teal tile of a selected toggle, under its cyan outline.
- **Sheet Top / Sheet Bottom** (sheet-top, sheet-bottom): sheets, the player's side panel, the toast.
- **Rule Navy** (rule-navy): every border and divider.
- **Lit Slate** (lit-slate): hover borders, key-cap borders, the default action's border, empty difficulty pips, idle hearts.
- **Row Hover** (row-hover): a song row under the mouse.
- **Highway Black** (highway-black): the canvas behind the highway.
- **Headline White** (headline-white): headings, names, values, button text.
- **Read Ink** (read-ink): body text; lighter than the canon's ink, for the sofa.
- **Dim Ink** (dim-ink): artists, column heads, notes, secondary facts.
- **Steel** (steel): links (canon) and the notation's ink.

### Fixed: Rocksmith string colours
- **E red, A yellow, D blue, G orange** (string-e, string-a, string-d, string-g), and for guitar **B green, high e purple** (string-b, string-high-e). Players know them by heart; they are not part of the palette and are not restyled. They appear on the highway (highway.js), faintly in the stage backdrop, and as the top border of each tuner string.

### Named Rules
**The One Live Colour Rule.** Cyan is the only colour that means "here" or "now". No other hue marks focus, the playhead, or a live heading.

**The Fenced Strings Rule.** Rocksmith's string colours belong to the highway and its echoes (backdrop, tuner). Chrome never borrows them for status or decoration.

**The Amber Speaks Twice Rule.** Amber is for difficulty and tunings (and warnings); it never marks focus or a primary action.

## Typography

**Display Font:** Saira Condensed 700/800 (with Arial Narrow, sans-serif), self-hosted from web/fonts, OFL
**Body Font:** Saira variable 100-900 (with Segoe UI, system-ui, sans-serif), self-hosted, OFL

**Character:** A sporty condensed grotesque leaning forward for anything named or announced, over its own wide sibling for everything read; one family, two widths, so the pairing is loud without clashing.

### Hierarchy
The scale is written before the couch zoom (a 1080p TV draws it 1.5x).
- **Display** (Saira Condensed 800, 72px and up, line-height ~1): the one big thing on a screen. The title wordmark (80px), PAUSED and the countdown (clamp 44-150px), the score (104px), the tuner's note (72px). Uppercase and leaning where it is a word; numbers lean too.
- **Headline** (Saira Condensed 800, 40-52px): screen titles. SONGS, the end screen's song title (52px), the song caption (52px, -8deg).
- **Title** (Saira Condensed 800, 28px, 0.02em): sheet headings, list group headings (cyan), the player's wordmark, loading.
- **Name** (Saira Condensed 700, 24px): song names (upright, mixed case), menu items (leaning caps), the Mix's panel heading, tuner string names.
- **Subhead** (Saira Condensed 700, 18px, 0.04-0.06em, uppercase, cyan): headings inside sheets and the side panel, section names, disclosure summaries.
- **Body Lead** (Saira 500, 20px, 1.4): a sentence that matters (the end screen's verdict), balanced.
- **Body** (Saira 500, 16px, 1.45): everything read. Button text is Saira 600; times and counts use tabular figures.
- **Label** (Saira 700, 14px, 0.1em, uppercase, dim): column heads only.
- **Key** (Saira 700, 14px): key caps and small notes.

### Named Rules
**The Lean Rule.** Headings, menu labels, group headings and big announcements are uppercase Saira Condensed skewed -10deg. Text that is read rather than announced stays upright.

**The Upright Names Rule.** Song names are Saira Condensed 700, mixed case, upright. Rows of 30-plus-character titles are read at a glance from the sofa; the lean costs legibility there.

**The Floor Is Sixteen Rule.** Nothing read is smaller than 16px before the zoom; 14px is for key caps, column heads and notes only.

## Layout

Screens are fixed layers over the stage backdrop. The title is a centred column: the wordmark at the top, a short skewed cyan rule (220 x 4px), a menu of full-width tiles up to 460px, the greykit credit at the foot. The song list is one glossy panel up to 1100px wide, centred on the stage with 32/24px of stage around it: a header (title, count, brand mark), a 3px cyan-fading rule, a wrapping tool row, sticky-looking column heads, then a grid of rows (heart, song and artist, part, difficulty, tuning, plays, finished, length) with a 12px column gap.

The player gives the whole window to the highway; chrome sits over its edges in fades of the stage navy (top bar fading down, bottom bar fading up over a 24px section-coloured progress track). The side panel docks bottom right (380px). Overlays (PAUSED, countdown, caption, lyrics, sync bar) never take clicks.

Spacing runs on a 4px base (4, 8, 12, 16, 24, 32). Rows are 60px tall, menu tiles 52px, buttons 36px.

The couch zoom is the responsive model for big screens: from 1500 x 840 a couch screen zooms 1.25x, from 1880 x 1040 1.5x, 2500 x 1400 2x, 3800 x 2100 3x; anything that fills the viewport divides by the zoom. Below 720px the song list drops to song name and part, and the stage padding collapses.

**The Zoom Not Type Rule.** On a big screen everything grows together through the couch zoom; individual type sizes are never bumped for TV.

## Elevation & Depth

Depth is literal and gamey: tiles are top-lit gradients with a 6% white inner highlight and a short drop shadow; panels and sheets float on deep, wide shadows over the stage; the focus bar lifts off its row with a cyan glow. The big type (title, PAUSED, score) carries a soft dark text shadow so it holds up over the stage or the highway.

### Shadow Vocabulary
- **Tile** (`box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 2px 6px rgba(0,0,0,.35)`): every button, input and menu tile at rest.
- **Focus lift** (`box-shadow: -6px 0 0 #ffffff, 0 10px 30px rgba(84,242,255,.22)` with `transform: scale(1.04)`; menu tiles 1.05): the focus bar's white edge stripe and cyan glow. A focused song row uses the same lift at scale 1.015.
- **Panel** (`box-shadow: 0 40px 120px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.05)`): the song list panel.
- **Sheet** (`box-shadow: 0 30px 90px rgba(0,0,0,.7)`): sheets and the player's side panel.
- **Toast** (`box-shadow: 0 10px 30px rgba(0,0,0,.5)`).

### Named Rules
**The Lit From Above Rule.** A surface is a vertical gradient, lighter at the top, with a faint white top edge. Flat fills are for tracks and grounds, not for things you press.

**The Lift Means Focus Rule.** Only the focused thing scales up and glows. Selection never lifts.

## Shapes

Gently rounded rectangles throughout: 6px for tiles, buttons, rows, chips and inputs; 12px for panels and sheets; 4px for key caps; 2px for difficulty pips. Forward motion comes from skew, not from shape: headings and pips lean -10deg, the title rule leans -20deg. Icons are drawn SVG at one stroke weight (2.4 on 24), applied as masks so they take the text colour (heart, check, close, chevron).

## Components

### Buttons
Tactile tiles you can read from the sofa, each carrying its key.
- **Shape:** gently rounded (6px), 36px minimum height, 5px 12px padding, Saira 600.
- **Default:** tile gradient, Rule Navy border, Headline White text, tile shadow.
- **Hover:** border turns Lit Slate.
- **Primary (the default action):** the brighter Default gradient with a Lit Slate border and its key cap lit cyan; no outline, no fill.
- **Selected (a toggle that is on):** the Pick gradient under a cyan outline. Nothing else wears the cyan outline.
- **Focus:** the focus bar (Focus Bar Cyan gradient, Stage Navy text, white edge stripe, cyan glow, scale 1.04); the key cap on it turns navy and loses its fill.
- **Danger:** red border and red text on the tile.
- **Disabled:** 40% opacity.
- **Transitions:** transform and border over .15s on `cubic-bezier(.22, 1, .36, 1)`.

### Key caps
Saira 700 14px in Read Ink on a 6% white fill, 1px Lit Slate border, 4px radius, 0 6px padding, 8px from its label. On the focus bar the cap goes navy-on-cyan; in a sentence it sits like a word (2px margins).

### Menu tiles (title screen)
Full-width 52px tiles in the canon menu, restyled: Saira Condensed 700 24px leaning caps, a key cap at the left, a dim Saira note at the right (e.g. "230 bass parts"). The default tile is the brighter Default gradient; the focused one becomes the focus bar at scale 1.05.

### Song rows
60px rows inset 18px in the list panel, rounded 6px, a Rule Navy divider beneath. Name in upright Saira Condensed 700 24px over the artist and album in Dim Ink; part, difficulty pips, tuning (amber unless standard), plays, finished and length (tabular). Hover tints Row Hover. Focus puts the whole row on the focus bar at scale 1.015, every cell recoloured for navy-on-cyan. A part with no audio dims its name.

### Difficulty pips
Five 7 x 16px bars, 3px apart, 2px radius, leaning -10deg; lit pips in Amber, unlit in Lit Slate (on the focus bar: navy and Bar Faint).

### Group headings
Saira Condensed 800 28px uppercase in Live Cyan, leaning, 22px above, with a Rule Navy underline: Recently played, then initials, tunings or difficulty as sorted.

### Inputs / Fields
- **Style:** the tile gradient and border, 6px radius, 5px 10px padding, Dim Ink placeholder.
- **Focus:** the focus bar, placeholder in Bar Ink 2.
- **Checkbox:** a 22px Stage Navy tile with a 1.5px Lit Slate border (5px radius) that fills cyan with a navy tick when checked; focus is a 3px white ring.
- **Range:** native with cyan accent; focus is a 3px white ring.

### Chips
Panel Navy at 90%, Rule Navy border, 6px radius, 4px 12px, Saira 600 16px. Status variants recolour text and border (score in cyan, "not scored" in amber).

### Panels and sheets
The song list panel and every sheet (Settings, Help, About, questions, tuner, end screen) are 12px-rounded surfaces with a Rule Navy border and a deep shadow; sheets use the Sheet gradient, the end screen a near-opaque tile gradient. Sheet headings are leaning Title caps; inner headings are cyan Subheads. Scrolling bodies fade at top and bottom. The close control reads "Esc" in a key cap plus a drawn X. Rarely needed settings fold under a cyan disclosure with a drawn chevron.

### Player chrome
A top bar fading from the stage navy (wordmark, chips, heart), a bottom bar fading up to it: the progress track (24px, 6px radius) carries a block per section coloured by kind with 2px gaps, the loop region in translucent cyan between cyan edges, and a 3px white playhead with a cyan glow. Controls are 16px buttons, cyan section name, tabular time.

### Lyrics
The song's words sit centred in the top bar, between the wordmark and the score: the line being sung in Saira 700 at 26px, upright (it's read), the syllables still to come in ink, those sung in text, the one being sung in the accent; the next line under it, the same size, in ink. They advance like a scroll: when a line is sung it moves up and fades, the next moves up into its place, and the one after fades in under it (fades only, under reduced motion). A dark halo holds them over the highway, and they never take clicks. Y or Settings turns them off.

### Big announcements
PAUSED and the countdown sit at 24% from the top, leaning Display caps; PAUSED sits on a horizontal cyan haze with the keys listed below in a dark rounded strip; the countdown ticks in from 1.35x (none under reduced motion), "go" in green. The song caption credits the song lower left like a music video, then fades.

### Tuner
Six (or four) string cards with a 3px top border in the string's Rocksmith colour; the current string gets a cyan outline, a tuned one a green tick. A 72px note name, a meter with a green in-tune zone and an amber needle that turns green in tune.

### End screen
The stage behind, dimmed; the song title as a leaning Headline, the score as a 104px leaning Display figure, an accuracy strip by section (red to green, red is where to practise), the verdict as a balanced 20px sentence, and a row of actions with Play again focused. When a song is played through, the lights come up and the amps' LEDs go green.

### Notation band (out of scope of the look)
Standard notation over tab (VexFlow) scrolls in a 196px band over the top of the highway, documented as it is: Steel ink, quiet #3a4a78 stave lines, bold near-white fret numbers and note names with a dark halo, tab number backings transparent so the highway shows through, a cyan playhead. It is not restyled with the rest of the world.

### Greykit canon (constraint)
The opening token block in web/style.css (between `@gk-tokens-begin` and `@gk-tokens-end`) is greykit.games canon and stays byte-identical across games; PumaBass's tokens follow it and may override a canon value (Read Ink overrides the canon ink). web/js/title.js (boot ident, title and sheet markup) is canon and untouched; PumaBass restyles the title and sheets only through `html`-prefixed selectors in style.css. The greykit boot stays as the studio ident and "Built by greykit.com" stays on the title and in About.

## Do's and Don'ts

### Do:
- **Do** mark the item you're on with the focus bar (cyan gradient, Stage Navy text, 6px white edge stripe, lift) and only the focus bar.
- **Do** mark a selected toggle with the cyan outline over the Pick gradient, never with a fill.
- **Do** show every key on the control it presses, in a key cap.
- **Do** set headings, menu labels and group headings in Saira Condensed 800 uppercase skewed -10deg; keep song names upright Saira Condensed 700 in mixed case.
- **Do** build pressable surfaces as top-lit gradients (tile-top to tile-bottom) with the 6% white top highlight.
- **Do** keep read text at 16px or more before the couch zoom, and let the zoom, not bigger type, carry the TV.
- **Do** keep Rocksmith's string colours exactly as they are, on the highway and its echoes only.
- **Do** honour reduced motion: ticks, captions, the cheer and the tuner's needle drop their animation.
- **Do** restyle canon markup (title, sheets) from style.css with `html`-prefixed selectors; leave the canon token block and title.js untouched.

### Don't:
- **Don't** make "selected" look like "focused": no cyan fill, lift or white stripe on a selected item.
- **Don't** put on the terminal costume: monospace everywhere, hairline boxes.
- **Don't** use a second live colour; amber is for difficulty, tunings and warnings, never focus.
- **Don't** lean song names or any text that is read rather than announced.
- **Don't** use native browser dialogs; ask in a sheet.
- **Don't** use text glyphs or icon fonts for icons; draw them as one-weight SVG masks.
- **Don't** restyle the notation band to match the chrome.
