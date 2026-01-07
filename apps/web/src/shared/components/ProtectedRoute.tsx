import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext';
import { notebooksApi } from '../../features/notebooks/services/notebooksApi';
import { LoginModal } from '../../features/auth/components/LoginModal';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireNotebookAccess?: boolean; // If true, checks notebook ownership from URL param
}

export function ProtectedRoute({ children, requireNotebookAccess = false }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();
  const [notebookCheckLoading, setNotebookCheckLoading] = useState(false);
  const [notebookAccessDenied, setNotebookAccessDenied] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Check notebook ownership if required
  useEffect(() => {
    if (requireNotebookAccess && isAuthenticated && user) {
      // Extract notebook ID from URL path
      const match = location.pathname.match(/^\/notebook\/([^/]+)$/);
      if (match && match[1]) {
        const notebookId = match[1];
        setNotebookCheckLoading(true);

        notebooksApi.getNotebook(notebookId)
          .then(() => {
            // Notebook exists and user has access
            setNotebookAccessDenied(false);
          })
          .catch((error) => {
            console.error('Notebook access check failed:', error);
            // Notebook doesn't exist or user doesn't have access
            setNotebookAccessDenied(true);
          })
          .finally(() => {
            setNotebookCheckLoading(false);
          });
      }
    }
  }, [requireNotebookAccess, isAuthenticated, user, location.pathname]);

  // Show login modal for unauthenticated users (not redirecting)
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setShowLoginModal(true);
    } else if (isAuthenticated) {
      setShowLoginModal(false);
    }
  }, [isAuthenticated, isLoading]);

  // Loading state
  if (isLoading || notebookCheckLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to home if notebook access is denied
  if (notebookAccessDenied) {
    return <Navigate to="/home" replace />;
  }

  // Not authenticated - show login modal but DON'T render children
  if (!isAuthenticated) {
    return (
      <>
        {showLoginModal && (
          <LoginModal
            onClose={() => setShowLoginModal(false)}
            authError="Please sign in to continue"
          />
        )}
        {/* Empty placeholder - protected content is not rendered */}
      </>
    );
  }

  // Authenticated and has access
  return <>{children}</>;
}
