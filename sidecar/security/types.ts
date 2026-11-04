export interface IOsSecretStore {
  getSecret(service: string, account: string): Promise<string | null>;
  setSecret(service: string, account: string, secret: string): Promise<void>;
  deleteSecret(service: string, account: string): Promise<boolean>;
  isAvailable(): Promise<boolean>;
  getStoreName(): string;
}

export interface EncryptedVaultEnvelope {
  version: 1;
  salt: string; // 16 bytes hex
  iv: string; // 12 bytes hex (96-bit for AES-GCM)
  authTag: string; // 16 bytes hex (128-bit)
  ciphertext: string; // hex
  updatedAt: number;
}

export interface ProviderCredentials {
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  accessKey?: string; // AWS
  secretKey?: string; // AWS
  sessionToken?: string; // AWS
  [key: string]: string | undefined;
}

export interface ICredentialVault {
  getCredentials(providerId: string): Promise<ProviderCredentials | null>;
  setCredentials(providerId: string, credentials: ProviderCredentials): Promise<void>;
  deleteCredentials(providerId: string): Promise<boolean>;
  hasCredentials(providerId: string): Promise<boolean>;
  listConfiguredProviderIds(): Promise<string[]>;
  clearAll(): Promise<void>;
}
