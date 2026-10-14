// Shared App Store frame themes. bg(shotIndex) lets a theme vary per screenshot.
const PASTELS = ["#E6C3BB", "#B8CBE0", "#C3E0CB", "#EADFC9", "#D9C8E3", "#F0D3B5", "#BFD9D9", "#EFE2A8"];
const THEMES = {
  brown: {
    label: "A · Espresso (current)",
    bg: () => "radial-gradient(120% 70% at 50% 0%, #6b5139 0%, #4a3727 55%, #3a2b1f 100%)",
    title: "#F7F2E7",
    sub: "rgba(247,242,231,.78)",
  },
  paper: {
    label: "B · Paper",
    bg: () =>
      "linear-gradient(rgba(90,68,48,.06) 1px, transparent 1px) 0 0/28px 28px, linear-gradient(90deg, rgba(90,68,48,.06) 1px, transparent 1px) 0 0/28px 28px, #F3EDE0",
    title: "#2B211A",
    sub: "#6E5D4D",
  },
  pastel: {
    label: "C · Folder pastels",
    bg: (i) => PASTELS[i % PASTELS.length],
    title: "#2B211A",
    sub: "rgba(43,33,26,.72)",
  },
  sunrise: {
    label: "D · Warm gradient",
    bg: () => "linear-gradient(165deg, #FBF3E6 0%, #F2D9C4 55%, #E6B9A0 100%)",
    title: "#2B211A",
    sub: "#6E5547",
  },
  ink: {
    label: "E · Ink",
    bg: () => "radial-gradient(110% 60% at 50% 0%, #2E2620 0%, #1A1512 70%)",
    title: "#F7F2E7",
    sub: "rgba(247,242,231,.7)",
  },
};
module.exports = { THEMES };
