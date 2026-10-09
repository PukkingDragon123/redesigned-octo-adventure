# Deli-very-dead

A cozy 3D voxel and pixel-art delivery game set in autumn Canada.

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
| W and S / Up and Down, one after the other | Right stick turned in circles, or RT and LT one after the other | Pedal. You turn the crank yourself: each time the other foot goes down it winds on half a turn (holding a key does nothing). Spin faster to go faster: the three gears change by themselves, and top gear wants quick feet. Stop spinning and Bessie coasts; nothing pedals for you. Spinning flat out winds Hank (he slows down and wobbles until he gets his breath back) |
| Mouse: drag round the crank | | Pedal with the mouse: drag in circles round the chainring, bottom right (backwards back-pedals) |
| S / Down held on its own | LT held | Brake (a back-pedal on the stick or the crank brakes too); hold when stopped to roll backwards |
| A D / Left Right arrows | Left stick | Steer (lean into corners; too fast on grass and the tyres let go); spin in the air |
| Space | A | Hold to crouch, let go to bunny hop (crouch about a third of a second for the full pop; pop right at a ramp lip to go higher); jump on foot |
| Q / Right Ctrl | Left stick down | Lean back: wheelie (while pedalling), manual (coasting), backflip (in the air). Tap the brake to save a loop-out |
| F | Left stick up | Lean forward: stoppie (with the brake), nose manual (coasting), frontflip (in the air); on foot, kicks whatever kickable thing is right there (F or Q) |
| Shift | RB | Drift (let go for a little kick); hold to run on foot (or push the stick right out) |
| Shift + direction (in the air) | RB + stick | Poses: Superman, No-Hander, Can-Can, Nothin', Skull Toss. Let go before you land |
| E / Enter | X | Talk, deliver, hop off / on the bike, pick things up; on foot next to a pumpkin, a bin or a tree: kick it (F / Q / B too) |
| R | Y | Ring the bell |
| C | | Camera (once Birdie lends you hers) |
| M | Back | The paper map |
| Tab | | Harold's keepsakes |
| Mouse drag (right button) | Right stick (on foot) | Look around |
| Esc | Start | Hank's journal (pause); skips a cutscene while one is playing |

Landings have to match the ground: roughly level with the slope and pointing
the way you're travelling. A perfect landing gives a little burst of speed; a
crooked one wobbles; a bad one is a bail.

On a touch screen, on-screen controls appear after your first tap: a floating
steering stick on the left (pull it back to wheelie, push it up for a stoppie)
and, bottom right, Bessie's crank: circle your thumb round the chainring to
pedal (backwards brakes), with brake, hop, trick and bell buttons round it.
The crank also shows the gear (the chain hops across three rear cogs), whether
the pedals are catching the back wheel, and how winded Hank is (the brass glows
red and the chain sags). Touch riding gets assists (steadier balance, forgiving
landings, no slide-outs). On foot the stick walks (a gentle push ambles, all
the way out runs) and there is a jump button; a paper tag shows whatever you can
do right here (talk, hop on, kick the pumpkin...): tap it.

Crash with cocoa in the crate and the cups go flying: every cup loses a chunk of
its heat, more the harder the crash.

## What there is to do

- Deliver Nana's cocoa before it cools. Each cup uses ingredients from her
  pantry; when something runs out, shop at Moose & Goose on the boardwalk and
  bring the groceries home.
- Pick the day's orders in Nana's order book, carry the cups out and load
  them into Bessie's crate; they ride behind the saddle, steaming.
- Hop off the bike anywhere. Kick pumpkins, knock over trash cans, fences,
  crates and barrels, upset the fish stall on the boardwalk (the fish flop),
  sit on benches, and walk around inside Nana's cabin: sit by the fire, look
  at Harold's photos, talk to Nana.
- Ride into a tree and Hank goes flying while the tree shakes its leaves loose.
- The village is holding a pumpkin carving contest on Main Street, the first
  thing you see riding in from Nana's. Gus hosts it with a dented tin megaphone:
  he strolls the tables, leans in, hums, points and has his say, calls the
  finished pumpkins and hands out the hourly ribbons, and the crowd cheers
  (pennants, jumping kids, "Hooray!"). The first time Hank shows up, the whole
  crowd screams and hides behind the tables and hay bales; they drift back to
  their pumpkins as they get used to him.
- Carve a pumpkin at Hank's own little table at the west end of the contest
  (once a day): drag on the big pixel pumpkin to cut (knife for thin lines,
  scoop for big bites, undo, an optional faint stencil), 75 seconds on the
  clock. Cuts glow with the candle inside; ring a bit and it drops in; cut right
  across the face and it caves in. Gus and Dr. Ingrid judge it on eyes, mouth,
  nose, symmetry, how much is cut and style, and Gus announces the ribbon. The
  face is saved and stands on the table as a glowing carved voxel pumpkin.
  (`?scene=carve` opens it straight away; `node tools/carvetest.mjs` checks the
  scoring, the saved mask and the models.)
