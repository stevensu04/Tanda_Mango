/** Phase 1 fake data. Everything here is replaced by the server + Claude in Phase 2. */

export const NAMES = [
  'SNEAKY PETE', 'DAVE', 'PRIYA', 'BIG TONY', 'MEI', 'KOFI', 'LOLA', 'RAVI', 'DJ OYSTER', 'GRANDMA JO',
  'TURBO KEV', 'YUKI', 'MOONWALK MO', 'SOFIA', 'TOBY', 'AMARA', 'NACHO', 'BEA', 'JUNO', 'SAL',
  'OTIS', 'WREN', 'IGGY', 'DOT',
];

/** Funny defaults for the phone's "reroll name" (no typing anywhere). */
export const DEFAULT_NAMES = ['SNEAKY PETE', 'NOT A COP', 'DJ OYSTER', 'TOTALLY 21', 'VIP-ISH', 'TALL KEV', 'MRS. STEALTH', 'THE INTERN', 'BOUNCY', 'GUEST OF GUEST'];

export const LINES = {
  lobby: 'CLUB VELVET IS OPEN. SCAN THE CODE AND GET IN LINE. NO PUSHING.',
  back: 'GUS IS SCROLLING HIS PHONE. HE HAS 400 UNREAD MESSAGES.',
  tell: 'DID SOMEBODY... MOVE?',
  fakeout: '...NAH. THOUGHT I HEARD A RAT.',
  watch: 'NOBODY. MOVE. A. MUSCLE.',
  caught: 'YOU. IN THE GREEN. I SAW THAT.',
  proveit: 'DAVE. YOU WANT IN? DANCE FOR ME.',
  fling: 'DAVE, MY NAN SHAKES HARDER AT BINGO. BACK OF THE LINE.',
  pass: '...FINE. THAT WAS ALMOST DANCING. KEEP WALKING.',
  vip: 'PRIYA IS IN. PRIYA, YOU RUN THE DOOR NOW. PICK A RULE.',
  lightsout: 'PRIYA PICKED LIGHTS OUT. GUS FOUND A FLASHLIGHT.',
  disco: 'PRIYA PICKED DISCO MODE. GUS CANNOT HELP HIMSELF.',
  moonwalk: 'PRIYA PICKED MOONWALK. LET GO TO MOVE. HOLD TO FREEZE.',
  hud: 'GUS IS BORED. BORED GUS LOOKS AWAY LONGER.',
  finale: 'LAST CALL. EVERYBODY RUSH THE DOOR. MASH!',
  finaleWin: 'THE ROPE SNAPPED. GUS IS CALLING HIS MUM.',
  nerd: 'TWENTY-FIVE TAPS A SECOND? NICE TRY, NERD. SIT DOWN.',
  end: 'CLUB VELVET IS CLOSED. MUGSHOTS ARE ON YOUR PHONES.',
};

export const CHAOS = [
  { id: 'lights', name: 'LIGHTS OUT', blurb: 'ONLY THE BEAM SEES' },
  { id: 'glasses', name: 'NEW GLASSES', blurb: 'GUS TURNS FASTER' },
  { id: 'moonwalk', name: 'MOONWALK', blurb: 'CONTROLS FLIP' },
  { id: 'disco', name: 'DISCO MODE', blurb: 'FAST TURNS + MUSIC' },
];

export const POWERS = [
  { id: 'banana', name: 'BANANA', blurb: 'TRIP SOMEONE', cooldown: 8 },
  { id: 'distract', name: 'DISTRACT', blurb: 'GUS LOOKS AWAY', cooldown: 10 },
  { id: 'snitch', name: 'SNITCH', blurb: 'GUS WATCHES LONGER', cooldown: 10 },
  { id: 'coup', name: 'COUP', blurb: 'OVERTHROW OWNER', cooldown: 15 },
];

export const HUD = { ego: 0.72, paranoia: 0.35, boredom: 0.81, suspicion: 0.2, mono: 'IF ONE MORE GUY SAYS HE KNOWS THE DJ...' };

export const TICKER = [
  'PRIYA HAS BEEN A STATUE FOR 20 SECONDS. SUSPICIOUS.',
  'DAVE HAS BEEN FLUNG TWICE. DAVE IS UNDETERRED.',
  'BIG TONY IS SNEAKING LIKE A FRIDGE.',
];

export const SOLO = [
  { name: 'DIVE BAR', guard: 'SLEEPY SAL', note: 'HE IS MOSTLY ASLEEP' },
  { name: 'ROOFTOP', guard: 'GUS', note: 'FAKE-OUTS. WATCH THE HEAD' },
  { name: 'AREA 51', guard: 'AGENT NULL', note: 'SEARCHLIGHTS. NO MERCY' },
];

export const MUGSHOT = {
  name: 'DAVE',
  caught: 3,
  bestDance: 61,
  distance: '41 FT',
  roast: 'MY NAN SHAKES HARDER AT BINGO.',
  title: 'PROFESSIONAL STATUE',
  threat: 'LOW',
};

export const RESULTS = [
  { label: 'FIRST IN', name: 'PRIYA', value: '0:24' },
  { label: 'MOST CAUGHT', name: 'DAVE', value: 'X3' },
  { label: 'BEST DANCER', name: 'KOFI', value: '94' },
  { label: 'BEST STATUE', name: 'GRANDMA JO', value: '31S' },
];
