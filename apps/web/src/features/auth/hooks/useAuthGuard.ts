import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface UseAuthGuardProps {
  isAuthenticated: boolean;
  isLoading: boolean;
}

/**
 * Redirects authenticated users from the marketing landing (/) to /home,
 * except when returning from Stripe checkout (success/canceled query params).
 */
export function useAuthGuard({ isAuthenticated, isLoading }: UseAuthGuardProps): void {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const fromStripe = params.get('success') === 'true' || params.get('canceled') === 'true';
    if (!isLoading && isAuthenticated && location.pathname === '/' && !fromStripe) {
      navigate('/home', { replace: true });
    }
  }, [isAuthenticated, isLoading, location.pathname, location.search, navigate]);
}