- On the first evening a stray cat is out walking the road home; go slowly and
  she comes to you, rush her and she bolts.
- Chat with villagers for favours: Agnes's three lost cats, lost glasses, puck,
  compass, stethoscope and Mountie hat, six saplings to plant for Gus, bird
  photos for Birdie, a secret letter, pumpkins for the café, lawn bowling,
  harvest supper invitations, and Lou's stunt bet.
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
  loading screen is plain black with no text: the 3D voxel Hank runs on the
  spot over a pixel-art skull in a red toque that fills bone-white as the game
  loads, its eyes lighting up at the end. The title is a live establishing shot of Maple
  Cove on an autumn morning, drawn by the world renderer: three slow camera
  moves (Main Street from over the sea, the pumpkin carving contest, the
  harbour), the villagers on their routines, Hank pedalling Bessie through town
  with a crate of cocoa and the snow-capped ranges (`createMountains` in
  `src/render/sky.js`, land side only) beyond, under a pixel logo painted in
  code. At the end of each day a bedtime scene
  (`src/game/bedtime.js`, `Story.bedtime`) puts him in striped pajamas and
  Nana tucks him in on the sofa.
- **Leaves and transitions** (`src/ui/leaves.js`, `src/ui/leafart.js`): pixel
  maple, oak, birch and aspen leaves (pre-drawn turn and tumble frames, never
  smoothly rotated) shake off menus, burst from big buttons and deliveries and
  drift over the title; short fades are leaf wipes (a gust covers the screen,
  then blows away), long ones stay soft (`leafTransition`, `screenFade`).
- **See-through** (`SEE_GLSL` in `src/render/shaderlib.js`, `updateSee` in
  `src/game/camera.js`): whatever stands between the camera and Hank (or a
  cutscene's subject) dissolves in a pixel dither with a glowing ember edge.
- **Voxels** (`src/voxel`): models are painted in code into voxel grids and
  meshed with face culling, baked ambient occlusion and greedy merging.
  Buildings, props, food, animals, characters and the cabin interior each have a model
  module; `tools/voxpreview.html?mod=/src/voxel/models/props.js` previews any
  of them, `tools/charpreview.html` previews the characters.
- **Forest** (`src/world/forest2d.js`, `src/art/trees2d.js`): every tree is
  pixel art: maples, birches, aspens, oaks, spruces, pines, tamaracks, bushes,
  ferns, saplings, stumps, logs and mushrooms are sculpted in code into
  outlined, shaded sprites (with baked normals so the sun lights them from the
  side), baked in Web Workers into one atlas and drawn as one instanced batch
  of upright camera-facing cards that sway, cast shadows and shake when hit.
- **Villagers** (`src/game/npcs.js`, `npcBrain.js`, `npcRoutines.js`,
  `npcNav.js`, `npcPets.js`): everyone is terrified of the walking skeleton at
  first. They scream, drop things, run for cover, hide and peek, faint, throw
  a boot or blow a whistle. Trust (saved per villager) grows with hot
  deliveries, a polite bell, calm riding and favours, from terrified to wary,
  friendly and fan. They keep daily routines by the hour (opening shop,
  sweeping, fishing, jogging, gossiping at the café, going home at night) and
  walk the sidewalks and crosswalks.
- **Houses** (`src/voxel/models/buildings.js`, `src/world/foundations.js`):
  buildings are painted at 1/16 m voxels with lap siding, sashed windows,
  shutters, shingle roofs, gutters, hydro meters, hoses and stone foundations;
  front doors are hinged leaves that swing open when Hank walks or rides into
  them and spring shut (`src/world/doors.js`). Near and far LOD meshes are
  built in workers. Lots are levelled and foundations,
  steps and stilts reach the ground; `node tools/floatcheck.mjs` reports gaps.
- **Street clutter and furniture** (`src/art/deco2d.js`,
  `src/art/furniture2d.js`, `src/world/deco2d.js`, `src/world/furniture2d.js`,
  `src/game/deco2d.js`): bins, crates, barrels, hay, mailboxes,
  market stalls with fish, porch rockers and swings, café terraces, shop window
  displays, beach and harbour gear, with simple physics so small things tip
  over, roll and spill when knocked, then tidy themselves up off-screen.
  Fences are voxel geometry (`src/world/fences3d.js`) that follow the ground
  post by post and topple when hit.
- **Nana's cabin** (`src/world/cabinInterior.js`, `src/game/interior.js`,
  `src/voxel/models/interior.js`): a walkable voxel room inside the real
  cabin, with its own colliders, camera box, firelight and things to use.
