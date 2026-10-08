# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Bass players (and some guitar players) who own Rocksmith 2014 songs and want to play them without
Steam or Rocksmith itself. They run PumaBass on their own computer and play it on a living-room TV
from the sofa, about three metres away, bass in hand, with a keyboard (often one hand free at best)
and the bass plugged into a Real Tone Cable. "Computer, up close" is the second setting.

The first player is the developer, on a Linux set-top PC under the TV; the product is meant, in time,
for other Rocksmith owners running it on their own PCs and TVs, so a stranger's first visit (no songs
folder chosen, no cable picked, no favorites) has to work as well as the developer's hundredth.

## Product Purpose

A note highway for the Rocksmith 2014 songs the player already owns: point it at a folder of
`.psarc` files and it plays them, bass first, with lead and rhythm guitar charts too. It is for
practice and enjoyment: learning songs, slowing them down, looping the hard part, bringing it back up
to speed, tuning, and learning to read standard notation and tab as the part scrolls past.

Success is a player who gets from the sofa to playing in a couple of key presses, finishes songs,
practises the parts that went badly, and can read the music a little better each week.

## Positioning

It plays the player's own Rocksmith charts and audio, read straight from their song files, with
Rocksmith's own difficulty levels, on a highway that keeps Rocksmith's string colours, and adds what
Rocksmith never had: standard notation over tab, scrolling with the song. Everything runs on the
player's computer; nothing leaves it. Not affiliated with Ubisoft.

## Operating Context

- A local Node server on `localhost:8014` serves the browser UI; browsers only allow the cable or a
  microphone on a localhost page, so the game is played on the computer that runs it.
- Played full screen in a browser kiosk on a TV, or in a normal window at a desk. The couch setting
  draws everything 1.5× on a 1080p TV.
- Rituals: tune (the tuner opens itself on the day's first song and when the tuning changes), pick a
  song, play; pause and come back in with a six-second run-up; loop a section, run the riff repeater;
  read the end screen and practise the red sections.
- Songs: typically a few hundred parts; some charts arrive without audio (Rocksmith 1 imports) and
  wait for the player's own recording.

## Capabilities and Constraints

- Keyboard first: every screen works from the keyboard, each key shown on the control it presses.
- Inputs: the Real Tone Cable (or any audio input) for the tuner, hearing the bass, and scoring.
- The highway's string colours are Rocksmith's and stay: E red, A yellow, D blue, G orange (guitar adds
  B green and e purple). Players know them by heart.
- No songs, audio or album art ship with it; no copyrighted material in the repo.
- No native browser dialogs (alerts, confirms); sheets instead.
- Storage keys are `pumabass_<feature>_v<n>`; Forget everything removes only those.
- Respects reduced motion.

## Brand Commitments

- The name is PumaBass; the wordmark sets "Puma" plain and "Bass" in the accent.
- Part of the greykit.games portfolio (Tactical tribe). The greykit boot, with its mark, stays as the
  studio ident before the game, and `web/js/title.js` stays byte-identical to games-meta's canon; from
  the title screen on, PumaBass has its own look. The credit "Built by greykit.com" stays on the title
  and in About.
- The app icon (`icon.svg`, hand-drawn): four strings in Rocksmith's colours running into the
  distance, a line for "now", notes riding in.
- Voice: plain, friendly, specific; says what happened and what to do next; no jargon a player
  wouldn't use.

## Evidence on Hand

- The player's own song library (not shipped). Screenshots for docs must not show copyrighted album art.
- No testimonials, users or press exist; none may be invented.

## Product Principles

1. From the sofa to playing in two key presses; never nag on the way.
2. The song is the star: the highway and the music come first, chrome stays out of their way.
3. Every screen should lead into the next bit of practice, not back to a menu.
4. Readable from across the room, and never ambiguous about where the focus is.
5. Honest about what it measures: what was scored, what wasn't, and why.

## Accessibility & Inclusion

Ten-foot legibility on a TV; full keyboard operation with a focus state that can't be mistaken for
"selected"; contrast to WCAG AA; reduced motion respected.
