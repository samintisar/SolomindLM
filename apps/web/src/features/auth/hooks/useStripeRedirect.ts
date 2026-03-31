import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface UseStripeRedirectProps {
  isAuthenticated: boolean;
  user: any;
}

export function useStripeRedirect({ isAuthenticated, user }: UseStripeRedirectProps) {
  const navigate = useNavigate();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const canceled = urlParams.get('canceled');

    if ((success === 'true' || canceled === 'true') && isAuthenticated && user) {
      navigate('/billing', { replace: true });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [isAuthenticated, user, navigate]);
}
