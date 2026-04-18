import type { AudioSource } from "expo-audio";

/** Default options for remote Convex / HTTPS audio URLs (expo-audio). */
export const remoteAudioPlayerOptions = {
  downloadFirst: true as const,
  updateInterval: 500,
};

/**
 * Use in components:
 * `import { useAudioPlayer } from 'expo-audio';`
 * `const player = useAudioPlayer(url as AudioSource, remoteAudioPlayerOptions);`
 */
export type { AudioSource };
