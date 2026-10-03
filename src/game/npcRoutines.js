// Who's who in Maple Cove: how each villager reacts the first time a skeleton
// rides up (fear style), what they shout, and their day, hour by hour.
// Activities: home (stand at their spot), at (a place + pose), bench (sit on the
// nearest bench), patrol / jog (a loop), errand (shop and carry the bag home),
// chat (meet up with friends), inside (go home and shut the door).
import { frontOf, DOUG_BEAT, MO_SPOT } from '../world/layout.js';
import { LANE_N, LANE_S } from './npcNav.js';

const P = (o, yaw, pose) => ({ x: o.x, z: o.z, yaw, pose });
const home = (pose = null) => ({ k: 'home', pose });
const at = (pt, pose = 'idle', o = {}) => ({ k: 'at', ...pt, pose: pt.pose || pose, ...o });
const bench = (x, z, pose = 'sit') => ({ k: 'bench', x, z, pose });
const inside = () => ({ k: 'inside' });
const errand = (to, carry = 'carryBag') => ({ k: 'errand', to, carry });
const chat = (meet) => ({ k: 'chat', meet });

// meet-ups: where, and who stands round
export const MEETS = {
  cafeGossip: { x: 225.6, z: LANE_N + 0.2, r: 0.8 },
  clinicVisit: { x: 243.8, z: LANE_N + 0.1, r: 0.65 },
};

const STORE_FRONT = { x: 230.5, z: LANE_N };

