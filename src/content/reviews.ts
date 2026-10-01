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

function letterElement(entry: LetterEntry, moduleId = "01"): ReviewElement {
  const id = `${moduleId}-${entry.id}`;
  return {
    id,
    moduleId,
    kind: "letter",
    label: entry.letter,
    sourceHref:
      moduleId === "01"
        ? "/parcours/01/cours#alphabet"
        : `/parcours/${moduleId}/vocabulaire#lettres`,
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

function wordElement(entry: WordEntry, moduleId = "01"): ReviewElement {
  const id = `${moduleId}-${entry.id}`;
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
    moduleId,
    kind: entry.kind,
    label: entry.ukrainian,
    sourceHref: `/parcours/${moduleId}/vocabulaire#${entry.section}`,
    cards: [comprehension, production],
  };
}

const module02Letters: LetterEntry[] = [
  {
    id: "lettre-d",
    letter: "Д д",
    sound: "d",
    note: "Tu retrouves cette lettre dans студент.",
  },
  {
    id: "lettre-e",
    letter: "Е е",
    sound: "è, comme repère de départ",
    note: "Tu retrouves cette voyelle dans не et студент. Elle est différente de і dans ні.",
  },
  {
    id: "lettre-zh",
    letter: "Ж ж",
    sound: "j de « jour »",
    note: "Ce n’est pas le petit son y de « yaourt ». Tu retrouves ж dans інженер.",
  },
  {
    id: "lettre-ts",
    letter: "Ц ц",
    sound: "ts, prononcé comme un ensemble",
    note: "Ce n’est pas simplement s. Tu retrouves ц dans це.",
  },
  {
    id: "lettre-ya",
    letter: "Я я",
    sound: "ya au début du mot",
    note: "Dans le pronom я, y et a forment une seule syllabe. Après une consonne, я peut signaler son adoucissement, comme dans Дякую.",
  },
];

const module02Words: WordEntry[] = [
  {
    id: "mot-ya",
    kind: "word",
    ukrainian: "я",
    meaning: "je — comme sujet",
    productionCue: "Je — le pronom sujet quand tu parles de toi",
    context: "Le mot est utilisé comme sujet, par exemple dans Я студент.",
    syllables: "**я**",
    position: "Une seule syllabe",
    pronunciation: "ya",
    note: "Ce pronom ne dit pas si la personne est un homme ou une femme. Garde Мене звати comme un autre modèle : on n’y remplace pas мене par я.",
    section: "pronoms",
  },
  {
    id: "mot-ty",
    kind: "word",
    ukrainian: "ти",
    meaning: "tu — une seule personne tutoyée",
    productionCue: "Tu — pronom sujet pour un ami que tu tutoies",
    context: "Tu t’adresses à un ami, une seule personne.",
    syllables: "**ти**",
    position: "Une seule syllabe",
    pronunciation: "ti*",
    note: "À distinguer de ви, qui peut vouvoyer une personne ou s’adresser à un groupe. i* représente и : une voyelle plus relâchée, distincte de і. L’astérisque n’ajoute aucun son.",
    section: "pronoms",
  },
  {
    id: "mot-vin",
    kind: "word",
    ukrainian: "він",
    meaning: "il — ici pour un homme",
    productionCue: "Il — pronom sujet quand tu parles d’un homme",
    context: "Tu parles d’un homme, une seule personne.",
    syllables: "**він**",
    position: "Une seule syllabe",
    pronunciation: "vin — i puis n, sans nasaliser",
    note: "Pour les choses, він suit le genre du nom ukrainien, qui ne correspond pas forcément au français. Dans les exemples du module, il désigne surtout une personne masculine.",
    section: "pronoms",
  },
  {
    id: "mot-vona",
    kind: "word",
    ukrainian: "вона",
    meaning: "elle — ici pour une femme",
    productionCue: "Elle — pronom sujet quand tu parles d’Anna",
    context: "Tu parles d’Anna, une seule personne.",
    syllables: "во-**на**",
    position: "2e syllabe",
    pronunciation: "vo-NA",
    note: "À distinguer de вони, qui parle de plusieurs personnes ou choses. Pour les choses, вона suit le genre du nom ukrainien.",
    section: "pronoms",
  },
  {
    id: "mot-my",
    kind: "word",
    ukrainian: "ми",
    meaning: "nous — comme sujet",
    productionCue: "Nous — pronom sujet pour toi et Anna ensemble",
    context: "Tu parles de toi et d’Anna ensemble.",
    syllables: "**ми**",
    position: "Une seule syllabe",
    pronunciation: "mi*",
    note: "Le groupe comprend la personne qui parle. i* représente и : une voyelle plus relâchée, distincte de і. L’astérisque n’ajoute aucun son.",
    section: "pronoms",
  },
  {
    id: "mot-vy",
    kind: "word",
    ukrainian: "ви",
    meaning: "vous — plusieurs personnes, ou une seule par politesse",
    productionCue: "Vous — pronom sujet pour une personne que tu vouvoies",
    context:
      "Le pronom peut viser une personne vouvoyée ou plusieurs interlocuteurs.",
    syllables: "**ви**",
    position: "Une seule syllabe",
    pronunciation: "vi*",
    note: "Le nom décrit la personne ou le groupe réel : Ви студент? s’adresse à un homme, Ви студенти? à plusieurs étudiants. i* représente и : une voyelle plus relâchée, distincte de і. L’astérisque n’ajoute aucun son.",
    section: "pronoms",
  },
  {
    id: "mot-vony",
    kind: "word",
    ukrainian: "вони",
    meaning: "ils / elles — plusieurs personnes ou choses",
    productionCue:
      "Ils ou elles — pronom sujet quand tu parles de plusieurs personnes",
    context:
      "Tu parles de plusieurs personnes, sans faire partie de ce groupe.",
    syllables: "во-**ни**",
    position: "2e syllabe",
    pronunciation: "vo-NI*",
    note: "Le même pronom sert pour « ils » et « elles ». À distinguer de він et вона au singulier. i* représente и : une voyelle plus relâchée, distincte de і. L’astérisque n’ajoute aucun son.",
    section: "pronoms",
  },
  {
    id: "mot-student",
    kind: "word",
    ukrainian: "студент",
    meaning: "étudiant — masculin singulier",
    productionCue: "Étudiant — un homme, dans l’enseignement supérieur",
    context: "Un seul homme poursuit des études supérieures.",
    syllables: "сту-**дент**",
    position: "2e syllabe",
    pronunciation: "stou-DÈNT — è puis n puis t",
    note: "Le n et le t se prononcent ; pas de voyelle nasale française. Formes de cette famille : студент, студентка, студенти.",
    section: "personnes-et-metiers",
  },
  {
    id: "mot-studentka",
    kind: "word",
    ukrainian: "студентка",
    meaning: "étudiante — féminin singulier",
    productionCue: "Étudiante — une femme, dans l’enseignement supérieur",
    context: "Une seule femme poursuit des études supérieures.",
    syllables: "сту-**ден**-тка",
    position: "2e syllabe",
    pronunciation: "stou-DÈN-tka — è puis n, sans nasaliser",
    note: "La terminaison -ка correspond ici au féminin. Cela décrit cette famille, pas tous les noms ukrainiens.",
    section: "personnes-et-metiers",
  },
  {
    id: "mot-studenty",
    kind: "word",
    ukrainian: "студенти",
    meaning: "étudiants — pluriel, groupe masculin ou mixte",
    productionCue:
      "Étudiants — plusieurs personnes, un groupe masculin ou mixte",
    context:
      "Plusieurs personnes poursuivent des études supérieures ; le groupe est masculin ou mixte.",
    syllables: "сту-**ден**-ти",
    position: "2e syllabe",
    pronunciation: "stou-DÈN-ti* — è puis n, sans nasaliser",
    note: "Le pronom et le nom changent : Він студент. → Вони студенти. Les pluriels féminins viendront plus tard. i* représente и : une voyelle plus relâchée, distincte de і. L’astérisque n’ajoute aucun son.",
    section: "personnes-et-metiers",
  },
  {
    id: "mot-inzhener",
    kind: "word",
    ukrainian: "інженер",
    meaning: "ingénieur — masculin singulier",
    productionCue: "Ingénieur — un homme, une seule personne",
    context: "Un seul homme exerce ce métier.",
    syllables: "ін-же-**нер**",
    position: "3e syllabe",
    pronunciation: "in-jè-NÈR — i puis n, sans nasaliser",
    note: "Le j est celui de « jour ». Le r final se prononce avec la pointe de la langue. Formes de cette famille : інженер, інженерка, інженери.",
    section: "personnes-et-metiers",
  },
  {
    id: "mot-inzhenerka",
    kind: "word",
    ukrainian: "інженерка",
    meaning: "ingénieure — féminin singulier",
    productionCue: "Ingénieure — une femme, une seule personne",
    context: "Une seule femme exerce ce métier.",
    syllables: "ін-же-**нер**-ка",
    position: "3e syllabe",
    pronunciation: "in-jè-NÈR-ka — i puis n, sans nasaliser",
    note: "La terminaison -ка correspond ici au féminin. L’accent reste sur la même voyelle que dans інженер.",
    section: "personnes-et-metiers",
  },
  {
    id: "mot-inzhenery",
    kind: "word",
    ukrainian: "інженери",
    meaning: "ingénieurs — pluriel, groupe masculin ou mixte",
    productionCue:
      "Ingénieurs — plusieurs personnes, un groupe masculin ou mixte",
    context:
      "Plusieurs personnes exercent ce métier ; le groupe est masculin ou mixte.",
    syllables: "ін-же-**не**-ри",
    position: "3e syllabe",
    pronunciation: "in-jè-NÈ-ri* — i puis n, sans nasaliser",
    note: "Le pronom et le nom changent : Він інженер. → Вони інженери. i* représente и : une voyelle plus relâchée, distincte de і. L’astérisque n’ajoute aucun son.",
    section: "personnes-et-metiers",
  },
  {
    id: "mot-tse",
    kind: "word",
    ukrainian: "це",
    meaning: "c’est… / ce sont… — pour identifier ce qu’on montre",
    productionCue:
      "Le mot qui introduit « c’est… » ou « ce sont… » pour identifier ce qu’on montre",
    context: "Le mot introduit une identification : Це кава. ou Це студенти.",
    syllables: "**це**",
    position: "Une seule syllabe",
    pronunciation: "tsè",
    note: "Це reste identique au singulier et au pluriel. Ce n’est pas le verbe « être » ; ne l’ajoute pas dans Я студент.",
    section: "petits-mots",
  },
  {
    id: "mot-ne",
    kind: "word",
    ukrainian: "не",
    meaning: "ne… pas — négation à l’intérieur de la phrase",
    productionCue:
      "Le mot de négation devant le nom dans « je ne suis pas étudiant » — pas la réponse « non »",
    context:
      "Le mot nie ce qui suit à l’intérieur d’une phrase, par exemple Я не студент.",
    syllables: "не",
    position:
      "Une seule syllabe ; généralement sans accent propre dans ces phrases",
    pronunciation: "nè",
    note: "Не reste séparé du nom par une espace. Ні, avec і, sert à répondre « non » ; не, avec е, nie ce qui suit. Il n’y a pas de deuxième mot pour « pas » dans ces modèles.",
    section: "petits-mots",
  },
];

export const reviewElements: ReviewElement[] = [
  ...letters.map((entry) => letterElement(entry)),
  ...words.map((entry) => wordElement(entry)),
  ...module02Letters.map((entry) => letterElement(entry, "02")),
  ...module02Words.map((entry) => wordElement(entry, "02")),
];

export function getReviewElement(id: string) {
  return reviewElements.find((element) => element.id === id);
}

export function getReviewCard(id: string) {
  return reviewElements
    .flatMap((element) => element.cards)
    .find((card) => card.id === id);
}
