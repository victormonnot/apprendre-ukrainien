import type {
  ExerciseAnswers,
  ExerciseAssessment,
  ExerciseDefinition,
  FieldAssessment,
} from "../exercise-types.ts";

const vocabulary: Record<string, string> = {
  кава: "café, la boisson",
  мова: "langue, au sens de langage",
  кіт: "chat",
  мама: "maman",
  тато: "papa",
  тут: "ici",
  там: "là, là-bas",
  кит: "baleine",
  сік: "jus",
  рис: "riz",
  сир: "fromage",
};

const wordAnswers: Record<string, string> = {
  "3a": "тато",
  "3b": "кава",
  "3c": "мама",
  "3d": "мова",
  "3e": "тут",
  "10a": "сік",
  "10b": "сир",
  "10c": "рис",
  "10d": "кит",
  "10e": "тут",
  "10f": "там",
};

const lowercaseAnswers: Record<string, string> = {
  "1a": "н",
  "1b": "р",
  "1c": "у",
  "1d": "в",
  "1e": "с",
  "1f": "к",
};

const stressAnswers: Record<string, { position: string; explanation: string }> =
  {
    "4a": {
      position: "2",
      explanation:
        "Привіт se découpe при-віт : l’accent porte sur віт, la 2e syllabe.",
    },
    "4b": {
      position: "1",
      explanation:
        "Дякую se découpe дя-ку-ю : l’accent porte sur дя, la 1re syllabe, sur trois.",
    },
    "4c": {
      position: "1",
      explanation:
        "кава se découpe ка-ва : l’accent porte sur ка, la 1re syllabe.",
    },
    "4d": {
      position: "1",
      explanation:
        "звати se découpe зва-ти : l’accent porte sur зва, la 1re syllabe.",
    },
  };

const segmentationAnswers: Record<string, string> = {
  "11a": "Добрий день! Мене звати Анна.",
  "11b": "Дякую!\nБудь ласка.",
  "11c": "До побачення!",
};

const decisions: Record<string, { value: string; explanation: string }> = {
  "12a": {
    value: "change",
    explanation:
      "До побачення sert à prendre congé. Ici, tu arrives : il faut une salutation, par exemple Привіт! avec un ami.",
  },
  "12b": {
    value: "change",
    explanation:
      "Ici, tu remercies pour l’aide reçue : Дякую! convient. Будь ласка peut répondre à un merci ou accompagner une demande ; ce n’est pas le remerciement attendu ici.",
  },
  "12c": {
    value: "change",
    explanation:
      "Привіт est une salutation. Pour répondre au remerciement Дякую!, la leçon propose Будь ласка.",
  },
  "12d": {
    value: "fits",
    explanation:
      "Добрий день! convient à une première rencontre professionnelle pendant la journée : c’est une salutation polie ou neutre.",
  },
};

function normalize(
  value: string,
  { keepCase = false, keepPunctuation = false } = {},
) {
  const normalized = value
    .normalize("NFC")
    .replace(/\u0301/gu, "")
    .trim()
    .replace(/\s+/gu, " ");
  const cased = keepCase ? normalized : normalized.toLocaleLowerCase("uk");
  return keepPunctuation ? cased : cased.replace(/[.!?…]+$/gu, "").trim();
}

function pending(
  fieldId: string,
  feedback: string,
  expected?: string,
): FieldAssessment {
  return {
    fieldId,
    status: "pending",
    feedback,
    ...(expected ? { expected } : {}),
  };
}

function assessWord(
  itemId: string,
  fieldId: string,
  value: string,
): FieldAssessment {
  const expected = wordAnswers[itemId]!;
  const actual = normalize(value);
  if (actual === expected) {
    return {
      fieldId,
      status: "correct",
      feedback: `Le mot ${expected} correspond bien à « ${vocabulary[expected]} ».`,
      expected,
    };
  }
  const knownMeaning = Object.hasOwn(vocabulary, actual)
    ? vocabulary[actual]
    : undefined;
  if (knownMeaning) {
    return {
      fieldId,
      status: "incorrect",
      feedback: `${actual} signifie « ${knownMeaning} ». Pour « ${vocabulary[expected]} », le mot travaillé dans la fiche est ${expected}. Reprends l’association entre le mot et son sens.`,
      expected,
    };
  }
  if (/\p{Script=Latin}/u.test(actual)) {
    return pending(
      fieldId,
      "Cette réponse contient des lettres latines. Le champ demande l’orthographe ukrainienne : les lettres de forme proche ne sont pas interchangeables. Compare avec le mot de la fiche ; cette saisie n’est pas validée automatiquement.",
      expected,
    );
  }
  return pending(
    fieldId,
    "Cette forme ne correspond pas exactement au mot travaillé dans la fiche. Elle peut contenir une faute ou être une autre proposition : la correction automatique ne tranche pas. Vérifie l’orthographe et le sens avant de réessayer.",
    expected,
  );
}

