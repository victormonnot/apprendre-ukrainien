import type {
  ReviewCardDefinition,
  ReviewElement,
} from "../lib/review-types.ts";

type LetterEntry = {
  id: string;
  letter: string;
  sound: string;
  note: string;
};

type WordEntry = {
  id: string;
  kind: "word" | "expression";
  ukrainian: string;
  meaning: string;
  productionCue: string;
  context: string;
  syllables: string;
  position: string;
  pronunciation: string;
  note: string;
  section: string;
};

// These identifiers describe learning items and remain stable when wording changes.
const letters: LetterEntry[] = [
  {
    id: "lettre-a",
    letter: "А а",
    sound: "a",
    note: "Repère du son dans un mot, pas le nom de la lettre.",
  },
  {
    id: "lettre-m",
    letter: "М м",
    sound: "m",
    note: "Réunis m et a pour lire ма ; ne lis pas « ème-a ».",
  },
  {
    id: "lettre-t",
    letter: "Т т",
    sound: "t",
    note: "Une même lettre : la majuscule et la minuscule sont montrées ensemble.",
  },
  {
    id: "lettre-o",
    letter: "О о",
    sound: "o",
    note: "Le dessin rappelle notre O latin.",
  },
  {
    id: "lettre-k",
    letter: "К к",
    sound: "k",
    note: "Le son k. La lettre С correspond au son s.",
  },
  {
    id: "lettre-n",
    letter: "Н н",
    sound: "n",
    note: "Le dessin rappelle H, mais le son est n.",
  },
  {
    id: "lettre-v",
    letter: "В в",
    sound: "v, comme repère de départ",
    note: "Ne pas lire b. Selon sa place, в peut aussi se rapprocher de w. Écoute un exemple.",
  },
  {
    id: "lettre-s",
    letter: "С с",
    sound: "s",
    note: "Même entre deux voyelles. Ce n’est pas le son k.",
  },
  {
    id: "lettre-r",
    letter: "Р р",
    sound: "r avec la pointe de la langue",
    note: "Le dessin rappelle P. Le r ukrainien est battu ou roulé. Identifier le son ne valide pas sa réalisation.",
  },
  {
    id: "lettre-ou",
    letter: "У у",
    sound: "ou, comme dans « roue »",
    note: "Ce n’est pas le son du u français de « rue ».",
  },
  {
    id: "lettre-i",
    letter: "І і",
    sound: "i",
    note: "À distinguer de И и, qui représente une autre voyelle.",
  },
  {
    id: "lettre-y",
    letter: "И и",
    sound: "i relâché, distinct de І і",
    note: "i* représente и : une voyelle plus relâchée, distincte de і. L’astérisque n’ajoute aucun son. La langue est un peu plus en arrière ; utilise l’audio comme modèle.",
  },
];

