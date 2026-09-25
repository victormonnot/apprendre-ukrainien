import type {
  SceneDefinition,
  SceneLine,
  SceneRoleId,
} from "../lib/scene-types.ts";

// Published scene versions are snapshots: add a version for content changes.
const expressionsV1 = {
  hello: {
    ukrainian: "Добрий день!",
    french: "Bonjour !",
    referenceId: "01-expression-dobryi-den",
    help: "Accent tonique : **до**-брий день — 1re syllabe de добрий ; день : une syllabe.\n\nRepère français approximatif : DO-bri\\*y dèn.\n\nLe n de день est prononcé et adouci ; pas de voyelle nasale française. bri\\*y forme une syllabe, y étant un petit son de liaison. i\\* représente и : une voyelle plus relâchée, distincte de і. L’astérisque n’ajoute aucun son.",
  },
  hi: {
    ukrainian: "Привіт!",
    french: "Salut !",
    referenceId: "01-expression-pryvit",
    help: "Accent tonique : при-**віт** — 2e syllabe.\n\nRepère français approximatif : pri\\*-VIT.\n\nSalutation informelle. i\\* représente и : une voyelle plus relâchée, distincte de і. L’astérisque n’ajoute aucun son.",
  },
  anna: {
    ukrainian: "Мене звати Анна.",
    french: "Je m’appelle Anna.",
    referenceId: "01-expression-mene-zvaty",
    help: "Accent tonique : ме-**не** **зва**-ти **ан**-на — 2e syllabe de мене ; 1re de звати ; 1re de Анна.\n\nRepère français approximatif : mè-NÈ ZVA-ti\\* AN-na.\n\nDeux mots fixes, puis le prénom. Pour Анна, prononce a puis n, sans nasaliser. i\\* représente и : une voyelle plus relâchée, distincte de і. L’astérisque n’ajoute aucun son.",
  },
  maxime: {
    ukrainian: "Мене звати Максим.",
    french: "Je m’appelle Maxime.",
    referenceId: "01-expression-mene-zvaty",
    help: "Accent tonique : ме-**не** **зва**-ти мак-**сим** — 2e syllabe de мене ; 1re de звати ; 2e de Максим.\n\nRepère français approximatif : mè-NÈ ZVA-ti\\* mak-SI\\*M.\n\nDeux mots fixes, puis le prénom. i\\* représente и : une voyelle plus relâchée, distincte de і. L’astérisque n’ajoute aucun son.",
  },
  thanks: {
    ukrainian: "Дякую!",
    french: "Merci !",
    referenceId: "01-expression-diakuiu",
    help: "Accent tonique : **дя**-ку-ю — 1re syllabe, sur trois.\n\nRepère français approximatif : DIA-kou-you.\n\nDIA se dit d’un seul mouvement : d adouci puis a, sans ajouter une syllabe « di ».",
  },
  welcome: {
    ukrainian: "Будь ласка.",
    french: "De rien.",
    referenceId: "01-expression-bud-laska",
    help: "Accent tonique : будь **ла**-ска — 1re syllabe de ласка ; будь : une syllabe.\n\nRepère français approximatif : boud LA-ska.\n\nDeux emplois : « s’il te/vous plaît » dans une demande ; « de rien » après un merci. Le d de будь est adouci ; on ne le remplace pas par t.",
  },
  goodbye: {
    ukrainian: "До побачення!",
    french: "Au revoir !",
    referenceId: "01-expression-do-pobachennia",
    help: "Accent tonique : до по-**ба**-че-ння — 2e syllabe de побачення.\n\nRepère français approximatif : do po-BA-tchè-nnia.\n\nLe groupe нн représente ici un n adouci prolongé. Le repère « nnia » n’ajoute pas une syllabe « ni ».",
  },
};

function lineV1(
  id: string,
  speakerId: SceneRoleId,
  expression: keyof typeof expressionsV1,
  direction: string,
  prompt: string,
): SceneLine {
  const { referenceId, ...content } = expressionsV1[expression];
  return {
    id,
    speakerId,
    ...content,
    direction,
    prompt,
    referenceIds: [referenceId],
  };
}

const charactersV1: SceneDefinition["characters"] = [
  {
    id: "anna",
    name: "Anna",
    ukrainian: "Анна",
    description: "Elle vient faire connaissance autour d’un café.",
  },
  {
    id: "maxime",
    name: "Maxime",
    ukrainian: "Максим",
    description: "Il partage la table et fait les présentations.",
  },
];

function freezeScene(scene: SceneDefinition): SceneDefinition {
  scene.characters.forEach(Object.freeze);
  Object.freeze(scene.characters);
  for (const line of scene.lines) {
    Object.freeze(line.referenceIds);
    Object.freeze(line);
  }
  Object.freeze(scene.lines);
  return Object.freeze(scene);
}

