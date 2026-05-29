export type CompiledActivityAction = {
  title: string;
  details?: string[];
  raw: string;
};

function quote(value: string) {
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function unquote(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return trimmed;
}

export const activityAction = {
  login: () => "login",
  profileDisplayImageChanged: (previousUrl: string, newUrl: string) =>
    `profile.displayImage.changedFrom(${quote(previousUrl)}).changedTo(${quote(newUrl)})`,
  accountBrandCreate: (brandAccountId: string) =>
    `account.brand.create(${quote(brandAccountId)})`,
  accountConnectionCreate: (connectionId: string, applicationId: string) =>
    `account.connection.create(${quote(connectionId)}).application(${quote(applicationId)})`,
} as const;

export function compileActivityAction(rawAction: string): CompiledActivityAction {
  const raw = rawAction?.trim() || "";

  if (raw === "login") {
    return { raw, title: "Logged in." };
  }

  const profileDisplayImageMatch = raw.match(
    /^profile\.displayImage\.changedFrom\((.+)\)\.changedTo\((.+)\)$/
  );
  if (profileDisplayImageMatch) {
    const previousUrl = unquote(profileDisplayImageMatch[1]);
    const newUrl = unquote(profileDisplayImageMatch[2]);
    return {
      raw,
      title: "You changed your profile picture.",
      details: [`From: ${previousUrl || "N/A"}`, `To: ${newUrl || "N/A"}`],
    };
  }

  const accountBrandCreateMatch = raw.match(/^account\.brand\.create\((.+)\)$/);
  if (accountBrandCreateMatch) {
    const brandAccountId = unquote(accountBrandCreateMatch[1]);
    return {
      raw,
      title: "Created a brand account.",
      details: [`Brand Account ID: ${brandAccountId}`],
    };
  }

  const accountConnectionCreateMatch = raw.match(
    /^account\.connection\.create\((.+)\)\.application\((.+)\)$/
  );
  if (accountConnectionCreateMatch) {
    const connectionId = unquote(accountConnectionCreateMatch[1]);
    const applicationId = unquote(accountConnectionCreateMatch[2]);
    return {
      raw,
      title: "Connected your account to an application.",
      details: [`Connection ID: ${connectionId}`, `Application ID: ${applicationId}`],
    };
  }

  return { raw, title: rawAction };
}

