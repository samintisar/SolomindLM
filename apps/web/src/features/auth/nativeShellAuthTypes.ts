export type NativeAuthResponse = {
  type: "native-auth:response";
  requestId: string;
  success: boolean;
  error?: string;
  authenticated?: boolean;
};
