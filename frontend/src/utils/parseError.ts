import errorsDict from "../constants/errors.json";

export type SupportedLocale = "en" | "fr";

// The type representing our dictionary
type ErrorsMap = typeof errorsDict;
type ErrorCode = keyof ErrorsMap;

/**
 * Parses a contract runtime error code to a user-friendly, localized error string.
 * @param errorMessage The raw error message thrown by Soroban (e.g., "Error(Value, InvalidInput)", or just "ERR_105")
 * @param locale The desired language
 * @returns A translated string if found, otherwise the original error string
 */
export function parseError(errorMessage: string, locale: SupportedLocale = "en"): string {
  if (!errorMessage) return "";

  // Extract custom ERR_XXX code if present (Soroban panics might be nested in string representation like "Status(101)" or "ERR_101")
  const match = errorMessage.match(/ERR_\d{3}/);
  if (!match) {
    return errorMessage;
  }

  const errorCode = match[0] as ErrorCode;
  const translationMap = errorsDict[errorCode];

  if (translationMap && translationMap[locale]) {
    return translationMap[locale];
  }

  return errorMessage;
}
