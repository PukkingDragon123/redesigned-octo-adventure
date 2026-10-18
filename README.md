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
the fonts (Pixelify Sans for every word, with two small pixel fonts behind it).

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
| W and S / Up and Down, one after the other | Right stick turned in circles, or RT and LT one after the other | Pedal. You turn the crank yourself: each time the other foot goes down it winds on half a turn (holding a key does nothing). Spin faster to go faster, as fast as you can crank: an easy spin cruises about 10.5 m/s in top gear, flat out (3-4 turns a second) about 18-20 m/s, more downhill. Stop spinning and Bessie coasts; nothing pedals for you. Spinning hard winds Hank fast (a full sprint lasts 10-15 seconds; the bone under the crank is his wind): spent, he slows down and wobbles until coasting gets his breath back |
| Z / X (or , / .) | D-pad down / up (LB down too) | Change gear. Bottom gear spins up easily and climbs but tops out early; top gear is a slog to wind up and flies. The gears change by themselves until you shift by hand; from then on they're yours (Settings: Gears puts them back on Automatic, and then a shift by hand just holds for a few seconds). The crank shows the gear (an A while automatic) |
| Mouse: drag round the crank | | Pedal with the mouse: drag in circles round the chainring, bottom right (backwards back-pedals) |
| S / Down held on its own | LT held | Brake (a back-pedal on the stick or the crank brakes too); hold when stopped to roll backwards |
| A D / Left Right arrows | Left stick | Steer (lean into corners; too fast on grass and the tyres let go); spin in the air |
| W A S D / arrows (on foot) | Left stick | Walk: a key (or the stick all the way out) jogs, half a push walks briskly, a gentle one ambles. Indoors Hank keeps to a walk |
| Space | A | Hold to crouch, let go to bunny hop (crouch about a third of a second for the full pop; pop right at a ramp lip to go higher); jump on foot |
| Q / Right Ctrl | Left stick down | Lean back: wheelie (while pedalling), manual (coasting), backflip (in the air). Tap the brake to save a loop-out |
| F | Left stick up | Lean forward: stoppie (with the brake), nose manual (coasting), frontflip (in the air); on foot, kicks whatever kickable thing is right there (F or Q) |
| Shift | RB | Drift (let go for a little kick); on foot, hold to sprint |
| Shift + direction (in the air) | RB + stick | Poses: Superman, No-Hander, Can-Can, Nothin', Skull Toss. Let go before you land |
| E / Enter | X | Talk, deliver, hop off / on the bike, pick things up; on foot next to a pumpkin, a bin or a tree: kick it (F / Q / B too) |
| R | Y | Ring the bell |
| C | | Camera (once Birdie lends you hers) |
| M | Back | The paper map |
| Tab | | Harold's keepsakes |
| Mouse drag (right button) | Right stick (on foot) | Look around |
| Esc | Start | Hank's journal (pause); skips a cutscene while one is playing |
| Tab, [ ], PgUp / PgDn | LB / RB | In the journal: turn to the next / previous bookmark |

