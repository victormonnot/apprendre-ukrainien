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

const definition = (
  number: number,
  title: string,
  guidance: string,
  items: ExerciseItem[],
): ExerciseDefinition => ({
  id: `01-${number}`,
  moduleId: "01",
  number,
  title,
  version: 1,
  guidance,
  items,
});

export const exercises: ExerciseDefinition[] = [
  definition(
    1,
    "Associer une lettre et son son",
    "Pour chaque majuscule, écris sa minuscule et le repère français de son son : Н · Р · У · В · С · К. Premier passage avec le tableau autorisé ; deuxième passage sans lui sur une nouvelle ligne. Réponds ensuite en français à 1g. Dans l’application, garde ces deux passages dans deux essais distincts.",
    [
      ...["Н", "Р", "У", "В", "С", "К"].map((letter, index) =>
        item(`1${String.fromCharCode(97 + index)}`, letter, [
          field("lowercase", "Minuscule ukrainienne"),
          field("sound", "Repère français du son"),
        ]),
      ),
      item("1g", "Pourquoi lire Н comme un H français serait-il une erreur ?", [
        field("explanation", "Ton explication en français", true),
      ]),
    ],
  ),
  definition(
    2,
    "Déchiffrer des mots entiers",
    "Pour chaque mot, écris un repère de lecture en lettres françaises, puis le sens français. Tous ont été introduits dans la partie 4 du cours. Utilise l’alphabet si nécessaire, mais essaie de retrouver le sens avant de regarder le vocabulaire. Cet exercice travaille l’identification des lettres et le sens ; la notation française ne constitue pas une évaluation de ta prononciation réelle.",
    ["мова", "кіт", "кава", "там", "тут"].map((word, index) =>
      item(`2${String.fromCharCode(97 + index)}`, word, [
        field("reading", "Repère de lecture en lettres françaises"),
        field("meaning", "Sens français"),
      ]),
    ),
  ),
  definition(
    3,
    "Produire à partir du sens",
    "Ferme le vocabulaire et écris en ukrainien. Si tu bloques, note d’abord ce que tu retrouves, puis regarde. Évite de remplacer directement une hésitation par une copie sans la signaler.",
    [
      "papa",
      "café, la boisson",
      "maman",
      "langue, au sens de langage",
      "ici",
    ].map((meaning, index) =>
      item(`3${String.fromCharCode(97 + index)}`, meaning, [
        field("word", "Mot ukrainien"),
      ]),
    ),
  ),
  definition(
    4,
    "Montrer l’accent sans petit signe",
    "Recopie chaque mot, découpe-le en syllabes à l’aide de la méthode du cours, puis entoure la syllabe accentuée dans le cahier. Écris aussi son numéro. Le tableau peut être consulté si nécessaire : le but est d’abord de comprendre la notation. Dans l’application, indique cette syllabe en choisissant sa position.",
    [
      ...["Привіт", "Дякую", "кава", "звати"].map((word, index) =>
        item(`4${String.fromCharCode(97 + index)}`, word, [
          field("word", "Mot recopié"),
          field("syllables", "Découpage en syllabes"),
          {
            id: "stress",
            label: "Position de la syllabe accentuée",
            options: [
              { value: "1", label: "1re syllabe" },
              { value: "2", label: "2e syllabe" },
              { value: "3", label: "3e syllabe" },
            ],
          },
        ]),
      ),
      item(
        "4e",
        "À quoi sert l’accent tonique ? Réponds en une phrase en français.",
        [field("explanation", "Ton explication en français", true)],
      ),
    ],
  ),
  definition(
    5,
    "Choisir une formule pour une situation",
    "Écris la formule ukrainienne qui convient. Pour 5a et 5b, explique brièvement ton choix de registre en français.",
    [
      item("5a", "Tu retrouves un ami : tu le salues.", [
        field("phrase", "Formule ukrainienne"),
        field("register", "Pourquoi ce registre ?", true),
      ]),
      item(
        "5b",
        "Tu rencontres une future collaboratrice pendant la journée, dans un cadre professionnel : tu la salues.",
        [
          field("phrase", "Formule ukrainienne"),
          field("register", "Pourquoi ce registre ?", true),
        ],
      ),
      item("5c", "Quelqu’un vient de t’aider : tu le remercies.", [
        field("phrase", "Formule ukrainienne"),
      ]),
      item("5d", "Quelqu’un te remercie : tu réponds.", [
        field("phrase", "Formule ukrainienne"),
      ]),
      item("5e", "Tu quittes la personne : tu dis au revoir.", [
        field("phrase", "Formule ukrainienne"),
      ]),
      item("5f", "Écris « oui », puis « non ».", [
        field("yes", "Oui, en ukrainien"),
        field("no", "Non, en ukrainien"),
      ]),
    ],
  ),
  definition(
    6,
    "Comprendre et faire varier",
    "Réponds aux trois demandes en conservant leurs numéros.",
    [
      item("6a", "Traduis Мене звати Анна. en français."),
      item("6b", "Réécris cette phrase pour te présenter comme Maxime."),
      item(
        "6c",
        "Dans ce changement, quelle partie reste fixe et quelle partie varie ? Explique en français.",
      ),
    ],
  ),
  definition(
    7,
    "Premier échange autonome",
    "En quatre lignes ukrainiennes, écris ce que tu dirais dans la situation suivante. Écris seulement tes propres répliques. Tout le vocabulaire nécessaire est dans la session. Essaie de reconstruire à partir des fonctions demandées, sans recopier le dialogue du cours.",
    [
      item(
        "7a",
        "Tu arrives à une rencontre professionnelle pendant la journée et salues la personne.",
      ),
      item(
        "7b",
        "Tu donnes ton prénom, en utilisant Максим comme prénom d’entraînement.",
      ),
      item("7c", "Plus tard, la personne t’aide : tu la remercies."),
      item("7d", "Au moment de partir, tu prends congé."),
    ],
  ),
  definition(
    8,
    "Rappel un autre jour",
    "À faire après avoir fait vérifier le premier travail, en laissant passer au moins une nuit et sans relire juste avant. Garde tes réponses : un rappel sans aide ne garantit pas qu’une réponse est juste. La date de remise est conservée avec l’essai ; indique l’aide utilisée pour chaque réponse.",
    [
      item("8a", "Retrouve quatre mots de lecture et leur sens."),
      item(
        "8b",
        "Écris une salutation adaptée à un ami, puis une présentation avec le prénom Анна.",
      ),
      item("8c", "Explique les deux emplois de Будь ласка travaillés ici."),
      item(
        "8d",
        "Écris deux lettres dont le dessin peut tromper un francophone et indique leurs sons.",
      ),
    ],
  ),
  definition(
    9,
    "Distinguer les lettres dans des mots proches",
    "Observe ces deux mots : кіт · кит. Avant cet exercice, lis le bloc « Quatre mots pour prolonger la lecture » de la fiche de vocabulaire ; ferme-la ensuite pour ton premier essai ; tu peux la rouvrir en signalant l’aide utilisée. Ce travail vérifie la distinction des lettres et le sens. Une bonne réponse écrite ne suffit pas à valider la différence entre les sons que tu prononces.",
    [
      item(
        "9a",
        "Recopie-les et entoure la lettre qui change. Donne le sens français de chacun. Dans l’application, nomme la lettre qui change pour chaque mot.",
        [
          field(
            "difference",
            "Deux mots recopiés et lettres qui changent",
            true,
          ),
          field("meaning", "Sens français de chacun", true),
        ],
      ),
      item(
        "9b",
        "Écris leur repère de lecture en lettres françaises en utilisant la convention i* du cours quand elle est nécessaire.",
        [field("reading", "Repère de lecture pour chaque mot", true)],
      ),
      item(
        "9c",
        "Explique ce qu’on perdrait en traitant і et и comme une seule lettre. Une phrase en français suffit.",
        [field("explanation", "Ton explication en français", true)],
      ),
      item(
        "9d",
        "Classe кіт · кит · сік · рис · сир en deux colonnes : « contient і » et « contient и ». Indique à côté de chaque mot le son de sa consonne finale, avec un repère français.",
        [
          field(
            "classification",
            "Les deux groupes et le son final de chaque mot",
            true,
          ),
        ],
      ),
    ],
  ),
  definition(
    10,
    "Choisir le mot précis",
    "Pour chaque description, retrouve un seul mot ukrainien parmi ceux de la fiche. Écris le mot avec son orthographe normale, puis son sens français. Il n’est pas demandé de traduire la description entière. Avant cet exercice, lis le bloc « Quatre mots pour prolonger la lecture » de la fiche de vocabulaire ; ferme-la pour ton premier essai. Pour 10e et 10f, utilise les mots de lieu appris dans le cours. Après ton essai, indique dans ta note les mots retrouvés facilement et ceux qui t’ont posé difficulté ; précise toute aide utilisée.",
    [
      "Sur une image, tu veux nommer la boisson obtenue en pressant un fruit.",
      "Tu veux nommer l’aliment laitier présenté comme du fromage.",
      "Tu veux nommer la céréale dont le nom français est « riz ».",
      "Tu veux nommer l’animal marin dont le nom français est « baleine ».",
      "Tu désignes l’endroit où tu te trouves : écris le mot pour « ici ».",
      "Tu désignes un endroit plus éloigné : écris le mot pour « là-bas ».",
    ].map((label, index) =>
      item(`10${String.fromCharCode(97 + index)}`, label, [
        field("word", "Mot ukrainien"),
        field("meaning", "Sens français"),
      ]),
    ),
  ),
  definition(
    11,
    "Retrouver les frontières entre les mots",
    "Les espaces ont été retirés des expressions ci-dessous. Rétablis seulement les espaces, en conservant l’ordre des lettres et la ponctuation, puis donne le sens en français. Pour 11b, il s’agit de deux répliques successives : une personne parle avant le point d’exclamation, puis l’autre répond. Mets une réplique par ligne. Ne cherche pas à former une seule phrase avec les deux.",
    [
      ...["Добрийдень!МенезватиАнна.", "Дякую!Будьласка.", "Допобачення!"].map(
        (label, index) =>
          item(`11${String.fromCharCode(97 + index)}`, label, [
            field("segmentation", "Expression avec les espaces rétablis", true),
            field("meaning", "Sens en français", true),
          ]),
      ),
      item(
        "11d",
        "Dans ta réponse 11a, encadre les deux mots fixes utilisés avant le prénom. Explique en français ce qui pourrait varier dans la présentation sans changer ces deux mots. Dans l’application, indique ces deux mots dans ton explication.",
        [field("explanation", "Deux mots fixes et explication", true)],
      ),
    ],
  ),
  definition(
    12,
    "Vérifier si la formule convient",
    "Pour chaque proposition, écris « convient » ou « à changer ». Si tu changes la formule, propose une expression de la leçon. Justifie en quelques mots en français. Les formules ukrainiennes ci-dessous sont des propositions à évaluer : elles ne conviennent pas forcément à la situation. Toutes les propositions ne sont pas nécessairement à corriger. Si la formule convient, écris « inchangée » dans le champ de proposition.",
    [
      "Tu arrives auprès d’un ami et veux le saluer. Proposition : До побачення!",
      "Une personne vient de t’aider ; vous vous êtes déjà salués et tu veux maintenant la remercier. Proposition : Будь ласка.",
      "Quelqu’un vient de te dire Дякую! ; tu veux répondre à son remerciement. Proposition : Привіт!",
      "Tu rencontres une personne pour la première fois, dans un cadre professionnel, pendant la journée. Proposition : Добрий день!",
    ].map((label, index) =>
      item(`12${String.fromCharCode(97 + index)}`, label, [
        {
          id: "decision",
          label: "La formule convient-elle ?",
          options: [
            { value: "fits", label: "Convient" },
            { value: "change", label: "À changer" },
          ],
        },
        field("proposal", "Ta proposition, ou « inchangée »"),
        field("justification", "Ta justification en français", true),
      ]),
    ),
  ),
  definition(
    13,
    "Adapter une présentation",
    "Voici le message de départ : Добрий день! Мене звати Анна. Si tu utilises le message de départ comme modèle pour 13c, indique l’aide utilisée. Les prénoms et les formules nécessaires sont déjà dans les fiches de la session.",
    [
      item(
        "13a",
        "Tu joues maintenant le rôle de Maxime et tu salues un ami. Réécris le message en adaptant le prénom et la salutation.",
      ),
      item(
        "13b",
        "Indique en français les deux changements effectués et la partie restée identique.",
      ),
      item(
        "13c",
        "Dans une autre scène, tu joues Anna lors d’une première rencontre professionnelle pendant la journée. Sans recopier le message de départ, écris ta salutation et ta présentation. Ajoute ensuite une nouvelle ligne pour prendre congé, en imaginant que la rencontre est terminée.",
      ),
    ],
  ),
];

export function getExercise(id: string) {
  return exercises.find((exercise) => exercise.id === id);
}

export function getModuleExercises(moduleId: string) {
  return exercises.filter((exercise) => exercise.moduleId === moduleId);
}

export function getExerciseByNumber(moduleId: string, number: number) {
  return exercises.find(
    (exercise) => exercise.moduleId === moduleId && exercise.number === number,
  );
}
