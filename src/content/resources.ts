import type { LearningResource } from "../lib/resource-types.ts";

export const learningResources: LearningResource[] = [
  {
    id: "ul-alphabet",
    moduleId: "01",
    title: "Écouter et lire l’alphabet ukrainien",
    author: "Ukrainian Lessons",
    kind: "video",
    description:
      "Une vidéo de référence pour associer les lettres à leurs sons et observer leur prononciation.",
    language: "Ukrainien · explications en anglais",
    durationSeconds: 850,
    sourceUrl: "https://www.ukrainianlessons.com/ukrainian-alphabet/",
    verifiedOn: "2026-09-25",
    objective:
      "Retrouver à l’oreille les douze lettres prioritaires du module.",
    steps: [
      "Garde le tableau du cours à côté de toi : А, М, Т, О, К, Н, В, С, Р, У, І et И sont les lettres à travailler d’abord.",
      "Écoute leur son, mets la vidéo en pause et répète si tu le souhaites. Les autres lettres peuvent rester une découverte.",
      "Reviens aux premiers mots du cours. Note les lettres pour lesquelles tu as encore besoin d’une écoute.",
    ],
    connections: [
      {
        label: "Le tableau de l’alphabet",
        href: "/parcours/01/cours#alphabet",
      },
      {
        label: "Lire ses premiers mots",
        href: "/parcours/01/cours#premiers-mots",
      },
    ],
    media: { kind: "youtube", videoId: "ksXIXj7CXwc" },
  },
  {
    id: "ulp-001",
    moduleId: "01",
    title: "ULP 1-01 · Saluer dans une situation familière",
    author: "Anna Ohoiko · Ukrainian Lessons",
    kind: "podcast",
    description:
      "Le premier épisode du podcast fait entendre un échange informel, avec des explications pour débutants.",
    language: "Ukrainien · explications en anglais",
    durationSeconds: 1035,
    sourceUrl: "https://www.ukrainianlessons.com/episode1/",
    verifiedOn: "2026-09-25",
    objective:
      "Reconnaître la salutation familière déjà rencontrée dans le cours.",
    steps: [
      "Relis les expressions du premier échange, puis écoute pour repérer la salutation familière.",
      "Rejoue un court passage qui contient cette salutation. Observe la manière dont les voix commencent la conversation.",
      "Note ce que tu reconnais et ce qui reste flou. Les questions et réponses nouvelles de l’épisode ne sont pas à apprendre pour terminer ce module.",
    ],
    connections: [
      {
        label: "Choisir une salutation",
        href: "/parcours/01/cours#premier-echange",
      },
      {
        label: "Les huit expressions",
        href: "/parcours/01/vocabulaire#expressions",
      },
    ],
    media: {
      kind: "audio",
      url: "https://www.buzzsprout.com/1370836/episodes/5566339-ulp-1-01-informal-greetings-in-ukrainian-podcast.mp3",
    },
  },
  {
    id: "ulp-003",
    moduleId: "01",
    title: "ULP 1-03 · Se présenter et donner son prénom",
    author: "Anna Ohoiko · Ukrainian Lessons",
    kind: "podcast",
    description:
      "Un dialogue de première rencontre pour écouter comment les interlocuteurs se présentent.",
    language: "Ukrainien · explications en anglais",
    durationSeconds: 815,
    sourceUrl: "https://www.ukrainianlessons.com/episode3/",
    verifiedOn: "2026-09-25",
    objective: "Repérer la formule qui permet de donner son prénom.",
    steps: [
      "Relis les exemples de présentation du cours, puis écoute les interlocuteurs donner leur prénom.",
      "Fais une pause après une présentation et retrouve les mots que tu connais. Réécoute ce passage si nécessaire.",
      "Écris une présentation avec ton propre prénom dans tes notes. Tu peux laisser la partie sur les nationalités pour plus tard.",
    ],
    connections: [
      {
        label: "Construire une présentation",
        href: "/parcours/01/cours#construire-echange",
      },
      {
        label: "Les prénoms du module",
        href: "/parcours/01/vocabulaire#prenoms",
      },
    ],
    media: {
      kind: "audio",
      url: "https://www.buzzsprout.com/1370836/episodes/5566333-ulp-1-03-how-to-introduce-yourself-in-ukrainian.mp3",
    },
  },
  {
    id: "ul-expressions",
    moduleId: "01",
    title: "Réécouter les expressions essentielles",
    author: "Anna Ohoiko · Ukrainian Lessons",
    kind: "guide",
    description:
      "Un guide gratuit de mots et d’expressions avec des enregistrements individuels sur le site de l’autrice.",
    language: "Ukrainien · explications en anglais",
    durationSeconds: null,
    sourceUrl: "https://www.ukrainianlessons.com/ph-essential/",
    verifiedOn: "2026-09-25",
    objective:
      "Comparer les expressions du module à leur enregistrement de référence.",
    steps: [
      "Ouvre le guide et retrouve les salutations, le remerciement et la formule de présentation déjà étudiés.",
      "Choisis deux ou trois expressions et écoute leur enregistrement. Utilise ta fiche de vocabulaire pour retrouver leur sens en français.",
      "Note une expression que tu souhaites réécouter. Le reste du guide est disponible pour une autre fois.",
    ],
    connections: [
      {
        label: "Les huit expressions",
        href: "/parcours/01/vocabulaire#expressions",
      },
      {
        label: "Comprendre leur emploi",
        href: "/parcours/01/cours#construire-echange",
      },
    ],
    media: null,
  },
];

export function getResource(id: string) {
  return learningResources.find((resource) => resource.id === id);
}
