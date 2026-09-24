import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Fail Studio jobs whose action was killed before it could mark them failed (#174).
crons.interval(
  "fail stuck studio jobs",
  { minutes: 5 },
  internal.studio.jobMutations.stuckJobs.sweepStuckStudioJobs,
  {}
);

export default crons;
