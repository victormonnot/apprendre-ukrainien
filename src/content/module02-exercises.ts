import type {
  ExerciseDefinition,
  ExerciseField,
  ExerciseItem,
} from "../lib/exercise-types.ts";

const field = (
  id: string,
  label: string,
  multiline = false,
): ExerciseField => ({
  id,
  label,
  ...(multiline ? { multiline: true } : {}),
});
const item = (
  id: string,
  label: string,
  fields: ExerciseField[] = [field("answer", "Ta réponse", true)],
): ExerciseItem => ({ id, label, fields });
const phrase = (id: string, label: string) =>
  item(id, label, [field("phrase", "Ta phrase en ukrainien", true)]);
const definition = (
  number: number,
  title: string,
  guidance: string,
  items: ExerciseItem[],
): ExerciseDefinition => ({
  id: `02-${number}`,
  moduleId: "02",
  number,
  title,
  version: 1,
  guidance,
  items,
});

export const module02Exercises: ExerciseDefinition[] = [
  definition(
    1,
    "Réactiver la session 01",
    "Sans relire la session 01 juste avant, écris les réponses. Ce petit rappel sert à repérer ce qui mérite une révision ; une hésitation ne t’empêche pas de poursuivre le module 02.",
    [
      phrase(
        "1a",
        "Une salutation adaptée à une rencontre professionnelle pendant la journée.",
      ),
      phrase("1b", "« Je m’appelle Maxime. » avec le prénom Максим."),
      item("1c", "« café » (boisson), « ici » et « là-bas » en ukrainien.", [
        field("coffee", "Café, la boisson"),
        field("here", "Ici"),
        field("there", "Là-bas"),
      ]),
      item(
        "1d",
        "Le sens de кіт puis de кит ; quelle lettre distingue les deux mots ?",
      ),
    ],
  ),
  definition(
    2,
    "Lire les nouvelles lettres et les mots",
    "Pour Д · Е · Ж · Ц · Я, dans cet ordre, écris la minuscule et le repère de son donné dans le cours. Pour les deux mots, recopie-les, sépare leurs syllabes et indique la position de l’accent. Le découpage et les repères écrits ne permettent pas de juger ta prononciation réelle.",
    [
      ...["Д", "Е", "Ж", "Ц", "Я"].map((letter, index) =>
        item(`2${String.fromCharCode(97 + index)}`, letter, [
          field("lowercase", "Minuscule ukrainienne"),
          field("sound", "Repère français du son"),
        ]),
      ),
      ...["студентка", "інженери"].map((word, index) =>
        item(`2${String.fromCharCode(102 + index)}`, word, [
          field("word", "Mot recopié"),
          field("syllables", "Découpage en syllabes"),
          {
            id: "stress",
            label: "Position de la syllabe accentuée",
            options: [1, 2, 3, 4].map((value) => ({
              value: String(value),
              label: `${value}${value === 1 ? "re" : "e"} syllabe`,
            })),
          },
        ]),
      ),
      item(
        "2h",
        "Explique la différence entre les repères « j » de Ж et « ya » de Я. Tu peux répondre en français sans produire d’enregistrement.",
        [field("explanation", "Ton explication en français", true)],
      ),
    ],
  ),
  definition(
    3,
    "Choisir un pronom adapté",
    "Écris uniquement le pronom sujet ukrainien qui convient. Tous les contextes sont indépendants. Pour 3i, explique ton choix en français.",
    [
      ...[
        "Tu parles de toi : « je ».",
        "Tu t’adresses à un ami que tu tutoies : « tu ».",
        "Tu parles d’Anna : « elle ».",
        "Tu parles de Maxime : « il ».",
        "Tu parles de toi et d’Anna : « nous ».",
        "Tu t’adresses poliment à une personne que tu rencontres pour la première fois : « vous ».",
        "Tu t’adresses à plusieurs amis : « vous ».",
        "Tu parles de plusieurs personnes : « ils » ou « elles ».",
      ].map((label, index) =>
        item(`3${String.fromCharCode(97 + index)}`, label, [
          field("pronoun", "Pronom sujet ukrainien"),
        ]),
      ),
      item(
        "3i",
        "Explique en français pourquoi les situations 3f et 3g peuvent utiliser le même pronom.",
        [field("explanation", "Ton explication en français", true)],
      ),
    ],
  ),
  definition(
    4,
    "Comprendre des phrases",
    "Traduis en français, en rétablissant les mots nécessaires à une phrase française naturelle.",
    [
      "Вона інженерка.",
      "Ми студенти.",
      "Він не студент.",
      "Це сік.",
      "Вони там.",
      "Ви студентка? — La question s’adresse à une seule femme, avec politesse.",
    ].map((label, index) =>
      item(`4${String.fromCharCode(97 + index)}`, label, [
        field("meaning", "Sens en français", true),
      ]),
    ),
  ),
  definition(
    5,
    "Construire à partir du sens",
    "Écris les phrases en ukrainien. Utilise les formes de la session ; pas besoin de chercher d’autres métiers.",
    [
      ...[
        "Il est ingénieur.",
        "Elle est étudiante.",
        "Nous sommes ingénieurs — un groupe mixte.",
        "Je ne suis pas ingénieure — une femme parle.",
        "C’est du fromage.",
        "Vous êtes ici — tu affirmes cela à plusieurs personnes.",
      ].map((label, index) =>
        phrase(`5${String.fromCharCode(97 + index)}`, label),
      ),
      item(
        "5g",
        "Explique en français ce que deviennent « est/sommes/êtes » et les articles français dans ces modèles ukrainiens.",
        [field("explanation", "Ton explication en français", true)],
      ),
    ],
  ),
  definition(
    6,
    "Transformer sans tout réinventer",
    "Transforme chaque phrase selon le contexte. Garde les mots utiles et adapte seulement ce que la consigne demande.",
    [
      "Transforme Він студент. pour parler d’Anna, une étudiante. Change le pronom et la forme du nom.",
      "Transforme Я інженер. pour parler de « nous », un groupe mixte d’ingénieurs.",
      "Mets Це сир. à la forme négative.",
      "Transforme Ви інженер. en question adressée poliment à un homme.",
      "Transforme Ти студент? en question adressée à plusieurs étudiants, un groupe mixte.",
    ].map((label, index) =>
      phrase(`6${String.fromCharCode(97 + index)}`, label),
    ),
  ),
  definition(
    7,
    "Répondre dans une situation",
    "Réponds en ukrainien avec Так ou Ні, suivi d’une phrase. Quand tu réponds négativement, écris aussi ce qui est vrai si la consigne te le donne. Les identités ci-dessous sont des rôles d’entraînement.",
    [
      "Tu joues un homme ingénieur. On te demande : Ти інженер?",
      "Tu joues une femme ingénieure, qui n’est pas étudiante. On te demande : Ви студентка?",
      "La boisson montrée est du jus. On te demande : Це кава?",
      "Tu parles au nom d’un groupe mixte d’étudiants. On vous demande : Ви студенти?",
    ].map((label, index) =>
      phrase(`7${String.fromCharCode(97 + index)}`, label),
    ),
  ),
  definition(
    8,
    "Une présentation à reconstruire",
    "Tu joues Anna, ingénieure, qui arrive à une rencontre professionnelle pendant la journée. Écris ses quatre répliques comme si Anna parlait, et non comme si tu racontais sa rencontre.",
    [
      "Elle salue son interlocuteur.",
      "Elle donne son prénom avec la formule de la session 01.",
      "Elle dit son métier.",
      "Elle demande poliment à son interlocuteur, un homme seul, s’il est étudiant.",
    ].map((label, index) =>
      phrase(`8${String.fromCharCode(97 + index)}`, label),
    ),
  ),
  definition(
    9,
    "Relire une phrase avec un objectif",
    "Les propositions suivantes sont des phrases à vérifier, pas des modèles à mémoriser. Pour chacune, choisis « convient » ou « à corriger ». Si nécessaire, réécris-la ; sinon, indique « inchangée ». Explique ton choix en français.",
    [
      "Pour dire « Nous sommes étudiants », un groupe mixte écrit : Ми студент.",
      "Pour dire « Elle n’est pas ingénieure », on écrit : Вона ні інженерка.",
      "Pour demander à un homme seul, avec politesse, s’il est étudiant, on écrit : Ви студент?",
      "Pour dire « C’est du café », on écrit : Це кава.",
      "Un homme veut répondre « Non, je ne suis pas étudiant » et écrit : Не, я ні студент.",
    ].map((label, index) =>
      item(`9${String.fromCharCode(97 + index)}`, label, [
        {
          id: "decision",
          label: "La phrase convient-elle ?",
          options: [
            { value: "fits", label: "Convient" },
            { value: "change", label: "À corriger" },
          ],
        },
        field("proposal", "Ta proposition, ou « inchangée »", true),
        field("justification", "Ta justification en français", true),
      ]),
    ),
  ),
  definition(
    10,
    "Changer d’interlocuteur",
    "Construis les questions puis la réponse. Pour 10d, compare en français le choix du pronom et la forme du nom.",
    [
      phrase(
        "10a",
        "Tu demandes à un ami, seul, s’il est ingénieur. Écris la question.",
      ),
      phrase(
        "10b",
        "Tu poses la même question à un homme que tu rencontres pour la première fois, en le vouvoyant. Réécris-la.",
      ),
      phrase(
        "10c",
        "Tu poses la question à plusieurs personnes, un groupe mixte d’ingénieurs. Réécris-la.",
      ),
      item(
        "10d",
        "Compare tes trois questions : indique ce qui change et ce qui reste identique.",
        [field("explanation", "Ton explication en français", true)],
      ),
      phrase(
        "10e",
        "Les personnes de 10c répondent ensemble par oui. Écris leur réponse avec une phrase complète.",
      ),
    ],
  ),
  definition(
    11,
    "Réutiliser les anciens mots",
    "Ferme les modèles et réutilise Це, не, тут ou там selon le sens. Les mots кава, сік, сир, рис, кіт et кит viennent de 01.",
    [
      phrase("11a", "Tu montres du riz et dis : « C’est du riz. »"),
      phrase(
        "11b",
        "Sur une image, il s’agit d’une baleine et non d’un chat. Écris deux phrases : d’abord ce que ce n’est pas, puis ce que c’est.",
      ),
      phrase(
        "11c",
        "Tu parles de toi et d’Anna, présents à l’endroit d’où tu parles : « Nous sommes ici. »",
      ),
      phrase(
        "11d",
        "Tu parles de plusieurs personnes qui se trouvent là-bas : « Elles sont là-bas. »",
      ),
      item(
        "11e",
        "Choisis une autre paire parmi кава, сік, сир, рис et écris une correction en deux phrases : « Ce n’est pas… C’est… » Indique en français la scène imaginée.",
      ),
    ],
  ),
  definition(
    12,
    "Retrouver un autre jour",
    "Laisse passer au moins une nuit après le premier travail, idéalement après correction, et ne relis pas juste avant. Indique les aides utilisées. Un premier rappel réussi ne suffit pas à conclure à la maîtrise.",
    [
      "Retrouve les sept pronoms sujets actifs du module avec leur sens.",
      "Écris une phrase affirmant un métier, puis la phrase qui nie ce même métier. Indique le rôle joué.",
      "Écris une question avec ви pour une seule personne et une autre pour un groupe mixte ; précise les contextes en français.",
      "Écris une phrase avec це en utilisant un mot de la session 01.",
      "Explique la différence entre ні et не, puis l’absence habituelle de « être » dans nos identifications au présent.",
    ].map((label, index) =>
      item(`12${String.fromCharCode(97 + index)}`, label),
    ),
  ),
];