const words: WordEntry[] = [
  {
    id: "mot-kava",
    kind: "word",
    ukrainian: "кава",
    meaning: "café — la boisson",
    productionCue: "Café — la boisson",
    context: "",
    syllables: "**ка**-ва",
    position: "1re syllabe",
    pronunciation: "KA-va",
    note: "Désigne ce que l’on boit, pas le lieu.",
    section: "premiers-mots",
  },
  {
    id: "mot-mova",
    kind: "word",
    ukrainian: "мова",
    meaning: "langue / langage",
    productionCue: "Langue — au sens de langage",
    context: "",
    syllables: "**мо**-ва",
    position: "1re syllabe",
    pronunciation: "MO-va",
    note: "Ne désigne pas l’organe dans la bouche.",
    section: "premiers-mots",
  },
  {
    id: "mot-kit",
    kind: "word",
    ukrainian: "кіт",
    meaning: "chat, en particulier mâle",
    productionCue: "Chat — mâle",
    context: "",
    syllables: "**кіт**",
    position: "Une seule syllabe",
    pronunciation: "kit — t final prononcé",
    note: "Le t final reste audible.",
    section: "premiers-mots",
  },
  {
    id: "mot-mama",
    kind: "word",
    ukrainian: "мама",
    meaning: "maman",
    productionCue: "Maman",
    context: "",
    syllables: "**ма**-ма",
    position: "1re syllabe",
    pronunciation: "MA-ma",
    note: "",
    section: "premiers-mots",
  },
  {
    id: "mot-tato",
    kind: "word",
    ukrainian: "тато",
    meaning: "papa",
    productionCue: "Papa",
    context: "",
    syllables: "**та**-то",
    position: "1re syllabe",
    pronunciation: "TA-to",
    note: "",
    section: "premiers-mots",
  },
  {
    id: "mot-tut",
    kind: "word",
    ukrainian: "тут",
    meaning: "ici",
    productionCue: "Ici",
    context: "",
    syllables: "**тут**",
    position: "Une seule syllabe",
    pronunciation: "tout — t final prononcé",
    note: "Le t final se prononce ; il n’est pas muet comme dans le mot français « tout ».",
    section: "premiers-mots",
  },
  {
    id: "mot-tam",
    kind: "word",
    ukrainian: "там",
    meaning: "là / là-bas",
    productionCue: "Là-bas",
    context: "",
    syllables: "**там**",
    position: "Une seule syllabe",
    pronunciation: "tam",
    note: "Prononce a puis m, sans nasaliser la voyelle.",
    section: "premiers-mots",
  },
  {
    id: "expression-pryvit",
    kind: "expression",
    ukrainian: "Привіт!",
    meaning: "Salut !",
    productionCue: "« Salut ! » — pour saluer un ami",
    context: "",
    syllables: "при-**віт**",
    position: "2e syllabe",
    pronunciation: "pri*-VIT",
    note: "Salutation informelle. i* représente и : une voyelle plus relâchée, distincte de і. L’astérisque n’ajoute aucun son.",
    section: "expressions",
  },
  {
    id: "expression-dobryi-den",
    kind: "expression",
    ukrainian: "Добрий день!",
    meaning: "Bonjour !",
    productionCue:
      "« Bonjour ! » — pendant la journée, registre poli ou neutre",
    context: "",
    syllables: "**до**-брий день",
    position: "1re syllabe de добрий ; день : une syllabe",
    pronunciation: "DO-bri*y dèn",
    note: "Le n de день est prononcé et adouci ; pas de voyelle nasale française. bri*y forme une syllabe, y étant un petit son de liaison. i* représente и : une voyelle plus relâchée, distincte de і. L’astérisque n’ajoute aucun son.",
    section: "expressions",
  },
  {
    id: "expression-diakuiu",
    kind: "expression",
    ukrainian: "Дякую!",
    meaning: "Merci !",
    productionCue: "« Merci ! »",
    context: "",
    syllables: "**дя**-ку-ю",
    position: "1re syllabe, sur trois",
    pronunciation: "DIA-kou-you",
    note: "DIA se dit d’un seul mouvement : d adouci puis a, sans ajouter une syllabe « di ».",
    section: "expressions",
  },
  {
    id: "expression-bud-laska",
    kind: "expression",
    ukrainian: "Будь ласка.",
    meaning: "De rien.",
    productionCue: "« S’il te/vous plaît » — pour accompagner une demande",
    context: "En réponse à quelqu’un qui vient de te remercier.",
    syllables: "будь **ла**-ска",
    position: "1re syllabe de ласка ; будь : une syllabe",
    pronunciation: "boud LA-ska",
    note: "Deux emplois : « s’il te/vous plaît » dans une demande ; « de rien » après un merci. Le d de будь est adouci ; on ne le remplace pas par t.",
    section: "expressions",
  },
  {
    id: "expression-tak",
    kind: "expression",
    ukrainian: "Так.",
    meaning: "Oui.",
    productionCue: "« Oui. »",
    context: "",
    syllables: "**так**",
    position: "Une seule syllabe",
    pronunciation: "tak",
    note: "",
    section: "expressions",
  },
  {
    id: "expression-ni",
    kind: "expression",
    ukrainian: "Ні.",
    meaning: "Non.",
    productionCue: "« Non. »",
    context: "",
    syllables: "**ні**",
    position: "Une seule syllabe",
    pronunciation: "ni",
    note: "",
    section: "expressions",
  },
  {
    id: "expression-do-pobachennia",
    kind: "expression",
    ukrainian: "До побачення!",
    meaning: "Au revoir !",
    productionCue: "« Au revoir ! »",
    context: "",
    syllables: "до по-**ба**-че-ння",
    position: "2e syllabe de побачення",
    pronunciation: "do po-BA-tchè-nnia",
    note: "Le groupe нн représente ici un n adouci prolongé. Le repère « nnia » n’ajoute pas une syllabe « ni ».",
    section: "expressions",
  },
  {
    id: "expression-mene-zvaty",
    kind: "expression",
    ukrainian: "Мене звати…",
    meaning: "Je m’appelle…",
    productionCue: "« Je m’appelle… » — retrouve le modèle avant le prénom",
    context: "",
    syllables: "ме-**не** **зва**-ти",
    position: "2e de мене ; 1re de звати",
    pronunciation: "mè-NÈ ZVA-ti*",
    note: "Deux mots fixes, puis le prénom. Aucun prénom n’est demandé sur cette carte. i* représente и : une voyelle plus relâchée, distincte de і. L’astérisque n’ajoute aucun son.",
    section: "expressions",
  },
  {
    id: "mot-kyt",
    kind: "word",
    ukrainian: "кит",
    meaning: "baleine",
    productionCue: "Baleine — l’animal marin",
    context: "",
    syllables: "**кит**",
    position: "Une seule syllabe",
    pronunciation: "ki*t — t final prononcé",
    note: "И dans кит (« baleine »), І dans кіт (« chat »). i* représente и : une voyelle plus relâchée, distincte de і. L’astérisque n’ajoute aucun son.",
    section: "mots-complementaires",
  },
  {
    id: "mot-sik",
    kind: "word",
    ukrainian: "сік",
    meaning: "jus",
    productionCue: "Jus — par exemple une boisson obtenue en pressant un fruit",
    context: "",
    syllables: "**сік**",
    position: "Une seule syllabe",
    pronunciation: "sik — k final prononcé",
    note: "Le s est adouci devant і ; le repère français reste approximatif.",
    section: "mots-complementaires",
  },
  {
    id: "mot-rys",
    kind: "word",
    ukrainian: "рис",
    meaning: "riz",
    productionCue: "Riz — la céréale",
    context: "",
    syllables: "**рис**",
    position: "Une seule syllabe",
    pronunciation: "ri*s — s final prononcé",
    note: "Le s final se prononce. Le r est battu ou roulé. i* représente и : une voyelle plus relâchée, distincte de і. L’astérisque n’ajoute aucun son.",
    section: "mots-complementaires",
  },
  {
    id: "mot-syr",
    kind: "word",
    ukrainian: "сир",
    meaning: "fromage",
    productionCue: "Fromage",
    context: "",
    syllables: "**сир**",
    position: "Une seule syllabe",
    pronunciation: "si*r — r final prononcé",
    note: "Selon le contexte, сир peut aussi désigner du fromage frais caillé. Pour cette carte, « fromage » suffit. i* représente и : une voyelle plus relâchée, distincte de і. L’astérisque n’ajoute aucun son.",
    section: "mots-complementaires",
  },
];

