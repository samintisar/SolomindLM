import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface UseAuthGuardProps {
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface UseAuthGuardReturn {
  showLoginModal: boolean;
  setShowLoginModal: React.Dispatch<React.SetStateAction<boolean>>;
  authError: string | null;
  setAuthError: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useAuthGuard({ isAuthenticated, isLoading }: UseAuthGuardProps): UseAuthGuardReturn {
  const location = useLocation();
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const isProtectedRoute =
      location.pathname === '/billing' ||
      location.pathname.startsWith('/notebook/');

    if (!isLoading && !isAuthenticated && isProtectedRoute) {
      setShowLoginModal(true);
    } else if (isAuthenticated) {
      setShowLoginModal(false);
    }
  }, [isAuthenticated, isLoading, location.pathname]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const fromStripe = params.get('success') === 'true' || params.get('canceled') === 'true';
    if (!isLoading && isAuthenticated && location.pathname === '/' && !fromStripe) {
      navigate('/home', { replace: true });
    }
  }, [isLoading, isAuthenticated, location.pathname, location.search, navigate]);

  return { showLoginModal, setShowLoginModal, authError, setAuthError };
}