There is almost nothing on the screen while you play: what you can do right here (on a
little cream tag hanging over Hank's head), a little leather journal in the top left corner and Harold's brass compass in
the top right, both real 3D things. The compass needle swings round to wherever you
should go next (it lags and overshoots as you turn, and the case tilts into the
corners); click or tap it and the camera goes into Hank's skull while he holds it up in
his bony hand, the place it points to inked on a paper tag (drag to look about, Esc to
put it away). How hot the cups are shows in how much they steam in Bessie's crate.

Every screen is written in Hank's journal: Esc (or the little journal) takes the camera
into first person while his hands lift a leather-bound book, open it and hold it up.
Its bookmark tabs turn to the journal (the day, money, errands), Nana's orders, the
map, her customers and recipes, the Skill Book, the keepsakes, settings and controls;
Nana's order board, Mo's shop list and the day's receipt open in the same book. The
pages are the pixel UI laid exactly onto the 3D paper (`src/ui/book.js`,
`src/ui/book3d.js`, `src/ui/view3d.js`, `src/ui/compass3d.js`; preview the held things
with `tools/heldpreview.html`).

Landings have to match the ground: roughly level with the slope and pointing
the way you're travelling. A perfect landing gives a little burst of speed; a
crooked one wobbles; a bad one is a bail.

On a touch screen, on-screen controls appear after your first tap: a floating
steering stick on the left (pull it back to wheelie, push it up for a stoppie)
and, bottom right, Bessie's crank: circle your thumb round the chainring to
pedal (backwards brakes; spin it as fast as you dare and the crank arm smears;
tap the rear cogs to change gear, the top half up and the bottom half down, and
tap the chainring to ring the bell), with just three buttons round it: brake,
hop and TRICK (Hank pulling a wheelie). The buttons are round log slices with a
dab of paint and a picture.
The crank also shows the gear (the chain hops across three rear cogs, the number
sits top left), whether the pedals are catching the back wheel, and how winded
Hank is: the bone along the bottom is his wind (red once he's puffed, cracked
when he's spent), the brass glows red and the chain sags. Touch riding gets
assists (steadier balance, forgiving landings, no slide-outs). On foot the stick
walks (a gentle push ambles, half way out walks briskly, all the way out jogs),
hold SPRINT to run flat out, and there is a jump button; the tag over Hank's head
shows whatever you can do right here (talk, hop on, kick the pumpkin...): tap it.

Crash with cocoa in the crate and the cups go flying: every cup loses a chunk of
its heat, more the harder the crash.

## What there is to do

- Deliver Nana's cocoa before it cools. Slow down near a customer and they come
  to you: a wave, over to Bessie's crate (or to Hank on foot), they take the cup,
  a thank-you bubble, pay, and off they go sipping (`src/game/walkup.js`,
  `node tools/walkuptest.mjs`). Each cup uses ingredients from her
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
  thing you see riding in from Nana's, and it's packed: the regulars plus two
  dozen and more townsfolk (`src/game/crowd.js`, dressed from a seed by
  `crowdGen.js`: kids, elders with canes, toques, earmuffs, scarves, plaid
  jackets, puffy vests) carving at the tables, chatting and laughing on the
  sidewalks, sipping cider, taking photos, wandering from table to table,
  playing tag through the leaf pile, strolling hand in hand, walking a dog on a
  leash and pushing a stroller. Gus hosts it in the game itself with a dented
  tin megaphone: he strolls the tables (the townsfolk's too), leans in, hums,
  points and has his say, calls the finished pumpkins and hands out the hourly
  ribbons, and the crowd cheers and claps (pennants, jumping kids, "Hooray!").
  Near the camera the townsfolk are full rigs; further off each is one baked
  mesh, and the lot is hidden when the contest is out of sight.
- The first time Hank rides in, a short cutscene: the whole contest freezes
  mid-action, scared stiff, and stares: no screams, nobody runs, just silence
  and crickets, trembling, hands flown to mouths, a dropped pumpkin, Pop hiding
  behind Josée, the dog whimpering behind its owner, Gus gulping
  (`?scene=townEntry`). They stay frozen in play until each has a cup. Nana sent a
  carrier of extra cocoa in Bessie's crate: walk up and *offer cocoa* to each of
  them; they hesitate, take it, sip and warm right up, and the people round them
  thaw too. Once the eight regulars have a cup, Gus comes over: "Any skeleton who
  brings cocoa can carve at my contest." (`?scene=villagePanic` rides in,
  `?scene=cocoaRound` starts frozen, `?scene=carveInvite` jumps to Gus's
  invitation; `node tools/crowdtest.mjs` checks the crowd and the round.)
- Carve a pumpkin at Hank's own little table at the west end of the contest
  (once a day), right there in the street: the camera glides into a close-up of
  a big voxel pumpkin (36 x 38 x 36 voxels: ribbed skin, flesh, a hollow full
  of guts, a stem), Hank's bony hands in shot, the contest going on behind. Gus
  makes a request (spooky, funny or cute for a style bonus, or copy his design
  off a little card for a likeness bonus); cut round the stem along the marker
  ring and the lid comes free, Hank lifts it off, scoop the guts into the bowl,
  lid back on; then carve against a 90 second clock: drag to cut (the knife
  saws under your finger or mouse and goes straight in through the wall, the
  gouge takes big bites), cut voxels pop out and tumble across the table, ring
  a bit and it drops in, two fingers (or right-drag, Q/E, the arrow buttons)
  turn and tip the pumpkin, undo, an optional stencil drawn on in marker. Cut a
  side clean across (or hollow out half of it) and it caves in. At the end the
  lights go down, Hank lowers a candle in, strikes a match, the inside and every
  cut through glow, he turns it to the street and the crowd goes "ooooh". Gus
  and Dr. Ingrid judge its best side on eyes, mouth, nose, symmetry, how much is
  cut, style and the request, Gus announces the ribbon and it lands in a flurry
  of leaves. The exact pumpkin is saved and stands on the table, glowing.
  (`?scene=carve` opens it straight away; `node tools/carvetest.mjs` checks the
  scoring, the requests, the voxel carving, the remeshing, the save and the
  models.)
- On the first evening a stray cat is out walking the road home; go slowly and
  she comes to you, rush her and she bolts.
- Chat with villagers for favours: Agnes's three lost cats, lost glasses, puck,
  compass, stethoscope and Mountie hat, six saplings to plant for Gus, bird
  photos for Birdie, a secret letter, pumpkins for the café, lawn bowling,
  harvest supper invitations, and Lou's stunt bet.
- Ride out into the backcountry west, north and south of the old map: Café du
  Rang on the west road (a giant mug on its roof), Lac des Huards with Gisèle's
  cottage, its dock, canoes and a fishing camp, Moose Marsh and its boardwalk
  and blind, the old railway coming out of its tunnel past Gare Sainte-Rose (a
  handcar on the rails, a rail trail east to the tree stand), Mont Écho's
  switchback trail up to Ranger Rosie's fire tower and its view, and Verger
  Tremblay's apple orchard and cider press. Their folk have favours too: a
  cocoa to go carried up the mountain before it cools, a race against Gérard
  the moose down the switchbacks, Gisèle's lost paddle, eight windfall apples
  for the press, Old Ollie's letter to the station master and back, and beating
  the old express down the rail trail. (`node tools/wildtest.mjs` checks the
  bigger world, its roads and models, and every one of these quests.)
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
- **Loading and title** (`src/boot/loader3d.js`, `src/ui/title.js`,
  `src/game/titleHill.js`): the loading screen is dark and warm with no text:
  Hank's voxel skull in his red toque turns slowly in a hearth-coloured rim
  light (a tiny renderer of its own, drawn low-res and scaled up by whole
  pixels), its eye sockets glowing, over a thin progress bar. The title is a
  live shot drawn by the world renderer at golden hour: Hank sits in the grass
  on the knoll above Maple Cove (`TITLE_HILL` in `src/world/layout.js`) sipping
  a steaming mug of cocoa, the rink, the green and the rooftops below; now and
  then a blue jay flutters in and lands on his toque, he freezes, eyes up, then
  turns and smiles while it hops, chirps and fluffs, and waves when it flies
  off. The camera drifts slowly over his shoulder. There is no flat interface:
  the game's name is written across the sky as one fluffy 3D cloud
  (`src/game/titleCloud.js`: a soft puff for every pixel of the letters, banded
  gold, peach and lavender like the sky's clouds, condensing out of the air,
  bobbing, wisps trailing off and cloudlets drifting by), and the menu is a
  wooden signpost in the grass beside him (`src/game/titleSign.js`, voxels like
  the rest of the village): painted arrow boards for Continue (with a little
  Day plank hanging under it), New Game, Settings and Controls point off in
  different directions. Point at one or step through them with the arrow keys
  or the d-pad and it lights up (lantern-gold letters) and wiggles; click, tap
  or press Enter / A and it swings round on its nail, and for Continue and New
  Game the camera heads off the way the arrow points as the picture fades. (Plain
  buttons hidden behind the boards keep the keyboard, gamepad and screen readers
  working like every other menu.) At the end of each day a bedtime scene
  (`src/game/bedtime.js`, `Story.bedtime`) puts him in striped pajamas and
  Nana tucks him in on the sofa.
- **Leaves and transitions** (`src/ui/leaves.js`, `src/ui/leafart.js`): pixel
  maple, oak, birch and aspen leaves (pre-drawn turn and tumble frames, never
  smoothly rotated) shake off menus, burst from big buttons and deliveries and
  drift over the title; short fades are glow dissolves (a warm lantern glow
  closes in as a dithered pixel iris with a golden rim while glints twinkle
  and a few leaves drift by, the scene changes under it, then it opens out
  again: never black), long ones stay soft, into a warm dark plum
  (`leafTransition`, `screenFade`).
- **See-through** (`SEE_GLSL` in `src/render/shaderlib.js`, `updateSee` in
  `src/game/camera.js`): whatever stands between the camera and Hank (or a
  cutscene's subject) dissolves in a pixel dither with a glowing ember edge.
- **Voxels** (`src/voxel`): models are painted in code into voxel grids and
  meshed with face culling, baked ambient occlusion and greedy merging; the mesher
  also flags every quad's convex edges. Buildings, props, food, animals, characters
  and the cabin interior each have a model module;
  `tools/voxpreview.html?mod=/src/voxel/models/props.js` previews any of them,
  `tools/charpreview.html` previews the characters.
- **The pixel-voxel look** (`VOXEL_LOOK_GLSL` in `src/render/shaderlib.js`): every
  voxel surface gets a crisp one- or two-pixel bevel on its convex edges (light along
  top rims, dark underneath), a hair of per-voxel colour jitter, and light that falls
  into a palette ramp (three crisp tone steps, tops a step up, undersides a step down,
  warm light and cool plum shade); both fade out once a voxel is a few pixels small, so
  nothing shimmers. The ground shares the ramp and reads as half-metre voxel tiles with
  terrace lips on the hills; grass is voxel blades; the far mountain ranges are voxel
  heightfields; the water's sheen falls into dithered steps on a grid of water pixels.
- **Forest** (`src/world/voxelForest.js`, `src/voxel/models/trees.js`,
  `src/world/treeBake.js`): every tree, stump and mushroom is a voxel model at every
  distance: maples, birches, aspens, oaks, spruces, tamaracks and dead trees, several
  seeded models a species, baked in workers at up to five resolutions (0.125 m up close
  to 2 m on the far hills) and drawn instanced per model and LOD from 32 m cells in (or
  casting shadows into) the view. Crowns sway, leaves flutter, the sun shines through
  them, and a bumped or kicked tree wobbles like a spring and sheds leaves.
- **Villagers** (`src/game/npcs.js`, `npcBrain.js`, `npcRoutines.js`,
  `npcNav.js`, `npcPets.js`): everyone is terrified of the walking skeleton at
  first. They scream, drop things, run for cover, hide and peek, faint, throw
  a boot or blow a whistle (except at the pumpkin contest, where they freeze
  and watch). Trust (saved per villager) grows with hot
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
  displays, beach and harbour gear. Each piece is sculpted from boxes, tubes and
  ellipsoids and voxelised (`src/voxel/sculptVox.js`, one sprite pixel per voxel, its
  painted details and lettering stamped on), built in a worker and drawn as instances of
  one BatchedMesh; things tip over about their foot, roll, flop and spill when knocked,
  then tidy themselves up off-screen. Fences are voxel geometry
  (`src/world/fences3d.js`) that follow the ground post by post and topple when hit; the
  boardwalk, docks, cemetery fence, homestead and the other old structures are voxel
  models too (`src/world/structures.js`).
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
  with surf that follows the shoreline, foam, swash and wet sand. The world is
  880 m a side (the sea keeps the east edge); the terrain is drawn in chunks with
  three levels of detail and skirts, inland lakes and marshes sit below the
  waterline, and the merged clutter far across the map is skipped.
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
- **UI** (`src/ui`): a pixel kit of carved wood panels with brass nails, slots,
  books and bezels (`kit.js`, `kitart.js`); every button is a little painted
  signboard like the ones on the title's signpost (planks in slate blue, barn red
  or leaf green, worn back to the wood at the corners, two iron nails; hot ones
  get a lantern-gold rim), with maple key tiles, painted toggle pegs and slider
  pegs, a round painted close board and a little gold arrow board pointing at
  whatever is chosen; shaded 32 px icons
  (`src/art/icons.js`), and simple cosy speech bubbles over the real 3D
  speaker (cream, round pixel corners, a brown outline, the speaker's name on a
  coloured tab). Everything is drawn on one chunky integer pixel grid (5 device
  pixels per art pixel on a 1080-wide phone, 4 at 1080p) with the type
  (Pixelify Sans, `src/ui/type.js`) at whole multiples of its size, so it stays
  crisp.
  Orders and customers live in a spiral notebook. Touch controls have a
  floating thumb stick (pull back to wheelie, push to stoppie), a pixel-art
  crank to spin as fast as you like (`crank.js`, with Hank's wind as a bone and
  the gear number on it; tap its cogs to shift and its chainring for the bell),
  brake, hop and one trick button (a skeleton pulling a wheelie); on foot a jump
  and a sprint button.
- **Rendering** (`src/render`): three.js renders at the screen's own pixels
  (or a whole fraction of them, upscaled nearest) into an HDR target. Sun
  shadows get a soft filtered edge on desktops; a half-resolution contact-AO
  pass darkens where things meet the ground. The composite adds height fog
  with sun scattering, cartoon depth-edge outlines, screen-space god rays,
  bloom on real light sources only, a filmic tonemap and an autumn grade
  (cool shade, warm light, a plum vignette, fine grain on high). The 'Retro'
  and 'Chunky' resolution settings bring back the old low-resolution, dithered
  pixel look. Water uses planar reflections (an analytic sky without them).
  Phones on medium/low skip AO, bloom and the soft shadow edge.
- **Game** (`src/game`): bicycle physics with momentum, a crank the rider turns
  himself (no cadence cap) through three gears that shift by themselves or by
  hand (`src/core/pedal.js` turns keys, sticks and drags into crank turns), a
  stamina pool that a sprint empties in 10-15 seconds,
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
  the prologue; `?scene=cabinNight|morning|garageReveal|townEntry|villagePanic|cocoaRound|carveInvite|catRescue|ending`
  plays a later story beat (add `&autotalk` to advance the dialogue by itself)
- `?loaderonly=60` shows just the loading scene for 60 seconds
- `?critters=deer:2:10,robin:4:5` places animals in front of the camera
  (`&calm` stops them fleeing)
- `?hour=19.5&weather=rain|snow|misty|overcast|breezy|clear`
- `?cam=x,y,z,lx,ly,lz` opens a free camera, which is handy for screenshots
- `?px=1` sets CSS pixels per rendered pixel (0.5 high-DPI, 1 HD, 2-3 retro),
  `?noshadow` turns shadows off

Graphics quality drops automatically if the frame rate stays low. Picking a
quality or pixel size in Settings turns that off.

## Credits

- Type: [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans) by Stefie
  Justprince (SIL Open Font License 1.1, `src/ui/fonts/PixelifySans-OFL.txt`),
  with [monogram](https://datagoblin.itch.io/monogram) by datagoblin (CC0) for
  the odd symbol and [BoldPixels](https://yukipixels.itch.io/boldpixels) by
  YukiPixels (CC BY-SA 4.0) on the village TV.
- Everything else is generated in code.
