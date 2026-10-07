/**
 * Types shared by the audio overview script pipeline.
 */

export interface DialogueLine {
  speaker: "host_a" | "host_b";
  text: string;
}
