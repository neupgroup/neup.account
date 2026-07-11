"use client";

import * as React from "react";

import { cn } from "@/core/utils";

type CountryCodeIndicator = {
  aliases: string[];
  code: string;
  flag: string;
  iso2: string;
  iso3: string;
  label: string;
};

type SharedCountryCodeAreaIndicator = {
  areaCode: string;
  code: string;
  country: string;
  flag: string;
  location: string;
};

type CountryCodeDetectionResult = {
  areaCode?: string;
  country: CountryCodeIndicator | null;
  localNumber: string;
  location?: string;
  mode: "none" | "single" | "shared-pending" | "shared-resolved";
  sharedCode?: string;
};

const BASE_COUNTRY_CODE_INDICATORS: CountryCodeIndicator[] = [
  { label: "Afghanistan", iso2: "AF", iso3: "AFG", code: "93", flag: "🇦🇫", aliases: ["afghanistan", "af", "afg"] },
  { label: "Albania", iso2: "AL", iso3: "ALB", code: "355", flag: "🇦🇱", aliases: ["albania", "al", "alb"] },
  { label: "Algeria", iso2: "DZ", iso3: "DZA", code: "213", flag: "🇩🇿", aliases: ["algeria", "dz", "dza"] },
  { label: "Argentina", iso2: "AR", iso3: "ARG", code: "54", flag: "🇦🇷", aliases: ["argentina", "ar", "arg"] },
  { label: "Australia", iso2: "AU", iso3: "AUS", code: "61", flag: "🇦🇺", aliases: ["australia", "au", "aus"] },
  { label: "Austria", iso2: "AT", iso3: "AUT", code: "43", flag: "🇦🇹", aliases: ["austria", "at", "aut"] },
  { label: "Bahamas", iso2: "BS", iso3: "BHS", code: "1242", flag: "🇧🇸", aliases: ["bahamas", "bs", "bhs"] },
  { label: "Bangladesh", iso2: "BD", iso3: "BGD", code: "880", flag: "🇧🇩", aliases: ["bangladesh", "bd", "bgd"] },
  { label: "Belgium", iso2: "BE", iso3: "BEL", code: "32", flag: "🇧🇪", aliases: ["belgium", "be", "bel"] },
  { label: "Bhutan", iso2: "BT", iso3: "BTN", code: "975", flag: "🇧🇹", aliases: ["bhutan", "bt", "btn"] },
  { label: "Brazil", iso2: "BR", iso3: "BRA", code: "55", flag: "🇧🇷", aliases: ["brazil", "br", "bra"] },
  { label: "Cambodia", iso2: "KH", iso3: "KHM", code: "855", flag: "🇰🇭", aliases: ["cambodia", "kh", "khm"] },
  { label: "Canada", iso2: "CA", iso3: "CAN", code: "1", flag: "🇨🇦", aliases: ["canada", "ca", "can"] },
  { label: "China", iso2: "CN", iso3: "CHN", code: "86", flag: "🇨🇳", aliases: ["china", "cn", "chn", "pr china", "people s republic of china"] },
  { label: "Denmark", iso2: "DK", iso3: "DNK", code: "45", flag: "🇩🇰", aliases: ["denmark", "dk", "dnk"] },
  { label: "Dominican Republic", iso2: "DO", iso3: "DOM", code: "1", flag: "🇩🇴", aliases: ["dominican republic", "do", "dom"] },
  { label: "Egypt", iso2: "EG", iso3: "EGY", code: "20", flag: "🇪🇬", aliases: ["egypt", "eg", "egy"] },
  { label: "Finland", iso2: "FI", iso3: "FIN", code: "358", flag: "🇫🇮", aliases: ["finland", "fi", "fin"] },
  { label: "France", iso2: "FR", iso3: "FRA", code: "33", flag: "🇫🇷", aliases: ["france", "fr", "fra"] },
  { label: "Germany", iso2: "DE", iso3: "DEU", code: "49", flag: "🇩🇪", aliases: ["germany", "de", "deu"] },
  { label: "Hong Kong", iso2: "HK", iso3: "HKG", code: "852", flag: "🇭🇰", aliases: ["hong kong", "hk", "hkg"] },
  { label: "India", iso2: "IN", iso3: "IND", code: "91", flag: "🇮🇳", aliases: ["india", "in", "ind"] },
  { label: "Indonesia", iso2: "ID", iso3: "IDN", code: "62", flag: "🇮🇩", aliases: ["indonesia", "id", "idn"] },
  { label: "Ireland", iso2: "IE", iso3: "IRL", code: "353", flag: "🇮🇪", aliases: ["ireland", "ie", "irl"] },
  { label: "Italy", iso2: "IT", iso3: "ITA", code: "39", flag: "🇮🇹", aliases: ["italy", "it", "ita"] },
  { label: "Jamaica", iso2: "JM", iso3: "JAM", code: "1", flag: "🇯🇲", aliases: ["jamaica", "jm", "jam"] },
  { label: "Japan", iso2: "JP", iso3: "JPN", code: "81", flag: "🇯🇵", aliases: ["japan", "jp", "jpn"] },
  { label: "Kenya", iso2: "KE", iso3: "KEN", code: "254", flag: "🇰🇪", aliases: ["kenya", "ke", "ken"] },
  { label: "Kuwait", iso2: "KW", iso3: "KWT", code: "965", flag: "🇰🇼", aliases: ["kuwait", "kw", "kwt"] },
  { label: "Malaysia", iso2: "MY", iso3: "MYS", code: "60", flag: "🇲🇾", aliases: ["malaysia", "my", "mys"] },
  { label: "Mexico", iso2: "MX", iso3: "MEX", code: "52", flag: "🇲🇽", aliases: ["mexico", "mx", "mex"] },
  { label: "Myanmar", iso2: "MM", iso3: "MMR", code: "95", flag: "🇲🇲", aliases: ["myanmar", "mm", "mmr", "burma"] },
  { label: "Nepal", iso2: "NP", iso3: "NPL", code: "977", flag: "🇳🇵", aliases: ["nepal", "np", "npl"] },
  { label: "Netherlands", iso2: "NL", iso3: "NLD", code: "31", flag: "🇳🇱", aliases: ["netherlands", "nl", "nld", "holland"] },
  { label: "New Zealand", iso2: "NZ", iso3: "NZL", code: "64", flag: "🇳🇿", aliases: ["new zealand", "nz", "nzl"] },
  { label: "Nigeria", iso2: "NG", iso3: "NGA", code: "234", flag: "🇳🇬", aliases: ["nigeria", "ng", "nga"] },
  { label: "Norway", iso2: "NO", iso3: "NOR", code: "47", flag: "🇳🇴", aliases: ["norway", "no", "nor"] },
  { label: "Pakistan", iso2: "PK", iso3: "PAK", code: "92", flag: "🇵🇰", aliases: ["pakistan", "pk", "pak"] },
  { label: "Philippines", iso2: "PH", iso3: "PHL", code: "63", flag: "🇵🇭", aliases: ["philippines", "ph", "phl"] },
  { label: "Portugal", iso2: "PT", iso3: "PRT", code: "351", flag: "🇵🇹", aliases: ["portugal", "pt", "prt"] },
  { label: "Qatar", iso2: "QA", iso3: "QAT", code: "974", flag: "🇶🇦", aliases: ["qatar", "qa", "qat"] },
  { label: "Saudi Arabia", iso2: "SA", iso3: "SAU", code: "966", flag: "🇸🇦", aliases: ["saudi arabia", "sa", "sau", "ksa"] },
  { label: "Singapore", iso2: "SG", iso3: "SGP", code: "65", flag: "🇸🇬", aliases: ["singapore", "sg", "sgp"] },
  { label: "South Africa", iso2: "ZA", iso3: "ZAF", code: "27", flag: "🇿🇦", aliases: ["south africa", "za", "zaf"] },
  { label: "South Korea", iso2: "KR", iso3: "KOR", code: "82", flag: "🇰🇷", aliases: ["south korea", "kr", "kor", "korea", "republic of korea"] },
  { label: "Spain", iso2: "ES", iso3: "ESP", code: "34", flag: "🇪🇸", aliases: ["spain", "es", "esp"] },
  { label: "Sri Lanka", iso2: "LK", iso3: "LKA", code: "94", flag: "🇱🇰", aliases: ["sri lanka", "lk", "lka"] },
  { label: "Sweden", iso2: "SE", iso3: "SWE", code: "46", flag: "🇸🇪", aliases: ["sweden", "se", "swe"] },
  { label: "Switzerland", iso2: "CH", iso3: "CHE", code: "41", flag: "🇨🇭", aliases: ["switzerland", "ch", "che"] },
  { label: "Thailand", iso2: "TH", iso3: "THA", code: "66", flag: "🇹🇭", aliases: ["thailand", "th", "tha"] },
  { label: "Trinidad & Tobago", iso2: "TT", iso3: "TTO", code: "1", flag: "🇹🇹", aliases: ["trinidad & tobago", "trinidad and tobago", "tt", "tto"] },
  { label: "Turkey", iso2: "TR", iso3: "TUR", code: "90", flag: "🇹🇷", aliases: ["turkey", "tr", "tur", "turkiye"] },
  { label: "UAE", iso2: "AE", iso3: "ARE", code: "971", flag: "🇦🇪", aliases: ["uae", "ae", "are", "united arab emirates"] },
  { label: "UK", iso2: "GB", iso3: "GBR", code: "44", flag: "🇬🇧", aliases: ["uk", "gb", "gbr", "united kingdom", "great britain", "england"] },
  { label: "Ukraine", iso2: "UA", iso3: "UKR", code: "380", flag: "🇺🇦", aliases: ["ukraine", "ua", "ukr"] },
  { label: "United States", iso2: "US", iso3: "USA", code: "1", flag: "🇺🇸", aliases: ["usa", "us", "united states", "united states of america", "united state of america", "united state of amercia", "america"] },
  { label: "Vietnam", iso2: "VN", iso3: "VNM", code: "84", flag: "🇻🇳", aliases: ["vietnam", "vn", "vnm"] },
];

