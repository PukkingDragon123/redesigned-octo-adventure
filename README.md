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

- **Story** (`src/game/prologue.js`, `story.js`): the prologue is staged in
  3D. Hank, still alive and bearded, fells one last maple at the lumber camp,
  lies down in the leaves "for one minute" and gets declared dead. The whole
  village turns out for his funeral in the rain (he snores in the coffin), the
  years go by over his grave through snow, spring and autumn, and then the
  Reaper notices the paperwork mistake. Scenes use real actors, scene-only
  voxel props (`src/voxel/models/lore.js`), front-on face shots and timed
  effects.
- **Loading and title** (`src/boot/loader3d.js`, `src/ui/title.js`): the
  loading screen is a 3D scene drawn through the game's own renderer while
  the world builds. Hank sprints down a spooky road and keeps losing his head.
  The title is a live dusk shot of him on Bessie outside Nana's cabin, with a
  pixel logo painted in code.
- **Voxels** (`src/voxel`): models are painted in code into voxel grids and
  meshed with face culling, baked ambient occlusion and greedy merging.
  Buildings, Halloween props, food, animals and characters each have a model
  module; `tools/voxpreview.html?mod=/src/voxel/models/props.js` previews any
  of them, `tools/charpreview.html` previews the characters.
- **Forest** (`src/world/voxelForest.js`, `src/voxel/models/trees.js`): every
  tree is voxel, from 0.125 m voxels up close to coarser LODs and camera-facing
  cards rendered from the same models at the horizon. Models are baked in Web
  Workers, instanced, culled to the view, and sway in the wind. Mushrooms,
  saplings, stumps and mossy logs fill the forest floor.
- **World** (`src/world`): a heightmap valley with a river, beaches and roads
  stamped into it from `layout.js`. Maple Cove has a straight Main Street with
  sidewalks, crosswalks and lamp posts, a post office, donut shop, Café Érable,
  Moose & Goose, a fire hall, a police post, a poutine shack, a town green with
  a gazebo and cenotaph, a hockey rink, a harbour with docks and a lighthouse.
  Out in the country there's a red-barn farm with a pumpkin patch and corn
  maze, a sugar shack, a campground, a covered bridge, a bike park, a beach
  with a lifeguard tower and a fish & chips shack, and signposts at every
  junction. Buildings are meshed in Web Workers. The sea uses Gerstner waves
  with surf that follows the shoreline, foam, swash and wet sand.
- **Characters** (`src/game/vchar.js`): jointed voxel rigs with springy
  procedural poses, idle fidgets, cartoon reactions, pixel face decals with
  many expressions, verlet-cloth scarves and capes, held props, bike-riding IK
  and a fall-apart mode.
- **Creatures and effects** (`src/game/critters2d.js`, `src/game/effects.js`):
  2D pixel-art deer, rabbits, foxes, squirrels, songbirds, geese, gulls,
  ducks, frogs, trout, butterflies, bats, owls and ghost wisps, sculpted in
  code into shaded sprites with several view angles. They live alongside the
  voxel animals and react to Hank. Particles are instanced: outlined toon
  smoke, impact stars, bouncing debris, skid marks, splash crowns and anime
  speed lines.
- **UI** (`src/ui`): a pixel kit of leather panels with gold filigree, buttons,
  slots, books and bezels (`kit.js`, `kitart.js`), shaded 32 px icons
  (`src/art/icons.js`), and black-and-white speech bubbles over the real 3D
  speaker. Everything is drawn on one integer pixel grid so it stays crisp.
  Touch controls have a steering wheel and chunky buttons for pedal, brake,
  hop, drift, wheelie and stoppie.
- **Rendering** (`src/render`): three.js renders at native resolution (or
  above it on high-DPI screens) into an HDR target. A post pass adds height fog
  with sun scattering, cartoon depth-edge outlines, screen-space god rays,
  bloom, colour grading and FXAA. The 'Retro' and 'Chunky' resolution settings
  bring back the old low-resolution, dithered pixel look. Water uses planar
  reflections.
- **Game** (`src/game`): bicycle physics with momentum, rhythm pedalling,
  spring-lean cornering and grip limits, wheelies, manuals and stoppies as
  balancing inverted pendulums, crouch-and-pop hops, air spins and flips with
  landing checks, foot dabs, kerb bumps and comic bails; skill tracking
  (`skills.js`), tricks and combos, a chase camera with punch-ins and
  hit-stop, cutscene scripting, orders whose cocoa cools as you ride,
  keepsakes, villagers, wildlife, a day/night cycle, weather, and saving to
  localStorage. `Bike` only needs a physics object with `groundAt` and
  `resolve`, so `node tools/biketest.mjs` can drive it with scripted inputs.
- **Audio** (`src/audio`): a WebAudio synth for sound effects, character voice
  blips, adaptive music and ambience. Open `/src/audio/test.html` in the dev
  server to audition the sounds.

## Debug URL parameters

These are useful while developing:

- `?start=ride` starts riding straight away (`&spawn=x,z,yaw`, `&day=3`,
  `&money=200`, `&skills=max` or `&skills=1` to pre-fill Harold's notes,
  `&assist=1` / `&assist=0` to force riding assists, `&nofreeze` to turn off
  hit-stop, `&cat=1`)
- `?start=intro` plays the new-game story
- `?scene=lumberCamp|funeral|yearsPass|revival|nanaFindsHank` plays one part of
  the prologue; `?scene=cabinNight|morning|garageReveal|villagePanic|catRescue|ending`
  plays a later story beat (add `&autotalk` to advance the dialogue by itself)
- `?loaderonly=60` shows just the loading scene for 60 seconds (`&pop=1` drops
  the head sooner)
- `?critters=deer:2:10,robin:4:5` places 2D animals in front of the camera
  (`&calm` stops them fleeing)
- `?hour=19.5&weather=rain|snow|misty|overcast|breezy|clear`
- `?cam=x,y,z,lx,ly,lz` opens a free camera, which is handy for screenshots
- `?px=1` sets CSS pixels per rendered pixel (0.5 high-DPI, 1 HD, 2-3 retro),
  `?noshadow` turns shadows off

Graphics quality drops automatically if the frame rate stays low. Picking a
quality or pixel size in Settings turns that off.

## Credits

- Fonts: [monogram](https://datagoblin.itch.io/monogram) by datagoblin (CC0)
  and [BoldPixels](https://yukipixels.itch.io/boldpixels) by YukiPixels
  (CC BY-SA 4.0).
- Everything else is generated in code.