// fear: how they react the first time they see Hank. run: flee speed. umbrella: colour key or null
export const PEOPLE = {
  gus: {
    house: 'gus', fear: 'shoe', run: 3.2, scream: 0.75,
    scare: ['GIT! GO ON, GIT!', 'BACK, YOU BAG OF BONES!', 'Not on my porch, ya walking xylophone!'],
    peek: ['Still out there, is it?', 'Hmph. Rattling around like it owns the place.'],
    wary: ["Don't you come any closer.", 'I got my eye on you, bones.', "...You still here?"],
    hello: ['Hank.', 'Mornin\'.', "Hmph. Ridin' slow for once."],
    day: [
      [6.5, 9, [home('sip')]],
      [9, 12, [at(P(frontOf('gus', 3.8, -3.6), 0.25), 'chop')]],
      [12, 13, [inside()]],
      [13, 17, [at(P(frontOf('gus', 1.4, 2.6), 0.25), 'paper'), at(P(frontOf('gus', 3.8, -3.6), 0.25), 'chop')]],
      [17, 21, [home('sip')]],
    ],
  },
  marie: {
    house: 'cafe', fear: 'hands', run: 3.6, scream: 1.3, umbrella: 'marie',
    scare: ['Mon dieu! Un squelette!', 'AAAH! Non, non, NON!', 'Au secours! A skeleton!'],
    peek: ['Is it gone? ...Non. Still there.', 'Mon dieu, it is looking at me...'],
    wary: ['B-bonjour... monsieur le squelette.', 'You want... a croissant? Take it! Take it!', 'Stay on that side, please.'],
    hello: ['Bonjour, Hank!', 'Ah, mon petit squelette!', 'Coucou, Hank!'],
    day: [
      [6.5, 8.5, [at(P(frontOf('cafe', 1.4, 3.6), 0), 'sweep')]],
      [8.5, 12, [home()]],
      [12, 13.5, [chat('cafeGossip')]],
      [13.5, 16, [home()]],
      [16, 17, [bench(223, LANE_N - 0.5, 'sitSip')]],
      [17, 21, [home()]],
    ],
  },
  agnes: {
    house: 'agnes', fear: 'faint', run: 2.3, scream: 1.4, umbrella: 'agnes',
    scare: ['Oh my stars...', 'Oh! Oh my! Oh dear!', 'Heavens to Betsy!'],
    peek: ['Is the bony gentleman still there?', 'Oh, I do hope it doesn\'t eat cats...'],
    wary: ['H-hello, dear... are you eating well? Oh. Right.', 'Please don\'t haunt my cats.', 'My, what... big bones you have.'],
    hello: ['Hello, dear!', 'Yoo-hoo, Hank!', 'Mind the cats, dear!'],
    day: [
      [6.5, 9, [at(P(frontOf('agnes', 0.9, 3.1), 0), 'water'), at(P(frontOf('agnes', 0.9, 3.1), 0), 'garden')]],
      [9, 12, [home('knit')]],
      [12, 13.5, [chat('cafeGossip')]],
      [13.5, 16, [bench(173, LANE_S + 0.5, 'sitKnit')]],
      [16, 18, [errand(STORE_FRONT)]],
      [18, 21, [home('knit')]],
    ],
  },
  birdie: {
    house: 'birdie', fear: 'shoe', run: 3.0, scream: 1.0,
    scare: ['SHIVER ME TIMBERS!', "Davy Jones! Back to the deep with ye!", 'ABANDON SHIP!'],
    peek: ['Still on the horizon, that one...', 'Arr... is it gone?'],
    wary: ["Ahoy... keep yer distance, matey.", "Don't come aboard without asking.", 'Steady as she goes...'],
    hello: ['Ahoy, Hank!', 'Fair winds, sailor!', 'Hank, me hearty!'],
    day: [
      [6.5, 10, [at({ x: 190, z: 87.3, yaw: 0 }, 'fish')]],
      [10, 12, [home()]],
      [12, 14, [bench(201.5, LANE_S + 0.5, 'sitPaper')]],
      [14, 17, [at({ x: 178, z: 87.3, yaw: 0.1 }, 'lookout'), at({ x: 190, z: 87.3, yaw: 0 }, 'fish')]],
      [17, 20, [at({ x: 190, z: 87.3, yaw: 0 }, 'fish')]],
      [20, 21, [home()]],
    ],
  },
  doug: {
    house: 'doug', fear: 'whistle', run: 3.8, scream: 0.9, night: true,
    scare: ['HALT! Stop right there!', 'Freeze, mister... bones!', 'This is the police! Probably!'],
    peek: ['Suspect is... still loitering.', 'Dispatch, I need backup. Dispatch? Oh, right, I am dispatch.'],
    wary: ['Keep your hands where I can see them. All twenty-seven bones.', 'Move along, citizen.', "I'm watching you."],
    hello: ['Citizen.', 'Evening, Hank. Drive safe.', 'Afternoon, Hank.'],
    day: [
      [6.5, 11, [{ k: 'patrol', pts: DOUG_BEAT }]],
      [11, 12, [at(P(frontOf('donuts', 1.4, 2.4), 0), 'sip')]],
      [12, 15, [{ k: 'patrol', pts: DOUG_BEAT }]],
      [15, 16, [chat('clinicVisit')]],
      [16, 21, [{ k: 'patrol', pts: DOUG_BEAT }]],
      [21, 23.5, [{ k: 'patrol', pts: DOUG_BEAT, pose: 'lantern' }]],
    ],
  },
  ingrid: {
    house: 'clinic', fear: 'notes', run: 3.8, scream: 1.2, umbrella: 'ingrid',
    scare: ['Is that... ambulatory?!', 'Fascinating! Terrifying! Fascinating!', 'That is NOT in the textbook!'],
    peek: ['Note: subject has no pulse. Subject waves. Hm.', 'Remarkable joint mobility...'],
    wary: ['Please hold still. For science.', 'Do you... feel pain? Asking clinically.', 'Interesting. Keep your distance.'],
    hello: ['Doctor Ingrid. Hello, Hank.', 'Still no pulse? Wonderful!', 'Hello, my favourite anomaly.'],
    day: [
      [6.5, 8, [{ k: 'jog', pts: [{ x: 240, z: LANE_N }, { x: 206, z: LANE_N }, { x: 205.5, z: LANE_S, cross: true }, { x: 261, z: LANE_S }, { x: 262, z: LANE_N, cross: true }, { x: 249, z: LANE_N }] }]],
      [8, 12, [home('clipboard')]],
      [12, 13, [bench(253, LANE_N - 0.5, 'sitSip')]],
      [13, 15, [home('clipboard')]],
      [15, 16, [chat('clinicVisit')]],
      [16, 19.5, [home('clipboard')]],
      [19.5, 21, [bench(237, LANE_S + 0.5, 'sitPaper')]],
    ],
  },
  kids: {
    char: 'pip', house: null, fear: 'cool', run: 3.4, kid: true, umbrella: 'pip',
    scare: ['WHOA! A REAL SKELETON!', 'SKELETON!!! COOOOL!', 'MOM! MOM! LOOK!'],
    hello: ['HANK!!!', 'Do a wheelie!', 'Hi skeleton!!'],
    fan: ['DO A BACKFLIP!', 'Can I ride on the handlebars?!', 'Hank is the COOLEST!'],
    day: [[6.5, 21, [home('hockey')]]],
  },
  pop: {
    char: 'pop', house: null, fear: 'cool', run: 3.4, kid: true, umbrella: 'pop',
    scare: ["I'm not scared. Pip is scared.", 'Whoa... are those REAL bones?', 'Is your skull detachable?!'],
    hello: ['Hey, Hank.', 'Hank! Watch this!', "Pip says hi. I mean - hi."],
    fan: ['Do a flip! Pip wants to see. Not me.', 'Can you take your head off again?'],
    day: [[6.5, 21, [home('hockey')]]],
  },
  lou: {
    house: 'sawmill', fear: 'scream', run: 4.4, scream: 1.75,
    scare: ['EEEEEEEEK!', 'MOMMAAAA!', 'A SKELETON! ON A BIKE! EEEK!'],
    peek: ['Is it... is it gone?', 'Big Lou is NOT scared. Big Lou is hiding.'],
    wary: ["H-hey, buddy... bones... pal.", 'You stay over there, okay?', "Don't make me scream again."],
    hello: ['HANK! My guy!', 'Lookin\' good, bones!', 'Hey hey, Hank!'],
    day: [
      [6.5, 12, [at({ x: 106.2, z: 119.8, yaw: 0.2 }, 'chop')]],
      [12, 13, [home('sip')]],
      [13, 18, [at({ x: 106.2, z: 119.8, yaw: 0.2 }, 'chop'), home()]],
      [18, 21, [home('sip')]],
    ],
  },
  lou_lh: {
    char: 'ollie', house: 'lighthouseHut', fear: 'pray', run: 2.6, scream: 0.85, umbrella: 'ollie',
    scare: ['The ghost of the cove!', 'Lord, preserve this old sailor!', 'Fifty years at sea and NOW I see a ghost!'],
    peek: ['Is the spectre still there?', 'Mind ye, ghost, I have a lantern and I am NOT afraid to use it.'],
    wary: ['Ahh... the bony lad. Don\'t come too close.', 'You smell of seaweed and... nothing.', 'Steady, old Ollie, steady.'],
    hello: ['Ahh, the bony lad.', 'Mind the gulls, Hank.', 'Fine evening for it, Hank.'],
    day: [
      [6.5, 10, [at(P(frontOf('lighthouseHut', 3.4, 1.6), 3.64), 'lookout')]],
      [10, 14, [at(P(frontOf('lighthouseHut', 1.3, -1.4), 3.64), 'sweep'), home()]],
      [14, 18, [home()]],
      [18, 21, [at(P(frontOf('lighthouseHut', 3.4, 1.6), 3.64), 'lantern')]],
    ],
  },
  mo: {
    house: 'store', fear: 'duck', run: 3.0, scream: 0.95, umbrella: 'mo',
    scare: ['Yikes! We are CLOSED!', 'Take what you want! Not the till!', 'Moose and GOOSE! A GHOST!'],
    peek: ['Is it still shopping?', 'We have... a skeleton discount? Please leave?'],
    wary: ['Welcome to... Moose & Goose? Please don\'t touch the produce.', 'Cash only. No bones.', 'H-hello, valued customer.'],
    hello: ['Hank! Fresh pumpkins!', 'Welcome back, Hank!', 'Best customer in town!'],
    day: [
      [6.5, 8, [at(P(frontOf('store', 0.7, 3.2), 0), 'sweep')]],
      [8, 20, [home()]],
      [20, 21, [at(P(frontOf('store', 0.7, 3.2), 0), 'sweep')]],
    ],
  },
  josee: {
    char: 'josee', house: 'kids', fear: 'kids', run: 3.6, scream: 1.3, umbrella: 'josee',
    spot: { x: 214.5, z: 24.9, yaw: Math.PI },
    scare: ['PIP! POP! GET AWAY FROM THAT THING!', 'KIDS! INSIDE! NOW!', 'Don\'t you TOUCH my babies!'],
    peek: ['Stay down, you two!', 'Pip, stop waving at it!'],
    wary: ["Kids, stay behind me.", 'You... deliver cocoa? To children?', 'Hm. You seem... polite. For a corpse.'],
    hello: ['Hi, Hank! Thanks for being nice to the kids.', 'Morning, Hank!', 'Pip will NOT stop talking about you.'],
    day: [
      [6.5, 9, [at(P(frontOf('kids', 0.9, 2.6), Math.PI + Math.PI), 'garden')]],
      [9, 12, [home('idle')]],
      [12, 13.5, [chat('cafeGossip')]],
      [13.5, 16, [home('idle')]],
      [16, 17.5, [errand(STORE_FRONT)]],
      [17.5, 21, [home('idle')]],
    ],
  },
};

void MO_SPOT;