export const cafeScenes: SceneDefinition[] = [
  {
    id: "01-cafe",
    version: 1,
    variantId: "rencontre",
    title: "Une rencontre au café",
    variantLabel: "Première rencontre",
    description:
      "Salue, présente-toi, remercie et prends congé avec les expressions du module 01.",
    setting:
      "En journée, Anna et Maxime se rencontrent pour la première fois dans un café. Leurs premières paroles, un petit service et leur départ forment huit répliques à explorer.",
    moduleId: "01",
    sourceHref: "/parcours/01/cours#construire-echange",
    characters: charactersV1.map((character) => ({ ...character })),
    lines: [
      lineV1(
        "anna-greeting",
        "anna",
        "hello",
        "Anna rejoint Maxime à une table et le salue.",
        "Salue Maxime avec un bonjour poli ou neutre, pendant la journée.",
      ),
      lineV1(
        "maxime-greeting",
        "maxime",
        "hello",
        "Maxime répond à la salutation d’Anna.",
        "Réponds à Anna avec le même bonjour poli ou neutre.",
      ),
      lineV1(
        "anna-introduction",
        "anna",
        "anna",
        "Anna donne son prénom.",
        "Présente-toi comme Anna, avec le modèle « Je m’appelle… ».",
      ),
      lineV1(
        "maxime-introduction",
        "maxime",
        "maxime",
        "Maxime se présente à son tour.",
        "Présente-toi comme Maxime, avec le modèle « Je m’appelle… ».",
      ),
      lineV1(
        "anna-thanks",
        "anna",
        "thanks",
        "Maxime passe le menu à Anna. Elle le remercie.",
        "Remercie Maxime pour le menu.",
      ),
      lineV1(
        "maxime-welcome",
        "maxime",
        "welcome",
        "Maxime répond au remerciement d’Anna.",
        "Réponds « de rien » au remerciement d’Anna.",
      ),
      lineV1(
        "anna-goodbye",
        "anna",
        "goodbye",
        "Plus tard, au moment de partir, Anna prend congé.",
        "Dis au revoir à Maxime.",
      ),
      lineV1(
        "maxime-goodbye",
        "maxime",
        "goodbye",
        "Maxime salue Anna une dernière fois.",
        "Dis au revoir à Anna.",
      ),
    ],
  },
  {
    id: "01-cafe",
    version: 1,
    variantId: "retrouvailles",
    title: "Une rencontre au café",
    variantLabel: "Un rendez-vous informel",
    description:
      "Retrouve les mêmes fonctions dans un autre ordre de parole, avec une salutation informelle.",
    setting:
      "Anna et Maxime ont échangé par écrit et se retrouvent pour la première fois en personne au café. Ils se saluent sur un ton informel et rappellent leur prénom pour confirmer le rendez-vous.",
    moduleId: "01",
    sourceHref: "/parcours/01/cours#construire-echange",
    characters: charactersV1.map((character) => ({ ...character })),
    lines: [
      lineV1(
        "maxime-greeting",
        "maxime",
        "hi",
        "Maxime pense reconnaître Anna et la salue sur un ton informel.",
        "Salue Anna de manière informelle, avec « Salut ! ».",
      ),
      lineV1(
        "anna-greeting",
        "anna",
        "hi",
        "Anna lui répond sur le même ton.",
        "Salue Maxime de manière informelle, avec « Salut ! ».",
      ),
      lineV1(
        "maxime-introduction",
        "maxime",
        "maxime",
        "Pour confirmer qu’il s’agit du bon rendez-vous, Maxime donne son prénom.",
        "Donne ton prénom : tu joues Maxime. Utilise « Je m’appelle… ».",
      ),
      lineV1(
        "anna-introduction",
        "anna",
        "anna",
        "Anna confirme à son tour son prénom.",
        "Donne ton prénom : tu joues Anna. Utilise « Je m’appelle… ».",
      ),
      lineV1(
        "maxime-thanks",
        "maxime",
        "thanks",
        "Anna lui passe le menu. Maxime la remercie.",
        "Remercie Anna pour le menu.",
      ),
      lineV1(
        "anna-welcome",
        "anna",
        "welcome",
        "Anna répond au remerciement de Maxime.",
        "Réponds « de rien » au remerciement de Maxime.",
      ),
      lineV1(
        "maxime-goodbye",
        "maxime",
        "goodbye",
        "Plus tard, Maxime doit partir. Il prend congé.",
        "Dis au revoir à Anna.",
      ),
      lineV1(
        "anna-goodbye",
        "anna",
        "goodbye",
        "Anna lui répond avant de quitter la table.",
        "Dis au revoir à Maxime.",
      ),
    ],
  },
].map(freezeScene);
Object.freeze(cafeScenes);

export function getScene(
  sceneId: string,
  variantId: string,
  version?: number,
): SceneDefinition | undefined {
  const versions = cafeScenes.filter(
    (scene) =>
      scene.id === sceneId &&
      scene.variantId === variantId &&
      (version === undefined || scene.version === version),
  );
  return versions.reduce<SceneDefinition | undefined>(
    (latest, scene) =>
      !latest || scene.version > latest.version ? scene : latest,
    undefined,
  );
}
