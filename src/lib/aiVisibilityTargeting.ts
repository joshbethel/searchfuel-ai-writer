export interface AiVisibilityCountryOption {
  iso2: string;
  name: string;
  locationCode: number;
}

export interface AiVisibilityLanguageOption {
  code: string;
  name: string;
}

// Curated defaults used by onboarding/settings selectors.
export const AI_VISIBILITY_COUNTRY_OPTIONS: AiVisibilityCountryOption[] = [
  { iso2: "US", name: "United States", locationCode: 2840 },
  { iso2: "GB", name: "United Kingdom", locationCode: 2826 },
  { iso2: "CA", name: "Canada", locationCode: 2124 },
  { iso2: "AU", name: "Australia", locationCode: 2036 },
  { iso2: "DE", name: "Germany", locationCode: 2276 },
  { iso2: "FR", name: "France", locationCode: 2250 },
  { iso2: "IT", name: "Italy", locationCode: 2380 },
  { iso2: "ES", name: "Spain", locationCode: 2724 },
  { iso2: "NL", name: "Netherlands", locationCode: 2528 },
  { iso2: "SE", name: "Sweden", locationCode: 2752 },
  { iso2: "NO", name: "Norway", locationCode: 2578 },
  { iso2: "DK", name: "Denmark", locationCode: 2208 },
  { iso2: "FI", name: "Finland", locationCode: 2246 },
  { iso2: "IE", name: "Ireland", locationCode: 2372 },
  { iso2: "CH", name: "Switzerland", locationCode: 2756 },
  { iso2: "AT", name: "Austria", locationCode: 2040 },
  { iso2: "BE", name: "Belgium", locationCode: 2056 },
  { iso2: "PT", name: "Portugal", locationCode: 2620 },
  { iso2: "PL", name: "Poland", locationCode: 2616 },
  { iso2: "IN", name: "India", locationCode: 2356 },
  { iso2: "SG", name: "Singapore", locationCode: 2702 },
  { iso2: "NZ", name: "New Zealand", locationCode: 2554 },
  { iso2: "BR", name: "Brazil", locationCode: 2076 },
  { iso2: "MX", name: "Mexico", locationCode: 2484 },
];

export const AI_VISIBILITY_LANGUAGE_OPTIONS: AiVisibilityLanguageOption[] = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "nl", name: "Dutch" },
  { code: "sv", name: "Swedish" },
  { code: "no", name: "Norwegian" },
  { code: "da", name: "Danish" },
  { code: "fi", name: "Finnish" },
  { code: "pl", name: "Polish" },
  { code: "cs", name: "Czech" },
  { code: "tr", name: "Turkish" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "hi", name: "Hindi" },
];

export const getCountryByLocationCode = (locationCode: number) =>
  AI_VISIBILITY_COUNTRY_OPTIONS.find((option) => option.locationCode === locationCode) ?? null;

export const getLanguageByCode = (languageCode: string) =>
  AI_VISIBILITY_LANGUAGE_OPTIONS.find((option) => option.code.toLowerCase() === languageCode.toLowerCase()) ?? null;

export const getFlagFromIso2 = (iso2: string) => {
  if (!iso2 || iso2.length !== 2) return "🌐";
  return String.fromCodePoint(
    ...iso2
      .toUpperCase()
      .split("")
      .map((char) => 127397 + char.charCodeAt(0)),
  );
};