const BASE_SHARED_COUNTRY_CODE_AREA_INDICATORS: SharedCountryCodeAreaIndicator[] = [
  { code: "1", areaCode: "212", location: "New York (Manhattan)", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "332", location: "New York (Overlay)", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "646", location: "New York (Overlay)", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "213", location: "Los Angeles", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "310", location: "Los Angeles (Westside)", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "424", location: "Los Angeles (Overlay)", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "818", location: "San Fernando Valley", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "415", location: "San Francisco", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "628", location: "San Francisco (Overlay)", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "408", location: "San Jose", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "669", location: "San Jose (Overlay)", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "206", location: "Seattle", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "425", location: "Seattle Metro", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "702", location: "Las Vegas", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "202", location: "Washington DC", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "303", location: "Denver", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "305", location: "Miami", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "786", location: "Miami (Overlay)", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "404", location: "Atlanta", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "678", location: "Atlanta (Overlay)", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "470", location: "Atlanta (Overlay)", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "312", location: "Chicago", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "773", location: "Chicago (Overlay)", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "213", location: "Los Angeles Core", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "214", location: "Dallas", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "469", location: "Dallas (Overlay)", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "972", location: "Dallas (Overlay)", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "713", location: "Houston", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "281", location: "Houston (Overlay)", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "832", location: "Houston (Overlay)", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "617", location: "Boston", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "857", location: "Boston (Overlay)", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "215", location: "Philadelphia", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "267", location: "Philadelphia (Overlay)", country: "United States", flag: "🇺🇸" },
  { code: "1", areaCode: "416", location: "Toronto", country: "Canada", flag: "🇨🇦" },
  { code: "1", areaCode: "437", location: "Toronto (Overlay)", country: "Canada", flag: "🇨🇦" },
  { code: "1", areaCode: "647", location: "Toronto (Overlay)", country: "Canada", flag: "🇨🇦" },
  { code: "1", areaCode: "604", location: "Vancouver", country: "Canada", flag: "🇨🇦" },
  { code: "1", areaCode: "778", location: "Vancouver (Overlay)", country: "Canada", flag: "🇨🇦" },
  { code: "1", areaCode: "403", location: "Calgary", country: "Canada", flag: "🇨🇦" },
  { code: "1", areaCode: "587", location: "Calgary (Overlay)", country: "Canada", flag: "🇨🇦" },
  { code: "1", areaCode: "514", location: "Montreal", country: "Canada", flag: "🇨🇦" },
  { code: "1", areaCode: "438", location: "Montreal (Overlay)", country: "Canada", flag: "🇨🇦" },
  { code: "1", areaCode: "306", location: "Saskatchewan", country: "Canada", flag: "🇨🇦" },
  { code: "1", areaCode: "876", location: "Jamaica", country: "Jamaica", flag: "🇯🇲" },
  { code: "1", areaCode: "809", location: "Dominican Republic", country: "Dominican Republic", flag: "🇩🇴" },
  { code: "1", areaCode: "829", location: "Dominican Republic (Overlay)", country: "Dominican Republic", flag: "🇩🇴" },
  { code: "1", areaCode: "849", location: "Dominican Republic (Overlay)", country: "Dominican Republic", flag: "🇩🇴" },
  { code: "1", areaCode: "242", location: "Bahamas", country: "Bahamas", flag: "🇧🇸" },
  { code: "1", areaCode: "868", location: "Trinidad & Tobago", country: "Trinidad & Tobago", flag: "🇹🇹" },
];