- **World** (`src/world`): a heightmap valley with a river, beaches and roads
  stamped into it from `layout.js`. Maple Cove has a straight Main Street with
  sidewalks, crosswalks and lamp posts, a post office, donut shop, Café Érable,
  Moose & Goose, a fire hall, a police post, a poutine shack, a town green with
  a gazebo and cenotaph, a hockey rink, a harbour with docks and a lighthouse.
  Out in the country there's a red-barn farm with a pumpkin patch and corn
  maze, a sugar shack, a campground, a covered bridge, a bike park, a beach
  with a lifeguard tower and a fish & chips shack. Buildings are meshed in Web Workers. The sea uses Gerstner waves
  with surf that follows the shoreline, foam, swash and wet sand.
- **Characters** (`src/game/vchar.js`): jointed voxel rigs with springy
  procedural poses, idle fidgets, cartoon reactions, pixel face decals with
  many expressions, verlet-cloth scarves and capes, held props, bike-riding IK
  and a fall-apart mode.
- **Creatures and effects** (`src/game/critters.js`, `src/game/critterAnim.js`,
  `src/voxel/models/animals.js`, `src/game/effects.js`): 31 kinds of voxel
  animals (deer, moose, foxes, raccoons, rabbits, squirrels, songbirds, geese,
  gulls, ducks, owls, bats, frogs, fish, butterflies...) built from parts and
  animated procedurally: gaits picked from speed, feet placed on the ground,
  heads that follow Hank, flapping and gliding, all blended. Each species is
  one instanced draw (`src/render/voxelRig.js`); legs hang from hips buried in
  the body and `node tools/legcheck.mjs` checks every quadruped's legs stay
  attached in every gait, on slopes too. Particles are instanced: outlined toon
  smoke, impact stars, bouncing debris, splash crowns and anime speed lines,
  and the tyres throw up whatever they ride on (grit, gravel chips, leaves,
  sand, rain spray, snow). Ground decals (`src/render/decals.js`, one instanced
  draw) press tyre tracks, skid streaks, Hank's bony footprints, villagers'
  boot prints and hoof and paw prints into soft ground and crumble away.
- **Roads** (`src/world/terrainMesh.js`): the terrain shader reads a small road
  frame (distance across the nearest road and its style) to draw wheel ruts,
  tyre grooves, worn centre lines, grassy crowns, ragged grass edges, leaves
  blown in from the forest and puddles that gather in the ruts when it rains.
- **UI** (`src/ui`): a pixel kit of carved wood panels with brass nails, buttons,
  slots, books and bezels (`kit.js`, `kitart.js`), shaded 32 px icons
  (`src/art/icons.js`), and black-and-white speech bubbles over the real 3D
  speaker. Everything is drawn on one integer pixel grid so it stays crisp.
  Orders and customers live in a spiral notebook. Touch controls have a
  floating thumb stick (pull back to wheelie, push to stoppie), a pixel-art
  crank to spin (`crank.js`), brake, hop and one trick button.
- **Rendering** (`src/render`): three.js renders at native resolution (or
  above it on high-DPI screens) into an HDR target. A post pass adds height fog
  with sun scattering, cartoon depth-edge outlines, screen-space god rays,
  bloom, colour grading and FXAA. The 'Retro' and 'Chunky' resolution settings
  bring back the old low-resolution, dithered pixel look. Water uses planar
  reflections.
- **Game** (`src/game`): bicycle physics with momentum, a crank the rider turns
  himself through three auto gears (`src/core/pedal.js` turns keys, sticks and
  drags into crank turns), a stamina pool that winds Hank,
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

- `?start=ride` starts riding straight away (`&spawn=x,z,yaw`, `&day=3`, `&trust=60`,
  `&money=200`, `&skills=max` or `&skills=1` to pre-fill Harold's notes,
  `&assist=1` / `&assist=0` to force riding assists, `&nofreeze` to turn off
  hit-stop, `&cat=1`)
- `?start=intro` plays the new-game story
- `?scene=cabinArrive|cabinSofa|loadCargo` plays the cabin and cargo-loading
  beats; `?scene=lumberCamp|funeral|yearsPass|revival|nanaFindsHank` plays one part of
  the prologue; `?scene=cabinNight|morning|garageReveal|villagePanic|catRescue|ending`
  plays a later story beat (add `&autotalk` to advance the dialogue by itself)
- `?loaderonly=60` shows just the loading scene for 60 seconds (`&pop=1` drops
  the head sooner)
- `?critters=deer:2:10,robin:4:5` places animals in front of the camera
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
