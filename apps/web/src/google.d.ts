/// <reference types="google.picker" />

declare namespace google {
  namespace accounts {
    namespace oauth2 {
      interface TokenClient {
        requestAccessToken(config: { prompt: string }): void;
      }

      interface TokenResponse {
        access_token?: string;
        error?: string;
      }

      function initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
      }): TokenClient;
    }
  }
}

declare const gapi: {
  load(api: string, callback: () => void): void;
  client: {
    load(url: string): Promise<void>;
  };
};
