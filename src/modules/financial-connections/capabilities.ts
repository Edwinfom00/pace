
export type FinancialConnectionProvider = {
  kind: "BANK_CONNECTION" | "MOBILE_MONEY";
  countryCodes: readonly string[];
  isConfigured: () => boolean;
};

export type FinancialConnectionCapabilities = {
  manual: true;
  importStatement: true;
  bankConnection: boolean;
  mobileMoney: boolean;
};


const configuredFinancialConnectionProviders: readonly FinancialConnectionProvider[] = [];

function supports(
  providers: readonly FinancialConnectionProvider[],
  kind: FinancialConnectionProvider["kind"],
  country: string | null | undefined,
): boolean {
  return Boolean(country) && providers.some(
    (provider) => provider.kind === kind && provider.isConfigured() && provider.countryCodes.includes(country!),
  );
}

export function getFinancialConnectionCapabilities(
  { country }: { country: string | null | undefined },
  providers: readonly FinancialConnectionProvider[] = configuredFinancialConnectionProviders,
): FinancialConnectionCapabilities {
  return {
    manual: true,
    importStatement: true,
    bankConnection: supports(providers, "BANK_CONNECTION", country),
    mobileMoney: supports(providers, "MOBILE_MONEY", country),
  };
}
