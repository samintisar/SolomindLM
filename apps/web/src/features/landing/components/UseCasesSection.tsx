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
    <section id="use-cases" className="py-32 md:py-40 px-6">
      <div className="max-w-[1500px] w-full mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
            Built for Every Learner
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            From students to professionals, SolomindLM adapts to your learning style
          </p>
        </div>

        {/* Use Cases Grid - 3 cols on lg, tighter spacing */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {useCases.map((useCase, index) => {
            const Icon = useCase.icon;
            return (
              <div
                key={index}
                className="group bg-card rounded-xl p-12 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
              >
                <div className="mb-3">
                  <Icon
                    className={`w-8 h-8 ${useCase.color} group-hover:scale-105 transition-transform duration-300`}
                    strokeWidth={1.5}
                  />
                </div>

                <h3 className="text-lg font-display font-bold text-foreground mb-2">
                  {useCase.title}
                </h3>

                <p className="text-base text-foreground/80 font-normal leading-[1.65] mb-3">
                  {useCase.description}
                </p>

                <div className={`mt-4 pt-4 border-t border-border/60`}>
                  <div className={`pl-3 border-l-2 ${useCase.borderColor} py-1`}>
                    <p className="text-sm text-foreground/75 font-normal leading-[1.6]">
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
