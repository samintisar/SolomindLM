export function getStatusMessage(status?: string): string | null {
  switch (status) {
    case "searching":
      return "Searching sources";
    case "reading":
      return "Reading sources";
    case "planning":
      return "Planning";
    case "thinking":
      return "Thinking";
    case "generating":
      return "Generating response";
    case "writing":
      return "Writing answer";
    case "retrieving":
      return "Retrieving passages";
    case "embedding":
      return "Embedding query";
    case "ranking":
      return "Ranking results";
    case "completed":
      return "Response complete";
    default:
      return status ? status.replace(/_/g, " ") : null;
  }
}
