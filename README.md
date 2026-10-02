# Deli-very-dead

A cozy 3D voxel delivery game set in a Halloween-decorated autumn Canada.

Hank the lumberjack was buried alive by accident during an extremely long nap.
The Grim Reaper, embarrassed by the paperwork, brings him back as a rattling
skeleton. Freezing and only technically dead, Hank is taken in by Nana
Marguerite, who wraps him in her late husband's scarf and toque and hires him to
deliver her famous hot cocoa around Maple Cove on Harold's old bicycle.

Each day goes like this: wake up for a breakfast that falls straight through
you, pick orders off Nana's board, ride through the forest and the village while
the cocoa cools, deliver for pay and tips, explore, and come home. There are no bike
upgrades: Bessie is an old 3-speed with a basket, a crate and a lamp, and she
is hard to ride well. Progression is skill. Harold's riding notes in the garage
track wheelies, manuals, stoppies, bunny hops, drifts, spins, flips, wheelie
drops, perfect landings, long jumps and combos, each with three mastery tiers
that you earn by actually pulling the moves off.

Everything runs in the browser. Terrain, voxel models, characters, icons,
music and sound effects are all generated in code; the only asset files are
two pixel fonts.

## Running it

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build in dist/
npm run preview   # serve the build
```

You need a browser with WebGL2. The first time you click or press a key, the
audio starts.

## Controls

| Keyboard | Gamepad | Action |
| --- | --- | --- |
| W / Up arrow | RT | Pedal. Hold it to cruise; tap it in a steady rhythm (about three taps a second) to sprint. Mash it and Hank's foot slips off |
| S / Down arrow | LT | Brake; hold when stopped to roll backwards |
| A D / Left Right arrows | Left stick | Steer (lean into corners; too fast on grass and the tyres let go); spin in the air |
| Space | A | Hold to crouch, let go to bunny hop (crouch about a third of a second for the full pop; pop right at a ramp lip to go higher); jump on foot |
| Q / Right Ctrl | Left stick down | Lean back: wheelie (while pedalling), manual (coasting), backflip (in the air). Tap the brake to save a loop-out |
| F | Left stick up | Lean forward: stoppie (with the brake), nose manual (coasting), frontflip (in the air); kick on foot (F or Q) |
| Shift | RB | Drift (let go for a little kick); run on foot |
| Shift + direction (in the air) | RB + stick | Poses: Superman, No-Hander, Can-Can, Nothin', Skull Toss. Let go before you land |
| E / Enter | X | Talk, deliver, hop off / on the bike, pick things up |
| R | Y | Ring the bell |
| C | | Camera (once Birdie lends you hers) |
| M | Back | The paper map |
| Tab | | Harold's keepsakes |
| Mouse drag | Right stick | Look around |
| Esc | Start | Hank's journal (pause); skips a cutscene while one is playing |

Landings have to match the ground: roughly level with the slope and pointing
the way you're travelling. A perfect landing gives a little burst of speed; a
crooked one wobbles; a bad one is a bail.

On a touch screen, on-screen controls appear after your first tap: a steering
wheel on the left (turn it, it springs back) and pedal, brake, hop, trick,
lean and bell buttons on the right. Touch riding gets assists (steadier
balance, forgiving landings, no slide-outs). On foot the wheel becomes a stick and the
buttons become jump, kick and snap. A paper tag shows whatever you can do right
now; tap it.

## What there is to do

- Deliver Nana's cocoa before it cools. Each cup uses ingredients from her
  pantry; when something runs out, shop at Moose & Goose on the boardwalk and
  bring the groceries home.
- Hop off the bike anywhere. Kick, roll and smash pumpkins and
  jack-o'-lanterns, sit on benches, bonk the giant skeleton bobblehead, stir
  the cauldron, carve a jack-o'-lantern on Nana's porch.
- Chat with villagers for favours: Agnes's three lost cats, lost glasses, puck,
  compass, stethoscope and Mountie hat, six saplings to plant for Gus, bird
  photos for Birdie, a secret letter, pumpkins for the café, pumpkin bowling,
  trick-or-treating after dark, and three flaming trick hoops.
- Crash badly and Hank bursts into bones, then zips back together.

## How it's made

- **Voxels** (`src/voxel`): models are painted in code into voxel grids and
  meshed with face culling, baked ambient occlusion and greedy merging.
  Buildings, Halloween props, trees (with LODs), food and animals each have a
  model module; `tools/voxpreview.html?mod=/src/voxel/models/props.js` previews
  any of them, `tools/charpreview.html` previews the characters.
- **Characters** (`src/game/vchar.js`): jointed voxel rigs with springy
  procedural poses, idle fidgets, cartoon reactions, pixel face decals with
  many expressions, verlet-cloth scarves and capes, held props, bike-riding IK
  and a fall-apart mode.
- **UI** (`src/ui`): almost everything is a physical thing: a pocket watch, a
  coin pouch, Nana's pinned list, a compass, paper prompts, black-and-white
  pixel speech bubbles over the real 3D speaker, a journal book, a paper map,
  the Gazette for day banners.

## How it's made

- **Rendering** (`src/render`): three.js draws into a low-resolution HDR
  target. A post pass adds height fog with sun scattering, depth-edge outlines,
  screen-space god rays, bloom, colour grading, and ordered dithering with
  palette quantisation. Water uses planar reflections.
- **World** (`src/world`): a heightmap valley with a river, a coastline and
  roads stamped into it. The forest is about 12,000 instanced billboard trees
  built from pixel-art leaf clumps that are lit with banded "pixel" lighting
  and backlit translucency. Instanced grass follows the camera. The village,
  cabin, cemetery and props are merged into one mesh per area from a
  procedural texture atlas.
- **2D art** (`src/art`): food icons, emotes, particles and other pixel art are
  painted in code.
- **Game** (`src/game`): bicycle physics with momentum, rhythm pedalling,
  spring-lean cornering and grip limits, wheelies, manuals and stoppies as
  balancing inverted pendulums, crouch-and-pop hops, air spins and flips with
  landing checks, foot dabs, kerb bumps and comic bails; skill tracking
  (`skills.js`), tricks and combos, a chase camera with punch-ins and
  hit-stop, cutscene scripting, orders whose cocoa cools as you ride,
  keepsakes, villagers, wildlife, a day/night cycle, weather, and saving to
  localStorage. `node`-friendly: `Bike` only needs a physics object with
  `groundAt` and `resolve`, so it can be driven by scripted inputs.
- **Audio** (`src/audio`): a WebAudio synth for sound effects, character voice
  blips, adaptive music, ambience, and bicycle and motor sounds. Open
  `/src/audio/test.html` in the dev server to audition the sounds.

## Debug URL parameters

These are useful while developing:

- `?start=ride` starts riding straight away (`&spawn=x,z,yaw`, `&day=3`,
  `&money=200`, `&skills=max` or `&skills=1` to pre-fill Harold's notes,
  `&assist=1` / `&assist=0` to force riding assists, `&nofreeze` to turn off
  hit-stop, `&cat=1`)
- `?start=intro` plays the new-game story
- `?scene=morning|cabinNight|garageReveal|villagePanic|catRescue|ending`
  plays a single story beat
- `?hour=19.5&weather=rain|snow|misty|overcast|breezy|clear`
- `?cam=x,y,z,lx,ly,lz` opens a free camera, which is handy for screenshots
- `?px=2` sets the pixel size, `?noshadow` turns shadows off

Graphics quality drops automatically if the frame rate stays low. Picking a
quality or pixel size in Settings turns that off.

## Credits

- Fonts: [monogram](https://datagoblin.itch.io/monogram) by datagoblin (CC0)
  and [BoldPixels](https://yukipixels.itch.io/boldpixels) by YukiPixels
  (CC BY-SA 4.0).
- Everything else is generated in code.
