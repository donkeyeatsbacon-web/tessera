// Built-in source texts for "Try a sample". Everything here is public
// domain (or original to Tessera), so visitors can start without pasting.
window.TESSERA_SAMPLES = [
  {
    id: 'sonnet18',
    label: 'Shakespeare — Sonnet 18',
    text: [
      "Shall I compare thee to a summer's day?",
      'Thou art more lovely and more temperate:',
      'Rough winds do shake the darling buds of May,',
      "And summer's lease hath all too short a date;",
      'Sometime too hot the eye of heaven shines,',
      "And often is his gold complexion dimm'd;",
      'And every fair from fair sometime declines,',
      "By chance or nature's changing course untrimm'd;",
      'But thy eternal summer shall not fade,',
      "Nor lose possession of that fair thou ow'st;",
      "Nor shall Death brag thou wander'st in his shade,",
      "When in eternal lines to time thou grow'st:",
      'So long as men can breathe or eyes can see,',
      'So long lives this, and this gives life to thee.'
    ].join('\n')
  },
  {
    id: 'tyger',
    label: 'William Blake — The Tyger',
    text: [
      'Tyger Tyger, burning bright,',
      'In the forests of the night;',
      'What immortal hand or eye,',
      'Could frame thy fearful symmetry?',
      '',
      'In what distant deeps or skies,',
      'Burnt the fire of thine eyes?',
      'On what wings dare he aspire?',
      'What the hand, dare seize the fire?',
      '',
      'And what shoulder, & what art,',
      'Could twist the sinews of thy heart?',
      'And when thy heart began to beat,',
      'What dread hand? & what dread feet?',
      '',
      'What the hammer? what the chain,',
      'In what furnace was thy brain?',
      'What the anvil? what dread grasp,',
      'Dare its deadly terrors clasp!',
      '',
      'When the stars threw down their spears',
      "And water'd heaven with their tears:",
      'Did he smile his work to see?',
      'Did he who made the Lamb make thee?',
      '',
      'Tyger Tyger burning bright,',
      'In the forests of the night:',
      'What immortal hand or eye,',
      'Dare frame thy fearful symmetry?'
    ].join('\n')
  },
  {
    id: 'daffodils',
    label: 'Wordsworth — I Wandered Lonely as a Cloud',
    text: [
      'I wandered lonely as a cloud',
      "That floats on high o'er vales and hills,",
      'When all at once I saw a crowd,',
      'A host, of golden daffodils;',
      'Beside the lake, beneath the trees,',
      'Fluttering and dancing in the breeze.'
    ].join('\n')
  },
  {
    id: 'jabberwocky',
    label: 'Lewis Carroll — Jabberwocky (opening)',
    text: [
      "'Twas brillig, and the slithy toves",
      'Did gyre and gimble in the wabe:',
      'All mimsy were the borogoves,',
      'And the mome raths outgrabe.',
      '',
      '"Beware the Jabberwock, my son!',
      'The jaws that bite, the claws that catch!',
      'Beware the Jubjub bird, and shun',
      'The frumious Bandersnatch!"',
      '',
      'He took his vorpal sword in hand;',
      'Long time the manxome foe he sought—',
      'So rested he by the Tumtum tree',
      'And stood awhile in thought.'
    ].join('\n')
  },
  {
    id: 'declaration',
    label: 'Declaration of Independence (preamble)',
    text:
      'When in the Course of human events, it becomes necessary for one people to ' +
      'dissolve the political bands which have connected them with another, and to ' +
      'assume among the powers of the earth, the separate and equal station to which ' +
      "the Laws of Nature and of Nature's God entitle them, a decent respect to the " +
      'opinions of mankind requires that they should declare the causes which impel ' +
      'them to the separation.\n\n' +
      'We hold these truths to be self-evident, that all men are created equal, that ' +
      'they are endowed by their Creator with certain unalienable Rights, that among ' +
      'these are Life, Liberty and the pursuit of Happiness.'
  },
  {
    id: 'austen',
    label: 'Jane Austen — Pride and Prejudice (opening)',
    text:
      'It is a truth universally acknowledged, that a single man in possession of a ' +
      'good fortune, must be in want of a wife.\n\n' +
      'However little known the feelings or views of such a man may be on his first ' +
      'entering a neighbourhood, this truth is so well fixed in the minds of the ' +
      'surrounding families, that he is considered as the rightful property of some ' +
      'one or other of their daughters.'
  },
  {
    id: 'recipe',
    label: 'A recipe (lemon honey cake)',
    text:
      'Heat the oven to a gentle warmth and butter a round tin. Beat soft butter with ' +
      'honey until pale and light, then add three eggs one at a time. Fold in flour, ' +
      'a pinch of salt, and the bright zest of two lemons. Pour the batter into the tin ' +
      'and bake until golden and a knife comes out clean. While the cake is still warm, ' +
      'spoon over lemon juice stirred with more honey, and let it soak in slowly. ' +
      'Serve in thin slices with tea, on a quiet afternoon.'
  },
  {
    id: 'forecast',
    label: 'A weather forecast',
    text:
      'Tonight, clouds gather from the west with a chance of light rain after midnight. ' +
      'Winds turn gusty along the coast. Tomorrow begins grey and cool, but the sun ' +
      'breaks through by late afternoon, and the evening stays clear and still. ' +
      'Expect frost in the valleys before dawn. The weekend looks bright, dry, and ' +
      'calm, with a gentle breeze and long golden light.'
  }
];