function assessSegmentation(
  itemId: string,
  fieldId: string,
  value: string,
): FieldAssessment {
  const expected = segmentationAnswers[itemId]!;
  const actual = normalize(value, { keepPunctuation: true });
  const reference = normalize(expected, { keepPunctuation: true });
  if (actual === reference) {
    if (itemId === "11b" && !/!\s*\n\s*Будь/iu.test(value)) {
      return {
        fieldId,
        status: "incorrect",
        feedback:
          "Les mots sont bien séparés. Pour respecter la consigne de 11b, mets aussi chaque réplique sur sa propre ligne : la seconde commence après le point d’exclamation.",
        expected,
      };
    }
    return {
      fieldId,
      status: "correct",
      feedback:
        "Les frontières entre les mots sont rétablies ; l’ordre des lettres et la ponctuation sont conservés.",
      expected,
    };
  }
  if (actual.replace(/\s/gu, "") === reference.replace(/\s/gu, "")) {
    return {
      fieldId,
      status: "incorrect",
      feedback:
        "Les lettres et la ponctuation sont conservées, mais les espaces ne séparent pas encore les mots comme dans la leçon. Compare les groupes de mots avec la proposition corrigée.",
      expected,
    };
  }
  return pending(
    fieldId,
    "La réponse diffère aussi par ses lettres ou sa ponctuation. Cet exercice demande seulement de rétablir les espaces : compare avec le texte de départ. Cette version n’est pas validée automatiquement.",
    expected,
  );
}

function assessField(
  itemId: string,
  fieldId: string,
  value: string,
): FieldAssessment {
  if (!value.trim())
    return pending(fieldId, "Aucune réponse n’a été remise pour ce champ.");

  if (fieldId === "lowercase" && lowercaseAnswers[itemId]) {
    const expected = lowercaseAnswers[itemId]!;
    const correct = normalize(value, { keepCase: true }) === expected;
    return {
      fieldId,
      status: correct ? "correct" : "incorrect",
      feedback: correct
        ? `La minuscule de ${expected.toLocaleUpperCase("uk")} est bien ${expected}. Cela vérifie l’écriture de la lettre, pas sa prononciation.`
        : `La paire à retenir est ${expected.toLocaleUpperCase("uk")} ${expected}. Le champ demande la minuscule ukrainienne ; une majuscule ou une lettre latine de forme proche ne remplit pas cette consigne.`,
      expected,
    };
  }
  if (fieldId === "word" && wordAnswers[itemId])
    return assessWord(itemId, fieldId, value);
  if (fieldId === "stress" && stressAnswers[itemId]) {
    const answer = stressAnswers[itemId]!;
    return {
      fieldId,
      status: normalize(value) === answer.position ? "correct" : "incorrect",
      feedback: `${answer.explanation} Ce repérage écrit ne valide pas ta prononciation.`,
      expected: `${answer.position}${answer.position === "1" ? "re" : "e"} syllabe`,
    };
  }
  if (fieldId === "segmentation" && segmentationAnswers[itemId])
    return assessSegmentation(itemId, fieldId, value);
  if (fieldId === "decision" && decisions[itemId]) {
    const answer = decisions[itemId]!;
    return {
      fieldId,
      status: value === answer.value ? "correct" : "incorrect",
      feedback: answer.explanation,
      expected: answer.value === "fits" ? "Convient" : "À changer",
    };
  }

  if (fieldId === "sound" || fieldId === "reading") {
    return pending(
      fieldId,
      "Ce repère de lecture en français reste à vérifier dans son contexte. Plusieurs approximations peuvent être utiles ; une réponse écrite ne permet pas d’évaluer ta prononciation.",
    );
  }
  if (fieldId === "meaning") {
    return pending(
      fieldId,
      "Le sens formulé en français reste à vérifier : des formulations différentes peuvent être justes. Une comparaison de mots ne suffit pas à juger cette réponse.",
    );
  }
  if (["explanation", "register", "justification"].includes(fieldId)) {
    return pending(
      fieldId,
      "Ton explication reste à relire et à vérifier. Elle n’est pas jugée automatiquement sur la présence de quelques mots.",
    );
  }
  if (fieldId === "word" || fieldId === "syllables") {
    return pending(
      fieldId,
      "La copie et le découpage restent à vérifier séparément. La correction de la position de l’accent ne valide pas ces deux éléments.",
    );
  }
  return pending(
    fieldId,
    "Cette production reste à vérifier dans son contexte. Elle est conservée telle que tu l’as remise ; aucune réussite ou erreur n’est déduite automatiquement.",
  );
}

export function gradeExercise(
  definition: ExerciseDefinition,
  answers: ExerciseAnswers,
): ExerciseAssessment {
  if (definition.moduleId !== "01" || definition.version !== 1) {
    return {
      status: "pending",
      items: definition.items.map((item) => ({
        itemId: item.id,
        fields: item.fields.map((field) =>
          pending(
            field.id,
            "Cette version de l’exercice ne dispose pas encore de correction automatique.",
          ),
        ),
      })),
    };
  }
  const items = definition.items.map((item) => ({
    itemId: item.id,
    fields: item.fields.map((field) =>
      assessField(item.id, field.id, answers[item.id]?.fields[field.id] ?? ""),
    ),
  }));
  const fields = items.flatMap((item) => item.fields);
  const correctedCount = fields.filter(
    (field) => field.status !== "pending",
  ).length;
  return {
    status:
      correctedCount === 0
        ? "pending"
        : correctedCount === fields.length
          ? "corrected"
          : "partial",
    items,
  };
}
