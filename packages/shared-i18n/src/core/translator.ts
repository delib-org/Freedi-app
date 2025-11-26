export type TranslationDictionary = Record<string, string>;

export function translate(key: string, dictionary: TranslationDictionary): string {
  return dictionary[key] ?? key;
}

export function translateWithParams(
  key: string,
  dictionary: TranslationDictionary,
  params: Record<string, string | number>
): string {
  let result = translate(key, dictionary);
  for (const [param, value] of Object.entries(params)) {
    result = result.replace(new RegExp(`{{${param}}}`, 'g'), String(value));
  }
  return result;
}

export function createTranslator(dictionary: TranslationDictionary) {
  return {
    t: (key: string) => translate(key, dictionary),
    tWithParams: (key: string, params: Record<string, string | number>) =>
      translateWithParams(key, dictionary, params),
  };
}
