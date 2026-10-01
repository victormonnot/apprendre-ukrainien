import { reviewElements } from "./reviews.ts";
import type { AudioCatalogue, AudioSegment } from "../lib/audio-types.ts";

const referenceSegments: AudioSegment[] = reviewElements
  .filter((element) => element.kind !== "letter")
  .map((element) => ({
    id: element.id,
    text: element.label,
    french: element.cards[0]!.answer,
    sourceHref: element.sourceHref,
    source: { kind: "reference", elementId: element.id },
  }));

export const presentationSegments: AudioSegment[] = [
  {
    id: "01-presentation-maxime",
    text: "Мене звати Максим.",
    french: "Je m’appelle Maxime.",
    sourceHref: "/parcours/01/cours#construire-echange",
  },
  {
    id: "01-presentation-anna",
    text: "Мене звати Анна.",
    french: "Je m’appelle Anna.",
    sourceHref: "/parcours/01/cours#construire-echange",
  },
  {
    id: "01-salutation-presentation",
    text: "Добрий день! Мене звати Максим.",
    french: "Bonjour ! Je m’appelle Maxime.",
    sourceHref: "/parcours/01/cours#construire-echange",
  },
  {
    id: "02-identification-etudiant",
    text: "Я студент.",
    french: "Je suis étudiant.",
    sourceHref: "/parcours/02/cours#phrases-au-present",
  },
  {
    id: "02-identification-ingenieure",
    text: "Вона інженерка.",
    french: "Elle est ingénieure.",
    sourceHref: "/parcours/02/cours#phrases-au-present",
  },
  {
    id: "02-identification-etudiants",
    text: "Ми студенти.",
    french: "Nous sommes étudiants.",
    sourceHref: "/parcours/02/cours#phrases-au-present",
  },
  {
    id: "02-identification-ingenieurs",
    text: "Вони інженери.",
    french: "Ils sont ingénieurs.",
    sourceHref: "/parcours/02/cours#personnes-et-metiers",
  },
  {
    id: "02-identifier-cafe",
    text: "Це кава.",
    french: "C’est du café.",
    sourceHref: "/parcours/02/cours#identifier-et-situer",
  },
  {
    id: "02-nier-cafe",
    text: "Це не кава.",
    french: "Ce n’est pas du café.",
    sourceHref: "/parcours/02/cours#negation",
  },
  {
    id: "02-situer-ici",
    text: "Я тут.",
    french: "Je suis ici.",
    sourceHref: "/parcours/02/cours#identifier-et-situer",
  },
  {
    id: "02-situer-la-bas",
    text: "Вона там.",
    french: "Elle est là-bas.",
    sourceHref: "/parcours/02/cours#identifier-et-situer",
  },
  {
    id: "02-question-etudiant",
    text: "Ти студент?",
    french: "Tu es étudiant ?",
    sourceHref: "/parcours/02/cours#questions",
  },
  {
    id: "02-reponse-etudiant",
    text: "Так, я студент.",
    french: "Oui, je suis étudiant.",
    sourceHref: "/parcours/02/cours#questions",
  },
  {
    id: "02-question-ingenieurs",
    text: "Ви інженери?",
    french: "Vous êtes ingénieurs ? — à plusieurs personnes",
    sourceHref: "/parcours/02/cours#questions",
  },
  {
    id: "02-reponse-ingenieurs",
    text: "Так, ми інженери.",
    french: "Oui, nous sommes ingénieurs.",
    sourceHref: "/parcours/02/cours#questions",
  },
].map((segment) => ({
  ...segment,
  source: { kind: "segment", segmentId: segment.id },
}));

export const audioGroups: AudioCatalogue["groups"] = [
  {
    id: "words",
    title: "Les premiers mots",
    description:
      "Écoute un mot, puis retrouve les lettres et son sens dans le cours.",
    segments: referenceSegments.filter((segment) =>
      segment.id.startsWith("01-mot-"),
    ),
  },
  {
    id: "expressions",
    title: "Saluer et remercier",
    description:
      "Des formules courtes du premier module, à écouter et à répéter.",
    segments: referenceSegments.filter((segment) =>
      segment.id.startsWith("01-expression-"),
    ),
  },
  {
    id: "presentation",
    title: "Se présenter",
    description:
      "Les phrases du premier échange, reprises sans changer leur texte.",
    segments: presentationSegments.filter((segment) =>
      segment.id.startsWith("01-"),
    ),
  },
  {
    id: "02-words",
    title: "Module 02 · Pronoms et nouvelles formes",
    description:
      "Les personnes, les études, le métier et les petits mots utiles pour construire une phrase.",
    segments: referenceSegments.filter((segment) =>
      segment.id.startsWith("02-"),
    ),
  },
  {
    id: "02-phrases",
    title: "Module 02 · Construire de petites phrases",
    description:
      "Identifier, situer, nier et répondre. Écoute, répète ou suis le modèle en shadowing, sans évaluation de ta voix.",
    segments: presentationSegments.filter((segment) =>
      segment.id.startsWith("02-"),
    ),
  },
];
export function findAudioSegment(text: string): AudioSegment | undefined {
  const normalized = text
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase("uk")
    .replace(/[.!…]+$/u, "");
  return [...referenceSegments, ...presentationSegments].find(
    (segment) =>
      segment.text
        .normalize("NFC")
        .toLocaleLowerCase("uk")
        .replace(/[.!…]+$/u, "") === normalized,
  );
}
