import { useState, useRef, useMemo } from 'react';
import {
  Images,
  Upload,
  Sparkles,
  Calendar,
  Heart,
  Camera,
  Film,
  StickyNote,
  ChevronRight,
  Trash2,
  Loader2,
  BookOpen,
  Clock,
  Wand2,
  ArrowLeft,
  Plus,
  X,
  Sun,
} from 'lucide-react';
import { tw, typography } from '../../lib/colors';

/* Memory Stitches — transform scattered photos, videos, and notes into
   chronological digital albums with AI-powered auto-curation. */

interface MemoryMedia {
  id: number;
  media_type: 'photo' | 'video' | 'note';
  file_url?: string;
  title: string;
  caption?: string;
  captured_at: string;
  sentiment?: string;
  ai_summary?: string;
  stitched?: boolean;
  created_at?: string;
}

interface MemoryAlbum {
  id: number;
  title: string;
  subtitle?: string;
  description?: string;
  cover_url?: string;
  status: 'draft' | 'ready';
  item_ids?: string;
  date_start?: string;
  date_end?: string;
  narrative?: string;
  sentiment?: string;
  created_at?: string;
}

declare global {
  interface Window {
    useWorkspaceDB: <T = unknown>(
      table: string,
      options?: {
        shared?: boolean;
        limit?: number;
        offset?: number;
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
      from: (table: string) => {
        insert: (row: Record<string, unknown>) => Promise<unknown>;
        update: (id: number, row: Record<string, unknown>) => Promise<unknown>;
        delete: (id: number) => Promise<unknown>;
      };
    };
  }
}

type View = 'gather' | 'albums' | 'album-detail' | 'stitching';

async function uploadFile(file: File): Promise<string> {
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    const base64Data = await new Promise<string>((resolve, reject) => {
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await fetch('/api/upload/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData: base64Data, fileName: file.name }),
    });
    const data = await res.json();
    if (!data.success && !data.imageUrl) throw new Error(data.error || 'Upload failed');
    return data.imageUrl;
  }

  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/upload/file', { method: 'POST', body: form });
  const data = await res.json();
  if (!data.success && !data.url) throw new Error(data.error || 'Upload failed');
  return data.url;
}

async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({ base64, mimeType: file.type || 'image/jpeg' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function analyzeImage(imageUrl: string): Promise<string> {
  const imgRes = await fetch(imageUrl);
  const blob = await imgRes.blob();
  const file = new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' });
  const { base64, mimeType } = await fileToBase64(file);
  const res = await fetch('/api/generate/vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt:
        'Describe this memory in warm, sentimental language. Note the people, setting, mood, and approximate season or time of day. Keep it to 2 sentences.',
      image: base64,
      mimeType,
    }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Vision analysis failed');
  return data.result;
}

async function curateAlbums(
  mediaItems: Array<{
    id: number;
    title: string;
    media_type: string;
    captured_at: string;
    ai_summary?: string;
    caption?: string;
    sentiment?: string;
  }>,
): Promise<
  Array<{
    title: string;
    subtitle: string;
    description: string;
    narrative: string;
    sentiment: string;
    itemIds: number[];
    dateStart: string;
    dateEnd: string;
  }>
> {
  const payload = mediaItems.map((m) => ({
    id: m.id,
    type: m.media_type,
    date: m.captured_at,
    title: m.title,
    summary: m.ai_summary || m.caption || '',
    sentiment: m.sentiment || 'nostalgic',
  }));

  const res = await fetch('/proxy/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.6,
      max_tokens: 2000,
      messages: [
        {
          role: 'system',
          content: `You are a gentle memory curator for Memori Christi, a service that turns scattered photos into heirloom albums. Group the provided memories into 1-3 cohesive albums by date proximity, event, or emotional theme. Return ONLY valid JSON array with objects: { "title", "subtitle", "description", "narrative", "sentiment", "itemIds": number[], "dateStart": "ISO date", "dateEnd": "ISO date" }. Sentiment must be one of: joyful, tender, nostalgic, peaceful, celebratory. Write in warm, timeless prose.`,
        },
        {
          role: 'user',
          content: `Curate these memories into albums:\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    }),
  });

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '[]';
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Could not parse album suggestions');
  return JSON.parse(jsonMatch[0]);
}

function formatDate(iso?: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function sentimentIcon(s?: string) {
  switch (s) {
    case 'joyful':
    case 'celebratory':
      return Sun;
    case 'tender':
      return Heart;
    default:
      return Sparkles;
  }
}

export default function MemoryStitches() {
  const {
    data: media,
    loading: mediaLoading,
    error: mediaError,
    refresh: refreshMedia,
  } = window.useWorkspaceDB<MemoryMedia>('memory_media', {
    orderBy: { column: 'captured_at', direction: 'desc' },
    limit: 200,
  });

  const {
    data: albums,
    loading: albumsLoading,
    error: albumsError,
    refresh: refreshAlbums,
  } = window.useWorkspaceDB<MemoryAlbum>('memory_albums', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 50,
  });

  const [view, setView] = useState<View>('gather');
  const [selectedAlbum, setSelectedAlbum] = useState<MemoryAlbum | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stitchProgress, setStitchProgress] = useState('');
  const [noteText, setNoteText] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const unstitched = useMemo(
    () => (media || []).filter((m) => !m.stitched),
    [media],
  );

  const albumMediaMap = useMemo(() => {
    const map = new Map<number, MemoryMedia>();
    (media || []).forEach((m) => map.set(m.id, m));
    return map;
  }, [media]);

  const selectedAlbumItems = useMemo(() => {
    if (!selectedAlbum?.item_ids) return [];
    try {
      const ids: number[] = JSON.parse(selectedAlbum.item_ids);
      return ids.map((id) => albumMediaMap.get(id)).filter(Boolean) as MemoryMedia[];
    } catch {
      return [];
    }
  }, [selectedAlbum, albumMediaMap]);

  const handleUploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length || uploading) return;
    setUploading(true);
    try {
      for (const file of list) {
        const isVideo = file.type.startsWith('video/');
        const isImage = file.type.startsWith('image/');
        if (!isVideo && !isImage) continue;

        const url = await uploadFile(file);
        const capturedAt = new Date(
          file.lastModified || Date.now(),
        ).toISOString();

        await window.__workspaceDb.from('memory_media').insert({
          media_type: isVideo ? 'video' : 'photo',
          file_url: url,
          title: file.name.replace(/\.[^.]+$/, '') || 'Untitled memory',
          captured_at: capturedAt,
          stitched: false,
        });
      }
      refreshMedia();
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleAddNote = async () => {
    const title = noteTitle.trim() || 'A written memory';
    const caption = noteText.trim();
    if (!caption || busy) return;
    setBusy(true);
    try {
      await window.__workspaceDb.from('memory_media').insert({
        media_type: 'note',
        title,
        caption,
        captured_at: new Date().toISOString(),
        sentiment: 'tender',
        stitched: false,
      });
      setNoteText('');
      setNoteTitle('');
      setShowNoteForm(false);
      refreshMedia();
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteMedia = async (id: number) => {
    await window.__workspaceDb.from('memory_media').delete(id);
    refreshMedia();
  };

  const handleDeleteAlbum = async (id: number) => {
    await window.__workspaceDb.from('memory_albums').delete(id);
    if (selectedAlbum?.id === id) {
      setSelectedAlbum(null);
      setView('albums');
    }
    refreshAlbums();
  };

  const handleStitch = async () => {
    if (unstitched.length === 0 || busy) return;
    setBusy(true);
    setView('stitching');
    setStitchProgress('Reading your memories…');

    try {
      const enriched = [...unstitched];

      for (let i = 0; i < enriched.length; i++) {
        const item = enriched[i];
        if (item.media_type === 'photo' && item.file_url && !item.ai_summary) {
          setStitchProgress(`Understanding photo ${i + 1} of ${enriched.length}…`);
          try {
            const summary = await analyzeImage(item.file_url);
            await window.__workspaceDb.from('memory_media').update(item.id, {
              ai_summary: summary,
              sentiment: item.sentiment || 'nostalgic',
            });
            enriched[i] = { ...item, ai_summary: summary };
          } catch {
            /* continue without vision */
          }
        }
      }

      refreshMedia();
      setStitchProgress('Weaving moments into albums…');

      const suggestions = await curateAlbums(enriched);

      for (const album of suggestions) {
        const coverItem = enriched.find(
          (m) => album.itemIds.includes(m.id) && m.file_url,
        );
        await window.__workspaceDb.from('memory_albums').insert({
          title: album.title,
          subtitle: album.subtitle,
          description: album.description,
          narrative: album.narrative,
          sentiment: album.sentiment,
          status: 'draft',
          item_ids: JSON.stringify(album.itemIds),
          date_start: album.dateStart,
          date_end: album.dateEnd,
          cover_url: coverItem?.file_url || '',
        });

        for (const id of album.itemIds) {
          await window.__workspaceDb.from('memory_media').update(id, {
            stitched: true,
          });
        }
      }

      refreshMedia();
      refreshAlbums();
      setView('albums');
    } catch (err) {
      console.error('Stitch failed:', err);
      setStitchProgress('Something went wrong. Your memories are safe — try again.');
      setTimeout(() => setView('gather'), 2500);
    } finally {
      setBusy(false);
      setStitchProgress('');
    }
  };

  const openAlbum = (album: MemoryAlbum) => {
    setSelectedAlbum(album);
    setView('album-detail');
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) {
      handleUploadFiles(e.dataTransfer.files);
    }
  };

  const MediaIcon = ({ type }: { type: string }) => {
    if (type === 'video') return <Film className="w-4 h-4" />;
    if (type === 'note') return <StickyNote className="w-4 h-4" />;
    return <Camera className="w-4 h-4" />;
  };

  return (
    <div className="min-h-full flex flex-col w-full bg-transparent">
      {/* Decorative paper grain overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03] mix-blend-multiply"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Header */}
      <header className="relative px-5 pt-4 pb-3 border-b border-[var(--space-border-default)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {view === 'album-detail' && selectedAlbum ? (
              <button
                onClick={() => {
                  setView('albums');
                  setSelectedAlbum(null);
                }}
                className={`flex items-center gap-1.5 text-sm mb-1 ${typography.color.secondary} hover:opacity-80 transition-opacity`}
              >
                <ArrowLeft className="w-4 h-4" /> All albums
              </button>
            ) : (
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-8 h-8 rounded-xl ${tw.bg.accent} flex items-center justify-center`}>
                  <Images className={`w-4 h-4 ${tw.icon.primary}`} />
                </span>
                <p className={`text-xs uppercase tracking-widest ${typography.color.tertiary}`}>
                  Memori Christi
                </p>
              </div>
            )}
            <h1 className={`text-xl font-semibold ${typography.color.primary}`} style={{ fontFamily: typography.fontFamily }}>
              {view === 'album-detail' && selectedAlbum
                ? selectedAlbum.title
                : 'Memory Stitches'}
            </h1>
            <p className={`text-sm mt-0.5 ${typography.color.secondary}`}>
              {view === 'album-detail' && selectedAlbum
                ? selectedAlbum.subtitle || 'A curated chapter of your story'
                : 'Where scattered moments become heirloom albums'}
            </p>
          </div>

          {view !== 'album-detail' && view !== 'stitching' && (
            <nav className="flex gap-1 shrink-0">
              {(['gather', 'albums'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setView(tab)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    view === tab
                      ? `${tw.button.primary} shadow-sm`
                      : `${tw.button.ghost} ${typography.color.secondary}`
                  }`}
                >
                  {tab === 'gather' ? 'Gather' : 'Albums'}
                </button>
              ))}
            </nav>
          )}
        </div>
      </header>

      {/* Stitching overlay */}
      {view === 'stitching' && (
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 text-center">
          <div className={`w-16 h-16 rounded-2xl ${tw.bg.accent} flex items-center justify-center mb-6 animate-pulse`}>
            <Wand2 className={`w-7 h-7 ${tw.icon.primary}`} />
          </div>
          <h2 className={`text-lg font-semibold mb-2 ${typography.color.primary}`}>
            Stitching your story…
          </h2>
          <p className={`text-sm ${typography.color.secondary} max-w-xs`}>
            {stitchProgress || 'AI is arranging your memories by date, event, and feeling.'}
          </p>
          <Loader2 className={`w-5 h-5 mt-6 animate-spin ${tw.icon.muted}`} />
        </div>
      )}

      {/* Gather view */}
      {view === 'gather' && (
        <div className="flex-1 overflow-y-auto">
          {/* Stats row */}
          <div className="px-5 py-4 grid grid-cols-3 gap-3">
            {[
              { label: 'Loose memories', value: unstitched.length, icon: Images },
              { label: 'Albums woven', value: (albums || []).length, icon: BookOpen },
              { label: 'Ready to stitch', value: unstitched.length >= 2 ? 'Yes' : unstitched.length, icon: Sparkles },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className={`${tw.card.default} p-3 rounded-xl`}>
                <Icon className={`w-4 h-4 mb-2 ${tw.icon.primary}`} />
                <p className={`text-lg font-semibold ${typography.color.primary}`}>{value}</p>
                <p className={`text-[11px] ${typography.color.tertiary}`}>{label}</p>
              </div>
            ))}
          </div>

          {/* Drop zone */}
          <div className="px-5 pb-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-300 ${
                dragOver
                  ? 'border-[var(--space-brand-primary)] bg-[var(--space-surface-accent-soft)] scale-[1.01]'
                  : 'border-[var(--space-border-strong)] hover:border-[var(--space-brand-primary-500)] hover:bg-[var(--space-surface-muted)]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && handleUploadFiles(e.target.files)}
              />
              <div className={`w-12 h-12 mx-auto mb-3 rounded-xl ${tw.bg.muted} flex items-center justify-center`}>
                {uploading ? (
                  <Loader2 className={`w-5 h-5 animate-spin ${tw.icon.primary}`} />
                ) : (
                  <Upload className={`w-5 h-5 ${tw.icon.primary}`} />
                )}
              </div>
              <p className={`text-sm font-medium ${typography.color.primary}`}>
                Drop photos & videos here
              </p>
              <p className={`text-xs mt-1 ${typography.color.tertiary}`}>
                or click to browse — each memory is saved to your keepsake box
              </p>
            </div>

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setShowNoteForm(!showNoteForm)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm ${tw.button.secondary}`}
              >
                <StickyNote className="w-4 h-4" /> Add a written memory
              </button>
              <button
                onClick={handleStitch}
                disabled={unstitched.length < 2 || busy}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm ${tw.button.primary} disabled:opacity-40`}
              >
                <Wand2 className="w-4 h-4" />
                Stitch into album{unstitched.length >= 2 ? '' : ' (need 2+)'}
              </button>
            </div>
          </div>

          {/* Note form */}
          {showNoteForm && (
            <div className={`mx-5 mb-4 p-4 rounded-xl ${tw.card.default}`}>
              <div className="flex items-center justify-between mb-3">
                <p className={`text-sm font-medium ${typography.color.primary}`}>Write a memory</p>
                <button onClick={() => setShowNoteForm(false)} className={tw.button.ghost}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <input
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Title (optional)"
                className={`${tw.input.base} ${tw.input.default} mb-2 text-sm py-2`}
              />
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="What do you remember? A moment, a feeling, a detail worth keeping…"
                rows={3}
                className={`${tw.input.base} ${tw.input.default} text-sm py-2 resize-none`}
              />
              <button
                onClick={handleAddNote}
                disabled={!noteText.trim() || busy}
                className={`mt-2 w-full py-2 rounded-lg text-sm ${tw.button.primary} disabled:opacity-40`}
              >
                Save memory
              </button>
            </div>
          )}

          {/* Media grid */}
          <div className="px-5 pb-6">
            {mediaLoading ? (
              <div className="flex flex-col items-center py-14 gap-3">
                <Loader2 className={`w-7 h-7 animate-spin ${tw.icon.muted}`} />
                <p className={`text-sm ${typography.color.tertiary}`}>Opening your keepsake box…</p>
              </div>
            ) : mediaError ? (
              <div className="text-center py-14">
                <p className={`text-sm ${typography.color.danger}`}>
                  Couldn't load memories: {mediaError.message}
                </p>
                <button onClick={refreshMedia} className={`mt-3 px-3 py-1.5 text-sm rounded-lg ${tw.button.secondary}`}>
                  Try again
                </button>
              </div>
            ) : !media?.length ? (
              <div className="flex flex-col items-center py-14 gap-3 text-center">
                <div className={`w-14 h-14 rounded-2xl ${tw.bg.muted} flex items-center justify-center`}>
                  <Images className={`w-6 h-6 ${tw.icon.muted}`} />
                </div>
                <p className={`text-sm font-medium ${typography.color.primary}`}>Your keepsake box is empty</p>
                <p className={`text-xs max-w-xs ${typography.color.tertiary}`}>
                  Upload photos, videos, or jot down a note. When you have a few loose memories, stitch them into a beautiful album.
                </p>
              </div>
            ) : (
              <>
                <p className={`text-xs mb-3 ${typography.color.tertiary}`}>
                  {unstitched.length} waiting to be stitched · {(media.length - unstitched.length)} already woven
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {media.map((item) => (
                    <div
                      key={item.id}
                      className={`group relative rounded-xl overflow-hidden ${tw.card.default} transition-all hover:shadow-md`}
                    >
                      <div className="aspect-[4/5] relative bg-[var(--space-surface-muted)]">
                        {item.media_type === 'photo' && item.file_url ? (
                          <img
                            src={item.file_url}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        ) : item.media_type === 'video' && item.file_url ? (
                          <video
                            src={item.file_url}
                            className="w-full h-full object-cover"
                            muted
                          />
                        ) : (
                          <div className="w-full h-full p-4 flex flex-col justify-center">
                            <StickyNote className={`w-6 h-6 mb-2 ${tw.icon.primary}`} />
                            <p className={`text-xs line-clamp-4 ${typography.color.secondary}`}>
                              {item.caption || item.title}
                            </p>
                          </div>
                        )}

                        {item.stitched && (
                          <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] ${tw.badge.primary}`}>
                            Woven
                          </span>
                        )}

                        <button
                          onClick={() => handleDeleteMedia(item.id)}
                          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Remove memory"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="p-2.5">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <MediaIcon type={item.media_type} />
                          <span className={`text-xs font-medium truncate ${typography.color.primary}`}>
                            {item.title}
                          </span>
                        </div>
                        <p className={`text-[10px] flex items-center gap-1 ${typography.color.tertiary}`}>
                          <Clock className="w-3 h-3" />
                          {formatDate(item.captured_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Albums view */}
      {view === 'albums' && (
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {albumsLoading ? (
            <div className="flex flex-col items-center py-14 gap-3">
              <Loader2 className={`w-7 h-7 animate-spin ${tw.icon.muted}`} />
              <p className={`text-sm ${typography.color.tertiary}`}>Loading albums…</p>
            </div>
          ) : albumsError ? (
            <div className="text-center py-14">
              <p className={`text-sm ${typography.color.danger}`}>{albumsError.message}</p>
              <button onClick={refreshAlbums} className={`mt-3 px-3 py-1.5 text-sm rounded-lg ${tw.button.secondary}`}>
                Try again
              </button>
            </div>
          ) : !albums?.length ? (
            <div className="flex flex-col items-center py-16 gap-4 text-center">
              <div className={`w-16 h-16 rounded-2xl ${tw.bg.accent} flex items-center justify-center`}>
                <BookOpen className={`w-7 h-7 ${tw.icon.primary}`} />
              </div>
              <div>
                <p className={`text-sm font-medium ${typography.color.primary}`}>No albums yet</p>
                <p className={`text-xs mt-1 max-w-xs ${typography.color.tertiary}`}>
                  Gather a few photos, videos, or notes, then tap "Stitch into album" — AI will weave them into a chronological story.
                </p>
              </div>
              <button
                onClick={() => setView('gather')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm ${tw.button.primary}`}
              >
                <Plus className="w-4 h-4" /> Start gathering
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {(albums || []).map((album) => {
                const SentIcon = sentimentIcon(album.sentiment);
                let itemCount = 0;
                try {
                  itemCount = JSON.parse(album.item_ids || '[]').length;
                } catch {
                  /* ignore */
                }
                return (
                  <button
                    key={album.id}
                    onClick={() => openAlbum(album)}
                    className={`w-full text-left rounded-2xl overflow-hidden ${tw.card.default} hover:shadow-lg transition-all duration-300 group`}
                  >
                    <div className="flex">
                      <div className="w-28 sm:w-36 shrink-0 aspect-[3/4] bg-[var(--space-surface-muted)] relative overflow-hidden">
                        {album.cover_url ? (
                          <img
                            src={album.cover_url}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <BookOpen className={`w-8 h-8 ${tw.icon.muted}`} />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                      </div>
                      <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] ${tw.badge.neutral}`}>
                              {album.status === 'draft' ? 'Draft' : 'Ready'}
                            </span>
                            {album.sentiment && (
                              <span className={`flex items-center gap-1 text-[10px] ${typography.color.tertiary}`}>
                                <SentIcon className="w-3 h-3" /> {album.sentiment}
                              </span>
                            )}
                          </div>
                          <h3 className={`font-semibold truncate ${typography.color.primary}`}>{album.title}</h3>
                          {album.subtitle && (
                            <p className={`text-xs mt-0.5 truncate ${typography.color.secondary}`}>
                              {album.subtitle}
                            </p>
                          )}
                          {album.description && (
                            <p className={`text-xs mt-2 line-clamp-2 ${typography.color.tertiary}`}>
                              {album.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <span className={`text-[11px] flex items-center gap-1 ${typography.color.tertiary}`}>
                            <Calendar className="w-3 h-3" />
                            {formatDate(album.date_start)}
                            {album.date_end && album.date_end !== album.date_start && (
                              <> – {formatDate(album.date_end)}</>
                            )}
                            · {itemCount} memories
                          </span>
                          <ChevronRight className={`w-4 h-4 ${tw.icon.muted} group-hover:translate-x-0.5 transition-transform`} />
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Album detail view */}
      {view === 'album-detail' && selectedAlbum && (
        <div className="flex-1 overflow-y-auto">
          {/* Cover hero */}
          <div className="relative h-48 sm:h-56 overflow-hidden">
            {selectedAlbum.cover_url ? (
              <img
                src={selectedAlbum.cover_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className={`w-full h-full ${tw.bg.muted}`} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
              {selectedAlbum.sentiment && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 text-xs mb-2 backdrop-blur-sm">
                  {(() => {
                    const Icon = sentimentIcon(selectedAlbum.sentiment);
                    return <Icon className="w-3 h-3" />;
                  })()}
                  {selectedAlbum.sentiment}
                </span>
              )}
              <p className="text-sm opacity-90">{selectedAlbum.subtitle}</p>
            </div>
          </div>

          {/* Narrative */}
          {selectedAlbum.narrative && (
            <div className={`mx-5 -mt-6 relative z-10 p-5 rounded-2xl ${tw.card.elevated}`}>
              <p className={`text-sm leading-relaxed italic ${typography.color.secondary}`}>
                "{selectedAlbum.narrative}"
              </p>
            </div>
          )}

          {selectedAlbum.description && (
            <p className={`px-5 pt-4 text-sm ${typography.color.secondary}`}>
              {selectedAlbum.description}
            </p>
          )}

          {/* Timeline */}
          <div className="px-5 py-6">
            <h3 className={`text-xs uppercase tracking-widest mb-4 ${typography.color.tertiary}`}>
              Timeline
            </h3>
            <div className="relative">
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-[var(--space-border-strong)]" />
              <div className="space-y-6">
                {selectedAlbumItems.length === 0 ? (
                  <p className={`text-sm pl-10 ${typography.color.tertiary}`}>No memories in this album.</p>
                ) : (
                  selectedAlbumItems
                    .sort(
                      (a, b) =>
                        new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime(),
                    )
                    .map((item) => (
                      <div key={item.id} className="relative pl-10">
                        <div className={`absolute left-0 w-[30px] h-[30px] rounded-full ${tw.bg.accent} flex items-center justify-center border-2 border-[var(--space-surface-card)]`}>
                          <MediaIcon type={item.media_type} />
                        </div>
                        <div className={`rounded-xl overflow-hidden ${tw.card.default}`}>
                          {item.file_url && item.media_type === 'photo' && (
                            <img
                              src={item.file_url}
                              alt={item.title}
                              className="w-full max-h-48 object-cover"
                            />
                          )}
                          {item.file_url && item.media_type === 'video' && (
                            <video
                              src={item.file_url}
                              controls
                              className="w-full max-h-48"
                            />
                          )}
                          <div className="p-3">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <p className={`text-sm font-medium ${typography.color.primary}`}>
                                {item.title}
                              </p>
                              <span className={`text-[10px] shrink-0 ${typography.color.tertiary}`}>
                                {formatDate(item.captured_at)}
                              </span>
                            </div>
                            {(item.ai_summary || item.caption) && (
                              <p className={`text-xs leading-relaxed ${typography.color.secondary}`}>
                                {item.ai_summary || item.caption}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>

          <div className="px-5 pb-6 flex gap-2">
            <button
              onClick={() => setView('gather')}
              className={`flex-1 py-2.5 rounded-xl text-sm ${tw.button.secondary}`}
            >
              Add more memories
            </button>
            <button
              onClick={() => handleDeleteAlbum(selectedAlbum.id)}
              className={`px-4 py-2.5 rounded-xl text-sm ${tw.button.ghost} ${typography.color.danger}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
