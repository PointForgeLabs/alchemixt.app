/**
 * The machine's vocabulary.
 *
 * Everything here is hand-authored: common English words grouped by the
 * feeling or image they carry. Nothing is scraped from any song. Weights are
 * deliberate — `shattered` should pull harder than `sad`.
 */

/** Words that carry emotional charge. Positive = warm//resolved, negative = dark/unresolved. */
export const VALENCE: Record<string, number> = {
  // warm
  love: 0.8, loved: 0.8, loving: 0.8, adore: 0.9, joy: 0.95, joyful: 0.95,
  happy: 0.8, happiness: 0.85, smile: 0.6, smiling: 0.6, laugh: 0.7, laughing: 0.7,
  bright: 0.6, brighter: 0.6, warm: 0.6, warmth: 0.65, gold: 0.5, golden: 0.6,
  beautiful: 0.8, beauty: 0.75, sweet: 0.6, sweetest: 0.7, tender: 0.6,
  hope: 0.75, hopeful: 0.8, dream: 0.4, dreams: 0.4, dreaming: 0.4,
  free: 0.7, freedom: 0.8, alive: 0.7, heal: 0.7, healing: 0.75, whole: 0.6,
  home: 0.5, safe: 0.6, peace: 0.8, peaceful: 0.8, calm: 0.6, easy: 0.4,
  shine: 0.65, shining: 0.65, glow: 0.6, glowing: 0.6, rise: 0.5, rising: 0.5,
  bless: 0.7, blessed: 0.75, grace: 0.7, faith: 0.6, believe: 0.55, trust: 0.6,
  friend: 0.55, together: 0.65, forever: 0.35, always: 0.3, yes: 0.4,
  celebrate: 0.85, dance: 0.6, dancing: 0.6, sing: 0.6, singing: 0.6, song: 0.35,
  good: 0.5, better: 0.5, best: 0.6, perfect: 0.7, heaven: 0.7, angel: 0.65,
  gentle: 0.55, soft: 0.4, kiss: 0.6, kissing: 0.6, touch: 0.35, hold: 0.35,
  new: 0.3, young: 0.35, sun: 0.5, sunshine: 0.75, summer: 0.5, bloom: 0.65,

  // cold
  hate: -0.85, hated: -0.85, hurt: -0.7, hurts: -0.7, hurting: -0.7,
  pain: -0.8, painful: -0.8, ache: -0.65, aching: -0.65, wound: -0.7, wounded: -0.75,
  sad: -0.6, sadness: -0.65, sorrow: -0.8, grief: -0.9, grieve: -0.85, mourn: -0.85,
  cry: -0.65, crying: -0.65, cried: -0.65, tears: -0.7, weep: -0.75, weeping: -0.75,
  broke: -0.6, broken: -0.75, break: -0.5, breaking: -0.6, shatter: -0.8, shattered: -0.85,
  lost: -0.7, lose: -0.6, losing: -0.65, loss: -0.75, gone: -0.6, leave: -0.4,
  left: -0.4, leaving: -0.55, goodbye: -0.6, farewell: -0.55, end: -0.4, ending: -0.45,
  alone: -0.7, lonely: -0.8, loneliness: -0.85, empty: -0.75, emptiness: -0.8,
  cold: -0.5, colder: -0.55, dark: -0.5, darkness: -0.6, black: -0.35, grey: -0.35, gray: -0.35,
  fear: -0.7, afraid: -0.7, scared: -0.65, terror: -0.85, dread: -0.8,
  die: -0.8, dying: -0.85, died: -0.8, dead: -0.8, death: -0.85, grave: -0.7, buried: -0.65,
  kill: -0.8, blood: -0.55, bleed: -0.65, bleeding: -0.65, scar: -0.6, scars: -0.6,
  fall: -0.35, falling: -0.4, fell: -0.35, drown: -0.75, drowning: -0.8, sink: -0.6, sinking: -0.65,
  hell: -0.7, devil: -0.6, sin: -0.5, guilt: -0.7, shame: -0.75, blame: -0.6,
  lie: -0.6, lies: -0.6, lied: -0.6, liar: -0.7, betray: -0.85, betrayed: -0.85,
  fake: -0.55, false: -0.5, wrong: -0.5, bad: -0.5, worse: -0.6, worst: -0.7,
  tired: -0.5, exhausted: -0.6, weary: -0.6, numb: -0.65, hollow: -0.7,
  nothing: -0.55, never: -0.4, nobody: -0.6, no: -0.3, without: -0.4,
  war: -0.7, fight: -0.4, fighting: -0.45, angry: -0.65, anger: -0.7, rage: -0.8,
  ghost: -0.5, haunt: -0.65, haunted: -0.7, silence: -0.35, silent: -0.3,
  rain: -0.2, storm: -0.35, winter: -0.3, ruin: -0.75, ruined: -0.8, waste: -0.6,
};

