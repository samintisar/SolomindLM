import { useMemo, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  useQuery,
  useMutation,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from 'convex/react';
import { api } from '@convex/_generated/api';

interface ProtectedRouteProps {
  children: ReactNode;
  requireNotebookAccess?: boolean;
}

function stripShareQueryParam(search: string): string {
  const p = new URLSearchParams(search);
  p.delete('share');
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function ProtectedRoute({ children, requireNotebookAccess = false }: ProtectedRouteProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const redeemCollaborate = useMutation(api.notebooks.sharing.redeemCollaborateLink);

  useQuery(api.auth.getCurrentUser);

  const notebookId = useMemo(() => {
    if (requireNotebookAccess) {
      const match = location.pathname.match(/^\/notebook\/([^/]+)$/);
      return match && match[1] ? match[1] : null;
    }
    return null;
  }, [requireNotebookAccess, location.pathname]);

  const shareToken = useMemo(() => {
    if (!requireNotebookAccess || !notebookId) return null;
    return new URLSearchParams(location.search).get('share');
  }, [requireNotebookAccess, notebookId, location.search]);

  const [redeemFinished, setRedeemFinished] = useState(() => shareToken === null);

  useEffect(() => {
    if (!shareToken || !notebookId) {
      setRedeemFinished(true);
      return;
    }

    setRedeemFinished(false);
    let cancelled = false;

    (async () => {
      try {
        const result = await redeemCollaborate({ token: shareToken });
        if (!cancelled && result.notebookId === notebookId) {
          const nextSearch = stripShareQueryParam(location.search);
          navigate(`${location.pathname}${nextSearch}`, { replace: true });
        }
      } catch (e) {
        console.error('[ProtectedRoute] redeem share link failed', e);
      } finally {
        if (!cancelled) {
          setRedeemFinished(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shareToken, notebookId, redeemCollaborate, location.pathname, location.search, navigate]);

  const notebook = useQuery(
    api.notebooks.index.get,
    notebookId ? { id: notebookId as any } : 'skip'
  );

  const waitingForNotebook =
    requireNotebookAccess &&
    notebookId &&
    (!redeemFinished || notebook === undefined);

  const notebookAccessDenied =
    requireNotebookAccess &&
    notebookId &&
    redeemFinished &&
    notebook === null;

  return (
    <>
      <AuthLoading>
        <div className="flex h-screen w-full items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      </AuthLoading>

      <Authenticated>
        {waitingForNotebook ? (
          <div className="flex h-screen w-full items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">Opening notebook…</p>
            </div>
          </div>
        ) : notebookAccessDenied ? (
          <Navigate to="/home" replace />
        ) : (
          children
        )}
      </Authenticated>

      <Unauthenticated>
        <Navigate
          to="/sign-in"
          replace
          {...({
            state: {
              from: `${location.pathname}${location.search}`,
              message: 'Please sign in to continue',
            },
          } as Record<string, unknown>)}
        />
      </Unauthenticated>
    </>
  );
}
