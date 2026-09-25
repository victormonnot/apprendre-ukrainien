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
      segment.id.includes("-mot-"),
    ),
  },
  {
    id: "expressions",
    title: "Saluer et remercier",
    description:
      "Des formules courtes du premier module, à écouter et à répéter.",
    segments: referenceSegments.filter(
      (segment) => !segment.id.includes("-mot-"),
    ),
  },
  {
    id: "presentation",
    title: "Se présenter",
    description:
      "Les phrases du premier échange, reprises sans changer leur texte.",
    segments: presentationSegments,
  },
];
export function findAudioSegment(text: string): AudioSegment | undefined {
  const normalized = text
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase("uk")
    .replace(/[.!?…]+$/u, "");
  return [...referenceSegments, ...presentationSegments].find(
    (segment) =>
      segment.text
        .normalize("NFC")
        .toLocaleLowerCase("uk")
        .replace(/[.!?…]+$/u, "") === normalized,
  );
}
