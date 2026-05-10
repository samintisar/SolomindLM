import { CheckCircle, Loader, XCircle, Circle } from "lucide-react";

export interface ResearchStep {
  type: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  title: string;
  description: string;
  details?: string;
}

export function ResearchSteps({ steps }: { steps: ResearchStep[] }) {
  return (
    <div className="space-y-2">
      {steps.map((step, index) => (
        <div key={index} className="flex items-start gap-3">
          <div className="mt-1">
            {step.status === "completed" && <CheckCircle className="w-5 h-5 text-green-500" />}
            {step.status === "in_progress" && <Loader className="w-5 h-5 animate-spin" />}
            {step.status === "failed" && <XCircle className="w-5 h-5 text-red-500" />}
            {step.status === "pending" && <Circle className="w-5 h-5 text-gray-300" />}
          </div>
          <div>
            <h4 className="font-medium">{step.title}</h4>
            <p className="text-sm text-gray-600">{step.description}</p>
            {step.details && (
              <p className="text-sm text-gray-500 mt-1">{step.details}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