/** How much physical energy a word carries. 0 = still, 1 = violent motion. */
export const AROUSAL: Record<string, number> = {
  scream: 1.0, screaming: 1.0, shout: 0.9, shouting: 0.9, yell: 0.9, roar: 0.95,
  explode: 1.0, explosion: 1.0, burst: 0.9, blast: 0.9, crash: 0.9, crashing: 0.9,
  smash: 0.95, shatter: 0.9, shattered: 0.85, tear: 0.8, tearing: 0.85, rip: 0.85,
  burn: 0.85, burning: 0.85, fire: 0.8, flame: 0.75, flames: 0.8, blaze: 0.9, inferno: 0.95,
  run: 0.75, running: 0.8, race: 0.8, chase: 0.8, chasing: 0.8, escape: 0.75,
  fight: 0.85, fighting: 0.85, war: 0.8, battle: 0.85, strike: 0.85, hit: 0.8,
  rage: 0.95, fury: 0.95, wild: 0.8, wilder: 0.8, crazy: 0.8, mad: 0.75, insane: 0.85,
  dance: 0.7, dancing: 0.75, jump: 0.75, dive: 0.7, fly: 0.65, flying: 0.7,
  storm: 0.8, thunder: 0.85, lightning: 0.9, hurricane: 0.95, quake: 0.9,
  pound: 0.85, pounding: 0.85, beat: 0.6, beating: 0.65, pulse: 0.6, heartbeat: 0.6,
  loud: 0.8, louder: 0.85, noise: 0.7, alarm: 0.8, siren: 0.85,
  rush: 0.8, rushing: 0.8, speed: 0.8, fast: 0.75, faster: 0.85, drive: 0.65, driving: 0.7,
  shake: 0.75, shaking: 0.75, tremble: 0.6, shiver: 0.5,
  rise: 0.55, climb: 0.6, higher: 0.6, up: 0.45,

  // stillness
  still: 0.05, quiet: 0.08, quietly: 0.08, silence: 0.05, silent: 0.05, hush: 0.05,
  sleep: 0.05, sleeping: 0.05, asleep: 0.05, dream: 0.15, dreaming: 0.15, drift: 0.15,
  slow: 0.15, slowly: 0.15, soft: 0.15, softly: 0.15, gentle: 0.2, gently: 0.2,
  whisper: 0.15, whispering: 0.15, breathe: 0.25, breathing: 0.25, sigh: 0.2,
  wait: 0.15, waiting: 0.15, stay: 0.2, rest: 0.1, resting: 0.1, calm: 0.1,
  float: 0.2, floating: 0.2, hover: 0.2, linger: 0.15, lying: 0.1, sit: 0.1, sitting: 0.1,
  frozen: 0.1, freeze: 0.15, stopped: 0.05, motionless: 0.0, sink: 0.25, sinking: 0.3,
};

export type ThemeKey =
  | 'love'
  | 'loss'
  | 'defiance'
  | 'transcendence'
  | 'nature'
  | 'night'
  | 'motion'
  | 'body'
  | 'memory'
  | 'city'
  | 'water'
  | 'fire';

export interface ThemeDef {
  key: ThemeKey;
  /** Shown to the user in the machine's written reading. */
  label: string;
  /** One-line description of what this theme does to the picture. */
  gloss: string;
  words: string[];
}

/**
 * Thematic fields. A song usually lights up three or four of these; the
 * strongest one picks the visual system, the rest bend its parameters.
 */
