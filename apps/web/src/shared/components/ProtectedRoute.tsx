import React, { useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery, Authenticated, Unauthenticated, AuthLoading } from 'convex/react';
import { api } from '@convex/_generated/api';
import { LoginModal } from '../../features/auth/components/LoginModal';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireNotebookAccess?: boolean; // If true, checks notebook ownership from URL param
}

export function ProtectedRoute({ children, requireNotebookAccess = false }: ProtectedRouteProps) {
  const location = useLocation();

  // Get user from Convex (Better Auth)
  const user = useQuery(api.auth.getCurrentUser);

  // Extract notebook ID from URL path if needed
  const notebookId = useMemo(() => {
    if (requireNotebookAccess) {
      const match = location.pathname.match(/^\/notebook\/([^/]+)$/);
      return match && match[1] ? match[1] : null;
    }
    return null;
  }, [requireNotebookAccess, location.pathname]);

  // Check notebook ownership if required
  const notebook = useQuery(
    api.notebooks.get,
    notebookId ? { id: notebookId as any } : "skip"
  );

  // Determine if access is denied (notebook not found - explicitly null after loading)
  // Note: undefined means still loading, but with Convex cache this is typically instant
  const notebookAccessDenied = requireNotebookAccess && notebookId && notebook === null;

  return (
    <>
      {/* Loading state - auth loading */}
      <AuthLoading>
        <div className="flex h-screen w-full items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      </AuthLoading>

      {/* Authenticated */}
      <Authenticated>
        {notebookAccessDenied ? (
          <Navigate to="/home" replace />
        ) : (
          children
        )}
      </Authenticated>

      {/* Not authenticated - show login modal */}
      <Unauthenticated>
        <LoginModal
          onClose={() => {}}
          authError="Please sign in to continue"
        />
      </Unauthenticated>
    </>
  );
}
