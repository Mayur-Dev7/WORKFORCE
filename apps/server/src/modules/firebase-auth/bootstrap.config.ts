export interface BootstrapConfig {
  adminEmail?: string;
  companyId?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getBootstrapConfig(): BootstrapConfig {
  const emailRaw = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const companyIdRaw = process.env.BOOTSTRAP_COMPANY_ID;

  const adminEmail = emailRaw && emailRaw.trim() ? emailRaw.trim().toLowerCase() : undefined;
  const companyId = companyIdRaw && companyIdRaw.trim() ? companyIdRaw.trim() : undefined;

  return { adminEmail, companyId };
}

export function isBootstrapConfigured(): boolean {
  const { adminEmail, companyId } = getBootstrapConfig();
  if (!adminEmail) return false;
  if (!companyId || !UUID_REGEX.test(companyId)) {
    return false;
  }
  return true;
}

export function validateBootstrapConfig(): boolean {
  const { adminEmail, companyId } = getBootstrapConfig();
  if (!adminEmail) {
    return true; // Not configured, valid
  }

  if (!companyId) {
    console.error('❌ [CONFIG ERROR] BOOTSTRAP_ADMIN_EMAIL is set but BOOTSTRAP_COMPANY_ID is missing. First-admin bootstrap will be rejected.');
    return false;
  }

  if (!UUID_REGEX.test(companyId)) {
    console.error(`❌ [CONFIG ERROR] BOOTSTRAP_COMPANY_ID "${companyId}" is not a valid UUID format. First-admin bootstrap will be rejected.`);
    return false;
  }

  return true;
}
