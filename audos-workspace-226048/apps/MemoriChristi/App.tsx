import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  Frame,
  Upload,
  Sparkles,
  Calendar,
  Heart,
  Camera,
  ChevronRight,
  ChevronLeft,
  Loader2,
  BookOpen,
  Wand2,
  ArrowLeft,
  X,
  ShoppingBag,
  Image as ImageIcon,
  Check,
  RefreshCw,
  Sun,
  Contrast,
  LayoutGrid,
  Link2,
  AlertCircle,
} from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import {
  uploadImage,
  formatPrice,
  ensureMemoriBackend,
  callHook,
  startCheckout,
  getSessionId,
  getWorkspaceDbToken,
  getOAuthRedirectUri,
  type Product,
} from '../../lib/memoriApi';

/* Memori Christi — new-parent journey: connect → cluster → preview → order */

type Step = 'connect' | 'cluster' | 'album' | 'preview' | 'checkout';
type PhotoFilter = 'none' | 'warm' | 'soft';

interface PhotoMedia {
  id: number;
  file_url: string;
  title?: string;
  captured_at: string;
  exif_date?: string;
  source?: string;
  in_cluster?: boolean;
  cluster_id?: number;
  sort_order?: number;
}

interface PhotoCluster {
  id: number;
  event_date: string;
  window_days?: number;
  title: string;
  status: string;
  photo_ids?: string;
  cover_url?: string;
  narrative?: string;
}

interface PhotoSource {
  id: number;
  provider: string;
  status: string;
  connected_at?: string;
  error_message?: string;
}

interface CartItem {
  product: Product;
  photoUrl?: string;
  quantity: number;
}

declare global {
  interface Window {
    useWorkspaceDB: <T = unknown>(
      table: string,
      options?: {
        shared?: boolean;
        limit?: number;
        orderBy?: { column: string; direction: 'asc' | 'desc' };
        filters?: Array<{ column: string; operator: string; value: unknown }>;
      },
    ) => {
      data: T[];
      loading: boolean;
      error: Error | null;
      total: number;
      refresh: () => void;
    };
    __workspaceDb: {
      from: (table: string, opts?: { shared?: boolean }) => {
        insert: (row: Record<string, unknown>) => Promise<unknown>;
        update: (id: number, row: Record<string, unknown>) => Promise<unknown>;
        delete: (id: number) => Promise<unknown>;
      };
    };
  }
}

const STEPS: { id: Step; label: string }[] = [
  { id: 'connect', label: 'Connect' },
  { id: 'cluster', label: 'First Days' },
  { id: 'album', label: 'Album' },
  { id: 'preview', label: 'Preview' },
  { id: 'checkout', label: 'Order' },
];

const FILTER_CLASS: Record<PhotoFilter, string> = {
  none: '',
  warm: 'sepia-[0.25] saturate-125 brightness-105',
  soft: 'grayscale-[0.35] contrast-90 brightness-105',
};

function frameBorder(style?: string) {
  switch (style) {
    case 'gold':
      return 'border-[14px] border-[#c9a227] shadow-[inset_0_0_0_2px_#f5e6a8]';
    case 'ivory':
      return 'border-[12px] border-[#f5f0e8] shadow-[inset_0_0_0_1px_#e8e0d4]';
    case 'linen':
    case 'leather':
      return '';
    default:
      return 'border-[12px] border-[#3d2314] shadow-[inset_0_0_0_2px_#8b6914]';
  }
}

