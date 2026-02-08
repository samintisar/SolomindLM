import React from 'react';
import { GraduationCap, Microscope, Languages, Briefcase, BookOpen, Users } from 'lucide-react';

interface UseCase {
  icon: React.ElementType;
  title: string;
  description: string;
  example: string;
  color: string;
  borderColor: string;
}

const useCases: UseCase[] = [
  {
    icon: GraduationCap,
    title: 'Medical Students',
    description: 'Turn dense lectures and research papers into memorizable flashcards and quizzes.',
    example: 'Upload a 50-page anatomy lecture → Get 200+ flashcards with diagrams',
    color: 'text-rose-600',
    borderColor: 'border-l-rose-500'
  },
  {
    icon: Microscope,
    title: 'Researchers',
    description: 'Extract key findings from papers and generate literature reviews instantly.',
    example: 'Upload 10 research papers → Get comprehensive summary and citations',
    color: 'text-blue-600',
    borderColor: 'border-l-blue-500'
  },
  {
    icon: Languages,
    title: 'Language Learners',
    description: 'Create vocabulary lists and grammar exercises from any content.',
    example: 'Upload a Spanish article → Get personalized vocabulary quiz',
    color: 'text-emerald-600',
    borderColor: 'border-l-emerald-500'
  },
  {
    icon: Briefcase,
    title: 'Professionals',
    description: 'Summarize industry reports and stay updated with minimal reading time.',
    example: 'Upload a market report → Get executive summary and key insights',
    color: 'text-amber-600',
    borderColor: 'border-l-amber-500'
  },
  {
    icon: BookOpen,
    title: 'Lifelong Learners',
    description: 'Turn any topic into a structured learning experience.',
    example: 'Upload a philosophy book → Answer written questions with instant AI-powered feedback',
    color: 'text-purple-600',
    borderColor: 'border-l-purple-500'
  },
  {
    icon: Users,
    title: 'Study Groups',
    description: 'Collaborate on shared study materials and track progress together.',
    example: 'Share flashcard deck → Practice together with real-time sync',
    color: 'text-indigo-600',
    borderColor: 'border-l-indigo-500'
  }
];

export const UseCasesSection: React.FC = () => {
  return (
    <section id="use-cases" className="py-32 px-6">
      <div className="max-w-[1500px] w-full mx-auto">
        {/* Section Header */}
        <div className="text-center mb-20">
          <h2 className="text-3xl md:text-4xl font-sans font-bold text-foreground mb-4">
            Built for Every Learner
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            From students to professionals, SolomindLM adapts to your learning style
          </p>
        </div>

        {/* Use Cases Grid - 2 columns, more spacing */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
          {useCases.map((useCase, index) => {
            const Icon = useCase.icon;
            return (
              <div
                key={index}
                className="group bg-card rounded-2xl p-8 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
              >
                {/* Icon - no container, larger, floats above */}
                <div className="mb-5 -mt-1">
                  <Icon
                    className={`w-11 h-11 ${useCase.color} group-hover:scale-110 transition-transform duration-300`}
                    strokeWidth={1.5}
                  />
                </div>

                {/* Title - 18–20px */}
                <h3 className="text-lg font-sans font-bold text-foreground mb-3">
                  {useCase.title}
                </h3>

                {/* Description - 14px, weight 400, line-height 1.6–1.7 */}
                <p className="text-sm text-muted-foreground font-normal leading-[1.65] mb-5">
                  {useCase.description}
                </p>

                {/* Example - left border accent only, minimal label */}
                <div className={`mt-6 pt-6 border-t border-border/60`}>
                  <div
                    className={`pl-4 border-l-2 ${useCase.borderColor} py-1.5`}
                  >
                    <p className="text-sm text-foreground/90 font-normal leading-[1.65]">
                      {useCase.example}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