const COUNTRY_CODE_INDICATORS: CountryCodeIndicator[] = BASE_COUNTRY_CODE_INDICATORS.map((entry) => {
  const baseAliases = Array.from(new Set([entry.label, entry.iso2, entry.iso3, ...entry.aliases]));
  const expandedAliases = baseAliases.flatMap((alias) => {
    const trimmed = alias.trim();
    const normalizedTokens = trimmed.split(/\s+/).filter(Boolean);

    if (normalizedTokens.length <= 1) {
      return [trimmed];
    }

    return [
      trimmed,
      normalizedTokens.join(" "),
      normalizedTokens.join("_"),
      normalizedTokens.join("-"),
      normalizedTokens.join(""),
    ];
  });

  return {
    ...entry,
    aliases: Array.from(new Set(expandedAliases)),
  };
});

const SHARED_COUNTRY_CODE_AREA_INDICATORS = BASE_SHARED_COUNTRY_CODE_AREA_INDICATORS.map((entry) => ({
  ...entry,
  code: entry.code.replace(/^\+/, ""),
  areaCode: entry.areaCode.replace(/\D/g, ""),
}));

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasToRegex(alias: string) {
  const tokens = alias.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
  return tokens.join("\\s*");
}

function normalizeRest(value: string) {
  return value.replace(/^[\s\-_]+/, "");
}