export const THEMES: ThemeDef[] = [
  {
    key: 'love',
    label: 'Love & Longing',
    gloss: 'pulls forms toward a center and warms the palette',
    words: [
      'love', 'loves', 'loved', 'loving', 'lover', 'heart', 'hearts', 'kiss', 'kissed',
      'touch', 'hold', 'holding', 'held', 'want', 'wanted', 'need', 'needed', 'desire',
      'yours', 'mine', 'baby', 'darling', 'honey', 'sweetheart', 'romance', 'together',
      'embrace', 'arms', 'close', 'closer', 'crave', 'longing', 'yearn', 'miss', 'missing',
      'adore', 'devotion', 'forever', 'promise', 'vow', 'marry', 'bride', 'ring',
    ],
  },
  {
    key: 'loss',
    label: 'Loss & Grief',
    gloss: 'thins the light and lets the composition fall apart at the edges',
    words: [
      'lost', 'lose', 'losing', 'loss', 'gone', 'goodbye', 'farewell', 'left', 'leaving',
      'grief', 'grieve', 'mourn', 'mourning', 'sorrow', 'tears', 'cry', 'crying', 'weep',
      'miss', 'missed', 'empty', 'emptiness', 'hollow', 'alone', 'lonely', 'loneliness',
      'broken', 'shattered', 'ache', 'aching', 'wound', 'scar', 'scars', 'grave', 'buried',
      'die', 'died', 'dying', 'dead', 'death', 'funeral', 'ghost', 'ghosts', 'absence',
      'without', 'never', 'nothing', 'nobody', 'over', 'ended', 'ending', 'goodnight',
    ],
  },
  {
    key: 'defiance',
    label: 'Defiance & Anger',
    gloss: 'fractures the surface and drives hard diagonals through it',
    words: [
      'fight', 'fighting', 'fought', 'war', 'battle', 'enemy', 'rebel', 'revolt', 'riot',
      'anger', 'angry', 'rage', 'fury', 'furious', 'hate', 'hated', 'scream', 'screaming',
      'shout', 'yell', 'roar', 'burn', 'burning', 'destroy', 'break', 'breaking', 'smash',
      'refuse', 'resist', 'stand', 'against', 'never', 'won', 'win', 'fist', 'blood',
      'revenge', 'betray', 'betrayed', 'liar', 'lies', 'blame', 'guilty', 'chains', 'cage',
      'free', 'freedom', 'escape', 'run', 'survive', 'stronger', 'rise', 'fallen',
    ],
  },
  {
    key: 'transcendence',
    label: 'Transcendence & Faith',
    gloss: 'organizes everything around a radiant center',
    words: [
      'god', 'lord', 'heaven', 'holy', 'sacred', 'divine', 'angel', 'angels', 'soul',
      'spirit', 'prayer', 'pray', 'praying', 'faith', 'believe', 'grace', 'bless', 'blessed',
      'saved', 'salvation', 'sin', 'sinner', 'forgive', 'forgiven', 'redemption', 'gospel',
      'eternal', 'eternity', 'infinite', 'universe', 'cosmos', 'star', 'stars', 'light',
      'rise', 'risen', 'above', 'higher', 'beyond', 'transcend', 'awake', 'awakening',
      'truth', 'meaning', 'purpose', 'destiny', 'fate', 'miracle', 'wonder', 'glory',
    ],
  },
  {
    key: 'nature',
    label: 'Earth & Growing Things',
    gloss: 'softens every edge into organic growth',
    words: [
      'tree', 'trees', 'forest', 'wood', 'woods', 'leaf', 'leaves', 'branch', 'root', 'roots',
      'flower', 'flowers', 'bloom', 'blossom', 'garden', 'grass', 'field', 'fields', 'meadow',
      'mountain', 'mountains', 'hill', 'hills', 'valley', 'stone', 'stones', 'rock', 'earth',
      'ground', 'soil', 'dirt', 'dust', 'seed', 'grow', 'growing', 'green', 'wild',
      'bird', 'birds', 'wing', 'wings', 'crow', 'dove', 'wolf', 'horse', 'animal',
      'spring', 'summer', 'autumn', 'winter', 'harvest', 'season', 'sky', 'wind', 'air',
    ],
  },
  {
    key: 'night',
    label: 'Night & Dream',
    gloss: 'drops the value range and scatters points of light across the dark',
    words: [
      'night', 'nights', 'midnight', 'dark', 'darkness', 'shadow', 'shadows', 'moon',
      'moonlight', 'star', 'stars', 'starlight', 'sleep', 'asleep', 'dream', 'dreams',
      'dreaming', 'nightmare', 'wake', 'awake', 'insomnia', 'late', 'evening', 'dusk',
      'twilight', 'black', 'blind', 'unseen', 'hidden', 'secret', 'quiet', 'silence',
      'ghost', 'haunt', 'haunted', 'drift', 'floating', 'lucid', 'vision', 'illusion',
    ],
  },
  {
    key: 'motion',
    label: 'Motion & Escape',
    gloss: 'lays down long directional currents the whole picture travels along',
    words: [
      'road', 'roads', 'highway', 'street', 'streets', 'drive', 'driving', 'drove', 'car',
      'train', 'plane', 'bus', 'wheels', 'engine', 'travel', 'journey', 'miles', 'distance',
      'run', 'running', 'ran', 'walk', 'walking', 'go', 'going', 'gone', 'leave', 'leaving',
      'escape', 'chase', 'chasing', 'follow', 'away', 'far', 'further', 'forward', 'ahead',
      'wander', 'wandering', 'roam', 'drift', 'drifting', 'move', 'moving', 'flee', 'fly',
      'return', 'coming', 'back', 'north', 'south', 'east', 'west', 'border', 'horizon',
    ],
  },
  {
    key: 'body',
    label: 'Body & Appetite',
    gloss: 'thickens the marks and brings them close to the picture plane',
    words: [
      'body', 'skin', 'bone', 'bones', 'blood', 'flesh', 'hand', 'hands', 'finger', 'fingers',
      'mouth', 'lips', 'tongue', 'teeth', 'eyes', 'eye', 'hair', 'face', 'neck', 'back',
      'hips', 'legs', 'feet', 'breath', 'breathe', 'breathing', 'sweat', 'pulse', 'heartbeat',
      'hunger', 'hungry', 'thirst', 'taste', 'tasting', 'smell', 'feel', 'feeling', 'felt',
      'hot', 'heat', 'fever', 'shiver', 'tremble', 'naked', 'bed', 'sheets', 'skin',
    ],
  },
  {
    key: 'memory',
    label: 'Memory & Time',
    gloss: 'stacks the image into strata, like sediment or old photographs',
    words: [
      'remember', 'remembered', 'memory', 'memories', 'forget', 'forgot', 'forgotten',
      'past', 'used', 'once', 'before', 'ago', 'yesterday', 'childhood', 'young', 'younger',
      'old', 'older', 'time', 'times', 'year', 'years', 'day', 'days', 'summer', 'photograph',
      'picture', 'letter', 'letters', 'name', 'names', 'story', 'told', 'said', 'was', 'were',
      'nostalgia', 'return', 'again', 'still', 'always', 'never', 'ancient', 'history', 'trace',
    ],
  },
  {
    key: 'city',
    label: 'City & Machine',
    gloss: 'imposes a rigid lattice the organic forms have to negotiate',
    words: [
      'city', 'cities', 'town', 'downtown', 'street', 'streets', 'building', 'buildings',
      'concrete', 'steel', 'glass', 'window', 'windows', 'door', 'doors', 'wall', 'walls',
      'room', 'rooms', 'apartment', 'floor', 'stairs', 'roof', 'bridge', 'tunnel', 'subway',
      'neon', 'sign', 'signs', 'light', 'lights', 'traffic', 'crowd', 'crowds', 'people',
      'machine', 'machines', 'wire', 'wires', 'phone', 'screen', 'television', 'radio',
      'money', 'work', 'job', 'factory', 'smoke', 'noise', 'siren', 'electric', 'current',
    ],
  },
  {
    key: 'water',
    label: 'Water',
    gloss: 'makes everything flow, pool, and reflect',
    words: [
      'water', 'waters', 'sea', 'ocean', 'wave', 'waves', 'tide', 'tides', 'river', 'rivers',
      'stream', 'creek', 'lake', 'pond', 'rain', 'raining', 'storm', 'flood', 'flooded',
      'drown', 'drowning', 'swim', 'swimming', 'sink', 'sinking', 'deep', 'deeper', 'depth',
      'shore', 'beach', 'sand', 'coast', 'harbor', 'boat', 'ship', 'sail', 'sailing', 'anchor',
      'blue', 'wet', 'salt', 'tears', 'pour', 'pouring', 'flow', 'flowing', 'current', 'ice',
    ],
  },
  {
    key: 'fire',
    label: 'Fire & Light',
    gloss: 'pushes hot color outward from bright cores',
    words: [
      'fire', 'fires', 'flame', 'flames', 'burn', 'burning', 'burned', 'burnt', 'blaze',
      'spark', 'sparks', 'ember', 'embers', 'ash', 'ashes', 'smoke', 'coal', 'candle',
      'light', 'lights', 'bright', 'brighter', 'shine', 'shining', 'glow', 'glowing',
      'sun', 'sunlight', 'sunshine', 'dawn', 'sunrise', 'sunset', 'gold', 'golden',
      'heat', 'hot', 'warm', 'warmth', 'red', 'orange', 'yellow', 'lightning', 'flash',
      'ignite', 'burning', 'fever', 'inferno', 'torch', 'lantern', 'star', 'match',
    ],
  },
];

