// Tessera analysis engine: syllables, stress, rhyme, and poetic-form
// detection. Pure functions with no DOM access, so it runs in the browser
// (as window.TesseraAnalysis) and under Node for tests (module.exports).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TesseraAnalysis = factory();
})(this, function () {
  'use strict';

  function capitalizeFirst(word) {
    return word ? word[0].toUpperCase() + word.slice(1) : word;
  }

  // -----------------------------------------------------------------
  // STRESS DICTIONARY
  // Stress patterns: '0' = unstressed, '1' = stressed. Derived from the
  // CMU Pronouncing Dictionary, restricted to common English words and
  // poetic vocabulary. Unknown words fall back to suffix-aware heuristics.
  // -----------------------------------------------------------------
  const STRESS_DICT = {
    // Diphthong + r words the CMU dictionary splits in two but verse
    // almost always treats as one syllable (Blake's "fire of thine eyes").
    'fire':'1','fires':'1','fired':'1','hour':'1','hours':'1','ours':'1','ourselves':'01',
    'tired':'1','desires':'01','sour':'1','choir':'1','wire':'1','spire':'1','lyre':'1',

    // Function words — typically unstressed in metered verse
    'a':'0','an':'0','the':'0','and':'0','but':'0','or':'0','nor':'0','yet':'0','so':'0',
    'for':'0','of':'0','to':'0','in':'0','on':'0','at':'0','by':'0','with':'0','from':'0',
    'as':'0','if':'0','though':'0','when':'0','while':'0','where':'0',
    'i':'0','you':'0','he':'0','she':'0','it':'0','we':'0','they':'0',
    'me':'0','him':'0','us':'0','them':'0',
    'my':'0','your':'0','his':'0','our':'0','their':'0','its':'0',
    'this':'0','that':'0','these':'0','those':'0',
    'am':'0','is':'0','are':'0','was':'0','were':'0','be':'0','been':'0','being':'10',
    'have':'0','has':'0','had':'0','having':'10',
    'do':'0','does':'0','did':'0','doing':'10',
    'will':'0','would':'0','shall':'0','should':'0',
    'can':'0','could':'0','may':'0','might':'0','must':'0',
    'not':'0','no':'0','any':'10','all':'1','some':'1','none':'1',
    // Archaic / poetic pronouns
    'thee':'0','thou':'0','thy':'0','thine':'0','ye':'0','ere':'0','o\'er':'0',

    // Iambs (01) — stress on second syllable
    'about':'01','above':'01','across':'01','afraid':'01','again':'01','against':'01','agree':'01',
    'ahead':'01','alarm':'01','alas':'01','alike':'01','alive':'01','allow':'01','alone':'01',
    'along':'01','aloud':'01','among':'01','amount':'01','apart':'01','appeal':'01','appear':'01',
    'apply':'01','arise':'01','around':'01','arrive':'01','aside':'01','asleep':'01','attack':'01',
    'attempt':'01','attend':'01','attract':'01','await':'01','awake':'01','aware':'01','away':'01',
    'because':'01','become':'01','before':'01','began':'01','begin':'01','begun':'01','behind':'01',
    'behold':'01','belief':'01','believe':'01','beneath':'01','below':'01','beside':'01','besides':'01',
    'between':'01','beyond':'01','compare':'01','compete':'01','complete':'01','compose':'01',
    'concern':'01','condemn':'01','confess':'01','confide':'01','confine':'01','confirm':'01',
    'confuse':'01','connect':'01','consent':'01','consist':'01','contain':'01','content':'01',
    'control':'01','convey':'01','create':'01','decide':'01','declare':'01','decline':'01',
    'defeat':'01','defend':'01','define':'01','delight':'01','demand':'01','deny':'01','depart':'01',
    'depend':'01','depict':'01','descend':'01','describe':'01','desire':'01','despair':'01',
    'destroy':'01','detect':'01','devote':'01','devour':'01','disclose':'01','discuss':'01',
    'divide':'01','divine':'01','employ':'01','enjoy':'01','enough':'01','ensure':'01','escape':'01',
    'event':'01','except':'01','exclaim':'01','exhaust':'01','exist':'01','expand':'01','expect':'01',
    'expire':'01','explain':'01','explode':'01','explore':'01','expose':'01','extend':'01','extreme':'01',
    'forget':'01','forgive':'01','fulfill':'01','ignore':'01','imply':'01','inform':'01','inside':'01',
    'insist':'01','instead':'01','intend':'01','invite':'01','involve':'01','obtain':'01','occur':'01',
    'offend':'01','oppose':'01','outside':'01','perceive':'01','perform':'01','perhaps':'01','permit':'01',
    'persuade':'01','possess':'01','prefer':'01','prepare':'01','present':'01','pretend':'01','prevent':'01',
    'propose':'01','protect':'01','provide':'01','pursue':'01','receive':'01','reduce':'01','refer':'01',
    'refuse':'01','regard':'01','regret':'01','rejoice':'01','relax':'01','release':'01','rely':'01',
    'remain':'01','remark':'01','remind':'01','remote':'01','remove':'01','renew':'01','repair':'01',
    'repeat':'01','reply':'01','report':'01','request':'01','require':'01','resist':'01','resolve':'01',
    'respect':'01','respond':'01','restore':'01','result':'01','resume':'01','retain':'01','retire':'01',
    'retreat':'01','return':'01','reveal':'01','review':'01','reward':'01','submit':'01','succeed':'01',
    'success':'01','suggest':'01','support':'01','suppose':'01','surprise':'01','surround':'01',
    'survive':'01','sustain':'01','today':'01','tonight':'01','unfair':'01','unite':'01','unknown':'01',
    'unless':'01','until':'01','upon':'01','withdraw':'01',

    // Trochees (10) — stress on first syllable
    'able':'10','absent':'10','after':'10','almost':'10','always':'10','angel':'10','anger':'10',
    'angry':'10','apple':'10','arrow':'10','autumn':'10','baby':'10','beauty':'10','better':'10',
    'bitter':'10','body':'10','bottom':'10','brother':'10','busy':'10','candle':'10','careful':'10',
    'castle':'10','central':'10','certain':'10','chapter':'10','children':'10','chosen':'10',
    'circle':'10','city':'10','climate':'10','color':'10','common':'10','cottage':'10','country':'10',
    'cover':'10','danger':'10','darling':'10','daughter':'10','distant':'10','doctor':'10','double':'10',
    'dragon':'10','dreamer':'10','earnest':'10','easy':'10','either':'10','elder':'10','empty':'10',
    'ever':'10','every':'10','evil':'10','fallen':'10','famous':'10','farmer':'10','father':'10',
    'fearful':'10','feature':'10','fellow':'10','female':'10','final':'10','finger':'10','finish':'10',
    'flower':'10','follow':'10','forest':'10','fortune':'10','forty':'10','forward':'10','fragrant':'10',
    'friendly':'10','frosty':'10','garden':'10','gather':'10','gentle':'10','glory':'10','golden':'10',
    'gracious':'10','greedy':'10','happy':'10','harbor':'10','harvest':'10','heaven':'10','heavy':'10',
    'hidden':'10','holy':'10','honest':'10','honey':'10','honor':'10','human':'10','humble':'10',
    'hunger':'10','hungry':'10','hunter':'10','husband':'10','image':'10','iron':'10','island':'10',
    'journey':'10','justice':'10','kingdom':'10','kitchen':'10','ladder':'10','lady':'10','language':'10',
    'laughter':'10','lazy':'10','letter':'10','little':'10','listen':'10','living':'10','lovely':'10',
    'lover':'10','loyal':'10','magic':'10','maiden':'10','master':'10','matter':'10','meadow':'10',
    'measure':'10','mercy':'10','merit':'10','message':'10','middle':'10','mighty':'10','mirror':'10',
    'modern':'10','modest':'10','moment':'10','money':'10','mortal':'10','mother':'10','mountain':'10',
    'music':'10','nature':'10','nearly':'10','never':'10','noble':'10','northern':'10','nothing':'10',
    'number':'10','ocean':'10','often':'10','only':'10','open':'10','order':'10','other':'10',
    'over':'10','parent':'10','partner':'10','passion':'10','patient':'10','peaceful':'10','people':'10',
    'perfect':'10','person':'10','picture':'10','pity':'10','pleasant':'10','pleasure':'10','poet':'10',
    'power':'10','pretty':'10','prison':'10','private':'10','problem':'10','profit':'10','public':'10',
    'purple':'10','purpose':'10','question':'10','quickly':'10','quiet':'10','reading':'10','ready':'10',
    'really':'10','reason':'10','river':'10','royal':'10','sacred':'10','sailor':'10','savage':'10',
    'season':'10','secret':'10','shadow':'10','shallow':'10','shelter':'10','silent':'10','silver':'10',
    'simple':'10','single':'10','sister':'10','sleeping':'10','slowly':'10','softly':'10','soldier':'10',
    'something':'10','sometime':'10','sorrow':'10','southern':'10','special':'10','spirit':'10',
    'splendid':'10','stately':'10','steady':'10','stolen':'10','stormy':'10','story':'10','stranger':'10',
    'student':'10','sudden':'10','suffer':'10','summer':'10','sunset':'10','sunshine':'10','supper':'10',
    'sweetly':'10','system':'10','table':'10','taken':'10','tender':'10','thunder':'10','tiger':'10',
    'tiny':'10','title':'10','tower':'10','travel':'10','treasure':'10','trouble':'10','truly':'10',
    'turtle':'10','twenty':'10','twinkle':'10','under':'10','useful':'10','useless':'10','velvet':'10',
    'visit':'10','wander':'10','water':'10','weary':'10','weather':'10','welcome':'10','western':'10',
    'whisper':'10','window':'10','winter':'10','wisdom':'10','woman':'10','wonder':'10','wooden':'10',
    'working':'10','worry':'10','worthy':'10','writer':'10','yellow':'10','younger':'10',

    // Dactyls (100) — three syllables, stress on first
    'animal':'100','beautiful':'100','capital':'100','careless':'100','century':'100','certainly':'100',
    'character':'100','colorful':'100','company':'100','comedy':'100','dangerous':'100','delicate':'100',
    'dignity':'100','discipline':'100','energy':'100','enemy':'100','everything':'100','evidence':'100',
    'family':'100','finally':'100','fortunate':'100','generous':'100','glorious':'100','gratitude':'100',
    'happily':'100','history':'100','honesty':'100','horrible':'100','industry':'100','innocent':'100',
    'liberty':'100','library':'100','memory':'100','minister':'100','miracle':'100','mystery':'100',
    'natural':'100','opposite':'100','origin':'100','positive':'100','powerful':'100','president':'100',
    'principle':'100','quality':'100','remedy':'100','sensible':'100','serious':'100','similar':'100',
    'symphony':'100','terrible':'100','wonderful':'100',

    // Amphibrachs (010) — three syllables, stress on middle
    'amazing':'010','consider':'010','continue':'010','delicious':'010','delightful':'010','depending':'010',
    'develop':'010','discover':'010','eternal':'010','familiar':'010','forever':'010','forgotten':'010',
    'imagine':'010','important':'010','observe':'01','observer':'010','romantic':'010','september':'010',
    'surrender':'010','together':'010','tomorrow':'010','unable':'010','whatever':'010','whenever':'010',
    'wherever':'010','whoever':'010',

    // Anapests (001) — three syllables, stress on last
    'comprehend':'001','contradict':'001','disagree':'001','introduce':'001','overcome':'001',
    'recommend':'001','understand':'001','undergo':'001'
  };

  // -----------------------------------------------------------------
  // FULL PRONUNCIATION DICTIONARY (optional, loaded at runtime)
  // data/pronunciations.txt is built from the CMU Pronouncing Dictionary by
  // tools/build-pronunciations.js, which leaves out every word these rules
  // already get right (inflections of known words, unambiguous spellings).
  // Until it arrives, everything falls back to STRESS_DICT plus heuristics.
  // -----------------------------------------------------------------
  let PRON_STRESS = null; // word -> '010'
  let PRON_RHYME = null;  // word -> ['AY R', ...] phonemes from the last stressed vowel on

  // Parse the compact text format: a JSON header line with the stress and
  // rhyme-tail tables, then one "prefixLen word,stressIdx,tailIdx.tailIdx"
  // line per word (front-coded against the previous word, base 36 numbers).
  function loadPronunciations(data) {
    const parser = pronunciationParser(data);
    if (!parser) return 0;
    parser.step(Infinity);
    return parser.finish();
  }

  // Same as loadPronunciations, but parses in ~8 ms slices and yields to
  // the browser between them, so the page never freezes while it loads.
  function loadPronunciationsAsync(data, sliceMs) {
    const parser = pronunciationParser(data);
    if (!parser) return Promise.resolve(0);
    const budget = sliceMs || 8;
    return new Promise((resolve) => {
      const tick = () => {
        const until = Date.now() + budget;
        if (parser.step(until)) resolve(parser.finish());
        else setTimeout(tick, 0);
      };
      tick();
    });
  }

  function pronunciationParser(data) {
    if (typeof data !== 'string') return null;
    const nl = data.indexOf('\n');
    const head = JSON.parse(data.slice(0, nl));
    const stress = new Map(), rhyme = new Map();
    let prev = '';
    let i = nl + 1;
    return {
      // Parse lines until the deadline (ms timestamp); true when done.
      step(until) {
        let n = 0;
        while (i < data.length) {
          let j = data.indexOf('\n', i);
          if (j === -1) j = data.length;
          const line = data.slice(i, j);
          i = j + 1;
          if (line) {
            const parts = line.split(',');
            const keep = parseInt(parts[0][0], 36);
            const word = prev.slice(0, keep) + parts[0].slice(1);
            prev = word;
            stress.set(word, head.stress[parseInt(parts[1], 36)]);
            rhyme.set(word, parts[2].split('.').map((t) => head.tails[parseInt(t, 36)]));
          }
          if (++n % 500 === 0 && Date.now() >= until) return false;
        }
        return true;
      },
      finish() {
        PRON_STRESS = stress;
        PRON_RHYME = rhyme;
        return stress.size;
      }
    };
  }

  function hasPronunciations() {
    return PRON_STRESS !== null;
  }

  // For the build tool: run the rules against an arbitrary word list.
  function setPronunciationMaps(stress, rhyme) {
    PRON_STRESS = stress;
    PRON_RHYME = rhyme;
  }

  // Spellings to try for a word, most literal first: archaic elisions like
  // dimm'd / wander'st / summer's map onto their modern dictionary forms.
  function pronVariants(raw) {
    const w = String(raw).toLowerCase().replace(/’/g, "'")
      .replace(/[^a-z']/g, '').replace(/^'+|'+$/g, '');
    if (!w) return [];
    const out = [w];
    if (/'d$/.test(w)) out.push(w.slice(0, -2) + 'ed');
    if (/'(s|ll|re|ve|m)$/.test(w)) out.push(w.replace(/'(s|ll|re|ve|m)$/, ''));
    if (w.indexOf("'") !== -1) out.push(w.replace(/'/g, ''));
    return out;
  }

  function lookupPron(map, raw) {
    if (!map) return null;
    let found = null;
    for (const v of pronVariants(raw)) {
      if (map.has(v)) { found = map.get(v); break; }
    }
    if (found === null) {
      const derived = derivePron(raw);
      if (!derived) return null;
      found = map === PRON_STRESS ? derived.stress : derived.tails;
    }
    // -ire words (fire, wires, desire, empire): CMU splits "AY ER" into two
    // syllables, but verse almost always scans them as one.
    if (map === PRON_STRESS && found.length > 1 && found.endsWith('0') &&
        /ire[sd]?$/.test(String(raw).toLowerCase())) {
      found = found.slice(0, -1);
    }
    return found;
  }

  // ---- Inflections of known words -----------------------------------
  // walked, walking, walks, happier, kindness... are built from the stem's
  // pronunciation, so the dictionary file doesn't need to list them.
  const VOICELESS = new Set(['P', 'T', 'K', 'F', 'TH']);
  const SIBILANT = new Set(['S', 'Z', 'SH', 'ZH', 'CH', 'JH']);
  const VOWEL_PHONES = new Set(['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW']);
  const SUFFIX_PHONES = {
    ing: 'IH NG', ings: 'IH NG Z', er: 'ER', ers: 'ER Z', est: 'AH S T', ly: 'L IY',
    ness: 'N AH S', ful: 'F AH L', less: 'L AH S', ment: 'M AH N T', ments: 'M AH N T S'
  };
  const INFLECTIONS = ['ments', 'ment', 'ings', 'ing', 'ness', 'less', 'ful', 'ers', 'est', 'er', 'ly', 'es', 'ed', 's'];

  function stemCandidates(stem) {
    // Two-letter stems are usually a dropped "e" (ow'st -> owe, not ow).
    const out = stem.length <= 2 ? [stem + 'e', stem] : [stem, stem + 'e'];
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) out.push(stem.slice(0, -1)); // stopped -> stop
    if (/i$/.test(stem)) out.push(stem.slice(0, -1) + 'y');               // cried -> cry
    return out;
  }

  function derivePron(raw) {
    if (!PRON_STRESS) return null;
    const w = pronVariants(raw)[0];
    if (!w) return null;
    // Archaic second person, one syllable: grow'st, ow'st, wander'st.
    if (/'st$/.test(w)) {
      for (const stem of stemCandidates(w.slice(0, -3))) {
        if (!PRON_STRESS.has(stem)) continue;
        return {
          stress: PRON_STRESS.get(stem),
          tails: (PRON_RHYME.get(stem) || []).map((t) => t + ' S T')
        };
      }
      return null;
    }
    if (w.indexOf("'") !== -1) return null;
    for (const suf of INFLECTIONS) {
      if (w.length < suf.length + 2 || !w.endsWith(suf)) continue;
      for (const stem of stemCandidates(w.slice(0, -suf.length))) {
        if (stem.length < 2 || !PRON_STRESS.has(stem)) continue;
        const base = PRON_STRESS.get(stem);
        const tails = PRON_RHYME.get(stem) || [];
        const last = (tails[0] || '').split(' ').pop();
        let add;
        if (suf === 's' || suf === 'es') {
          add = SIBILANT.has(last) ? 'AH Z' : (VOICELESS.has(last) ? 'S' : 'Z');
          if (suf === 'es' && add !== 'AH Z' && !VOWEL_PHONES.has(last)) continue; // "boxe" + s is not a thing
        } else if (suf === 'ed') {
          add = (last === 'T' || last === 'D') ? 'AH D' : (VOICELESS.has(last) || SIBILANT.has(last) && last !== 'Z' && last !== 'ZH' && last !== 'JH' ? 'T' : 'D');
        } else {
          add = SUFFIX_PHONES[suf];
        }
        const extra = add.split(' ').filter((p) => VOWEL_PHONES.has(p)).length;
        return {
          stress: base + '0'.repeat(extra),
          tails: tails.map((t) => t + ' ' + add)
        };
      }
    }
    return null;
  }

  // Return a stress pattern string (0s and 1s) for one word.
  function getWordStress(rawWord) {
    if (!rawWord) return '';
    // Normalize: lowercase, strip common contractions for lookup
    const w = rawWord.toLowerCase().replace(/[\u2019']s$|[\u2019']re$|[\u2019']ve$|[\u2019']d$|[\u2019']m$|[\u2019']ll$/, '');
    if (Object.hasOwn(STRESS_DICT, w)) return STRESS_DICT[w];
    const full = lookupPron(PRON_STRESS, rawWord);
    if (full) return full;
    return heuristicStress(w);
  }

  // Suffix-aware fallback for words missing from the dictionary.
  function heuristicStress(word) {
    const syllables = countSyllables(word);
    if (syllables <= 1) return '1';

    // Suffix-driven stress placement (English tends to stress predictably here)
    // Words ending in -tion, -sion, -cion, -cian: stress on syllable BEFORE the suffix
    if (/(tion|sion|cion|cian|tian)$/.test(word)) {
      return makePattern(syllables, syllables - 2);
    }
    // -ic, -ical: stress on syllable just before -ic
    if (/ical$/.test(word)) {
      return makePattern(syllables, syllables - 3);
    }
    if (/ic$/.test(word) && syllables >= 2) {
      return makePattern(syllables, syllables - 2);
    }
    // -ity, -ety: antepenultimate stress
    if (/(ity|ety)$/.test(word) && syllables >= 3) {
      return makePattern(syllables, syllables - 3);
    }
    // -ate verbs/adjectives often stress antepenult
    if (/ate$/.test(word) && syllables >= 3) {
      return makePattern(syllables, syllables - 3);
    }
    // -ly adverbs preserve the stem stress (default first-syllable for 2-syl)
    if (/ly$/.test(word) && syllables === 2) {
      return '10';
    }
    // Default: first-syllable stress (most common in English root words)
    return makePattern(syllables, 0);
  }

  function makePattern(length, stressAt) {
    let s = '';
    for (let i = 0; i < length; i++) s += (i === stressAt ? '1' : '0');
    return s;
  }

  // Stress pattern for an entire line (concatenation of word stresses).
  function getLineStress(line) {
    const wordRe = /[\p{L}\p{N}][\p{L}\p{N}'\u2019-]*/gu;
    const words = line.match(wordRe) || [];
    let pattern = '';
    for (const w of words) pattern += getWordStress(w);
    return pattern;
  }

  // Match a stress sequence against the four canonical English meter feet.
  // Returns the best-fitting meter and a 0..1 score.
  function classifyLineMeter(stress) {
    const len = stress.length;
    if (len === 0) return { foot: 'unknown', score: 0 };
    const candidates = [
      { foot: 'iambic',    unit: '01' },
      { foot: 'trochaic',  unit: '10' },
      { foot: 'anapestic', unit: '001' },
      { foot: 'dactylic',  unit: '100' }
    ];
    let best = { foot: 'irregular', score: 0 };
    for (const c of candidates) {
      let expected = '';
      while (expected.length < len) expected += c.unit;
      expected = expected.substr(0, len);
      let m = 0;
      for (let i = 0; i < len; i++) if (stress[i] === expected[i]) m++;
      const score = m / len;
      if (score > best.score) best = { foot: c.foot, score: score };
    }
    return best;
  }

  // Map a foot type + syllable count to a meter name like "iambic pentameter".
  function namedMeter(foot, syllables) {
    const footLen = (foot === 'anapestic' || foot === 'dactylic') ? 3 : 2;
    const feet = Math.round(syllables / footLen);
    const counts = {
      1:'monometer', 2:'dimeter', 3:'trimeter', 4:'tetrameter',
      5:'pentameter', 6:'hexameter', 7:'heptameter', 8:'octameter'
    };
    return foot + ' ' + (counts[feet] || (feet + '-meter'));
  }

  // Pattern descriptions: one per recognized form. Used to populate the status panel.
  const PATTERN_DESCRIPTIONS = {
    // ---- Japanese & East Asian ----
    'haiku':
      'Three lines of 5\u20137\u20135 syllables. A Japanese form ' +
      'traditionally capturing a single moment with seasonal imagery. Imported into ' +
      'English by the Imagists in the early 20th century and embraced by the Beats; ' +
      'now the most popular short fixed form in English.',
    'tanka':
      'Five lines of 5\u20137\u20135\u20137\u20137 syllables. A Japanese ' +
      'court poem that predates haiku by roughly a thousand years. The first three ' +
      'lines often set a scene; the final two pivot or comment on it.',
    'kimo':
      'Three lines of 10\u20137\u20136 syllables. An Israeli ' +
      'adaptation of haiku, stretched to fit Hebrew\u2019s typically longer words.',
    'katauta':
      'Three lines of 5\u20137\u20137 syllables. A Japanese form ' +
      'usually addressed to a lover; two katauta paired form a mondo (question and answer).',
    'dodoitsu':
      'Four lines of 7\u20137\u20137\u20135 syllables. A Japanese ' +
      'folk-song form from the Edo period, traditionally about love or work.',
    'lune':
      'A three-line form. Robert Kelly\u2019s version has 5\u20133\u20135 ' +
      'syllables; Jack Collom\u2019s version has 3\u20135\u20133 words. Called the ' +
      '"American haiku."',
    'haynaku':
      'Three lines of 1\u20132\u20133 words. Invented by Eileen R. ' +
      'Tabios in 2003; the name plays on "haiku" and the Tagalog interjection "hay naku."',

    // ---- English / American ----
    'cinquain':
      'Five lines of 2\u20134\u20136\u20138\u20132 syllables. ' +
      'Adelaide Crapsey\u2019s 1909 form, inspired by the brevity of haiku and tanka.',
    'limerick':
      'Five lines, AABBA rhyme. Lines 1, 2, and 5 are anapestic ' +
      'trimeter (~8\u20139 syllables); lines 3 and 4 are anapestic dimeter (~5\u20136). ' +
      'Comic, frequently bawdy, popularized by Edward Lear in the 1840s.',
    'nonet':
      'Nine lines counting down: 9\u20138\u20137\u20136\u20135\u20134\u20133\u20132\u20131 ' +
      'syllables. A modern syllabic countdown, sometimes inverted as 1\u20139.',
    'fib':
      'Six lines whose syllable counts follow the Fibonacci sequence: ' +
      '1, 1, 2, 3, 5, 8. Invented by Gregory K. Pincus in 2006 and spread online.',
    'minute-poem':
      'Twelve lines, 60 syllables total: three quatrains of 8\u20134\u20134\u20134 ' +
      'rhyming AABB CCDD EEFF. Iambic. A modern strict form.',
    'alphabet':
      'Twenty-six lines, each beginning with a successive letter of ' +
      'the alphabet from A to Z. Often used as a children\u2019s or teaching exercise.',
    'acrostic':
      'A poem in which the first letter of each line spells a word, ' +
      'name, or message read vertically. Edgar Allan Poe wrote them; the form is ancient.',
    'diminishing-verse':
      'A poem in which each successive line drops the first ' +
      'letter of the previous line\u2019s first word \u2014 a shrinking telescope of letters.',
    'kwansaba':
      'Seven lines, seven words per line, with no word longer than ' +
      'seven letters. A praise form invented by Eugene B. Redmond in 1995, named for ' +
      'the seven principles of Kwanzaa.',
    'double-dactyl':
      'Eight lines in two stanzas of dactylic dimeter. Line 1 is ' +
      'nonsense ("Higgledy-piggledy"), line 2 a proper name, and line 7 a single ' +
      '6-syllable word. Invented by Anthony Hecht and Paul Pascal in 1951.',
    'monotetra':
      'Quatrains of iambic tetrameter where all four lines share ' +
      'the same rhyme (AAAA), and the final line repeats itself. Michael Walker.',
    'magic-9':
      'Nine lines rhyming ABACADABA \u2014 the alphabet sequence ' +
      'A\u2013B\u2013R\u2013A\u2013C\u2013A\u2013D\u2013A\u2013B\u2013R\u2013A with the ' +
      'R\u2019s removed. Hence "magic."',
    'clerihew':
      'A whimsical biographical quatrain rhyming AABB, with deliberately ' +
      'awkward metre. Invented by Edmund Clerihew Bentley around 1905.',

    // ---- Sonnet variants ----
    'sonnet':
      'Fourteen lines of roughly ten syllables apiece. The dominant ' +
      'short fixed form of European lyric poetry from the Renaissance onward.',
    'sonnet-shakespearean':
      'Three iambic-pentameter quatrains and a closing ' +
      'couplet (ABAB CDCD EFEF GG). Shakespeare\u2019s 154 sonnets are the canonical model.',
    'sonnet-petrarchan':
      'An octave (ABBAABBA) followed by a sestet (CDECDE or ' +
      'variants). The original sonnet form, brought to perfection by Petrarch.',
    'sonnet-spenserian':
      'Three interlocking quatrains and a couplet, ABAB BCBC ' +
      'CDCD EE. Edmund Spenser\u2019s adaptation of the Italian form into English.',
    'sonnet-curtal':
      'Eleven lines (technically 10\u00BD), ABCABC DCBDCC or ' +
      'ABCABC DBCDC. Gerard Manley Hopkins\u2019s shortened sonnet, used in "Pied Beauty."',

    // ---- French ----
    'ballade':
      'Twenty-eight lines: three eight-line stanzas rhyming ABABBCBC ' +
      'plus a four-line envoy BCBC. Each stanza ends with the same refrain.',
    'rondeau':
      'Fifteen lines on two rhymes with a refrain. Made famous in English ' +
      'by John McCrae\u2019s "In Flanders Fields."',
    'triolet':
      'Eight lines, ABaAabAB. Line 1 returns as lines 4 and 7; line 2 ' +
      'returns as line 8. Two rhymes only.',
    'villanelle':
      'Nineteen lines: five tercets and a quatrain, on two rhymes, with ' +
      'two refrain lines that alternate as the last line of each tercet and pair at the end. ' +
      'Dylan Thomas\u2019s "Do not go gentle," Elizabeth Bishop\u2019s "One Art."',
    'dizain':
      'Ten lines of ten syllables each, rhyming ABABBCCDCD. The ' +
      'defining stanza of the French Renaissance and Marot\u2019s great vehicle.',
    'huitain':
      'Eight lines, ABABBCBC. The component the ballade\u2019s stanzas are ' +
      'built on, and a standalone form in its own right.',
    'kyrielle':
      'Quatrains in eight-syllable lines with a refrain repeating as the ' +
      'final line of each stanza. From the French ecclesiastical "kyrie eleison."',
    'lai':
      'Nine lines, syllables 5\u20135\u20132\u20135\u20135\u20132\u20135\u20135\u20132, ' +
      'rhyming AABAABAAB. A short medieval French form.',
    'descort':
      'A poem in which every line differs from every other in metre, ' +
      'length, and rhyme. Built to be deliberately discordant.',
    'glose':
      'Forty lines: a four-line epigraph followed by four ten-line stanzas, ' +
      'each ending with one line of the epigraph in sequence.',

    // ---- Italian / Spanish / Occitan ----
    'ottava-rima':
      'Eight lines of iambic pentameter, ABABABCC. Boccaccio\u2019s ' +
      'vehicle; Byron used it for "Don Juan."',
    'italian-octave':
      'Eight lines of iambic pentameter, ABBAABBA. The opening ' +
      'octave of a Petrarchan sonnet, used standalone.',
    'sicilian-octave':
      'Eight lines of iambic pentameter, ABABABAB. The earliest ' +
      'octave form, displaced by ottava rima.',
    'terza-rima':
      'Interlocking tercets, ABA BCB CDC DED... The form of ' +
      'Dante\u2019s "Divine Comedy."',
    'espinela':
      'Ten octosyllabic lines rhyming ABBAACCDDC. Named for ' +
      'Vicente Espinel (1591); also called d\u00E9cima.',
    'endecha':
      'Spanish quatrain of 7\u20137\u20137\u201311 syllables. ' +
      'Traditionally a lament or dirge.',

    // ---- Welsh / Irish ----
    'awdl-gywydd':
      'Welsh quatrain of seven-syllable lines. Lines 2 and 4 ' +
      'end-rhyme; line 3 cross-rhymes into the middle of line 4.',
    'cyhydedd-fer':
      'Welsh couplets of eight-syllable lines.',
    'cyhydedd-naw-ban':
      'Welsh couplets of nine-syllable lines.',
    'cywydd-deuair-fyrion':
      'Welsh couplets of four-syllable lines.',
    'cywydd-deuair-hirion':
      'Welsh couplets of seven-syllable lines, one line ' +
      'ending stressed and one unstressed.',
    'cywydd-llosgyrnog':
      'Welsh sextet, 8\u20138\u20137\u20138\u20138\u20137. ' +
      'Lines 3 and 6 share an end-rhyme; lines 1, 2, 4, 5 use internal rhyme.',
    'clogyrnach':
      'Welsh sextet of 8\u20138\u20135\u20135\u20133\u20133 ' +
      'syllables, rhyming AABBBA.',
    'englyn-cyrch':
      'Welsh quatrain, seven syllables each, rhyming ABBA with an ' +
      'internal rhyme between lines 3 and 4.',
    'cyrch-a-chwta':
      'Welsh eight-line stanza, seven syllables each.',
    'gwawdodyn':
      'Welsh quatrain, 9\u20139\u201310\u20139 syllables. Lines ' +
      '1, 2, and 4 share an end-rhyme.',
    'ae-freislighe':
      'Irish quatrain of seven-syllable lines, rhyming ABAB. ' +
      'Lines 1 and 3 end with three-syllable words; lines 2 and 4 end with two-syllable words.',
    'casbairdne':
      'Irish quatrain of seven-syllable lines. Lines 2 and 4 ' +
      'rhyme exactly; lines 1 and 3 share consonance with them.',
    'breccbairdne':
      'Irish quatrain of 5\u20136\u20136\u20136 syllables.',
    'cethramtu-rannaigechta-moire':
      'Irish quatrain of three-syllable lines. ' +
      'A tightly compressed form.',
    'lethrannaegecht-mor':
      'Irish quatrain of five-syllable lines.',
    'deibide-baise-fri-toin':
      'Irish quatrain of 3\u20137\u20137\u20131 syllables \u2014 ' +
      'the "lip-to-bottom" form, named for its lurching shape.',

    // ---- Persian / Arabic ----
    'rubaiyat':
      'Quatrains rhyming AABA. From the Persian "ruba\u02BCi." Edward ' +
      'FitzGerald\u2019s loose translation of Omar Khayy\u00E1m made it famous in English.',
    'interlocking-rubaiyat':
      'Rubaiyat quatrains in which line 3 of each stanza ' +
      'becomes the rhyme of the next: AABA BBCB CCDC. Used by Robert Frost in ' +
      '"Stopping by Woods on a Snowy Evening."',
    'ghazal':
      'Couplets sharing an end-refrain ("radif") and a rhyme ' +
      '("qafia") just before it. Persian and Arabic origin; the poet often names ' +
      'themselves in the final couplet.',
    'masnavi':
      'Long narrative poems in couplets sharing the same end-rhyme ' +
      '(AA BB CC...). Persian; Rumi\'s six-volume "Masnavi" is the canonical example.',

    // ---- Pashto ----
    'landay':
      'Pashto couplet of 22 syllables total (9 + 13). Composed and sung ' +
      'mostly by Afghan women; often about love, war, or sorrow.',

    // ---- Stanza-level meters (existing) ----
    'common-meter':
      'Alternating 8 and 6 syllable lines, usually iambic, often ' +
      'rhyming ABAB or ABCB. The meter of folk ballads, Protestant hymns, and Emily ' +
      'Dickinson\u2014whose poems can famously be sung to "The Yellow Rose of Texas."',
    'long-meter':
      'Quatrains of 8-syllable iambic lines. A hymn meter (Isaac ' +
      'Watts, Charles Wesley) with steadier tread than common meter.',
    'short-meter':
      'Quatrains of 6-6-8-6 syllables.',
    'sonnet-shape':
      'Fourteen lines of roughly 10 syllables apiece, in a sonnet shape ' +
      'but without an exactly matching rhyme scheme.',
    'iambic pentameter':
      'Lines of 10 syllables in unstressed\u2013stressed pairs ' +
      '(u\u2013/u\u2013/u\u2013/u\u2013/u\u2013). The dominant meter of English verse ' +
      'since Chaucer; the meter of all Shakespeare\u2019s plays and most of Milton.',
    'iambic tetrameter':
      'Lines of 8 syllables in unstressed\u2013stressed pairs ' +
      '(u\u2013/u\u2013/u\u2013/u\u2013). The pulse of Marvell\u2019s "To His Coy Mistress," ' +
      'most hymns, and many of Dickinson\u2019s quieter pieces.',
    'iambic trimeter':
      'Lines of 6 syllables in unstressed\u2013stressed pairs.',
    'iambic hexameter':
      'Lines of 12 syllables, the alexandrine.',
    'trochaic tetrameter':
      'Lines of 8 syllables in stressed\u2013unstressed pairs ' +
      '(\u2013u/\u2013u/\u2013u/\u2013u). Insistent and march-like. Longfellow\u2019s ' +
      '"Hiawatha," Blake\u2019s "Tyger."',
    'trochaic pentameter':
      'Lines of 10 syllables in stressed\u2013unstressed pairs.',
    'anapestic tetrameter':
      'Lines of 12 syllables in uu\u2013/uu\u2013/uu\u2013/uu\u2013. ' +
      'The galloping meter of "A Visit from St. Nicholas" and most of Dr. Seuss.',
    'anapestic trimeter':
      'Lines of 9 syllables in anapestic feet. Light, lifting.',
    'dactylic hexameter':
      'Six dactylic feet per line. The meter of Homer and ' +
      'Virgil; Longfellow imitated it in "Evangeline."',
    'free verse':
      'No fixed metrical pattern detected. Lines vary in length and stress. ' +
      'The default mode of modern poetry since Whitman, Pound, and the Imagists ' +
      'rejected regular meter in the late 19th and early 20th centuries.',
    'blank-verse':
      'Unrhymed iambic pentameter. Shakespeare\u2019s plays, Milton\u2019s ' +
      '"Paradise Lost," Wordsworth\u2019s "Prelude."',
    'syllabic':
      'Lines share a consistent syllable count but lack a regular ' +
      'stress pattern. Marianne Moore is the great practitioner.',
    'rhyming-couplets':
      'Pairs of rhyming lines, AABBCC. The dominant English ' +
      'narrative form from Chaucer through Pope.',
    'quatrain':
      'A stanza or short poem of four lines.',
    'tercet':
      'A stanza or short poem of three lines.',
    'couplet':
      'A two-line poem or stanza.',
    'sestet':
      'A six-line stanza.',
    'octave':
      'An eight-line stanza.',
    'quintain':
      'A five-line stanza.',

    // Welsh / Celtic forms
    'englyn-byr-cwca':
      'A Welsh tercet of 7\u20137\u201310 syllables with internal rhyme. ' +
      'One of the shorter englyn forms; like all Welsh strict-meter verse it ' +
      'traditionally also requires cynghanedd (consonant chiming), which a ' +
      'syllable-counter can\u2019t check.',
    'gwawdodyn-hir':
      'A Welsh six-line form, 9\u20139\u20139\u20139\u201310\u20139 syllables. ' +
      'Lines 1, 2, 3, 4, and 6 share an end-rhyme; line 5 has an internal rhyme ' +
      'that hooks into line 6. A close cousin of the four-line gwawdodyn.',
    'hir-a-thoddaid':
      'A Welsh six-line form with five lines of 10 syllables and one of 9, all ' +
      'sharing a single end-rhyme except for one line that introduces a cross-rhyme ' +
      'with the next. Used by 14th-century Welsh court poets.',

    // Irish / Gaelic forms
    'dechnad-cummaisc':
      'An Irish quatrain with alternating line lengths\u20148 and 4 syllables\u2014' +
      'rhyming ABAB. One of the syllabic forms of early Irish bardic verse.',
    'dechnad-mor':
      'An Irish quatrain of four 8-syllable lines rhyming ABAB. A relative of ' +
      'the dechnad cummaisc with uniform line length.',
    'novem':
      'A tercet of 9, 9, and 9 syllables, invented by the Canadian poet Robin ' +
      'Skelton. The name (Latin "nine") gestures both at the syllable count and ' +
      'at the form\u2019s nine total stresses.',

    // Japanese / East Asian forms
    'imayo':
      'A Japanese quatrain in which each 12-syllable line breaks at a caesura ' +
      'into 7+5. Flourished in the Heian period as the standard form for popular ' +
      'song lyrics.',
    'kouta':
      'A Japanese quatrain of roughly 7\u20137\u20137\u20135 (or 7\u20135\u20137' +
      '\u20135) syllables, originally a "little song" sung by geisha and ' +
      'townspeople in the Edo period.',
    'haiku-sonnet':
      'Four haiku followed by a closing couplet\u201414 lines total. A modern ' +
      'hybrid that blends the Japanese short form with the Western sonnet\u2019s ' +
      'overall shape and turn.',
    'chueh-chu':
      'A Chinese "sonnet cut short": four lines of either five or seven characters ' +
      'each, with strict tone patterns. Often translated into English as four ' +
      'lines of equal syllable count.',

    // French forms
    'bref-double':
      'A French fourteen-line form arranged as three quatrains plus a closing ' +
      'couplet. Lines vary in length, and three of the rhymes recur across the ' +
      'whole poem rather than within single stanzas.',
    'chant-royal':
      'A French sixty-line form: five 11-line stanzas plus a 5-line envoi, all ' +
      'on five recurring rhymes. The most demanding of the medieval French fixed ' +
      'forms; mostly extinct by the Renaissance.',
    'luc-bat':
      'Vietnamese "six-eight" form: alternating lines of 6 and 8 syllables, with ' +
      'a chain rhyme that links the sixth syllable of one line to the sixth of ' +
      'the next 8-syllable line. The dominant meter of classical Vietnamese verse.',

    // Italian / Spanish forms
    'ovillejo':
      'A Spanish ten-line form: three rhyming couplets in which the second line ' +
      'of each is a short echo (often a single word), followed by a redondilla ' +
      '(four-line stanza) whose last line strings the three echo-words together. ' +
      'Cervantes used it in Don Quixote.',
    'mistress-bradstreet-stanza':
      'An eight-line stanza invented by John Berryman for "Homage to Mistress ' +
      'Bradstreet" (1956): syllable counts 5\u20135\u20138\u20137\u20139\u20137\u201310\u20137, ' +
      'rhyming ABCBDDBA. Idiosyncratic and rarely imitated.',
    'spenserian-stanza':
      'Nine lines: eight iambic pentameter lines plus a closing alexandrine ' +
      '(iambic hexameter), rhyming ABABBCBCC. Invented by Edmund Spenser for ' +
      'The Faerie Queene; later used by Keats, Shelley, and Byron.',

    // English / American forms
    'bob-and-wheel':
      'A five-line tail at the end of a longer stanza: one very short "bob" of ' +
      'two syllables, then a "wheel" of four short lines (typically six syllables ' +
      'each), all rhyming. Famous from "Sir Gawain and the Green Knight."',
    'flamenca':
      'A Spanish quintain (five-line stanza) used in flamenco song lyrics, ' +
      'syllabic with lines roughly the same length, typically rhyming ABBAB or ' +
      'similar.',
    'echo-verse':
      'A poem in which the last word (or last syllable) of each line is echoed ' +
      'as a short reply on the next line. Popular in 16th- and 17th-century ' +
      'English pastoral verse.',
    'byr-a-thoddaid':
      'A Welsh quatrain of 8\u20138\u201310\u20136 syllables. The third (long) ' +
      'line carries a cross-rhyme that hooks into the short fourth line; the first ' +
      'two share a separate end-rhyme.',
    'cyhydedd-hir':
      'A Welsh quatrain in which each long line traditionally divides into ' +
      '5\u20135\u20135\u20134 syllables (19 total). One of the more unusual ' +
      'Welsh strict-meter forms; the internal division can\u2019t be detected ' +
      'from text alone, only the total line length.'
  };

  // Words that should always render with a capital first letter, regardless of position.
  // Lowercase keys; comparisons normalize via toLowerCase().
  const KNOWN_PROPER_NOUNS = new Set([
    'i',
    'monday','tuesday','wednesday','thursday','friday','saturday','sunday',
    'january','february','march','april','may','june','july','august',
    'september','october','november','december'
  ]);

  const ARTICLES = new Set(['a', 'an', 'the']);


  // Counts syllables in a word. Uses the stress dictionary for known words
  // (which is exact), with a suffix-aware heuristic as fallback.
  function countSyllables(word) {
    if (!word) return 1;
    const full = lookupPron(PRON_STRESS, word);
    if (full && !Object.hasOwn(STRESS_DICT, word.toLowerCase())) return full.length;
    const lower = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!lower) return 1;

    // 1) Direct lookup
    if (Object.hasOwn(STRESS_DICT, lower)) return STRESS_DICT[lower].length;

    // 2) Stem-based lookup for common inflections
    const stemTries = [
      { suffix: 'ing', delta: 1 },
      { suffix: 'ings', delta: 1 },
      { suffix: 'ly',  delta: 1 },
      { suffix: 'ness', delta: 1 },
      { suffix: 'ful', delta: 1 },
      { suffix: 'less', delta: 1 },
      { suffix: 'es',  delta: 0 },
      { suffix: 'ed',  delta: 0 },
      { suffix: 's',   delta: 0 }
    ];
    for (const t of stemTries) {
      if (lower.length > t.suffix.length + 1 && lower.endsWith(t.suffix)) {
        const stem = lower.slice(0, -t.suffix.length);
        if (Object.hasOwn(STRESS_DICT, stem)) {
          // -ed normally doesn't add a syllable, but after t/d it does (wanted, loaded)
          let extra = t.delta;
          if (t.suffix === 'ed') {
            const last = stem.charAt(stem.length - 1);
            if (last === 't' || last === 'd') extra = 1;
          }
          return STRESS_DICT[stem].length + extra;
        }
      }
    }

    // 3) Heuristic fallback: count vowel groups
    if (lower.length <= 3) return 1;

    let s = lower;
    // Silent trailing 'e' (but not 'le' or words where -e is sounded)
    s = s.replace(/(?:[^laeiouy]e|[^laeiouy]es)$/, '');
    // Strip silent -ed unless preceded by t/d (where it's pronounced)
    if (/[td]ed$/.test(s)) {
      // keep the syllable
    } else {
      s = s.replace(/ed$/, '');
    }
    // Leading 'y' acts as consonant
    s = s.replace(/^y/, '');

    const matches = s.match(/[aeiouy]+/g);
    const count = matches ? matches.length : 1;
    return Math.max(1, count);
  }


  // ---------- RHYME SCHEME DETECTION ----------
  // Extract the last word from each line, compute an orthographic "rhyme key"
  // (the portion of the word from the last stressed vowel onwards, with common
  // silent-letter normalizations), then assign letters A, B, C... to lines whose
  // keys match. This is approximate — English orthography doesn't map perfectly
  // to phonemes (love/move look alike but don't rhyme; sky/high rhyme but look
  // different) — so we accept some false positives and negatives in edge cases.
  // The common cases that matter for verse — couplets, AABBA limericks, ABAB
  // quatrains, sonnets — are handled reliably.

  // Suffix-aware stress used specifically for finding the rhyme position. More
  // aggressive than the meter heuristic at recognizing feminine/masculine endings.
  function rhymeStress(word) {
    if (Object.hasOwn(STRESS_DICT, word)) return STRESS_DICT[word];
    const full = lookupPron(PRON_STRESS, word);
    if (full) return full;
    const syllables = countSyllables(word);
    if (syllables <= 1) return '1';

    // Strong feminine endings — last syllable unstressed (-er, -ow, -le, -y after consonant)
    if (syllables === 2 && /(?:[^aeiou]y|er|or|ow|le|en|on|et|in)$/.test(word)) {
      return '10';
    }
    // Existing suffix-shifting rules from the meter heuristic
    if (/(tion|sion|cion|cian|tian)$/.test(word)) return makePattern(syllables, syllables - 2);
    if (/ical$/.test(word)) return makePattern(syllables, syllables - 3);
    if (/ic$/.test(word) && syllables >= 2) return makePattern(syllables, syllables - 2);
    if (/(ity|ety)$/.test(word) && syllables >= 3) return makePattern(syllables, syllables - 3);
    if (/ate$/.test(word) && syllables >= 3) return makePattern(syllables, syllables - 3);
    // Masculine final syllable: 2-syl words ending in CVC(e) like "inside", "complete", "above"
    if (syllables === 2 && word.length >= 5 &&
        /[bcdfghjklmnpqrstvwxz][aeiou][bcdfghjklmnpqrstvwxz]e?$/.test(word) &&
        !/(?:er|en|le|on|or|in|ow|et|it|us|ic|al)$/.test(word)) {
      return '01';
    }
    return makePattern(syllables, 0);
  }

  // Rhyme key from the pronunciation dictionary. Unknown words borrow the
  // pronunciation of their longest known ending (untrimmed -> trimmed),
  // since only the ending matters for rhyme.
  function phoneticRhymeKeys(word) {
    if (!PRON_RHYME) return [];
    const direct = lookupPron(PRON_RHYME, word);
    if (direct) return direct.map((t) => 'P:' + t);
    const variants = pronVariants(word);
    if (!variants.length) return []; // numbers, symbols
    for (const v of variants.slice(1).concat(variants[0])) {
      for (let i = 1; i <= v.length - 3; i++) {
        const tail = v.slice(i);
        if (!/[aeiouy]/.test(tail)) break;
        const found = PRON_RHYME.get(tail) || (derivePron(tail) || {}).tails;
        if (found && found.length) return found.map((t) => 'P:' + t);
      }
    }
    return [];
  }

  // Every rhyme key a word can have (alternate pronunciations: tears/cheers
  // and tears/bears both rhyme).
  function getRhymeKeys(word) {
    const phonetic = phoneticRhymeKeys(word);
    if (phonetic.length) return phonetic;
    const k = getRhymeKey(word);
    return k ? [k] : [];
  }

  function rhymesWith(a, b) {
    const kb = getRhymeKeys(b);
    return getRhymeKeys(a).some((k) => kb.indexOf(k) !== -1);
  }

  // How well two words rhyme: 'perfect', 'slant' (same stressed vowel, or
  // same closing consonants: love/move, cat/hut), 'eye' (spelled alike but
  // sound different: love/prove by ear, temperate/date), or 'none'.
  function rhymeQuality(a, b) {
    if (!a || !b) return 'none';
    const la = String(a).toLowerCase(), lb = String(b).toLowerCase();
    if (la === lb) return 'identical';
    if (rhymesWith(a, b)) return 'perfect';
    const pa = phoneticRhymeKeys(a), pb = phoneticRhymeKeys(b);
    if (pa.length && pb.length) {
      for (const x of pa) {
        for (const y of pb) {
          const xs = x.slice(2).split(' '), ys = y.slice(2).split(' ');
          const sameVowel = xs[0] === ys[0];
          const codaX = xs.slice(1).join(' '), codaY = ys.slice(1).join(' ');
          const sameCoda = codaX && codaX === codaY;
          if (sameVowel || sameCoda) return 'slant';
        }
      }
    }
    if (orthographicRhymeKey(a) === orthographicRhymeKey(b)) return 'eye';
    return 'none';
  }

  // Returns the rhyme key for one word (its first pronunciation when the
  // dictionary is loaded). Words sharing a key are treated as rhyming.
  function getRhymeKey(word) {
    if (!word) return '';
    const phonetic = phoneticRhymeKeys(word);
    if (phonetic.length) return phonetic[0];
    return orthographicRhymeKey(word);
  }

  // Spelling-based rhyme key, used when a word has no known pronunciation.
  function orthographicRhymeKey(word) {
    if (!word) return '';
    const w = word.toLowerCase().replace(/[\u2019']/g, '').replace(/[^a-z]/g, '');
    if (!w) return '';

    // Strip silent terminal 'e' if preceded by a consonant and the word has another vowel.
    // Catches "ride"→"rid", "love"→"lov", "kite"→"kit". Spares "be", "see", "tree".
    let normalized = w;
    if (normalized.length > 2 && normalized.endsWith('e')) {
      const beforeE = normalized.charAt(normalized.length - 2);
      const isCons = 'aeiouy'.indexOf(beforeE) === -1;
      const hasOtherVowel = /[aeiouy]/.test(normalized.slice(0, -1));
      if (isCons && hasOtherVowel) normalized = normalized.slice(0, -1);
    }

    // Silent 'e' in past-tense '-ed' after consonants other than t/d. Catches
    // "missed"→"missd", "played"→"playd", "loved"→"lovd" (the 'e' is silent
    // except after t/d, where it adds a syllable: "wanted", "needed").
    if (normalized.length > 3 && /[^aeiouytd]ed$/.test(normalized)) {
      normalized = normalized.slice(0, -2) + 'd';
    }

    // Silent 'gh' in -igh- (night→nit, high→hi, sigh→si)
    normalized = normalized.replace(/igh/g, 'i');

    // 'ea' → 'ee': both commonly represent /iː/ at the rhyming position.
    // Lets "beat"/"feet", "sea"/"see", "tea"/"tree" rhyme. Misclassifies a
    // small set where 'ea' is /ɛ/ ("bread", "head") but that's a rare cost.
    normalized = normalized.replace(/ea/g, 'ee');

    // Find positions of vowel groups (y counts as vowel here)
    const vowelStarts = [];
    let inV = false;
    for (let i = 0; i < normalized.length; i++) {
      const isV = 'aeiouy'.indexOf(normalized[i]) !== -1;
      if (isV && !inV) { vowelStarts.push(i); inV = true; }
      else if (!isV) { inV = false; }
    }
    if (vowelStarts.length === 0) return normalized;

    const stress = rhymeStress(w);
    let lastStressed = stress.lastIndexOf('1');
    if (lastStressed === -1) lastStressed = stress.length - 1;

    const numSyl = stress.length;
    const numGroups = vowelStarts.length;
    let groupIdx;
    if (numGroups <= numSyl) {
      // Fewer vowel groups than syllables (rare — diphthong-as-one-group).
      groupIdx = Math.min(lastStressed, numGroups - 1);
    } else {
      // More vowel groups than syllables — extras are usually trailing silent
      // vowels (e.g. final 'e' in 'declines'). Align left-to-right: stress
      // digit i maps to vowel group i, ignoring the silent extras at the end.
      groupIdx = lastStressed;
    }
    groupIdx = Math.max(0, Math.min(numGroups - 1, groupIdx));

    let rhyme = normalized.substring(vowelStarts[groupIdx]);

    // Terminal 'y' → 'i' (sky/high should rhyme)
    if (rhyme.endsWith('y')) rhyme = rhyme.slice(0, -1) + 'i';
    // Drop any surviving silent 'gh' (caught most via 'igh', this catches 'augh'/'ough'/'eigh')
    rhyme = rhyme.replace(/gh/g, '');

    return rhyme;
  }

  // Pull the final word out of a line (ignoring trailing punctuation).
  function getLastWord(line) {
    const re = /[\p{L}\p{N}][\p{L}\p{N}'\u2019-]*/gu;
    const matches = line.match(re);
    if (!matches || matches.length === 0) return '';
    return matches[matches.length - 1];
  }

  // Assign A, B, C, ... up to a-z if more than 26 unique rhymes are needed.
  function rhymeLetterFor(i) {
    if (i < 26) return String.fromCharCode(65 + i);
    if (i < 52) return String.fromCharCode(97 + (i - 26));
    return '?';
  }

  // Walk the source lines and build a scheme string like "AABBA".
  function detectRhymeScheme(lineMeters) {
    if (!lineMeters || lineMeters.length === 0) {
      return { scheme: '', letters: [], keys: [] };
    }
    const words = lineMeters.map((lm) => getLastWord(lm.text));
    const keySets = words.map((w) => getRhymeKeys(w));
    const keys = keySets.map((k) => k[0] || '');
    // A line joins the first earlier group it shares any rhyme key with.
    const groups = []; // { letter, keys: Set }
    const letters = [];
    for (const ks of keySets) {
      if (!ks.length) { letters.push('\u2013'); continue; } // en dash for lines with no word
      let group = groups.find((g) => ks.some((k) => g.keys.has(k)));
      if (!group) {
        group = { letter: rhymeLetterFor(groups.length), keys: new Set() };
        groups.push(group);
      }
      ks.forEach((k) => group.keys.add(k));
      letters.push(group.letter);
    }
    return { scheme: letters.join(''), letters: letters, keys: keys, words: words };
  }

  // Identify well-known rhyme schemes. Returns a human-readable label or null.
  function nameRhymeScheme(scheme) {
    if (!scheme) return null;

    const exact = {
      'AABBA':           'limerick',
      'ABAB':            'alternating rhyme',
      'ABBA':            'envelope rhyme',
      'AABB':            'rhyming couplet',
      'AAA':             'monorhyme tercet',
      'ABA':             'tercet',
      'AABBCC':          'rhyming couplets',
      'ABCB':            'ballad quatrain',
      'ABABCC':          'sestet (heroic)',
      'ABABBCBCC':       'Spenserian stanza',
      'ABABCDCDEFEFGG':  'Shakespearean sonnet',
      'ABBAABBACDECDE':  'Petrarchan sonnet',
      'ABBAABBACDCDCD':  'Petrarchan sonnet',
      'ABBAABBACDCCDC':  'Petrarchan sonnet',
      'ABBAABBACDEDCE':  'Petrarchan sonnet (variant)',
      'ABABBCBCCDCDEE':  'Spenserian sonnet'
    };
    if (Object.hasOwn(exact, scheme)) return exact[scheme];

    if (scheme === 'AA') return 'rhymed couplet';
    // All same letter: monorhyme
    if (/^A+$/.test(scheme)) return 'monorhyme';

    // AABBCC… couplets
    if (scheme.length >= 4 && scheme.length % 2 === 0) {
      let ok = true;
      const seen = new Set();
      for (let i = 0; i < scheme.length; i += 2) {
        if (scheme[i] !== scheme[i + 1]) { ok = false; break; }
        if (seen.has(scheme[i])) { ok = false; break; }
        seen.add(scheme[i]);
      }
      if (ok) return 'rhyming couplets';
      if (isCoupletScheme(scheme)) return 'rhyming couplets (with an imperfect rhyme)';
    }

    // ABABCDCD… alternating quatrains
    if (scheme.length >= 8 && scheme.length % 4 === 0) {
      let ok = true;
      const seenPairs = new Set();
      for (let i = 0; i < scheme.length; i += 4) {
        const a = scheme[i], b = scheme[i + 1];
        if (a === b) { ok = false; break; }
        if (scheme[i + 2] !== a || scheme[i + 3] !== b) { ok = false; break; }
        const pair = a + b;
        if (seenPairs.has(pair)) { ok = false; break; }
        seenPairs.add(pair);
      }
      if (ok) return 'alternating quatrains';
    }

    // No two lines rhyme — unrhymed/free verse
    const noDash = scheme.replace(/[\u2013]/g, '');
    const unique = new Set(noDash.split(''));
    if (noDash.length >= 2 && unique.size === noDash.length) {
      return 'unrhymed';
    }

    return null;
  }

  // Analyze the pasted source: per-line syllable counts and stress patterns,
  // then identify a named pattern (haiku, tanka, sonnet, iambic pentameter, etc).
  function analyzeSourceMeter(text) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) return null;

    const wordRe = /[\p{L}\p{N}][\p{L}\p{N}'\u2019-]*/gu;

    const lineMeters = lines.map((line) => {
      const words = line.match(wordRe) || [];
      const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
      const stress = getLineStress(line);
      const meter = classifyLineMeter(stress);
      return {
        text: line,
        syllables: syllables,
        stress: stress,
        foot: meter.foot,
        footScore: meter.score
      };
    });

    const rhyme = detectRhymeScheme(lineMeters);
    const pattern = detectPattern(lineMeters, rhyme);
    return {
      lineMeters: lineMeters,
      lineCount: lines.length,
      pattern: pattern,
      rhyme: rhyme
    };
  }

  // --- Helpers used by FORM_DEFINITIONS ----------------------------------

  // True if the scheme is rhyming couplets (AABBCC...).
  // Longer poems may have a few imperfect pairs (Blake's eye / symmetry):
  // one miss is allowed per five couplets once there are at least four.
  function isCoupletScheme(scheme) {
    if (!scheme || scheme.length < 2 || scheme.length % 2 !== 0) return false;
    const pairs = scheme.length / 2;
    const allowed = pairs >= 4 ? Math.floor(pairs / 5) || 1 : 0;
    let misses = 0;
    for (let i = 0; i < scheme.length; i += 2) {
      if (scheme[i] !== scheme[i + 1]) { misses++; continue; }
      if (i > 0 && scheme[i] === scheme[i - 2]) return false; // different from previous couplet
    }
    return misses <= allowed && misses < pairs / 2;
  }

  // How many lines miss the rhyme a target scheme asks of them (each line
  // must rhyme with the first earlier line that shares its target letter).
  // Letters can differ by name: ABAB matches CDCD.
  function schemeMisses(scheme, target) {
    if (!scheme || scheme.length !== target.length) return Infinity;
    let misses = 0;
    for (let i = 0; i < target.length; i++) {
      const j = target.indexOf(target[i]);
      if (j < i && scheme[i] !== scheme[j]) misses++;
    }
    return misses;
  }

  // Strip everything but lowercase letters/digits to compare two lines for refrains.
  function compareKey(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // Count words in a line (using the same word regex as the rest of the code).
  function countWordsIn(line) {
    const re = /[\p{L}\p{N}][\p{L}\p{N}'\u2019-]*/gu;
    const m = line.match(re);
    return m ? m.length : 0;
  }

  // Pull the first alphabetic letter of a line, uppercased. Returns '' if none.
  function firstLetterOf(line) {
    const m = (line || '').match(/[A-Za-z]/);
    return m ? m[0].toUpperCase() : '';
  }

  // True if the array represents the Fibonacci sequence (1,1,2,3,5,8,...) or
  // its variant starting from the second term (1,2,3,5,8,...).
  function isFibonacciCounts(counts) {
    if (counts.length < 4) return false;
    const startA = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55];
    const startB = [1, 2, 3, 5, 8, 13, 21, 34, 55];
    function matches(seq) {
      if (counts.length > seq.length) return false;
      for (let i = 0; i < counts.length; i++) {
        if (counts[i] !== seq[i]) return false;
      }
      return true;
    }
    return matches(startA) || matches(startB);
  }

  // --- FORM DEFINITIONS --------------------------------------------------
  // Tests run in order; first non-null result wins. Order from MOST specific
  // (unique signatures) to LEAST specific (generic stanza shapes).

  const FORM_DEFINITIONS = [
    // ===== Highly distinctive structural patterns =====

    // Nonet: countdown 9-8-7-6-5-4-3-2-1.
    { name: 'nonet', label: 'Nonet', test: function (ctx) {
      if (ctx.n !== 9) return null;
      const down = [9, 8, 7, 6, 5, 4, 3, 2, 1];
      const up = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      const isDown = down.every(function (e, i) { return ctx.counts[i] === e; });
      const isUp = up.every(function (e, i) { return ctx.counts[i] === e; });
      if (isDown) return { confidence: 'high' };
      if (isUp) return { confidence: 'high', labelOverride: 'Nonet (reverse, 1\u20139)' };
      return null;
    }},

    // Fibonacci poem (Fib).
    { name: 'fib', label: 'Fib (Fibonacci poem)', test: function (ctx) {
      if (ctx.n < 4 || ctx.n > 10) return null;
      if (isFibonacciCounts(ctx.counts)) return { confidence: 'high' };
      return null;
    }},

    // Alphabet poem: 26 lines starting A, B, C... Z.
    { name: 'alphabet', label: 'Alphabet poem', test: function (ctx) {
      if (ctx.n !== 26) return null;
      const expected = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      if (ctx.firstLetters === expected) return { confidence: 'high' };
      return null;
    }},

    // Diminishing verse: each line's first word is the previous line's first
    // word with its leading letter removed.
    { name: 'diminishing-verse', label: 'Diminishing verse', test: function (ctx) {
      if (ctx.n < 3) return null;
      const firsts = ctx.lineMeters.map(function (lm) {
        const m = (lm.text || '').match(/[A-Za-z]+/);
        return m ? m[0].toLowerCase() : '';
      });
      if (firsts.some(function (w) { return !w; })) return null;
      for (let i = 1; i < firsts.length; i++) {
        if (firsts[i] !== firsts[i - 1].slice(1)) return null;
      }
      return { confidence: 'high' };
    }},

    // Hay(na)ku: 3 lines, 1-2-3 words.
    { name: 'haynaku', label: 'Hay(na)ku', test: function (ctx) {
      if (ctx.n !== 3) return null;
      const wc = ctx.wordCounts;
      if (wc[0] === 1 && wc[1] === 2 && wc[2] === 3) return { confidence: 'high' };
      return null;
    }},

    // Kwansaba: 7 lines × 7 words × ≤7 letters per word.
    { name: 'kwansaba', label: 'Kwansaba', test: function (ctx) {
      if (ctx.n !== 7) return null;
      if (!ctx.wordCounts.every(function (c) { return c === 7; })) return null;
      for (const lm of ctx.lineMeters) {
        const words = (lm.text || '').match(/[A-Za-z\u2019'-]+/g) || [];
        for (const w of words) {
          const letters = w.replace(/[\u2019'-]/g, '');
          if (letters.length > 7) return null;
        }
      }
      return { confidence: 'high' };
    }},

    // Double dactyl: 8 lines, line 7 is a single ~6-syllable word.
    { name: 'double-dactyl', label: 'Double dactyl', test: function (ctx) {
      if (ctx.n !== 8) return null;
      const line7 = (ctx.lineMeters[6].text || '').trim();
      const words = line7.match(/[A-Za-z\u2019'-]+/g) || [];
      if (words.length !== 1) return null;
      const syl = countSyllables(words[0]);
      if (syl < 5 || syl > 7) return null;
      if (ctx.dominantFoot === 'dactylic') return { confidence: 'high' };
      return { confidence: 'medium' };
    }},

    // ===== Japanese / East Asian fixed-syllable forms (3 lines) =====

    { name: 'haiku', label: 'Haiku', test: function (ctx) {
      if (ctx.n !== 3) return null;
      const c = ctx.counts;
      if (within(c[0], 5, 1) && within(c[1], 7, 1) && within(c[2], 5, 1)) {
        const exact = c[0] === 5 && c[1] === 7 && c[2] === 5;
        return {
          confidence: exact ? 'high' : 'medium',
          labelOverride: exact ? 'Haiku' : 'Haiku (loose)'
        };
      }
      return null;
    }},

    { name: 'kimo', label: 'Kimo', test: function (ctx) {
      if (ctx.n !== 3) return null;
      const c = ctx.counts;
      if (c[0] === 10 && c[1] === 7 && c[2] === 6) return { confidence: 'high' };
      return null;
    }},

    { name: 'katauta', label: 'Katauta', test: function (ctx) {
      if (ctx.n !== 3) return null;
      const c = ctx.counts;
      if (c[0] === 5 && c[1] === 7 && c[2] === 7) return { confidence: 'high' };
      return null;
    }},

    { name: 'lune', label: 'Lune (Kelly form, 5\u20133\u20135)', test: function (ctx) {
      if (ctx.n !== 3) return null;
      const c = ctx.counts;
      if (c[0] === 5 && c[1] === 3 && c[2] === 5) return { confidence: 'high' };
      const wc = ctx.wordCounts;
      if (wc[0] === 3 && wc[1] === 5 && wc[2] === 3) {
        return { confidence: 'high', labelOverride: 'Lune (Collom form, 3\u20135\u20133 words)' };
      }
      return null;
    }},

    { name: 'englyn-byr-cwca', label: 'Englyn byr cwca', test: function (ctx) {
      if (ctx.n !== 3) return null;
      const c = ctx.counts;
      // 7-7-10 syllables, end-rhyme on all three lines.
      if (c[0] === 7 && c[1] === 7 && c[2] === 10) {
        if (ctx.scheme === 'AAA') return { confidence: 'high' };
        return { confidence: 'medium' };
      }
      return null;
    }},

    { name: 'novem', label: 'Novem (Skelton)', test: function (ctx) {
      if (ctx.n !== 3) return null;
      // Three lines of exactly 9 syllables each.
      if (ctx.counts.every(function (c) { return c === 9; })) {
        return { confidence: 'high' };
      }
      return null;
    }},

    // ===== Four-line forms =====

    { name: 'deibide-baise-fri-toin', label: 'Deibide baise fri toin', test: function (ctx) {
      if (ctx.n !== 4) return null;
      const c = ctx.counts;
      if (c[0] === 3 && c[1] === 7 && c[2] === 7 && c[3] === 1) return { confidence: 'high' };
      return null;
    }},

    { name: 'breccbairdne', label: 'Breccbairdne', test: function (ctx) {
      if (ctx.n !== 4) return null;
      const c = ctx.counts;
      if (c[0] === 5 && c[1] === 6 && c[2] === 6 && c[3] === 6) return { confidence: 'high' };
      return null;
    }},

    { name: 'endecha', label: 'Endecha', test: function (ctx) {
      if (ctx.n !== 4) return null;
      const c = ctx.counts;
      if (within(c[0], 7, 1) && within(c[1], 7, 1) && within(c[2], 7, 1) && within(c[3], 11, 1)) {
        return { confidence: 'high' };
      }
      return null;
    }},

    { name: 'dodoitsu', label: 'Dodoitsu', test: function (ctx) {
      if (ctx.n !== 4) return null;
      const c = ctx.counts;
      if (c[0] === 7 && c[1] === 7 && c[2] === 7 && c[3] === 5) return { confidence: 'high' };
      return null;
    }},

    { name: 'cethramtu-rannaigechta-moire', label: 'Cethramtu rannaigechta moire', test: function (ctx) {
      if (ctx.n !== 4) return null;
      if (ctx.counts.every(function (c) { return c === 3; })) return { confidence: 'high' };
      return null;
    }},

    { name: 'lethrannaegecht-mor', label: 'Lethrannaegecht mor', test: function (ctx) {
      if (ctx.n !== 4) return null;
      if (ctx.counts.every(function (c) { return c === 5; })) return { confidence: 'high' };
      return null;
    }},

    { name: 'dechnad-cummaisc', label: 'Dechnad cummaisc', test: function (ctx) {
      if (ctx.n !== 4) return null;
      const c = ctx.counts;
      // Alternating 8 and 7 syllable lines, end-rhyme ABAB.
      if (c[0] === 8 && c[1] === 7 && c[2] === 8 && c[3] === 7) {
        if (ctx.scheme === 'ABAB') return { confidence: 'high' };
        return { confidence: 'medium' };
      }
      return null;
    }},

    { name: 'dechnad-mor', label: 'Dechnad mor', test: function (ctx) {
      if (ctx.n !== 4) return null;
      // Four lines of 8 syllables; monorhyme is the strong signal.
      if (!ctx.counts.every(function (c) { return c === 8; })) return null;
      if (ctx.scheme === 'AAAA') return { confidence: 'high' };
      return null;
    }},

    { name: 'imayo', label: 'Imayo', test: function (ctx) {
      if (ctx.n !== 4) return null;
      // Japanese 4-line, 12 syllables each (with internal pause at 7/8).
      if (ctx.counts.every(function (c) { return c === 12; })) {
        return { confidence: 'high' };
      }
      return null;
    }},

    { name: 'kouta', label: 'Kouta', test: function (ctx) {
      if (ctx.n !== 4) return null;
      const c = ctx.counts;
      // Japanese folk quatrain; the common form is 7-7-7-5 or 7-5-7-5.
      // Distinguish from Dodoitsu (which is strictly 7-7-7-5) by checking
      // for 7-5-7-5 first.
      if (c[0] === 7 && c[1] === 5 && c[2] === 7 && c[3] === 5) {
        return { confidence: 'high' };
      }
      return null;
    }},

    { name: 'gwawdodyn', label: 'Gwawdodyn', test: function (ctx) {
      if (ctx.n !== 4) return null;
      const c = ctx.counts;
      if (c[0] === 9 && c[1] === 9 && c[2] === 10 && c[3] === 9) return { confidence: 'high' };
      return null;
    }},

    // Byr a thoddaid: Welsh quatrain, 8-8-10-6 syllables.
    { name: 'byr-a-thoddaid', label: 'Byr a thoddaid', test: function (ctx) {
      if (ctx.n !== 4) return null;
      const c = ctx.counts;
      if (c[0] === 8 && c[1] === 8 && c[2] === 10 && c[3] === 6) return { confidence: 'high' };
      return null;
    }},

    // Cyhydedd hir: Welsh quatrain with very long lines, traditionally 19
    // syllables per line divided 5+5+5+4. We can\u2019t verify the internal
    // divisions, so we trigger on 4 lines of ~19 syllables.
    { name: 'cyhydedd-hir', label: 'Cyhydedd hir', test: function (ctx) {
      if (ctx.n !== 4) return null;
      if (!ctx.counts.every(function (c) { return within(c, 19, 1); })) return null;
      return { confidence: 'medium' };
    }},

    // 4 × 7 syllables — several Celtic forms share this shape. Distinguish
    // by rhyme scheme when possible; otherwise label as a family.
    { name: 'ae-freislighe', label: 'Ae freislighe', test: function (ctx) {
      if (ctx.n !== 4 || !ctx.counts.every(function (c) { return c === 7; })) return null;
      if (ctx.scheme === 'ABAB') return { confidence: 'medium' };
      return null;
    }},
    { name: 'englyn-cyrch', label: 'Englyn cyrch', test: function (ctx) {
      if (ctx.n !== 4 || !ctx.counts.every(function (c) { return c === 7; })) return null;
      if (ctx.scheme === 'ABBA') return { confidence: 'medium' };
      return null;
    }},
    { name: 'awdl-gywydd', label: 'Awdl gywydd', test: function (ctx) {
      if (ctx.n !== 4 || !ctx.counts.every(function (c) { return c === 7; })) return null;
      if (ctx.scheme && ctx.scheme[1] === ctx.scheme[3] &&
          ctx.scheme[0] !== ctx.scheme[1]) {
        return { confidence: 'medium' };
      }
      return null;
    }},
    { name: 'casbairdne', label: 'Casbairdne (or similar 7\u20137\u20137\u20137 Celtic quatrain)',
      test: function (ctx) {
        if (ctx.n !== 4 || !ctx.counts.every(function (c) { return c === 7; })) return null;
        return { confidence: 'low' };
      }
    },

    // ===== Five-line forms =====

    { name: 'cinquain', label: 'Cinquain (Crapsey)', test: function (ctx) {
      if (ctx.n !== 5) return null;
      const c = ctx.counts;
      if (c[0] === 2 && c[1] === 4 && c[2] === 6 && c[3] === 8 && c[4] === 2) {
        return { confidence: 'high' };
      }
      if (within(c[0], 2, 1) && within(c[1], 4, 1) && within(c[2], 6, 1) &&
          within(c[3], 8, 1) && within(c[4], 2, 1)) {
        return { confidence: 'medium' };
      }
      return null;
    }},

    { name: 'tanka', label: 'Tanka', test: function (ctx) {
      if (ctx.n !== 5) return null;
      const c = ctx.counts;
      if (within(c[0], 5, 1) && within(c[1], 7, 1) && within(c[2], 5, 1) &&
          within(c[3], 7, 1) && within(c[4], 7, 1)) {
        const exact = c[0] === 5 && c[1] === 7 && c[2] === 5 && c[3] === 7 && c[4] === 7;
        return {
          confidence: exact ? 'high' : 'medium',
          labelOverride: exact ? 'Tanka' : 'Tanka (loose)'
        };
      }
      return null;
    }},

    { name: 'limerick', label: 'Limerick', test: function (ctx) {
      if (ctx.n !== 5 || ctx.scheme !== 'AABBA') return null;
      const c = ctx.counts;
      const longLines = [c[0], c[1], c[4]];
      const shortLines = [c[2], c[3]];
      const shapeOK = longLines.every(function (x) { return x >= 7 && x <= 11; }) &&
                      shortLines.every(function (x) { return x >= 4 && x <= 7; }) &&
                      Math.min.apply(null, longLines) > Math.max.apply(null, shortLines);
      return { confidence: shapeOK ? 'high' : 'medium' };
    }},

    { name: 'flamenca', label: 'Flamenca', test: function (ctx) {
      if (ctx.n !== 5) return null;
      const c = ctx.counts;
      // Spanish quintain, classic shape 7-5-7-7-5.
      if (c[0] === 7 && c[1] === 5 && c[2] === 7 && c[3] === 7 && c[4] === 5) {
        return { confidence: 'high' };
      }
      return null;
    }},

    { name: 'bob-and-wheel', label: 'Bob and wheel', test: function (ctx) {
      if (ctx.n !== 5) return null;
      const c = ctx.counts;
      // The "bob" is a very short line (1-2 syllables, 1-3 words); the four
      // "wheel" lines that follow are roughly 4-6 syllables each. End-rhyme
      // ABABA is the classic signature (from Sir Gawain).
      const bobShort = c[0] <= 2 && ctx.wordCounts[0] <= 3;
      const wheelOK = c[1] >= 3 && c[1] <= 7 &&
                      c[2] >= 3 && c[2] <= 7 &&
                      c[3] >= 3 && c[3] <= 7 &&
                      c[4] >= 3 && c[4] <= 7;
      if (!bobShort || !wheelOK) return null;
      if (ctx.scheme === 'ABABA') return { confidence: 'high' };
      return { confidence: 'medium' };
    }},

    // ===== Six-line forms =====

    { name: 'clogyrnach', label: 'Clogyrnach', test: function (ctx) {
      if (ctx.n !== 6) return null;
      const expected = [8, 8, 5, 5, 3, 3];
      if (!expected.every(function (e, i) { return ctx.counts[i] === e; })) return null;
      if (ctx.scheme === 'AABBBA') return { confidence: 'high' };
      return { confidence: 'medium' };
    }},

    { name: 'cywydd-llosgyrnog', label: 'Cywydd llosgyrnog', test: function (ctx) {
      if (ctx.n !== 6) return null;
      const expected = [8, 8, 7, 8, 8, 7];
      if (!expected.every(function (e, i) { return ctx.counts[i] === e; })) return null;
      return { confidence: 'medium' };
    }},

    { name: 'gwawdodyn-hir', label: 'Gwawdodyn hir', test: function (ctx) {
      if (ctx.n !== 6) return null;
      const c = ctx.counts;
      // Welsh 6-liner: four 9-syllable lines, one 10-syllable, one 9-syllable.
      // The classic pattern is 9-9-9-9-10-9.
      if (c[0] === 9 && c[1] === 9 && c[2] === 9 && c[3] === 9 && c[4] === 10 && c[5] === 9) {
        return { confidence: 'high' };
      }
      return null;
    }},

    { name: 'hir-a-thoddaid', label: 'Hir a thoddaid', test: function (ctx) {
      if (ctx.n !== 6) return null;
      const c = ctx.counts;
      // Welsh 6-liner: lines 1-4 and 6 share the same end-rhyme (mostly
      // monorhyme), line 5 introduces a different rhyme that resolves
      // internally with line 6. Classic shape: 10-10-10-10-10-9 or similar.
      if (!c.every(function (x) { return x === 10 || x === 9; })) return null;
      // Test scheme: lines 1, 2, 3, 4, 6 should share a letter; line 5 differs.
      const s = ctx.scheme;
      if (s.length !== 6) return null;
      const main = s[0];
      if (main === '\u2013') return null;
      const matchesMain = (s[1] === main && s[2] === main && s[3] === main && s[5] === main);
      if (matchesMain && s[4] !== main) return { confidence: 'high' };
      return null;
    }},

    // ===== Eight-line forms =====

    // Triolet: detected by line repetition (1=4=7, 2=8).
    { name: 'triolet', label: 'Triolet', test: function (ctx) {
      if (ctx.n !== 8) return null;
      const keys = ctx.lineMeters.map(function (lm) { return compareKey(lm.text); });
      if (keys[0] === keys[3] && keys[0] === keys[6] && keys[1] === keys[7] && keys[0]) {
        return { confidence: 'high' };
      }
      return null;
    }},

    { name: 'ottava-rima', label: 'Ottava rima', test: function (ctx) {
      if (ctx.n !== 8 || ctx.scheme !== 'ABABABCC') return null;
      return { confidence: 'high' };
    }},

    { name: 'italian-octave', label: 'Italian octave', test: function (ctx) {
      if (ctx.n !== 8 || ctx.scheme !== 'ABBAABBA') return null;
      return { confidence: 'high' };
    }},

    { name: 'sicilian-octave', label: 'Sicilian octave', test: function (ctx) {
      if (ctx.n !== 8 || ctx.scheme !== 'ABABABAB') return null;
      return { confidence: 'high' };
    }},

    { name: 'huitain', label: 'Huitain', test: function (ctx) {
      if (ctx.n !== 8 || ctx.scheme !== 'ABABBCBC') return null;
      return { confidence: 'high' };
    }},

    { name: 'cyrch-a-chwta', label: 'Cyrch a chwta', test: function (ctx) {
      if (ctx.n !== 8) return null;
      if (!ctx.counts.every(function (c) { return c === 7; })) return null;
      return { confidence: 'medium' };
    }},

    { name: 'chueh-chu', label: 'Chueh-chu', test: function (ctx) {
      if (ctx.n !== 8) return null;
      // Chinese "sonnet cut short": 8 lines, uniformly 5 or 7 syllables.
      // (Tonal patterns can't be detected; syllable + length is the
      // structural signature available from English text alone.)
      const target = (ctx.counts[0] === 7) ? 7 : 5;
      if (!ctx.counts.every(function (c) { return c === target; })) return null;
      return { confidence: 'medium' };
    }},

    { name: 'mistress-bradstreet-stanza', label: 'Mistress Bradstreet stanza (Berryman)',
      test: function (ctx) {
        if (ctx.n !== 8) return null;
        const c = ctx.counts;
        // Berryman's stanza in "Homage to Mistress Bradstreet":
        // 5-5-8-5-8-8-3-2 syllables, rhyme ABCCBDDA.
        const expected = [5, 5, 8, 5, 8, 8, 3, 2];
        const shapeOK = expected.every(function (e, i) { return within(c[i], e, 1); });
        if (!shapeOK) return null;
        if (ctx.scheme === 'ABCCBDDA') return { confidence: 'high' };
        return { confidence: 'medium' };
      }
    },

    // ===== Nine-line forms =====

    { name: 'magic-9', label: 'Magic 9', test: function (ctx) {
      if (ctx.n !== 9 || ctx.scheme !== 'ABACADABA') return null;
      return { confidence: 'high' };
    }},

    { name: 'spenserian-stanza', label: 'Spenserian stanza', test: function (ctx) {
      if (ctx.n !== 9 || ctx.scheme !== 'ABABBCBCC') return null;
      const first8 = ctx.counts.slice(0, 8).every(function (c) { return within(c, 10, 1); });
      const last12 = within(ctx.counts[8], 12, 1);
      if (first8 && last12) return { confidence: 'high' };
      return { confidence: 'medium' };
    }},

    { name: 'lai', label: 'Lai', test: function (ctx) {
      if (ctx.n !== 9) return null;
      const expected = [5, 5, 2, 5, 5, 2, 5, 5, 2];
      const syllableOK = expected.every(function (e, i) { return ctx.counts[i] === e; });
      const schemeOK = ctx.scheme === 'AABAABAAB';
      if (syllableOK && schemeOK) return { confidence: 'high' };
      if (syllableOK) return { confidence: 'medium' };
      return null;
    }},

    // ===== Ten-line forms =====

    { name: 'dizain', label: 'Dizain', test: function (ctx) {
      if (ctx.n !== 10 || ctx.scheme !== 'ABABBCCDCD') return null;
      if (!ctx.counts.every(function (c) { return within(c, 10, 1); })) return null;
      return { confidence: 'high' };
    }},

    { name: 'espinela', label: 'Espinela (D\u00E9cima)', test: function (ctx) {
      if (ctx.n !== 10 || ctx.scheme !== 'ABBAACCDDC') return null;
      if (!ctx.counts.every(function (c) { return within(c, 8, 1); })) return null;
      return { confidence: 'high' };
    }},

    { name: 'ovillejo', label: 'Ovillejo', test: function (ctx) {
      if (ctx.n !== 10) return null;
      const c = ctx.counts;
      // Cervantine 10-liner: 8-3-8-3-8-3-8-8-8-8 syllables, scheme AABBCCCDDC.
      // Lines 2, 4, 6 are "echoes" (3-4 syllables); the final quatrain
      // (lines 7-10) reuses the three echoes plus a closing line.
      const longOK = [c[0], c[2], c[4], c[6], c[7], c[8], c[9]].every(function (x) {
        return within(x, 8, 1);
      });
      const echoOK = [c[1], c[3], c[5]].every(function (x) { return x >= 2 && x <= 5; });
      if (!longOK || !echoOK) return null;
      if (ctx.scheme === 'AABBCCCDDC') return { confidence: 'high' };
      return { confidence: 'medium' };
    }},

    // ===== Eleven-line: Curtal sonnet =====

    { name: 'sonnet-curtal', label: 'Curtal sonnet (Hopkins)', test: function (ctx) {
      if (ctx.n !== 11) return null;
      if (ctx.scheme === 'ABCABCDCBDC' || ctx.scheme === 'ABCABCDBCDC' ||
          ctx.scheme === 'ABCABCDCBDCC') return { confidence: 'high' };
      return null;
    }},

    // ===== Twelve-line: Minute poem =====

    { name: 'minute-poem', label: 'Minute poem', test: function (ctx) {
      if (ctx.n !== 12) return null;
      const expected = [8, 4, 4, 4, 8, 4, 4, 4, 8, 4, 4, 4];
      if (!expected.every(function (e, i) { return ctx.counts[i] === e; })) return null;
      let aabb = true;
      for (let i = 0; i < 12; i += 2) {
        if (ctx.scheme[i] !== ctx.scheme[i + 1]) { aabb = false; break; }
      }
      return { confidence: aabb ? 'high' : 'medium' };
    }},

    // ===== Fourteen-line: Sonnet variants =====

    { name: 'haiku-sonnet', label: 'Haiku sonnet', test: function (ctx) {
      if (ctx.n !== 14) return null;
      const c = ctx.counts;
      // 4 haiku (5-7-5 × 4 = 12 lines) + a 2-line couplet.
      // Allow ±1 syllable tolerance on each line.
      const haikuPart = [5, 7, 5, 5, 7, 5, 5, 7, 5, 5, 7, 5];
      const ok = haikuPart.every(function (e, i) { return within(c[i], e, 1); });
      if (!ok) return null;
      // The couplet (lines 13, 14) can be roughly anything; require both
      // lines to share an end-rhyme for high confidence.
      if (ctx.scheme && ctx.scheme[12] === ctx.scheme[13] && ctx.scheme[12] !== '\u2013') {
        return { confidence: 'high' };
      }
      return { confidence: 'medium' };
    }},

    { name: 'bref-double', label: 'Bref double', test: function (ctx) {
      if (ctx.n !== 14) return null;
      // French 14-liner: three quatrains plus a couplet, with a sparse
      // distinctive rhyme scheme of A B C D / A B C D / B D / C D where
      // the rhymes scatter unpredictably. Distinguishing signature: line
      // counts have no fixed syllable target (varies by author), but the
      // form is NOT iambic-pentameter; usually 8 or 10 syllables uniformly.
      // To avoid false positives, only fire on a distinctive rhyme pattern:
      // lines 1+5 share a rhyme, lines 2+6 share, lines 3+7 share, and
      // lines 12+14 share — without matching the strict sonnet schemes.
      const s = ctx.scheme;
      if (!s || s.length !== 14) return null;
      const knownSonnets = ['ABABCDCDEFEFGG', 'ABABBCBCCDCDEE'];
      if (knownSonnets.indexOf(s) !== -1) return null;
      if (schemeMisses(s.slice(0, 8), 'ABBAABBA') === 0) return null; // Petrarchan octave
      const hasRefrainPattern = (s[0] === s[4] && s[1] === s[5] && s[2] === s[6] &&
                                 s[11] === s[13] && s[0] !== s[1]);
      if (hasRefrainPattern) return { confidence: 'medium' };
      return null;
    }},

    { name: 'sonnet-shakespearean', label: 'Shakespearean sonnet (iambic pentameter)',
      test: function (ctx) {
        if (ctx.n !== 14) return null;
        if (!ctx.counts.every(function (c) { return within(c, 10, 1); })) return null;
        // One imperfect rhyme is allowed (temperate / date in Sonnet 18 rhymed
        // for Shakespeare but not today).
        const misses = schemeMisses(ctx.scheme, 'ABABCDCDEFEFGG');
        if (misses > 1) return null;
        return { confidence: misses ? 'medium' : 'high' };
      }
    },
    { name: 'sonnet-petrarchan', label: 'Petrarchan sonnet', test: function (ctx) {
      if (ctx.n !== 14) return null;
      if (!ctx.counts.every(function (c) { return within(c, 10, 1); })) return null;
      const variants = ['ABBAABBACDECDE', 'ABBAABBACDCDCD',
                        'ABBAABBACDCCDC', 'ABBAABBACDEDCE'];
      const misses = Math.min.apply(null, variants.map(function (v) { return schemeMisses(ctx.scheme, v); }));
      if (misses <= 1) return { confidence: misses ? 'medium' : 'high' };
      // The octave defines the form; sestets vary widely (CDCEDE, CDDCEE...),
      // so a clean ABBAABBA octave with fresh sestet rhymes still counts.
      const octave = ctx.scheme.slice(0, 8), sestet = ctx.scheme.slice(8);
      const fresh = sestet.split('').every(function (l) { return octave.indexOf(l) === -1; });
      if (schemeMisses(octave, 'ABBAABBA') === 0 && fresh && new Set(sestet).size <= 3) {
        return { confidence: 'medium' };
      }
      return null;
    }},
    { name: 'sonnet-spenserian', label: 'Spenserian sonnet', test: function (ctx) {
      if (ctx.n !== 14) return null;
      if (!ctx.counts.every(function (c) { return within(c, 10, 1); })) return null;
      const misses = schemeMisses(ctx.scheme, 'ABABBCBCCDCDEE');
      if (misses > 1) return null;
      return { confidence: misses ? 'medium' : 'high' };
    }},
    { name: 'sonnet-shape', label: 'Sonnet (shape only)', test: function (ctx) {
      if (ctx.n !== 14) return null;
      if (!ctx.counts.every(function (c) { return within(c, 10, 1); })) return null;
      return { confidence: 'medium' };
    }},

    // ===== Nineteen-line: Villanelle =====

    { name: 'villanelle', label: 'Villanelle', test: function (ctx) {
      if (ctx.n !== 19) return null;
      // Two refrain lines: line 1 returns as 6, 12, 18; line 3 returns as 9, 15, 19.
      const k = ctx.lineMeters.map(function (lm) { return compareKey(lm.text); });
      const r1Same = (k[0] === k[5] || k[0] === k[11] || k[0] === k[17]);
      const r2Same = (k[2] === k[8] || k[2] === k[14] || k[2] === k[18]);
      if (r1Same && r2Same && k[0] && k[2]) return { confidence: 'high' };
      return null;
    }},

    // ===== Twenty-eight-line: Ballade =====

    { name: 'ballade', label: 'Ballade', test: function (ctx) {
      if (ctx.n !== 28) return null;
      const expected = 'ABABBCBCABABBCBCABABBCBCBCBC';
      if (ctx.scheme === expected) return { confidence: 'high' };
      return { confidence: 'medium' };
    }},

    { name: 'chant-royal', label: 'Chant royal', test: function (ctx) {
      if (ctx.n !== 60) return null;
      // French expansion of the ballade: 5 stanzas of 11 lines + 5-line envoy.
      // No fixed scheme without the canonical rhyme structure, but the line
      // count alone is so unusual that a medium-confidence call is warranted.
      return { confidence: 'medium' };
    }},

    // ===== Couplet-based forms =====

    // Acknowledge first since most distinctive — landay has very specific shape.
    { name: 'landay', label: 'Landay', test: function (ctx) {
      if (ctx.n !== 2) return null;
      const c = ctx.counts;
      if (c[0] === 9 && c[1] === 13) return { confidence: 'high' };
      if (within(c[0], 9, 1) && within(c[1], 13, 1)) return { confidence: 'medium' };
      return null;
    }},

    // Welsh syllabic-couplet forms. Welsh poetry counts syllables, not feet —
    // so these only fire when the meter is NOT cleanly an English foot.
    // (Otherwise an English iambic-tetrameter rhyming-couplets poem would
    // get misclassified as Welsh by coincidence.)
    { name: 'cywydd-deuair-fyrion', label: 'Cywydd deuair fyrion', test: function (ctx) {
      if (ctx.n < 2 || ctx.n % 2 !== 0) return null;
      if (!ctx.counts.every(function (c) { return c === 4; })) return null;
      if (!isCoupletScheme(ctx.scheme)) return null;
      if (ctx.dominantFoot === 'iambic' || ctx.dominantFoot === 'trochaic') return null;
      return { confidence: 'medium' };
    }},
    { name: 'cywydd-deuair-hirion', label: 'Cywydd deuair hirion', test: function (ctx) {
      if (ctx.n < 2 || ctx.n % 2 !== 0) return null;
      if (!ctx.counts.every(function (c) { return c === 7; })) return null;
      if (!isCoupletScheme(ctx.scheme)) return null;
      if (ctx.dominantFoot === 'iambic' || ctx.dominantFoot === 'trochaic') return null;
      return { confidence: 'medium' };
    }},
    { name: 'cyhydedd-fer', label: 'Cyhydedd fer', test: function (ctx) {
      if (ctx.n < 2 || ctx.n % 2 !== 0) return null;
      if (!ctx.counts.every(function (c) { return c === 8; })) return null;
      if (!isCoupletScheme(ctx.scheme)) return null;
      if (ctx.dominantFoot === 'iambic' || ctx.dominantFoot === 'trochaic') return null;
      return { confidence: 'medium' };
    }},
    { name: 'cyhydedd-naw-ban', label: 'Cyhydedd naw ban', test: function (ctx) {
      if (ctx.n < 2 || ctx.n % 2 !== 0) return null;
      if (!ctx.counts.every(function (c) { return c === 9; })) return null;
      if (!isCoupletScheme(ctx.scheme)) return null;
      if (ctx.dominantFoot === 'iambic' || ctx.dominantFoot === 'trochaic') return null;
      return { confidence: 'medium' };
    }},

    { name: 'luc-bat', label: 'L\u1EE5c b\u00E1t', test: function (ctx) {
      if (ctx.n < 4 || ctx.n % 2 !== 0) return null;
      // Vietnamese "six-eight": alternating 6 and 8 syllable lines.
      // The form can extend indefinitely. The internal-rhyme linking rule
      // (line N's 8th syllable rhymes with line N+1's 6th syllable) is hard
      // to verify without diacritics, so we accept the syllable shape alone
      // at medium confidence.
      for (let i = 0; i < ctx.n; i++) {
        const target = (i % 2 === 0) ? 6 : 8;
        if (ctx.counts[i] !== target) return null;
      }
      return { confidence: 'medium' };
    }},

    // ===== Quatrain-based / monorhyme forms =====

    // Rubaiyat-style: AABA quatrains. Single stanza = rubai; chains with
    // interlock = interlocking rubaiyat.
    { name: 'interlocking-rubaiyat', label: 'Interlocking rubaiyat', test: function (ctx) {
      if (ctx.n < 8 || ctx.n % 4 !== 0) return null;
      // Each stanza is XXYX, and line 3 of one stanza = line 1 of next (rhyme-wise).
      for (let i = 0; i < ctx.n; i += 4) {
        const s = ctx.scheme.slice(i, i + 4);
        if (s.length < 4) return null;
        if (s[0] !== s[1] || s[0] !== s[3] || s[0] === s[2]) return null;
      }
      for (let i = 4; i < ctx.n; i += 4) {
        const prev3 = ctx.scheme[i - 2]; // line 3 letter of previous stanza
        const curr0 = ctx.scheme[i];     // line 1 letter of current stanza
        if (prev3 !== curr0) return null;
      }
      return { confidence: 'high' };
    }},
    { name: 'rubaiyat', label: 'Rubaiyat stanza', test: function (ctx) {
      if (ctx.n !== 4) return null;
      const s = ctx.scheme;
      if (s.length === 4 && s[0] === s[1] && s[0] === s[3] && s[0] !== s[2]) {
        return { confidence: 'high' };
      }
      return null;
    }},

    // Monotetra: quatrain(s) with AAAA, all 8-syllable iambic.
    { name: 'monotetra', label: 'Monotetra', test: function (ctx) {
      if (ctx.n < 4 || ctx.n % 4 !== 0) return null;
      for (let i = 0; i < ctx.n; i += 4) {
        const s = ctx.scheme.slice(i, i + 4);
        if (s[0] !== s[1] || s[1] !== s[2] || s[2] !== s[3]) return null;
      }
      if (!ctx.counts.every(function (c) { return within(c, 8, 1); })) return null;
      return { confidence: 'high' };
    }},

    // Clerihew: 4 lines, AABB. (Whether it's about a person — unverifiable.)
    // Sub-criterion: first line typically ends with a name. Best we can do is
    // surface it as "AABB quatrain — possibly clerihew" later. Skip here.

    // ===== Refrain / repetition forms =====

    // Echo verse: each line ends with a short "echo" — a word (often just
    // the last syllable of the previous line) on a line of its own.
    { name: 'echo-verse', label: 'Echo verse', test: function (ctx) {
      if (ctx.n < 4 || ctx.n % 2 !== 0) return null;
      // Every even-indexed line (the "echoes", 0-indexed 1, 3, 5...) must be
      // 1-2 words, and its first word must end-match the previous line's last
      // word (either identical or a suffix of it).
      const wordRe = /[\p{L}\p{N}][\p{L}\p{N}'\u2019-]*/gu;
      function last(s) {
        const m = (s || '').match(wordRe);
        return m ? m[m.length - 1].toLowerCase() : '';
      }
      function first(s) {
        const m = (s || '').match(wordRe);
        return m ? m[0].toLowerCase() : '';
      }
      function words(s) {
        const m = (s || '').match(wordRe);
        return m ? m.length : 0;
      }
      for (let i = 1; i < ctx.n; i += 2) {
        const echoLine = ctx.lineMeters[i].text;
        if (words(echoLine) > 2) return null;
        const echoWord = first(echoLine);
        const prevLast = last(ctx.lineMeters[i - 1].text);
        if (!echoWord || !prevLast) return null;
        // Echo matches: identical, or suffix of the previous last word
        // (e.g. "where" → "ere", "lonely" → "only").
        if (echoWord !== prevLast && !prevLast.endsWith(echoWord)) return null;
      }
      return { confidence: 'high' };
    }},

    // Ghazal: 5-15 couplets where every second line ends with the same word(s).
    { name: 'ghazal', label: 'Ghazal', test: function (ctx) {
      if (ctx.n < 4 || ctx.n % 2 !== 0) return null;
      if (ctx.n > 30) return null;
      // Extract last word of each even-indexed line (lines 2, 4, 6, ...).
      const lastWords = [];
      for (let i = 1; i < ctx.n; i += 2) {
        const m = (ctx.lineMeters[i].text || '').match(/[A-Za-z\u2019'-]+/g);
        if (!m || !m.length) return null;
        lastWords.push(m[m.length - 1].toLowerCase().replace(/[\u2019']/g, ''));
      }
      // All identical = strong ghazal signal (the "radif" refrain).
      const refrain = lastWords[0];
      if (!refrain) return null;
      if (lastWords.every(function (w) { return w === refrain; })) {
        return { confidence: 'high' };
      }
      return null;
    }},

    // Masnavi / heroic couplets: long string of rhyming couplets.
    { name: 'masnavi', label: 'Masnavi (rhyming couplets, narrative scale)',
      test: function (ctx) {
        if (ctx.n < 10 || ctx.n % 2 !== 0) return null;
        // Persian masnavi lines are long; short-line couplets (Blake) are
        // plain rhyming couplets.
        const avg = ctx.counts.reduce(function (a, b) { return a + b; }, 0) / ctx.n;
        if (avg < 9) return null;
        if (isCoupletScheme(ctx.scheme)) return { confidence: 'medium' };
        return null;
      }
    },

    // ===== Common meters (English hymn tradition) =====

    { name: 'common-meter', label: 'Common meter (ballad meter)', test: function (ctx) {
      if (ctx.n < 4 || ctx.n % 2 !== 0) return null;
      for (let i = 0; i < ctx.n; i++) {
        const target = (i % 2 === 0) ? 8 : 6;
        if (!within(ctx.counts[i], target, 1)) return null;
      }
      return { confidence: 'high' };
    }},

    { name: 'short-meter', label: 'Short meter', test: function (ctx) {
      if (ctx.n < 4 || ctx.n % 4 !== 0) return null;
      const targets = [6, 6, 8, 6];
      for (let i = 0; i < ctx.n; i++) {
        if (!within(ctx.counts[i], targets[i % 4], 1)) return null;
      }
      return { confidence: 'high' };
    }},

    // ===== Metric naming (uniform lines) =====

    { name: 'blank-verse', label: 'Blank verse', test: function (ctx) {
      if (ctx.n < 4) return null;
      if (!ctx.counts.every(function (c) { return within(c, 10, 1); })) return null;
      if (ctx.dominantFoot !== 'iambic') return null;
      // Has to be unrhymed.
      const distinct = new Set(ctx.letters.filter(function (l) { return l !== '\u2013'; }));
      if (distinct.size < ctx.n * 0.8) return null;
      return { confidence: 'high' };
    }},

    { name: 'iambic tetrameter', label: 'Iambic tetrameter (long meter)',
      test: function (ctx) {
        if (ctx.n < 4) return null;
        if (!ctx.counts.every(function (c) { return within(c, 8, 1); })) return null;
        if (ctx.dominantFoot === 'iambic') return { confidence: 'high' };
        return null;
      }
    },
    { name: 'trochaic tetrameter', label: 'Trochaic tetrameter', test: function (ctx) {
      if (ctx.n < 4) return null;
      if (!ctx.counts.every(function (c) { return within(c, 8, 1); })) return null;
      if (ctx.dominantFoot === 'trochaic') return { confidence: 'high' };
      return null;
    }},

    // Generic uniform meter — name by foot + length.
    { name: '__uniform_meter__', label: '', test: function (ctx) {
      const unique = new Set(ctx.counts);
      if (!(unique.size === 1 || (unique.size === 2 && nearUniform(ctx.counts)))) return null;
      const target = mode(ctx.counts);
      const foot = ctx.dominantFoot;
      if (foot === 'iambic' || foot === 'trochaic' ||
          foot === 'anapestic' || foot === 'dactylic') {
        const m = namedMeter(foot, target);
        return {
          confidence: 'high',
          name: m,
          labelOverride: capitalizeFirst(m)
        };
      }
      return {
        confidence: 'medium',
        name: 'syllabic',
        labelOverride: 'Syllabic (' + target + '-syllable lines)'
      };
    }},

    // ===== Generic stanza shapes (low-confidence fallbacks) =====

    { name: 'rhyming-couplets', label: 'Rhyming couplets', test: function (ctx) {
      if (ctx.n < 4 || ctx.n % 2 !== 0) return null;
      if (!isCoupletScheme(ctx.scheme)) return null;
      return { confidence: 'medium' };
    }}
  ];

  // --- detectPattern ----------------------------------------------------
  // Build a context from lineMeters + rhyme, walk FORM_DEFINITIONS, and
  // return the first matching form. Falls through to "free verse" if nothing
  // matches.
  function detectPattern(lineMeters, rhyme) {
    const counts = lineMeters.map(function (m) { return m.syllables; });
    const n = counts.length;
    const scheme = (rhyme && rhyme.scheme) || '';
    const letters = (rhyme && rhyme.letters) || [];

    const wordCounts = lineMeters.map(function (m) { return countWordsIn(m.text); });
    const firstLetters = lineMeters.map(function (m) { return firstLetterOf(m.text); }).join('');
    const dominantFoot = dominantFootName(lineMeters);

    const ctx = {
      lineMeters: lineMeters,
      counts: counts,
      n: n,
      scheme: scheme,
      letters: letters,
      wordCounts: wordCounts,
      firstLetters: firstLetters,
      dominantFoot: dominantFoot
    };

    if (n === 0) {
      return { name: 'free verse', label: 'Free verse', kind: 'free', confidence: 'high' };
    }

    for (const form of FORM_DEFINITIONS) {
      const result = form.test(ctx);
      if (result) {
        const name = result.name || form.name;
        const label = result.labelOverride || form.label;
        return {
          name: name,
          label: label,
          kind: inferKind(name),
          confidence: result.confidence
        };
      }
    }

    return { name: 'free verse', label: 'Free verse', kind: 'free', confidence: 'high' };
  }

  // Map a form name to a coarse "kind" — used by older callers/styling.
  function inferKind(name) {
    if (name === 'free verse') return 'free';
    if (name === 'syllabic' || name.indexOf('syllabic') === 0) return 'syllabic';
    if (/(iambic|trochaic|anapestic|dactylic|common-meter|short-meter|long-meter|blank-verse)/.test(name)) {
      return 'metered';
    }
    return 'fixed';
  }

  function within(value, target, tolerance) {
    return Math.abs(value - target) <= tolerance;
  }

  function nearUniform(counts) {
    const sorted = counts.slice().sort((a, b) => a - b);
    return sorted[sorted.length - 1] - sorted[0] <= 1;
  }

  function mode(arr) {
    const counts = {};
    let modeVal = arr[0], modeCount = 0;
    for (const v of arr) {
      counts[v] = (counts[v] || 0) + 1;
      if (counts[v] > modeCount) { modeCount = counts[v]; modeVal = v; }
    }
    return modeVal;
  }

  // Find which foot (iambic/trochaic/anapestic/dactylic) dominates across lines,
  // weighted by per-line confidence. Requires majority + minimum threshold.
  function dominantFootName(lineMeters) {
    const totals = { iambic: 0, trochaic: 0, anapestic: 0, dactylic: 0, irregular: 0 };
    for (const lm of lineMeters) {
      if (lm.footScore >= 0.65 && Object.hasOwn(totals, lm.foot)) {
        totals[lm.foot] += lm.footScore;
      } else {
        totals.irregular += 1;
      }
    }
    let best = 'irregular', bestScore = 0;
    for (const k of Object.keys(totals)) {
      if (k !== 'irregular' && totals[k] > bestScore) {
        bestScore = totals[k];
        best = k;
      }
    }
    // Require the dominant foot to win against irregular by a reasonable margin
    if (bestScore < lineMeters.length * 0.4) return null;
    return best;
  }


  return {
    STRESS_DICT, PATTERN_DESCRIPTIONS, KNOWN_PROPER_NOUNS, ARTICLES, FORM_DEFINITIONS,
    getWordStress, getLineStress, classifyLineMeter, namedMeter,
    loadPronunciations, loadPronunciationsAsync, hasPronunciations, setPronunciationMaps,
    countSyllables, getRhymeKey, getRhymeKeys, rhymesWith, rhymeQuality, getLastWord, detectRhymeScheme, nameRhymeScheme,
    analyzeSourceMeter, detectPattern, schemeMisses
  };
});