function findCountryIndicatorByLabel(label: string) {
  return COUNTRY_CODE_INDICATORS.find((entry) => entry.label === label) ?? null;
}

function detectSharedCountryCode(rawValue: string): CountryCodeDetectionResult | null {
  const value = rawValue.trimStart();
  const sharedCodes = Array.from(new Set(SHARED_COUNTRY_CODE_AREA_INDICATORS.map((entry) => entry.code))).sort((a, b) => b.length - a.length);

  for (const code of sharedCodes) {
    const match = value.match(new RegExp(`^\\+?${escapeRegExp(code)}([\\s_-]+)(.*)$`, "i"));
    if (!match) {
      continue;
    }

    const rest = normalizeRest(match[2] ?? "");
    const finalizedMatch = rest.match(/^(\d{3})([\s_-]+)(.*)$/);
    if (!finalizedMatch) {
      return { country: null, localNumber: rest, sharedCode: code, mode: "shared-pending" };
    }

    const areaDigits = finalizedMatch[1];

    const areaIndicator = SHARED_COUNTRY_CODE_AREA_INDICATORS.find((entry) => entry.code === code && entry.areaCode === areaDigits);
    if (!areaIndicator) {
      return { country: null, localNumber: rest, sharedCode: code, mode: "shared-pending" };
    }

    const country = findCountryIndicatorByLabel(areaIndicator.country);
    if (!country) {
      return { country: null, localNumber: rest, sharedCode: code, mode: "shared-pending" };
    }

    return {
      areaCode: areaDigits,
      country,
      localNumber: normalizeRest(finalizedMatch[3] ?? ""),
      location: areaIndicator.location,
      mode: "shared-resolved",
      sharedCode: code,
    };
  }

  return null;
}

