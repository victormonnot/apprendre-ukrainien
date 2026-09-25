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
          "Les exercices du cours et cinq activités complémentaires.",
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
