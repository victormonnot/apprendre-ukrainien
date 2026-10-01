export type DocumentView = "cours" | "vocabulaire" | "exercices";

export type ModuleDocument = {
  view: DocumentView;
  label: string;
  filename: string;
  description: string;
};

export type LearningModule = {
  id: string;
  title: string;
  description: string;
  level: string;
  prerequisites: string;
  objectives: string[];
  documents: ModuleDocument[];
};

export const modules: LearningModule[] = [
  {
    id: "01",
    title: "Lire le cyrillique et faire un premier échange",
    description:
      "Reconnaître les lettres, lire ses premiers mots et trouver les bonnes expressions pour se présenter.",
    level: "Débutant",
    prerequisites: "Aucun prérequis",
    objectives: ["Découvrir l’écriture", "Lire des mots", "Se présenter"],
    documents: [
      {
        view: "cours",
        label: "Cours",
        filename: "course.md",
        description: "Les explications, les exemples et les exercices réunis.",
      },
      {
        view: "vocabulaire",
        label: "Vocabulaire",
        filename: "vocabulary.md",
        description:
          "Les mots, leur prononciation et leurs usages en contexte.",
      },
      {
        view: "exercices",
        label: "Exercices",
        filename: "exercises.md",
        description:
          "Les exercices du cours, cinq compléments et tes réponses conservées.",
      },
    ],
  },
  {
    id: "02",
    title: "Se présenter et construire des phrases",
    description:
      "Dire qui l’on est, distinguer tu et vous, identifier une chose et construire des questions et des phrases négatives simples.",
    level: "Débutant",
    prerequisites: "Après les premiers échanges du module 01",
    objectives: [
      "Parler de soi et des autres",
      "Choisir tu ou vous",
      "Construire des phrases simples",
    ],
    documents: [
      {
        view: "cours",
        label: "Cours",
        filename: "course.md",
        description:
          "Les nouvelles explications, les exemples et les exercices réunis.",
      },
      {
        view: "vocabulaire",
        label: "Vocabulaire",
        filename: "vocabulary.md",
        description:
          "Les pronoms, les questions et les mots utiles en contexte.",
      },
      {
        view: "exercices",
        label: "Exercices",
        filename: "exercises.md",
        description:
          "Les exercices du cours, quatre compléments et tes réponses conservées.",
      },
    ],
  },
];

export function getModule(id: string) {
  return modules.find((module) => module.id === id);
}

export function documentHref(moduleId: string, view: DocumentView) {
  return `/parcours/${moduleId}/${view}`;
}