function detectCountryCodeIndicator(rawValue: string): CountryCodeDetectionResult {
  const value = rawValue.trimStart();
  const sharedResult = detectSharedCountryCode(rawValue);
  if (sharedResult) {
    return sharedResult;
  }

  for (const country of [...COUNTRY_CODE_INDICATORS].sort((a, b) => b.code.length - a.code.length)) {
    if (SHARED_COUNTRY_CODE_AREA_INDICATORS.some((entry) => entry.code === country.code)) {
      continue;
    }

    const numericRegex = new RegExp(`^\\+?${escapeRegExp(country.code)}([\\s_-]+)(.*)$`, "i");
    const numericMatch = value.match(numericRegex);

    if (numericMatch) {
      return {
        country,
        areaCode: undefined,
        localNumber: normalizeRest(numericMatch[2] ?? ""),
        mode: "single",
        sharedCode: country.code,
      };
    }
  }

  const aliasEntries = COUNTRY_CODE_INDICATORS.flatMap((country) =>
    country.aliases.map((alias) => ({
      country,
      alias,
      pattern: aliasToRegex(alias),
    }))
  ).sort((a, b) => b.alias.length - a.alias.length);

  for (const entry of aliasEntries) {
    const aliasRegex = new RegExp(`^${entry.pattern}([\\s_-]+)(.*)$`, "i");
    const aliasMatch = value.match(aliasRegex);

    if (aliasMatch) {
      const isSharedCode = SHARED_COUNTRY_CODE_AREA_INDICATORS.some((indicator) => indicator.code === entry.country.code);
      return {
        country: isSharedCode ? null : entry.country,
        areaCode: undefined,
        localNumber: normalizeRest(aliasMatch[2] ?? ""),
        mode: isSharedCode ? "shared-pending" : "single",
        sharedCode: entry.country.code,
      };
    }
  }

  return {
    areaCode: undefined,
    country: null,
    localNumber: rawValue,
    mode: "none",
  };
}

function parsePhoneValue(value: string | undefined): CountryCodeDetectionResult {
  const rawValue = value ?? "";
  if (!rawValue.trim()) {
    return { country: null, localNumber: "", sharedCode: undefined, areaCode: undefined, mode: "none" };
  }

  return detectCountryCodeIndicator(rawValue);
}

function formatPhoneValue({
  areaCode,
  country,
  localNumber,
  mode,
  sharedCode,
}: {
  areaCode?: string;
  country: CountryCodeIndicator | null;
  localNumber: string;
  mode: CountryCodeDetectionResult["mode"];
  sharedCode?: string;
}) {
  const code = sharedCode ?? country?.code;
  if (!code) {
    return localNumber;
  }

  const normalizedNumber = localNumber.replace(/^[\s\-_]+/, "");

  if (mode === "shared-resolved" && areaCode) {
    return normalizedNumber ? `+${code} ${areaCode} ${normalizedNumber}` : `+${code} ${areaCode} `;
  }

  return normalizedNumber ? `+${code} ${normalizedNumber}` : `+${code} `;
}

export interface PhoneInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange"> {
  onChange?: (value: string) => void;
  value?: string;
}

function normalizeTriggerAttempt(value: string) {
  return value.replace(/[\s\-_]+$/, "").trim();
}