// Extra public-domain openings that rotate through the daily prompt
// (along with the samples above). One is picked per calendar day.
window.TESSERA_DAILY = [
  {
    id: 'hope',
    label: 'Emily Dickinson \u2014 Hope is the thing with feathers',
    text: 'Hope is the thing with feathers\nThat perches in the soul,\nAnd sings the tune without the words,\nAnd never stops at all,'
  },
  {
    id: 'wind',
    label: 'Christina Rossetti \u2014 Who Has Seen the Wind?',
    text: 'Who has seen the wind?\nNeither I nor you:\nBut when the leaves hang trembling,\nThe wind is passing through.\n\n' +
      'Who has seen the wind?\nNeither you nor I:\nBut when the trees bow down their heads,\nThe wind is passing by.'
  },
  {
    id: 'autumn',
    label: 'John Keats \u2014 To Autumn (opening)',
    text: 'Season of mists and mellow fruitfulness,\nClose bosom-friend of the maturing sun;\n' +
      'Conspiring with him how to load and bless\nWith fruit the vines that round the thatch-eves run;'
  },
  {
    id: 'raven',
    label: 'Edgar Allan Poe \u2014 The Raven (opening)',
    text: 'Once upon a midnight dreary, while I pondered, weak and weary,\n' +
      'Over many a quaint and curious volume of forgotten lore\u2014\n' +
      'While I nodded, nearly napping, suddenly there came a tapping,\n' +
      'As of some one gently rapping, rapping at my chamber door.'
  },
  {
    id: 'rose',
    label: 'Robert Burns \u2014 A Red, Red Rose (opening)',
    text: 'O my Luve is like a red, red rose\nThat\u2019s newly sprung in June;\nO my Luve is like the melody\nThat\u2019s sweetly play\u2019d in tune.'
  },
  {
    id: 'ishmael',
    label: 'Herman Melville \u2014 Moby-Dick (opening)',
    text: 'Call me Ishmael. Some years ago\u2014never mind how long precisely\u2014having little or no money in my purse, ' +
      'and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world.'
  },
  {
    id: 'two-cities',
    label: 'Charles Dickens \u2014 A Tale of Two Cities (opening)',
    text: 'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, ' +
      'it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, ' +
      'it was the spring of hope, it was the winter of despair.'
  },
  {
    id: 'gettysburg',
    label: 'Abraham Lincoln \u2014 Gettysburg Address (opening)',
    text: 'Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty, ' +
      'and dedicated to the proposition that all men are created equal.'
  },
  {
    id: 'alice',
    label: 'Lewis Carroll \u2014 Alice\u2019s Adventures in Wonderland (opening)',
    text: 'Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: ' +
      'once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, ' +
      '\u2018and what is the use of a book,\u2019 thought Alice \u2018without pictures or conversations?\u2019'
  }
];