/** Explicit color words the machine will honor literally in the palette. */
export const COLOR_WORDS: Record<string, number> = {
  red: 0, crimson: 355, scarlet: 5, blood: 0, ruby: 350,
  orange: 28, amber: 40, rust: 20, copper: 25,
  yellow: 52, gold: 45, golden: 45, honey: 40,
  green: 130, emerald: 145, jade: 155, olive: 80, lime: 90,
  teal: 178, turquoise: 172, cyan: 185,
  blue: 215, azure: 205, navy: 225, indigo: 245, cobalt: 220,
  purple: 280, violet: 275, lavender: 270, plum: 300, magenta: 315,
  pink: 335, rose: 345, blush: 350,
  brown: 25, bronze: 30, sepia: 35,
  silver: 210, grey: 210, gray: 210, white: 45, black: 240, ivory: 45,
};

/** Function words excluded from "signature word" reporting. */
export const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'so', 'as', 'than', 'that', 'this',
  'these', 'those', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does',
  'did', 'doing', 'have', 'has', 'had', 'having', 'will', 'would', 'shall', 'should',
  'can', 'could', 'may', 'might', 'must', 'to', 'of', 'in', 'on', 'at', 'by', 'for',
  'with', 'from', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'it', 'its',
  'i', 'me', 'my', 'mine', 'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her',
  'hers', 'we', 'us', 'our', 'ours', 'they', 'them', 'their', 'theirs', 'what', 'which',
  'who', 'whom', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few',
  'more', 'most', 'other', 'some', 'such', 'not', 'only', 'own', 'same', 'too', 'very',
  'just', 'now', 'get', 'got', 'go', 'going', 'gonna', 'wanna', 'im', 'ive', 'dont',
  'cant', 'wont', 'aint', 'yeah', 'yea', 'ooh', 'oh', 'uh', 'ah', 'na', 'la', 'hey',
  'em', 'ya', 'til', 'cause', 'coz', 'let', 'lets', 'theres', 'thats', 'youre', 'theyre',
]);

/** Pronoun buckets — who the song is addressed to shapes the composition's focus. */
export const PRONOUNS = {
  first: new Set(['i', 'me', 'my', 'mine', 'myself', 'im', 'ive', 'ill', 'id']),
  second: new Set(['you', 'your', 'yours', 'yourself', 'youre', 'youve', 'youll']),
  collective: new Set(['we', 'us', 'our', 'ours', 'ourselves', 'weve', 'well', 'were']),
  third: new Set(['he', 'him', 'his', 'she', 'her', 'hers', 'they', 'them', 'their', 'theirs']),
} as const;
