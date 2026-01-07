import React from 'react';
import { GraduationCap, Microscope, Languages, Briefcase, BookOpen, Users, ArrowRight } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';

interface UseCase {
  icon: React.ElementType;
  title: string;
  description: string;
  example: string;
  color: string;
  bgColor: string;
}

const useCases: UseCase[] = [
  {
    icon: GraduationCap,
    title: 'Medical Students',
    description: 'Turn dense lectures and research papers into memorizable flashcards and quizzes.',
    example: 'Upload a 50-page anatomy lecture → Get 200+ flashcards with diagrams',
    color: 'text-rose-600',
    bgColor: 'bg-rose-50 dark:bg-rose-950/20'
  },
  {
    icon: Microscope,
    title: 'Researchers',
    description: 'Extract key findings from papers and generate literature reviews instantly.',
    example: 'Upload 10 research papers → Get comprehensive summary and citations',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20'
  },
  {
    icon: Languages,
    title: 'Language Learners',
    description: 'Create vocabulary lists and grammar exercises from any content.',
    example: 'Upload a Spanish article → Get personalized vocabulary quiz',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/20'
  },
  {
    icon: Briefcase,
    title: 'Professionals',
    description: 'Summarize industry reports and stay updated with minimal reading time.',
    example: 'Upload a market report → Get executive summary and key insights',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-950/20'
  },
  {
    icon: BookOpen,
    title: 'Lifelong Learners',
    description: 'Turn any topic into a structured learning experience.',
    example: 'Upload a philosophy book → Answer written questions with instant AI-powered feedback',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 dark:bg-purple-950/20'
  },
  {
    icon: Users,
    title: 'Study Groups',
    description: 'Collaborate on shared study materials and track progress together.',
    example: 'Share flashcard deck → Practice together with real-time sync',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50 dark:bg-indigo-950/20'
  }
];

export const UseCasesSection: React.FC = () => {
  return (
    <section id="use-cases" className="py-20 px-6 bg-background">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-sans font-bold text-foreground mb-4">
            Built for Every Learner
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            From students to professionals, SolomindLM adapts to your learning style
          </p>
        </div>

        {/* Use Cases Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {useCases.map((useCase, index) => {
            const Icon = useCase.icon;
            return (
              <div
                key={index}
                className="group bg-card border border-border rounded-2xl p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                {/* Icon */}
                <div className={`w-14 h-14 ${useCase.bgColor} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className={`w-7 h-7 ${useCase.color}`} />
                </div>

                {/* Title */}
                <h3 className="text-xl font-bold text-foreground mb-2">
                  {useCase.title}
                </h3>

                {/* Description */}
                <p className="text-muted-foreground text-sm mb-4 leading-relaxed">
                  {useCase.description}
                </p>

                {/* Example - Enhanced Design */}
                <div className={`mt-6 pt-6 border-t border-border group/example`}>
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Example</p>
                    <div className={`p-4 rounded-lg bg-gradient-to-br ${useCase.bgColor} border border-border/50 group-hover/example:border-current group-hover/example:shadow-md transition-all duration-300`}>
                      <p className={`text-sm font-semibold leading-relaxed text-foreground group-hover/example:${useCase.color} transition-colors duration-300`}>
                        {useCase.example}
                      </p>
                    </div>
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