function isExplicitCountryTriggerAttempt(value: string) {
  return /[\s\-_]+$/.test(value) && Boolean(normalizeTriggerAttempt(value));
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, value, onChange, placeholder, ...props }, ref) => {
    const [triggerError, setTriggerError] = React.useState<string | null>(null);
    const { areaCode, country, localNumber, mode, sharedCode } = parsePhoneValue(value);
    const hasChip = Boolean(country || sharedCode);
    const resolvedPlaceholder = hasChip
      ? "Type phone number now."
      : placeholder ?? "977 9840000000 or np 9840000000";

    return (
      <div className="space-y-1.5">
        <div
          className={cn(
            "flex w-full items-center gap-2 rounded-xl border border-input bg-background px-3 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
            triggerError && "border-destructive focus-within:ring-destructive",
            className
          )}
        >
          {hasChip ? (
            <span className="inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-muted px-3 text-xs font-semibold text-foreground">
              {country ? <span aria-hidden="true">{country.flag}</span> : null}
              <span>
                +{sharedCode ?? country?.code}
                {mode === "shared-resolved" && areaCode ? ` ${areaCode}` : ""}
              </span>
            </span>
          ) : null}

          <input
            {...props}
            ref={ref}
            type="tel"
            value={hasChip ? localNumber : value ?? ""}
            placeholder={resolvedPlaceholder}
            className="h-12 w-full border-0 bg-transparent px-0 py-0 text-sm placeholder:text-muted-foreground focus-visible:outline-none"
            onChange={(event) => {
              setTriggerError(null);

              if (hasChip) {
                const nextRaw = event.target.value;

                if (mode === "single") {
                  onChange?.(
                    formatPhoneValue({
                      areaCode,
                      country,
                      localNumber: nextRaw.replace(/[\s\-_]+/g, ""),
                      mode,
                      sharedCode,
                    })
                  );
                  return;
                }

                if (mode === "shared-resolved") {
                  onChange?.(
                    formatPhoneValue({
                      areaCode,
                      country,
                      localNumber: nextRaw.replace(/[\s\-_]+/g, ""),
                      mode,
                      sharedCode,
                    })
                  );
                  return;
                }

                const detected = detectCountryCodeIndicator(`+${sharedCode} ${nextRaw}`);
                if (detected.mode === "shared-resolved") {
                  onChange?.(
                    formatPhoneValue({
                      areaCode: detected.areaCode,
                      country: detected.country,
                      localNumber: detected.localNumber,
                      mode: detected.mode,
                      sharedCode: detected.sharedCode,
                    })
                  );
                  return;
                }

                onChange?.(
                  formatPhoneValue({
                    areaCode,
                    country,
                    localNumber: nextRaw.replace(/[\s\-_]+/g, ""),
                    mode,
                    sharedCode,
                  })
                );
                return;
              }

              const rawValue = event.target.value;
              const detected = detectCountryCodeIndicator(rawValue);
              if (detected.country || detected.sharedCode) {
                onChange?.(
                  formatPhoneValue({
                    areaCode: detected.areaCode,
                    country: detected.country,
                    localNumber: detected.localNumber,
                    mode: detected.mode,
                    sharedCode: detected.sharedCode,
                  })
                );
                return;
              }

              if (isExplicitCountryTriggerAttempt(rawValue)) {
                setTriggerError(`${normalizeTriggerAttempt(rawValue)} is not a registered country code.`);
              }

              onChange?.(rawValue);
            }}
            onKeyDown={(event) => {
              if (hasChip && !localNumber && event.key === "Backspace") {
                event.preventDefault();
                setTriggerError(null);
                onChange?.("");
              }

              if ((mode === "single" || mode === "shared-resolved") && event.key === " ") {
                event.preventDefault();
              }

              props.onKeyDown?.(event);
            }}
          />
        </div>
        {triggerError ? <p className="text-sm text-destructive">{triggerError}</p> : null}
      </div>
    );
  }
);

PhoneInput.displayName = "PhoneInput";

export { PhoneInput };
