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
  logout: () => "logout",
  passwordChanged: () => "security.password.changed",
  totpEnabled: () => "security.totp.enabled",
  totpDisabled: () => "security.totp.disabled",
  accountDependentCreate: (dependentAccountId: string) =>
    `account.dependent.create(${quote(dependentAccountId)})`,
  accountSubbrandCreate: (subbrandAccountId: string) =>
    `account.subbrand.create(${quote(subbrandAccountId)})`,
  profileDisplayImageChanged: (previousUrl: string, newUrl: string) =>
    `profile.displayImage.changedFrom(${quote(previousUrl)}).changedTo(${quote(newUrl)})`,
  profileDobChanged: (previousDob: string, newDob: string) =>
    `profile.dob.changedFrom(${quote(previousDob)}).changedTo(${quote(newDob)})`,
  profileNameChanged: (previousName: string, newName: string) =>
    `profile.name.changedFrom(${quote(previousName)}).changedTo(${quote(newName)})`,
  profileLegalNameChanged: (previousLegalName: string, newLegalName: string) =>
    `profile.legalName.changedFrom(${quote(previousLegalName)}).changedTo(${quote(newLegalName)})`,
  verificationApplied: () => "verification.applied",
  verificationApproved: (category: string) => `verification.approved(${quote(category)})`,
  applicationCreated: (applicationId: string) => `application.create(${quote(applicationId)})`,
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
  if (raw === "logout") {
    return { raw, title: "Logged out." };
  }
  if (raw === "security.password.changed") {
    return { raw, title: "You changed your password." };
  }
  if (raw === "security.totp.enabled") {
    return { raw, title: "Two-factor authentication was enabled." };
  }
  if (raw === "security.totp.disabled") {
    return { raw, title: "Two-factor authentication was disabled." };
  }
  if (raw === "verification.applied") {
    return { raw, title: "Verification was submitted." };
  }

  const profileDisplayImageMatch = raw.match(
    /^profile\.displayImage\.changedFrom\((.+)\)\.changedTo\((.+)\)$/
  );
  if (profileDisplayImageMatch) {
    return {
      raw,
      title: "You changed your profile picture.",
    };
  }

  const profileDobMatch = raw.match(/^profile\.dob\.changedFrom\((.+)\)\.changedTo\((.+)\)$/);
  if (profileDobMatch) {
    const previousDob = unquote(profileDobMatch[1]);
    const newDob = unquote(profileDobMatch[2]);
    return {
      raw,
      title: "You changed your date of birth.",
      details: [`From "${previousDob || "N/A"}" to "${newDob || "N/A"}"`],
    };
  }

  const profileNameMatch = raw.match(/^profile\.name\.changedFrom\((.+)\)\.changedTo\((.+)\)$/);
  if (profileNameMatch) {
    const previousName = unquote(profileNameMatch[1]);
    const newName = unquote(profileNameMatch[2]);
    return {
      raw,
      title: "You changed your display name.",
      details: [`From "${previousName || "N/A"}" to "${newName || "N/A"}"`],
    };
  }

  const profileLegalNameMatch = raw.match(/^profile\.legalName\.changedFrom\((.+)\)\.changedTo\((.+)\)$/);
  if (profileLegalNameMatch) {
    const previousLegalName = unquote(profileLegalNameMatch[1]);
    const newLegalName = unquote(profileLegalNameMatch[2]);
    return {
      raw,
      title: "You changed your legal name.",
      details: [`From "${previousLegalName || "N/A"}" to "${newLegalName || "N/A"}"`],
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

  const accountDependentCreateMatch = raw.match(/^account\.dependent\.create\((.+)\)$/);
  if (accountDependentCreateMatch) {
    const dependentAccountId = unquote(accountDependentCreateMatch[1]);
    return {
      raw,
      title: "Created a dependent account.",
      details: [`Dependent Account ID: ${dependentAccountId}`],
    };
  }

  const accountSubbrandCreateMatch =
    raw.match(/^account\.(?:branch|subbrand)\.create\((.+)\)$/);
  if (accountSubbrandCreateMatch) {
    const subbrandAccountId = unquote(accountSubbrandCreateMatch[1]);
    return {
      raw,
      title: "Created a subbrand account.",
      details: [`Subbrand Account ID: ${subbrandAccountId}`],
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

  const verificationApprovedMatch = raw.match(/^verification\.approved\((.+)\)$/);
  if (verificationApprovedMatch) {
    const category = unquote(verificationApprovedMatch[1]);
    return {
      raw,
      title: "Account verification was approved.",
      details: [`Category: ${category || "N/A"}`],
    };
  }

  const applicationCreateMatch = raw.match(/^application\.create\((.+)\)$/);
  if (applicationCreateMatch) {
    const applicationId = unquote(applicationCreateMatch[1]);
    return {
      raw,
      title: "Created an application.",
      details: [`Application ID: ${applicationId}`],
    };
  }

  return { raw, title: rawAction };
}
