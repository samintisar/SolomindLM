import { useNavigate } from "react-router-dom";
import { LandingPage } from "@/features/landing/LandingPage";

export function LandingRoute() {
  const navigate = useNavigate();
  return <LandingPage onGetStarted={() => navigate("/home")} />;
}
