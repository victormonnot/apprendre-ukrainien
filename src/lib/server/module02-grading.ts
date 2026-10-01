import type { FieldAssessment } from "../exercise-types.ts";

const pronouns: Record<string, string> = {
  "3a": "я",
  "3b": "ти",
  "3c": "вона",
  "3d": "він",
  "3e": "ми",
  "3f": "ви",
  "3g": "ви",
  "3h": "вони",
};
const lowercase: Record<string, string> = {
  "2a": "д",
  "2b": "е",
  "2c": "ж",
  "2d": "ц",
  "2e": "я",
};
const stresses: Record<string, { value: string; feedback: string }> = {
  "2f": {
    value: "2",
    feedback:
      "студентка se découpe сту-ден-тка : l’accent porte sur ден, la 2e syllabe. Ce repérage écrit ne valide pas ta prononciation.",
  },
  "2g": {
    value: "3",
    feedback:
      "інженери se découpe ін-же-не-ри : l’accent porte sur не, la 3e syllabe. Ce repérage écrit ne valide pas ta prononciation.",
  },
};
const decisions: Record<string, { value: string; feedback: string }> = {
  "9a": {
    value: "change",
    feedback:
      "Ми désigne plusieurs personnes : le nom prend ici le pluriel студенти. Ми студенти. = Nous sommes étudiants.",
  },
  "9b": {
    value: "change",
    feedback:
      "La négation dans la phrase est не : Вона не інженерка. Ні est la réponse autonome « non ».",
  },
  "9c": {
    value: "fits",
    feedback:
      "Ви peut vouvoyer une personne : студент reste au singulier pour cet homme seul. Ви студент? convient.",
  },
  "9d": {
    value: "fits",
    feedback:
      "Це кава. identifie ce que l’on montre. Aucun article ni verbe « être » n’est à ajouter dans ce modèle.",
  },
  "9e": {
    value: "change",
    feedback:
      "Les deux mots sont inversés : Ні, я не студент. Ні répond « non » ; не nie le statut dans la phrase.",
  },
};

// Reference answers are server-side and are only returned after submission.
// Other formulations remain pending: exact matching cannot judge every valid sentence.
const phrases: Record<string, { text: string; feedback: string }> = {
  "1a": {
    text: "Добрий день!",
    feedback:
      "Добрий день! convient à une rencontre professionnelle pendant la journée.",
  },
  "1b": {
    text: "Мене звати Максим.",
    feedback: "Le bloc Мене звати reste fixe ; Максим est le prénom du rôle.",
  },
  "5a": {
    text: "Він інженер.",
    feedback: "Він désigne ici un homme ; інженер est au masculin singulier.",
  },
  "5b": {
    text: "Вона студентка.",
    feedback: "Вона et студентка désignent ici une étudiante.",
  },
  "5c": {
    text: "Ми інженери.",
    feedback: "Ми désigne le groupe qui parle ; інженери est au pluriel.",
  },
  "5d": {
    text: "Я не інженерка.",
    feedback:
      "Я reste identique quel que soit le genre ; не nie le métier féminin інженерка.",
  },
  "5e": {
    text: "Це сир.",
    feedback:
      "Це introduit l’identification et сир signifie fromage. Aucun article n’est nécessaire.",
  },
  "5f": {
    text: "Ви тут.",
    feedback: "Ви s’adresse ici à plusieurs personnes ; тут les situe ici.",
  },
  "6a": {
    text: "Вона студентка.",
    feedback:
      "Pour parler d’Anna, він devient вона et студент devient студентка.",
  },
  "6b": {
    text: "Ми інженери.",
    feedback:
      "Le sujet et le nom passent tous deux au pluriel : ми et інженери.",
  },
  "6c": {
    text: "Це не сир.",
    feedback: "Не se place avant сир pour nier cette identification.",
  },
  "6d": {
    text: "Ви інженер?",
    feedback:
      "Le point d’interrogation transforme ce modèle en question ; інженер reste au singulier pour l’homme vouvoyé.",
  },
  "6e": {
    text: "Ви студенти?",
    feedback:
      "Pour plusieurs étudiants, ти devient ви et студент devient студенти.",
  },
  "7a": {
    text: "Так, я інженер.",
    feedback:
      "La personne interrogée par ти répond avec я : c’est elle qui parle maintenant.",
  },
  "7b": {
    text: "Ні, я не студентка. Я інженерка.",
    feedback:
      "Ні répond non, не nie le statut d’étudiante ; la seconde phrase précise le métier donné dans la situation.",
  },
  "7c": {
    text: "Ні, це не кава. Це сік.",
    feedback:
      "La première phrase nie l’identification ; la seconde indique qu’il s’agit de jus.",
  },
  "7d": {
    text: "Так, ми студенти.",
    feedback:
      "Le groupe interrogé par ви répond avec ми ; студенти reste au pluriel.",
  },
  "8a": {
    text: "Добрий день!",
    feedback:
      "Cette salutation convient à la rencontre professionnelle pendant la journée.",
  },
  "8b": {
    text: "Мене звати Анна.",
    feedback: "Anna donne son prénom à la première personne avec Мене звати.",
  },
  "8c": {
    text: "Я інженерка.",
    feedback:
      "Anna parle d’elle-même : я, puis le métier au féminin інженерка.",
  },
  "8d": {
    text: "Ви студент?",
    feedback: "Anna vouvoie un homme seul : ви avec студент au singulier.",
  },
  "10a": {
    text: "Ти інженер?",
    feedback: "Ти s’adresse à un ami seul, que l’on tutoie.",
  },
  "10b": {
    text: "Ви інженер?",
    feedback:
      "Ви marque ici le vouvoiement d’un seul homme : інженер reste singulier.",
  },
  "10c": {
    text: "Ви інженери?",
    feedback: "Ви s’adresse au groupe ; інженери est au pluriel.",
  },
  "10e": {
    text: "Так, ми інженери.",
    feedback:
      "Le groupe répond avec ми : le point de vue change, le nom reste pluriel.",
  },
  "11a": {
    text: "Це рис.",
    feedback: "Це identifie ce que l’on montre ; рис désigne le riz.",
  },
  "11b": {
    text: "Це не кіт. Це кит.",
    feedback:
      "Кіт désigne le chat et кит la baleine : la voyelle change le sens. Les deux phrases suivent l’ordre demandé.",
  },
  "11c": {
    text: "Ми тут.",
    feedback: "Ми inclut la personne qui parle et Anna ; тут signifie ici.",
  },
  "11d": {
    text: "Вони там.",
    feedback: "Вони sert pour ils ou elles ; там situe les personnes là-bas.",
  },
};