function escapeAsterisks(text: string) {
  return text.replaceAll("*", "\\*");
}

function letterElement(entry: LetterEntry): ReviewElement {
  const id = `01-${entry.id}`;
  return {
    id,
    moduleId: "01",
    kind: "letter",
    label: entry.letter,
    sourceHref: "/parcours/01/cours#alphabet",
    cards: [
      {
        id: `${id}-recognition`,
        elementId: id,
        version: 1,
        direction: "recognition",
        prompt:
          "Quel repère de son cette lettre représente-t-elle dans un mot ?",
        cue: entry.letter,
        cueLang: "uk",
        answer: entry.sound,
        answerLang: "fr",
        details: `${escapeAsterisks(entry.note)}\n\nIl s’agit d’un repère approximatif de son, pas du nom de la lettre. Retrouver ce repère ne vérifie pas ta prononciation.`,
      },
    ],
  };
}

function wordElement(entry: WordEntry): ReviewElement {
  const id = `01-${entry.id}`;
  const details = [
    `Accent tonique : ${entry.syllables} — ${entry.position}.`,
    `Repère français approximatif : ${escapeAsterisks(entry.pronunciation)}.`,
    escapeAsterisks(entry.note),
  ]
    .filter(Boolean)
    .join("\n\n");
  const common = { elementId: id, version: 1, details };
  const comprehension: ReviewCardDefinition = {
    ...common,
    id: `${id}-comprehension`,
    direction: "comprehension",
    prompt: ["Retrouve le sens en français.", entry.context]
      .filter(Boolean)
      .join(" "),
    cue: entry.ukrainian,
    cueLang: "uk",
    answer: entry.meaning,
    answerLang: "fr",
  };
  const production: ReviewCardDefinition = {
    ...common,
    id: `${id}-production`,
    direction: "production",
    prompt:
      "Retrouve la forme ukrainienne du module. Écris-la en cyrillique, dans le champ ou sur papier.",
    cue: entry.productionCue,
    cueLang: "fr",
    answer: entry.ukrainian,
    answerLang: "uk",
  };
  return {
    id,
    moduleId: "01",
    kind: entry.kind,
    label: entry.ukrainian,
    sourceHref: `/parcours/01/vocabulaire#${entry.section}`,
    cards: [comprehension, production],
  };
}

export const reviewElements: ReviewElement[] = [
  ...letters.map(letterElement),
  ...words.map(wordElement),
];

export function getReviewElement(id: string) {
  return reviewElements.find((element) => element.id === id);
}

export function getReviewCard(id: string) {
  return reviewElements
    .flatMap((element) => element.cards)
    .find((card) => card.id === id);
}
