export interface EmbeddedProviderConfig {
  id: string;
  provider: string;
  model: string;
  enabled: boolean;
}

export class ProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigurationError";
  }
}

export function requireConfiguredEmbeddedProvider(
  providers: EmbeddedProviderConfig[],
  preferredProviderId?: string
): EmbeddedProviderConfig {
  const enabled = providers.filter((item) => item.enabled);
  if (enabled.length === 0) {
    throw new ProviderConfigurationError(
      "No embedded provider configured. Configure provider before skill generation."
    );
  }

  if (preferredProviderId) {
    const selected = enabled.find((item) => item.id === preferredProviderId);
    if (!selected) {
      throw new ProviderConfigurationError(
        `Preferred provider is unavailable: ${preferredProviderId}`
      );
    }
    return selected;
  }

  return enabled[0];
}