function FrameMockup({
  photoUrl,
  product,
  filter,
}: {
  photoUrl: string;
  product: Product;
  filter: PhotoFilter;
}) {
  const isAlbum = product.product_type === 'album';
  if (isAlbum) {
    return (
      <div className="relative mx-auto max-w-xs">
        <div
          className={`rounded-r-lg rounded-l-sm shadow-2xl overflow-hidden ${
            product.frame_style === 'leather'
              ? 'bg-[#4a3728] p-3'
              : 'bg-[#e8dfd0] p-3'
          }`}
        >
          <div className="grid grid-cols-2 gap-1 aspect-square">
            <img src={photoUrl} alt="" className={`col-span-2 w-full h-1/2 object-cover rounded-sm ${FILTER_CLASS[filter]}`} />
            <img src={photoUrl} alt="" className={`w-full aspect-square object-cover rounded-sm ${FILTER_CLASS[filter]}`} />
            <img src={photoUrl} alt="" className={`w-full aspect-square object-cover rounded-sm ${FILTER_CLASS[filter]}`} />
          </div>
          <p className={`text-center text-[10px] mt-2 ${product.frame_style === 'leather' ? 'text-[#f5e6d3]' : 'text-[#6b5c4a]'}`}>
            {product.name}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-[220px]">
      <div className={`bg-[#faf8f5] p-4 shadow-[0_20px_50px_rgba(61,35,20,0.25)] ${frameBorder(product.frame_style)}`}>
        <img src={photoUrl} alt="" className={`w-full aspect-[4/5] object-cover ${FILTER_CLASS[filter]}`} />
      </div>
      <p className={`text-center text-xs mt-3 ${typography.color.secondary}`}>{product.dimensions}</p>
    </div>
  );
}

function GalleryWall({ photos, filter }: { photos: string[]; filter: PhotoFilter }) {
  const display = photos.slice(0, 3);
  return (
    <div className="flex items-end justify-center gap-3 py-6 px-4 bg-gradient-to-b from-[var(--space-surface-muted)] to-[var(--space-surface-card)] rounded-2xl">
      {display.map((url, i) => (
        <div
          key={i}
          className={`bg-[#faf8f5] shadow-lg ${frameBorder(i === 1 ? 'gold' : 'walnut')} ${
            i === 1 ? 'scale-110 z-10' : 'scale-95 opacity-90'
          }`}
          style={{ width: i === 1 ? 100 : 72 }}
        >
          <img src={url} alt="" className={`w-full aspect-[4/5] object-cover ${FILTER_CLASS[filter]}`} />
        </div>
      ))}
    </div>
  );
}

export default function MemoriChristi() {
  const { data: photos, loading: photosLoading, refresh: refreshPhotos } =
    window.useWorkspaceDB<PhotoMedia>('photo_media', {
      orderBy: { column: 'captured_at', direction: 'asc' },
      limit: 300,
    });

  const { data: clusters, refresh: refreshClusters } =
    window.useWorkspaceDB<PhotoCluster>('photo_clusters', {
      orderBy: { column: 'created_at', direction: 'desc' },
      limit: 5,
    });

  const { data: sources, refresh: refreshSources } =
    window.useWorkspaceDB<PhotoSource>('photo_sources', { limit: 5 });

  const {
    data: products,
    loading: productsLoading,
    error: productsError,
    refresh: refreshProducts,
  } = window.useWorkspaceDB<Product>('products', { shared: true, limit: 50 });

  const [step, setStep] = useState<Step>('connect');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [windowDays, setWindowDays] = useState(7);
  const [photoFilter, setPhotoFilter] = useState<PhotoFilter>('warm');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [albumOrder, setAlbumOrder] = useState<number[]>([]);
  const [connectError, setConnectError] = useState('');
  const [importing, setImporting] = useState(false);
  const [setupInfo, setSetupInfo] = useState<{ redirectUri: string } | null>(null);
  const [clientIdInput, setClientIdInput] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const wallRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void ensureMemoriBackend().then(() => refreshProducts());
  }, [refreshProducts]);

  const activeCluster = clusters?.[0] || null;
  const googleSource = sources?.find((s) => s.provider === 'google_photos');
  const isGoogleConnected = googleSource?.status === 'connected';

  const clusterPhotos = useMemo(() => {
    if (!activeCluster?.photo_ids) return [];
    try {
      const ids: number[] = JSON.parse(activeCluster.photo_ids);
      const map = new Map((photos || []).map((p) => [p.id, p]));
      return ids.map((id) => map.get(id)).filter(Boolean) as PhotoMedia[];
    } catch {
      return [];
    }
  }, [activeCluster, photos]);

  const orderedAlbumPhotos = useMemo(() => {
    if (!albumOrder.length) return clusterPhotos;
    const map = new Map(clusterPhotos.map((p) => [p.id, p]));
    return albumOrder.map((id) => map.get(id)).filter(Boolean) as PhotoMedia[];
  }, [clusterPhotos, albumOrder]);

  const heroPhoto = orderedAlbumPhotos[0]?.file_url || photos?.[0]?.file_url || '';

  useEffect(() => {
    if (clusterPhotos.length && !albumOrder.length) {
      setAlbumOrder(clusterPhotos.map((p) => p.id));
    }
  }, [clusterPhotos, albumOrder.length]);

  useEffect(() => {
    if (products?.length && !selectedProduct) {
      setSelectedProduct(products.find((p) => p.product_type === 'frame') || products[0]);
    }
  }, [products, selectedProduct]);

  const handleUpload = async (files: FileList | File[], source = 'upload') => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    setUploading(true);
    setConnectError('');
    try {
      for (const file of list) {
        const url = await uploadImage(file);
        const captured = new Date(file.lastModified || Date.now()).toISOString();
        await window.__workspaceDb.from('photo_media').insert({
          file_url: url,
          title: file.name.replace(/\.[^.]+$/, '') || 'Memory',
          captured_at: captured,
          exif_date: captured,
          source,
          in_cluster: false,
        });
      }
      refreshPhotos();
    } catch (e) {
      setConnectError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  /* Handle the OAuth redirect back from Google (?code=...&state=gp_...) */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const oauthError = params.get('error');
    if ((!code && !oauthError) || !state || !state.startsWith('gp_')) return;
    ['code', 'state', 'scope', 'authuser', 'prompt', 'error'].forEach((k) => params.delete(k));
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));

    if (oauthError) {
      setConnectError('Google sign-in was cancelled. You can try again or upload photos directly.');
      return;
    }

    void (async () => {
      setBusy(true);
      setStatusMsg('Finishing Google Photos sign-in…');
      try {
        await ensureMemoriBackend();
        const res = await callHook<{ success?: boolean; message?: string; error?: string }>(
          'google-photos-auth',
          {
            action: 'exchange',
            code,
            state,
            redirectUri: getOAuthRedirectUri(),
            sessionId: getSessionId(),
            wsToken: getWorkspaceDbToken(),
          },
        );
        if (res.success) {
          setStatusMsg(res.message || 'Google Photos connected!');
          refreshSources();
        } else {
          setConnectError(res.error || 'Google sign-in failed. Please try again.');
        }
      } catch {
        setConnectError('Google sign-in failed. Please try again.');
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectGooglePhotos = async () => {
    setBusy(true);
    setConnectError('');
    setSetupInfo(null);
    try {
      await ensureMemoriBackend();
      const res = await callHook<{
        success?: boolean;
        authUrl?: string;
        setupRequired?: boolean;
        error?: string;
      }>('google-photos-auth', {
        action: 'init',
        redirectUri: getOAuthRedirectUri(),
        sessionId: getSessionId(),
        wsToken: getWorkspaceDbToken(),
      });
      if (res.authUrl) {
        window.location.href = res.authUrl;
        return;
      }
      if (res.setupRequired) {
        setSetupInfo({ redirectUri: getOAuthRedirectUri() });
      }
      setConnectError(res.error || 'Connection failed');
    } catch {
      setConnectError('Could not connect. Try uploading photos directly.');
    } finally {
      setBusy(false);
    }
  };

  const saveClientId = async () => {
    const value = clientIdInput.trim();
    if (!value) return;
    setBusy(true);
    try {
      const res = await callHook<{ success?: boolean; error?: string }>('google-photos-auth', {
        action: 'set-client-id',
        clientId: value,
      });
      if (res.success) {
        setSetupInfo(null);
        setClientIdInput('');
        setConnectError('');
        setStatusMsg('Client ID saved. Tap "Connect Google Photos" again to sign in.');
      } else {
        setConnectError(res.error || 'Could not save the client ID.');
      }
    } finally {
      setBusy(false);
    }
  };

  const importFromGooglePhotos = async () => {
    setBusy(true);
    setImporting(true);
    setConnectError('');
    try {
      const auth = { sessionId: getSessionId(), wsToken: getWorkspaceDbToken() };
      const init = await callHook<{
        success?: boolean;
        pickerUri?: string;
        pickerSessionId?: string;
        pollIntervalMs?: number;
        error?: string;
      }>('google-photos-auth', { action: 'picker-init', ...auth });
      if (!init.success || !init.pickerUri) {
        setConnectError(init.error || 'Could not open the Google Photos picker.');
        return;
      }
      window.open(init.pickerUri, '_blank', 'noopener');
      setStatusMsg('Pick your photos in the Google Photos tab — they\'ll import here (with their original dates) as soon as you finish.');

      const interval = Math.max(3000, init.pollIntervalMs || 5000);
      const deadline = Date.now() + 10 * 60 * 1000;
      let totalImported = 0;
      while (Date.now() < deadline) {
        const res = await callHook<{
          ready?: boolean;
          imported?: number;
          remaining?: number;
          done?: boolean;
          skippedExisting?: number;
          error?: string;
        }>('google-photos-auth', {
          action: 'picker-poll',
          pickerSessionId: init.pickerSessionId,
          ...auth,
        });
        if (res.error) {
          setConnectError(res.error);
          break;
        }
        if (res.ready) {
          totalImported += res.imported || 0;
          refreshPhotos();
          if (res.done) {
            setStatusMsg(
              totalImported > 0
                ? `Imported ${totalImported} photo${totalImported === 1 ? '' : 's'} from Google Photos — original dates preserved for first-days clustering.`
                : res.skippedExisting
                  ? 'Those photos were already imported — you\'re all set.'
                  : 'No new photos were selected.',
            );
            break;
          }
          setStatusMsg(`Imported ${totalImported} so far — bringing in the rest…`);
          continue;
        }
        await new Promise((r) => setTimeout(r, interval));
      }
    } catch {
      setConnectError('Import failed. Your connection is safe — try again.');
    } finally {
      setImporting(false);
      setBusy(false);
    }
  };

  const disconnectGoogle = async () => {
    await callHook('google-photos-auth', {
      action: 'disconnect',
      sessionId: getSessionId(),
    });
    refreshSources();
  };

  const runCluster = async () => {
    if (!birthDate) {
      setStatusMsg('Please enter your baby\'s birth date.');
      return;
    }
    setBusy(true);
    setStatusMsg('Finding photos from the first days…');
    try {
      const res = await callHook<{
        success?: boolean;
        message?: string;
        count?: number;
      }>('cluster-birth-photos', { birthDate, windowDays });
      refreshClusters();
      refreshPhotos();
      if (res.success) {
        setStatusMsg(`Found ${res.count} photos from the first days!`);
        setStep('album');
      } else {
        setStatusMsg(res.message || 'No photos found near that date. Upload more or widen the window.');
      }
    } catch {
      setStatusMsg('Clustering failed. Your photos are safe — try again.');
    } finally {
      setBusy(false);
    }
  };

  const removeFromAlbum = (id: number) => {
    setAlbumOrder((prev) => prev.filter((x) => x !== id));
  };

  const movePhoto = (id: number, dir: -1 | 1) => {
    setAlbumOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  };

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        return prev.map((c) =>
          c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [...prev, { product, photoUrl: heroPhoto, quantity: 1 }];
    });
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.product.price_cents * c.quantity, 0);

  const saveDraft = useCallback(async () => {
    if (!cart.length) return;
    await window.__workspaceDb.from('draft_orders').insert({
      items_json: JSON.stringify(cart),
      album_cluster_id: activeCluster?.id || null,
      total_cents: cartTotal,
      status: 'draft',
    });
  }, [cart, cartTotal, activeCluster]);

  const handleCheckout = async () => {
    if (!cart.length) return;
    setBusy(true);
    try {
      await saveDraft();
      const names = cart.map((c) => c.product.name).join(', ');
      const res = await startCheckout({
        amount: cartTotal,
        productName: `Memori Christi — ${names}`,
        productDescription: 'Physical keepsake order',
        metadata: {
          clusterId: String(activeCluster?.id || ''),
          items: JSON.stringify(cart.map((c) => ({ sku: c.product.sku, qty: c.quantity }))),
        },
      });
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      } else {
        setStatusMsg(res.error || 'Checkout unavailable. Your draft is saved.');
      }
    } catch {
      setStatusMsg('Checkout failed — your album draft is preserved. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleWallUpload = async (file: File) => {
    setBusy(true);
    try {
      const url = await uploadImage(file);
      window.dispatchEvent(
        new CustomEvent('openAgent', {
          detail: {
            message: `I uploaded a photo of my wall (${url}). Christi, can you suggest a gallery arrangement with frames from the catalog?`,
          },
        }),
      );
      setStatusMsg('Wall photo sent to Christi — open the chat to see her suggestion!');
    } catch {
      setStatusMsg('Could not upload wall photo.');
    } finally {
      setBusy(false);
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="min-h-full flex flex-col w-full">
      {/* Header */}
      <header className="px-5 pt-4 pb-3 border-b border-[var(--space-border-default)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-8 h-8 rounded-xl ${tw.bg.accent} flex items-center justify-center`}>
                <Frame className={`w-4 h-4 ${tw.icon.primary}`} />
              </span>
              <p className={`text-xs uppercase tracking-widest ${typography.color.tertiary}`}>Memori Christi</p>
            </div>
            <h1 className={`text-xl font-semibold ${typography.color.primary}`} style={{ fontFamily: typography.fontFamily }}>
              First Days Keepsakes
            </h1>
            <p className={`text-sm mt-0.5 ${typography.color.secondary}`}>
              From scattered photos to frames you can hold
            </p>
          </div>
          {cart.length > 0 && (
            <button
              onClick={() => setStep('checkout')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs ${tw.button.primary}`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              {cart.length} · {formatPrice(cartTotal)}
            </button>
          )}
        </div>

        {/* Step nav */}
        <nav className="flex gap-1 mt-4 overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setStep(s.id)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                step === s.id
                  ? tw.button.primary
                  : i <= stepIndex
                    ? `${tw.button.secondary} opacity-80`
                    : `${tw.button.ghost} ${typography.color.tertiary}`
              }`}
            >
              {i < stepIndex ? <Check className="w-3 h-3" /> : null}
              {s.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {statusMsg && (
          <div className={`mb-4 p-3 rounded-xl text-sm ${tw.card.flat} ${typography.color.secondary}`}>
            {statusMsg}
            <button onClick={() => setStatusMsg('')} className="float-right"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* CONNECT */}
        {step === 'connect' && (
          <div className="space-y-5 max-w-lg mx-auto">
            <div className={`${tw.card.elevated} p-6 text-center`}>
              <Heart className={`w-10 h-10 mx-auto mb-3 ${tw.icon.primary}`} />
              <h2 className={`text-lg font-semibold mb-2 ${typography.color.primary}`}>Connect your photos</h2>
              <p className={`text-sm mb-5 ${typography.color.secondary}`}>
                Link Google Photos or upload directly — we'll find the moments from your baby's first days.
              </p>

              {isGoogleConnected ? (
                <div className={`p-4 rounded-xl ${tw.bg.muted} mb-4`}>
                  <div className="flex items-center justify-center gap-2 text-sm font-medium text-[var(--space-semantic-success)]">
                    <Check className="w-4 h-4" /> Google Photos connected
                  </div>
                  <button
                    onClick={importFromGooglePhotos}
                    disabled={busy || importing}
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl mt-3 ${tw.button.primary} disabled:opacity-50`}
                  >
                    {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                    {importing ? 'Importing your photos…' : 'Import from Google Photos'}
                  </button>
                  <button onClick={disconnectGoogle} className={`mt-2 text-xs ${typography.color.tertiary} hover:underline`}>
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  onClick={connectGooglePhotos}
                  disabled={busy}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl mb-3 ${tw.button.secondary}`}
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                  Connect Google Photos
                </button>
              )}

              {setupInfo && (
                <div className={`mt-3 p-4 rounded-xl text-left ${tw.bg.muted}`}>
                  <p className={`text-sm font-medium mb-2 ${typography.color.primary}`}>
                    One-time setup (workspace owner)
                  </p>
                  <ol className={`text-xs space-y-1.5 list-decimal pl-4 ${typography.color.secondary}`}>
                    <li>
                      In Google Cloud Console, create an OAuth web client and enable the
                      {' '}<strong>Google Photos Picker API</strong>.
                    </li>
                    <li>
                      Add this exact redirect URI:{' '}
                      <code className="break-all text-[10px] bg-[var(--space-surface-card)] px-1 py-0.5 rounded">{setupInfo.redirectUri}</code>
                    </li>
                    <li>
                      Ask Otto to save your client secret as the API key{' '}
                      <code className="text-[10px] bg-[var(--space-surface-card)] px-1 py-0.5 rounded">GOOGLE_PHOTOS_CLIENT_SECRET</code>{' '}
                      with allowed host <code className="text-[10px] bg-[var(--space-surface-card)] px-1 py-0.5 rounded">oauth2.googleapis.com</code>.
                    </li>
                    <li>Paste the OAuth client ID below and save.</li>
                  </ol>
                  <div className="flex gap-2 mt-3">
                    <input
                      type="text"
                      value={clientIdInput}
                      onChange={(e) => setClientIdInput(e.target.value)}
                      placeholder="1234…apps.googleusercontent.com"
                      className={`${tw.input.base} ${tw.input.default} flex-1 text-xs py-2`}
                    />
                    <button
                      onClick={saveClientId}
                      disabled={busy || !clientIdInput.trim()}
                      className={`px-3 py-2 rounded-xl text-xs ${tw.button.secondary} disabled:opacity-40`}
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--space-border-default)]" /></div>
                <div className="relative flex justify-center"><span className={`px-3 text-xs ${tw.bg.card} ${typography.color.tertiary}`}>or upload</span></div>
              </div>

              <div
                onClick={() => fileRef.current?.click()}
                className="rounded-2xl border-2 border-dashed border-[var(--space-border-strong)] p-8 cursor-pointer hover:border-[var(--space-brand-primary)] hover:bg-[var(--space-surface-muted)] transition-all"
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  className="hidden"
                  onChange={(e) => e.target.files && handleUpload(e.target.files)}
                />
                {uploading ? (
                  <Loader2 className={`w-8 h-8 mx-auto animate-spin ${tw.icon.primary}`} />
                ) : (
                  <Upload className={`w-8 h-8 mx-auto mb-2 ${tw.icon.primary}`} />
                )}
                <p className={`text-sm font-medium ${typography.color.primary}`}>Drop birth photos here</p>
                <p className={`text-xs mt-1 ${typography.color.tertiary}`}>Camera or file upload · JPG, PNG, HEIC</p>
              </div>

              {connectError && (
                <div className="mt-3 flex items-center gap-2 text-sm text-[var(--space-semantic-danger)]">
                  <AlertCircle className="w-4 h-4" /> {connectError}
                  <button onClick={connectGooglePhotos} className="underline ml-1">Retry</button>
                </div>
              )}
            </div>

            {(photos?.length || 0) > 0 && (
              <>
                <p className={`text-xs ${typography.color.tertiary}`}>{photos!.length} photos ready</p>
                <div className="grid grid-cols-4 gap-2">
                  {photos!.slice(0, 8).map((p) => (
                    <img key={p.id} src={p.file_url} alt="" className="aspect-square object-cover rounded-lg" />
                  ))}
                </div>
                <button
                  onClick={() => setStep('cluster')}
                  className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 ${tw.button.primary}`}
                >
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        )}

        {/* CLUSTER */}
        {step === 'cluster' && (
          <div className="space-y-5 max-w-lg mx-auto">
            <div className={`${tw.card.elevated} p-6`}>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className={tw.icon.primary} />
                <h2 className={`text-lg font-semibold ${typography.color.primary}`}>Find the first days</h2>
              </div>
              <p className={`text-sm mb-5 ${typography.color.secondary}`}>
                Tell us when your baby arrived. We'll gather every photo from the hospital, homecoming, and those blurry, beautiful early days.
              </p>

              <label className={`block text-xs font-medium mb-1.5 ${typography.color.tertiary}`}>Birth date</label>
              <div className="flex items-center gap-2 mb-4">
                <Calendar className={`w-4 h-4 ${tw.icon.muted}`} />
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className={`${tw.input.base} ${tw.input.default} flex-1 text-sm py-2`}
                />
              </div>

              <label className={`block text-xs font-medium mb-1.5 ${typography.color.tertiary}`}>
                Window: ±{windowDays} days
              </label>
              <input
                type="range"
                min={3}
                max={14}
                value={windowDays}
                onChange={(e) => setWindowDays(Number(e.target.value))}
                className="w-full mb-5 accent-[var(--space-brand-highlight)]"
              />

              <button
                onClick={runCluster}
                disabled={busy || !birthDate || !(photos?.length)}
                className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 ${tw.button.primary} disabled:opacity-40`}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                Gather first-days photos
              </button>

              {!(photos?.length) && (
                <p className={`text-xs mt-3 text-center ${typography.color.tertiary}`}>
                  <button onClick={() => setStep('connect')} className="underline">Connect photos</button> first
                </p>
              )}
            </div>

            {activeCluster && (
              <div className={`${tw.card.default} p-4`}>
                <p className={`text-sm font-medium ${typography.color.primary}`}>{activeCluster.title}</p>
                <p className={`text-xs ${typography.color.tertiary}`}>{clusterPhotos.length} photos clustered</p>
                <button onClick={() => setStep('album')} className={`mt-3 text-sm ${typography.color.brand} font-medium`}>
                  Review album →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ALBUM */}
        {step === 'album' && (
          <div className="space-y-5 max-w-2xl mx-auto">
            <div className="text-center mb-2">
              <h2 className={`text-lg font-semibold ${typography.color.primary}`}>
                {activeCluster?.title || 'Your first-days album'}
              </h2>
              <p className={`text-sm ${typography.color.secondary}`}>{activeCluster?.narrative}</p>
            </div>

            {orderedAlbumPhotos.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {orderedAlbumPhotos.map((p, i) => (
                  <div key={p.id} className={`group relative rounded-xl overflow-hidden ${tw.card.default}`}>
                    <img src={p.file_url} alt="" className="aspect-[4/5] w-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 justify-end">
                      <button onClick={() => movePhoto(p.id, -1)} disabled={i === 0} className="p-1 rounded bg-white/90 text-xs">←</button>
                      <button onClick={() => movePhoto(p.id, 1)} disabled={i === orderedAlbumPhotos.length - 1} className="p-1 rounded bg-white/90 text-xs">→</button>
                      <button onClick={() => removeFromAlbum(p.id)} className="p-1 rounded bg-white/90"><X className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10">
                <p className={`text-sm ${typography.color.tertiary}`}>No album yet — cluster your photos first.</p>
                <button onClick={() => setStep('cluster')} className={`mt-3 px-4 py-2 rounded-xl text-sm ${tw.button.secondary}`}>Go to clustering</button>
              </div>
            )}

            {orderedAlbumPhotos.length > 0 && (
              <button onClick={() => setStep('preview')} className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 ${tw.button.primary}`}>
                Preview frames & albums <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* PREVIEW */}
        {step === 'preview' && (
          <div className="space-y-6 max-w-3xl mx-auto">
            {/* Filters */}
            <div className="flex gap-2 justify-center">
              {(['none', 'warm', 'soft'] as PhotoFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setPhotoFilter(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize ${
                    photoFilter === f ? tw.button.primary : tw.button.ghost
                  }`}
                >
                  {f === 'none' ? 'Original' : f === 'warm' ? <><Sun className="w-3 h-3 inline" /> Warm</> : <><Contrast className="w-3 h-3 inline" /> Soft</>}
                </button>
              ))}
            </div>

            {/* Hero preview */}
            {heroPhoto && selectedProduct && (
              <div className={`${tw.card.elevated} p-6`}>
                <FrameMockup photoUrl={heroPhoto} product={selectedProduct} filter={photoFilter} />
              </div>
            )}

            {/* Gallery view */}
            {orderedAlbumPhotos.length >= 2 && (
              <div>
                <h3 className={`text-xs uppercase tracking-widest mb-3 ${typography.color.tertiary}`}>Gallery wall preview</h3>
                <GalleryWall photos={orderedAlbumPhotos.map((p) => p.file_url)} filter={photoFilter} />
              </div>
            )}

            {/* Wall photo for Christi */}
            <div className={`${tw.card.default} p-5`}>
              <div className="flex items-start gap-3">
                <LayoutGrid className={`w-5 h-5 mt-0.5 ${tw.icon.primary}`} />
                <div className="flex-1">
                  <p className={`text-sm font-medium ${typography.color.primary}`}>Plan your gallery wall</p>
                  <p className={`text-xs mt-1 ${typography.color.secondary}`}>
                    Upload a photo of your nursery wall — Christi will suggest frame sizes and layout.
                  </p>
                  <input
                    ref={wallRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleWallUpload(e.target.files[0])}
                  />
                  <button
                    onClick={() => wallRef.current?.click()}
                    disabled={busy}
                    className={`mt-3 px-4 py-2 rounded-xl text-sm ${tw.button.secondary}`}
                  >
                    <Camera className="w-4 h-4 inline mr-1" /> Upload wall photo
                  </button>
                </div>
              </div>
            </div>

            {/* Product catalog */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-xs uppercase tracking-widest ${typography.color.tertiary}`}>Keepsakes</h3>
                {productsError && (
                  <button onClick={refreshProducts} className={`text-xs flex items-center gap-1 ${typography.color.brand}`}>
                    <RefreshCw className="w-3 h-3" /> Retry
                  </button>
                )}
              </div>

              {productsLoading ? (
                <div className="flex justify-center py-10"><Loader2 className={`w-6 h-6 animate-spin ${tw.icon.muted}`} /></div>
              ) : !products?.length ? (
                <div className={`text-center py-8 ${tw.card.flat}`}>
                  <p className={`text-sm ${typography.color.tertiary}`}>Loading catalog…</p>
                  <button onClick={() => { void ensureMemoriBackend().then(refreshProducts); }} className={`mt-2 text-sm ${typography.color.brand}`}>Reload</button>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {products.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => setSelectedProduct(product)}
                      className={`text-left rounded-2xl overflow-hidden transition-all ${
                        selectedProduct?.id === product.id
                          ? 'ring-2 ring-[var(--space-brand-highlight)] shadow-lg'
                          : tw.card.default
                      }`}
                    >
                      <div className="flex">
                        <div className="w-24 shrink-0 aspect-square bg-[var(--space-surface-muted)]">
                          {product.thumbnail_url ? (
                            <img src={product.thumbnail_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Frame className={tw.icon.muted} />
                            </div>
                          )}
                        </div>
                        <div className="p-3 flex-1 min-w-0">
                          <span className={`text-[10px] uppercase tracking-wide ${typography.color.tertiary}`}>{product.product_type}</span>
                          <p className={`text-sm font-medium truncate ${typography.color.primary}`}>{product.name}</p>
                          <p className={`text-xs ${typography.color.secondary}`}>{product.dimensions}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className={`text-sm font-semibold ${typography.color.primary}`}>{formatPrice(product.price_cents)}</span>
                            <span
                              onClick={(e) => { e.stopPropagation(); addToCart(product); }}
                              className={`text-xs px-2 py-1 rounded-lg ${tw.button.primary}`}
                            >
                              Add
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <button onClick={() => setStep('checkout')} className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 ${tw.button.primary}`}>
                Continue to order · {formatPrice(cartTotal)} <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* CHECKOUT */}
        {step === 'checkout' && (
          <div className="space-y-5 max-w-lg mx-auto">
            <button onClick={() => setStep('preview')} className={`flex items-center gap-1 text-sm ${typography.color.secondary}`}>
              <ArrowLeft className="w-4 h-4" /> Back to preview
            </button>

            <div className={`${tw.card.elevated} p-6`}>
              <h2 className={`text-lg font-semibold mb-4 ${typography.color.primary}`}>Your keepsake order</h2>

              {cart.length === 0 ? (
                <div className="text-center py-6">
                  <ShoppingBag className={`w-10 h-10 mx-auto mb-3 ${tw.icon.muted}`} />
                  <p className={`text-sm ${typography.color.tertiary}`}>Your cart is empty</p>
                  <button onClick={() => setStep('preview')} className={`mt-3 px-4 py-2 rounded-xl text-sm ${tw.button.secondary}`}>Browse keepsakes</button>
                </div>
              ) : (
                <>
                  <div className="space-y-3 mb-5">
                    {cart.map((item) => (
                      <div key={item.product.id} className="flex gap-3 items-center">
                        {item.photoUrl && (
                          <img src={item.photoUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${typography.color.primary}`}>{item.product.name}</p>
                          <p className={`text-xs ${typography.color.tertiary}`}>Qty {item.quantity}</p>
                        </div>
                        <p className={`text-sm font-medium ${typography.color.primary}`}>
                          {formatPrice(item.product.price_cents * item.quantity)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-[var(--space-border-default)] pt-4 flex justify-between items-center mb-5">
                    <span className={`font-semibold ${typography.color.primary}`}>Total</span>
                    <span className={`text-xl font-semibold ${typography.color.primary}`}>{formatPrice(cartTotal)}</span>
                  </div>
                  <button
                    onClick={handleCheckout}
                    disabled={busy}
                    className={`w-full py-3.5 rounded-xl flex items-center justify-center gap-2 text-base ${tw.button.primary} disabled:opacity-50`}
                  >
                    {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShoppingBag className="w-5 h-5" />}
                    Place order
                  </button>
                  <p className={`text-[10px] text-center mt-3 ${typography.color.tertiary}`}>
                    Secure checkout via Stripe · Your album draft is saved if payment is interrupted
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
