/* ============================================================
   COOKIE CORNER — Content Moderation
   Validates review text before submission.
   ============================================================ */

const BLOCKED_WORDS = [

  // ── English: racial & ethnic slurs ───────────────────────
  'nigger','nigga','niggas','nig','chink','chinks','spic','spics',
  'kike','kikes','wetback','wetbacks','gook','gooks','coon','coons',
  'jigaboo','sambo','zipperhead','beaner','beaners','towelhead',
  'raghead','ragheads','camel jockey','sand nigger','porch monkey',
  'jungle bunny','mud people','nip','jap','japs','kraut','krauts',
  'mick','paddy','polack','dago','wop','greaseball','limey','frog',
  'redskin','injun','squaw','slope','gypsy','pikey','hymie',
  'sheeny','yid','hebe','cholo','pocho','spook','cuck',
  'cracker','honky','whitey','redneck','hillbilly','white trash',

  // ── English: homophobic & transphobic slurs ───────────────
  'faggot','faggots','fag','fags','dyke','dykes','tranny','trannies',
  'shemale','homo','poofter','poof','pansy','fairy','queer',

  // ── English: ableist slurs ───────────────────────────────
  'retard','retarded','retards','spaz','spastic','mong',

  // ── English: profanity ───────────────────────────────────
  'fuck','fucking','fucked','fucker','fuckers','shit','shitting',
  'cunt','cunts','bitch','bitches','bastard','bastards',
  'whore','whores','slut','sluts','asshole','assholes',
  'dickhead','motherfucker','cocksucker','cock','dick','pussy',
  'piss','prick','twat','wanker','bullshit','horseshit',

  // ── Nazi & white supremacist ─────────────────────────────
  'nazi','nazis','neonazi','neo-nazi','nsdap',
  'hitler','adolf','adolf hitler',
  'heil','sieg heil','heil hitler',
  'third reich','drittes reich',
  'aryan','aryans','aryan race',
  'waffen ss','waffen-ss','schutzstaffel',
  'gestapo','ss officer',
  'white power','white supremacy','white supremacist','white nationalist',
  'ethnic cleansing','final solution','master race',
  'holocaust denier','kkk','ku klux','ku klux klan',
  '1488','14/88','14 88','1488ers',
  'hakenkreuz','swastika',
  'untermensch','untermenschen','untermensch',
  'rassenschande','volksjude','endlösung',

  // ── German: racial & ethnic slurs ───────────────────────
  'neger','negermusik',
  'kanake','kanaken',
  'kümmeltürke','türkenschwein','türkensau',
  'judensau','judenschwein','juden raus','jude raus',
  'itaker','makaroni',
  'schlitzauge','schlitzaugen',
  'kameltreiber','kameltreiber',
  'kohle','bimbo',
  'zigeuner','zigeunerin',
  'mohr',
  'ausländer raus','deutschland den deutschen',
  'scheiß ausländer','dreckiger ausländer',
  'scheiß türke','scheiß jude','scheiß araber',

  // ── German: homophobic & transphobic slurs ───────────────
  'schwuchtel','warmer bruder','tunte','tunten',
  'lesbe','lesben',

  // ── German: profanity ────────────────────────────────────
  'wichser','wichsers','wichse',
  'hurensohn','hurensöhne','hurenbock',
  'schlampe','schlampen',
  'fotze','fotzen',
  'arschloch','arschlöcher',
  'drecksau','drecksäue',
  'vollidiot','vollidioten',
  'scheißkerl','scheißkerle',
  'miststück','miststücke',
  'verpissdich','verpiss dich',
  'wixer','spastiker',
  'dreckiges schwein','dreckschwein',
  'pisser','pisskerl',

];

// Non-Latin Unicode blocks: Cyrillic, Arabic, CJK, Kana, Devanagari, Greek, Hebrew, etc.
const NON_LATIN = /[Ͱ-ϿЀ-ӿ֐-׿؀-ۿऀ-ॿ぀-ヿ一-鿿가-힯]/;

/**
 * Validates a piece of review text.
 * Returns an error string if invalid, or null if clean.
 */
function validateReviewText(text) {
  if (!text || !text.trim()) return null;

  // Language check — reject non-Latin scripts
  if (NON_LATIN.test(text)) {
    return 'Please write your review in English or German.';
  }

  // Blacklist check — normalise punctuation to spaces for reliable word matching
  const padded = ' ' + text.toLowerCase().replace(/[^a-zäöüß0-9]/gi, ' ').replace(/\s+/g, ' ') + ' ';

  for (const word of BLOCKED_WORDS) {
    if (padded.includes(' ' + word + ' ')) {
      return 'Your review contains inappropriate language. Please keep it respectful 🙂';
    }
  }

  return null;
}
