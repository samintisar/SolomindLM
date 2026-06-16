import { describe, expect, it } from "vitest";
import { extractYouTubeVideoId, isYouTubeHostname, youTubeEmbedSrc } from "./youtubeEmbed";

describe("isYouTubeHostname", () => {
  it("accepts youtube.com and subdomains", () => {
    expect(isYouTubeHostname("www.youtube.com")).toBe(true);
    expect(isYouTubeHostname("m.youtube.com")).toBe(true);
    expect(isYouTubeHostname("youtube.com")).toBe(true);
  });

  it("accepts youtu.be", () => {
    expect(isYouTubeHostname("youtu.be")).toBe(true);
  });

  it("rejects non-YouTube hosts", () => {
    expect(isYouTubeHostname("evil.com")).toBe(false);
    expect(isYouTubeHostname("notyoutube.com")).toBe(false);
  });
});

describe("extractYouTubeVideoId", () => {
  it("parses watch URLs", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=abc123")).toBe("abc123");
  });

  it("parses youtu.be URLs", () => {
    expect(extractYouTubeVideoId("https://youtu.be/abc123")).toBe("abc123");
  });

  it("parses shorts URLs", () => {
    expect(extractYouTubeVideoId("https://youtube.com/shorts/abc123")).toBe("abc123");
  });

  it("parses embed URLs", () => {
    expect(extractYouTubeVideoId("https://youtube.com/embed/abc123")).toBe("abc123");
  });

  it("parses live URLs", () => {
    expect(extractYouTubeVideoId("https://youtube.com/live/abc123")).toBe("abc123");
  });

  it("returns null for empty or invalid input", () => {
    expect(extractYouTubeVideoId("")).toBeNull();
    expect(extractYouTubeVideoId(undefined)).toBeNull();
    expect(extractYouTubeVideoId("not-a-url")).toBeNull();
  });

  it("rejects non-YouTube hosts even when v= is present", () => {
    expect(extractYouTubeVideoId("https://evil.com/watch?v=abc123")).toBeNull();
    expect(extractYouTubeVideoId("https://phishing.example/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("rejects javascript and data URLs", () => {
    expect(extractYouTubeVideoId("javascript:alert(1)")).toBeNull();
    expect(extractYouTubeVideoId("data:text/html,<script>alert(1)</script>")).toBeNull();
  });
});

describe("youTubeEmbedSrc", () => {
  it("builds a nocookie embed URL with the video id", () => {
    expect(youTubeEmbedSrc("abc123")).toBe("https://www.youtube-nocookie.com/embed/abc123");
  });
});