function normalize(value: string, preserveCase = false) {
  const text = value
    .normalize("NFC")
    .replace(/\u0301/gu, "")
    .trim()
    .replace(/\s+/gu, " ");
  return preserveCase ? text : text.toLocaleLowerCase("uk");
}
function sentence(value: string) {
  return normalize(value)
    .replace(/\s*[—–]\s*/gu, " ")
    .replace(/\s+-\s+/gu, " ")
    .replace(/\s*([,.!?])\s*/gu, "$1 ")
    .trim()
    .replace(/[.!?…]+$/gu, "")
    .trim();
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

export function gradeModule02Field(
  itemId: string,
  fieldId: string,
  value: string,
): FieldAssessment {
  if (!value.trim())
    return pending(fieldId, "Aucune réponse n’a été remise pour ce champ.");
  const actual = normalize(value)
    .replace(/[.!?…]+$/gu, "")
    .trim();
  if (fieldId === "lowercase" && Object.hasOwn(lowercase, itemId)) {
    const expected = lowercase[itemId]!;
    return {
      fieldId,
      status: normalize(value, true) === expected ? "correct" : "incorrect",
      expected,
      feedback: `La paire est ${expected.toLocaleUpperCase("uk")} ${expected}. Le champ demande la minuscule ukrainienne ; cela ne vérifie pas sa prononciation.`,
    };
  }
  if (fieldId === "stress" && Object.hasOwn(stresses, itemId)) {
    const reference = stresses[itemId]!;
    return {
      fieldId,
      status: actual === reference.value ? "correct" : "incorrect",
      expected: `${reference.value}e syllabe`,
      feedback: reference.feedback,
    };
  }
  if (fieldId === "pronoun" && Object.hasOwn(pronouns, itemId)) {
    const expected = pronouns[itemId]!;
    const known = [...Object.values(pronouns), "воно"].includes(actual);
    const feedback =
      expected === "ви"
        ? "Ви s’adresse soit à une personne vouvoyée, soit à plusieurs personnes ; le contexte de la consigne indique lequel."
        : `Le pronom attendu pour la personne ou le groupe de cette consigne est ${expected}.`;
    if (!known)
      return pending(
        fieldId,
        "La forme saisie ne correspond pas à un pronom sujet du module. Vérifie l’orthographe ukrainienne, sans substituer de lettres latines.",
        expected,
      );
    return {
      fieldId,
      status: actual === expected ? "correct" : "incorrect",
      expected,
      feedback,
    };
  }
  if (fieldId === "decision" && Object.hasOwn(decisions, itemId)) {
    const reference = decisions[itemId]!;
    return {
      fieldId,
      status: value === reference.value ? "correct" : "incorrect",
      expected: reference.value === "fits" ? "Convient" : "À corriger",
      feedback: reference.feedback,
    };
  }
  if (itemId === "1c" && ["coffee", "here", "there"].includes(fieldId)) {
    const expected = { coffee: "кава", here: "тут", there: "там" }[
      fieldId as "coffee" | "here" | "there"
    ];
    return actual === expected
      ? {
          fieldId,
          status: "correct",
          expected,
          feedback: "Ce mot correspond au sens demandé dans la session 01.",
        }
      : pending(
          fieldId,
          "Compare le mot avec son sens dans la fiche 01. Cette autre forme reste à vérifier.",
          expected,
        );
  }
  if (fieldId === "phrase" && Object.hasOwn(phrases, itemId)) {
    const reference = phrases[itemId]!;
    if (sentence(value) === sentence(reference.text)) {
      const question = reference.text.endsWith("?");
      const actualQuestion = /\?\s*$/u.test(value);
      if (question !== actualQuestion)
        return {
          fieldId,
          status: "incorrect",
          expected: reference.text,
          feedback: question
            ? "Les mots sont justes, mais cette consigne demande une question : ajoute le point d’interrogation."
            : "Les mots sont justes, mais la consigne demande une affirmation ou une réponse, pas une question.",
        };
      return {
        fieldId,
        status: "correct",
        expected: reference.text,
        feedback: reference.feedback,
      };
    }
    return pending(
      fieldId,
      "Ta formulation diffère du modèle et reste à vérifier : elle n’est pas déclarée fausse par simple comparaison. Compare le sens, les pronoms et les formes, puis utilise la relecture de l’atelier si nécessaire.",
      reference.text,
    );
  }
  if (["sound", "word", "syllables"].includes(fieldId))
    return pending(
      fieldId,
      "La copie, le découpage et le repère français restent à vérifier séparément. Une réponse écrite ne permet pas d’évaluer ta prononciation.",
    );
  return pending(
    fieldId,
    "Cette réponse libre reste à relire dans son contexte. Elle est conservée sans déduire automatiquement une réussite ou une erreur.",
  );
}
