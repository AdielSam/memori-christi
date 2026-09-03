/**
 * Memori Christi — API helpers, server hook bootstrap, MCP tool registration.
 */

const WORKSPACE_NUMERIC = '226048';
const WORKSPACE_ID =
  (typeof window !== 'undefined' && (window as any).__WORKSPACE_ID__) ||
  `workspace-${WORKSPACE_NUMERIC}`;

export const PRODUCT_SEED = [
  {
    sku: 'FRAME-8X10-WALNUT',
    name: 'Heritage Walnut Frame',
    product_type: 'frame',
    dimensions: '8×10 in',
    price_cents: 8900,
    thumbnail_url:
      'https://images.unsplash.com/photo-1513519245088-0e12902e35ca?w=400&h=500&fit=crop',
    description: 'Solid walnut moulding with museum-quality mat — our signature frame.',
    frame_style: 'walnut',
  },
  {
    sku: 'FRAME-5X7-IVORY',
    name: 'Classic Ivory Frame',
    product_type: 'frame',
    dimensions: '5×7 in',
    price_cents: 5900,
    thumbnail_url:
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=500&fit=crop',
    description: 'Soft ivory finish — perfect for nursery gallery walls.',
    frame_style: 'ivory',
  },
  {
    sku: 'FRAME-11X14-GOLD',
    name: 'Gallery Gold Frame',
    product_type: 'frame',
    dimensions: '11×14 in',
    price_cents: 11900,
    thumbnail_url:
      'https://images.unsplash.com/photo-1618220179428-22790bb461c5?w=400&h=500&fit=crop',
    description: 'Statement size with antique gold leaf — the hero of any wall.',
    frame_style: 'gold',
  },
  {
    sku: 'ALBUM-LINEN-FIRST-DAYS',
    name: 'First Days Linen Album',
    product_type: 'album',
    dimensions: '10×10 in · 30 pages',
    price_cents: 12900,
    thumbnail_url:
      'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&h=500&fit=crop',
    description: 'Linen-bound layflat album for the hospital-to-home story.',
    frame_style: 'linen',
  },
  {
    sku: 'ALBUM-LEATHER-HEIRLOOM',
    name: 'Heirloom Leather Album',
    product_type: 'album',
    dimensions: '12×12 in · 50 pages',
    price_cents: 19900,
    thumbnail_url:
      'https://images.unsplash.com/photo-1456513080920-11dd5aa0cc85?w=400&h=500&fit=crop',
    description: 'Full-grain leather with archival pages — built to last generations.',
    frame_style: 'leather',
  },
  {
    sku: 'SET-GALLERY-TRIO',
    name: 'Gallery Wall Trio',
    product_type: 'set',
    dimensions: '8×10 + two 5×7',
    price_cents: 14900,
    thumbnail_url:
      'https://images.unsplash.com/photo-1513694203232-719a280e0f87?w=400&h=500&fit=crop',
    description: 'Three coordinated frames — the nursery gallery starter set.',
    frame_style: 'walnut',
  },
];

export interface Product {
  id: number;
  sku: string;
  name: string;
  product_type: string;
  dimensions: string;
  price_cents: number;
  thumbnail_url?: string;
  description?: string;
  frame_style?: string;
}

export async function uploadImage(file: File): Promise<string> {
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

export async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve({ base64: result.split(',')[1], mimeType: file.type || 'image/jpeg' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function getPaymentAppId(): string {
  const w = window as Window & { __APP_ID__?: string; __SPACE_ID__?: string };
  return w.__APP_ID__ || w.__SPACE_ID__ || WORKSPACE_ID;
}

/** Recover the visitor's workspace session id the same way SpaceRuntimeContext does. */
export function getSessionId(): string | null {
  try {
    const stored = localStorage.getItem(`space_session_workspace-${WORKSPACE_NUMERIC}`);
    if (stored) {
      const session = JSON.parse(stored);
      const id = session.workspaceSessionId || session.sessionId || session.id;
      if (id) return String(id);
    }
    const ssId = sessionStorage.getItem('space_session_id');
    if (ssId) return ssId;
  } catch {
    return null;
  }
  return null;
}

export function getWorkspaceDbToken(): string | null {
  const ws = (window as any).__workspaceDb as { token?: string } | undefined;
  return ws?.token ? String(ws.token) : null;
}

/** Stable OAuth redirect URI for this app (register this exact URI in Google Cloud Console). */
export function getOAuthRedirectUri(): string {
  return window.location.origin + window.location.pathname;
}

export async function startCheckout(opts: {
  amount: number;
  productName: string;
  productDescription?: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}): Promise<{ checkoutUrl?: string; success?: boolean; error?: string }> {
  const res = await fetch('/api/payments/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Id': getPaymentAppId(),
    },
    body: JSON.stringify({
      amount: opts.amount,
      productName: opts.productName,
      productDescription: opts.productDescription,
      customerEmail: opts.customerEmail,
      successUrl: `${window.location.origin}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: window.location.href,
      metadata: opts.metadata,
    }),
  });
  return res.json();
}

const HOOK_DEFINITIONS: Array<{ name: string; description: string; code: string }> = [
  {
    name: 'browse-product-catalog',
    description: 'Returns frame and album products for Memori Christi',
    code: `const { productType, size } = request.body || {};
let sql = "SELECT * FROM products WHERE active = true AND session_id IS NULL";
const result = await db.rawQuery(sql);
let products = result.rows || [];
if (productType) {
  products = products.filter((p) => p.product_type === productType);
}
if (size) {
  const s = String(size).toLowerCase();
  products = products.filter((p) => String(p.dimensions || '').toLowerCase().includes(s));
}
respond(200, { products, count: products.length });`,
  },
  {
    name: 'get-photo-cluster',
    description: 'Returns AI-clustered birth photos for an event date',
    code: `const { eventDate, windowDays } = request.body || {};
let cluster = null;
if (eventDate) {
  const found = await db.query('photo_clusters', { where: { event_date: eventDate }, limit: 1 });
  cluster = found.rows[0] || null;
} else {
  const found = await db.query('photo_clusters', {
    orderBy: [{ column: 'created_at', direction: 'desc' }],
    limit: 1,
  });
  cluster = found.rows[0] || null;
}
if (!cluster) {
  respond(200, {
    cluster: null,
    photos: [],
    message: 'No birth photo cluster yet. Connect photos and set a birth date in the app.',
  });
} else {
  const ids = JSON.parse(cluster.photo_ids || '[]');
  const all = await db.query('photo_media', { limit: 200 });
  const photos = (all.rows || []).filter((p) => ids.includes(p.id));
  respond(200, { cluster, photos, count: photos.length, windowDays: cluster.window_days || 7 });
}`,
  },
  {
    name: 'analyze-wall-photo',
    description: 'Analyzes a wall photo and suggests gallery arrangement',
    code: `const { imageUrl } = request.body || {};
if (!imageUrl) {
  respond(400, { error: 'imageUrl is required' });
} else {
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error('Could not fetch wall photo');
    const arrayBuffer = await imgRes.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';

    const catalog = await db.rawQuery(
      "SELECT sku, name, product_type, dimensions, price_cents, frame_style FROM products WHERE active = true AND session_id IS NULL"
    );
    const products = catalog.rows || [];

    const visionRes = await fetch('/api/generate/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Assess this wall photo for a nursery gallery. Note wall color, available space, lighting quality, and obstacles. If too dark or blurry, say so. Reply in 2 sentences.',
        image: base64,
        mimeType,
      }),
    });
    const visionData = await visionRes.json();
    const wallAssessment = visionData.result || visionData.error || 'Unable to analyze wall.';

    if (/too dark|blurry|cannot see|unable to/i.test(wallAssessment)) {
      respond(200, {
        success: false,
        summary: "I couldn't quite make out your wall — try a brighter photo with the full wall visible.",
        wallAssessment,
        suggestion: null,
      });
    } else {
      const ai = await platform.generateText({
        model: 'gpt-4o-mini',
        systemPrompt: 'You are Christi, gallery expert for Memori Christi frames. Return ONLY valid JSON.',
        userPrompt: 'Wall analysis: ' + wallAssessment + '\\n\\nProducts: ' + JSON.stringify(products) + '\\n\\nSuggest a specific gallery wall. JSON shape: { "layout": "description", "frames": [{"sku","name","dimensions","quantity","position"}], "spacing": "inches between frames", "summary": "warm 2-sentence recommendation" }',
      });
      let suggestion = null;
      let summary = 'A beautiful gallery arrangement for your nursery wall.';
      try {
        const match = (ai.text || '').match(/\\{[\\s\\S]*\\}/);
        if (match) {
          suggestion = JSON.parse(match[0]);
          summary = suggestion.summary || summary;
        }
      } catch (e) {
        summary = ai.text || summary;
      }
      await db.insert('gallery_suggestions', {
        wall_photo_url: imageUrl,
        suggestion_json: JSON.stringify(suggestion || { raw: ai.text }),
        summary,
      });
      respond(200, { success: true, summary, suggestion, wallAssessment, products });
    }
  } catch (err) {
    respond(200, {
      success: false,
      summary: 'Something went wrong analyzing your wall. Try a clearer, well-lit photo.',
      error: String(err),
    });
  }
}`,
  },
  {
    name: 'cluster-birth-photos',
    description: 'Clusters photos around a birth date',
    code: `const { birthDate, windowDays = 7 } = request.body || {};
if (!birthDate) {
  respond(400, { error: 'birthDate is required (YYYY-MM-DD)' });
} else {
  const birth = new Date(birthDate);
  const start = new Date(birth);
  start.setDate(start.getDate() - Number(windowDays));
  const end = new Date(birth);
  end.setDate(end.getDate() + Number(windowDays));

  const all = await db.query('photo_media', { limit: 500 });
  const photos = (all.rows || []).filter((p) => {
    const d = new Date(p.exif_date || p.captured_at);
    return d >= start && d <= end;
  });

  if (photos.length === 0) {
    respond(200, {
      success: false,
      message: 'No photos found near that date. Try widening the window or uploading more photos.',
      photos: [],
    });
  } else {
    const ids = photos.map((p) => p.id);
    const cover = photos.find((p) => p.file_url) || photos[0];
    const title = 'First Days — ' + birthDate;
    const narrative = photos.length + ' precious moments from the first days together.';

    const existing = await db.query('photo_clusters', { where: { event_date: birthDate }, limit: 1 });
    let cluster;
    if (existing.rowCount > 0) {
      cluster = (await db.update('photo_clusters', { id: existing.rows[0].id }, {
        title,
        window_days: windowDays,
        photo_ids: JSON.stringify(ids),
        cover_url: cover.file_url,
        narrative,
        status: 'draft',
      })).updatedRows[0];
    } else {
      cluster = (await db.insert('photo_clusters', {
        event_date: birthDate,
        window_days: windowDays,
        title,
        photo_ids: JSON.stringify(ids),
        cover_url: cover.file_url,
        narrative,
        status: 'draft',
      })).insertedRows[0];
    }

    for (const p of photos) {
      await db.update('photo_media', { id: p.id }, { in_cluster: true, cluster_id: cluster.id });
    }

    respond(200, { success: true, cluster, photos, count: photos.length });
  }
}`,
  },
  {
    name: 'google-photos-auth',
    description: 'Google Photos OAuth (Picker API): connect, token exchange, photo import with creation dates (v2)',
    code: `const body = request.body || {};
const action = body.action || (request.query && request.query.action) || 'status';
const sessionId = body.sessionId ? String(body.sessionId) : null;
const wsToken = body.wsToken ? String(body.wsToken) : null;

const SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
const PICKER_BASE = 'https://photospicker.googleapis.com/v1';

function parseMeta(row) {
  if (!row || !row.metadata) return {};
  try { return JSON.parse(row.metadata) || {}; } catch (e) { return {}; }
}

async function getClientId() {
  const r = await db.query('app_settings', { where: { setting_key: 'google_photos_client_id' }, limit: 1 });
  const v = r.rows[0] && r.rows[0].setting_value;
  return v ? String(v).trim() : null;
}

async function getSourceRow() {
  if (sessionId) {
    const r = await db.query('photo_sources', {
      where: [
        { column: 'provider', operator: '=', value: 'google_photos' },
        { column: 'session_id', operator: '=', value: sessionId },
      ],
      limit: 1,
    });
    if (r.rows[0]) return r.rows[0];
  }
  const r2 = await db.query('photo_sources', {
    where: [
      { column: 'provider', operator: '=', value: 'google_photos' },
      { column: 'session_id', operator: 'IS NULL' },
    ],
    limit: 1,
  });
  return r2.rows[0] || null;
}

async function saveMeta(row, patch, extra) {
  const meta = Object.assign({}, parseMeta(row), patch);
  const data = Object.assign({ metadata: JSON.stringify(meta) }, extra || {});
  const res = await db.update('photo_sources', { id: row.id }, data);
  return res.updatedRows[0];
}

async function googleTokenRequest(form) {
  if (!wsToken) throw new Error('Missing workspace token. Reload the app and try again.');
  const res = await fetch('/api/workspaces/' + workspaceId + '/secrets/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': wsToken },
    body: JSON.stringify({ method: 'POST', url: 'https://oauth2.googleapis.com/token', form: form }),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data && typeof data.error === 'string' ? data.error : 'Secrets proxy request failed';
    throw new Error(msg);
  }
  let payload = data.body;
  if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch (e) {} }
  if (data.status >= 400) {
    const detail = payload && (payload.error_description || payload.error)
      ? (payload.error_description || payload.error)
      : JSON.stringify(payload);
    throw new Error('Google rejected the request: ' + detail);
  }
  return payload || {};
}

async function getValidAccessToken(row) {
  const meta = parseMeta(row);
  if (meta.access_token && meta.expires_at && Date.now() < Number(meta.expires_at) - 60000) {
    return meta.access_token;
  }
  if (!meta.refresh_token) throw new Error('Google Photos is not connected. Connect it first.');
  const clientId = await getClientId();
  if (!clientId) throw new Error('Google Photos setup incomplete: missing OAuth client ID.');
  const tokens = await googleTokenRequest({
    client_id: clientId,
    client_secret: '{{secrets.GOOGLE_PHOTOS_CLIENT_SECRET}}',
    refresh_token: meta.refresh_token,
    grant_type: 'refresh_token',
  });
  if (!tokens.access_token) throw new Error('Token refresh failed. Reconnect Google Photos.');
  await saveMeta(row, {
    access_token: tokens.access_token,
    expires_at: Date.now() + (Number(tokens.expires_in) || 3600) * 1000,
  });
  return tokens.access_token;
}

if (action === 'status') {
  const row = await getSourceRow();
  const meta = parseMeta(row);
  const clientId = await getClientId();
  respond(200, {
    connected: !!(row && row.status === 'connected' && meta.refresh_token),
    status: row ? row.status : 'disconnected',
    provider: 'google_photos',
    clientIdConfigured: !!clientId,
  });
} else if (action === 'set-client-id') {
  const clientIdValue = String(body.clientId || '').trim();
  if (!clientIdValue) {
    respond(400, { error: 'clientId is required' });
  } else {
    const existing = await db.query('app_settings', { where: { setting_key: 'google_photos_client_id' }, limit: 1 });
    if (existing.rows[0]) {
      await db.update('app_settings', { id: existing.rows[0].id }, { setting_value: clientIdValue });
    } else {
      await db.insert('app_settings', { setting_key: 'google_photos_client_id', setting_value: clientIdValue });
    }
    respond(200, { success: true });
  }
} else if (action === 'init') {
  const redirectUri = String(body.redirectUri || '').trim();
  const clientId = await getClientId();
  if (!redirectUri) {
    respond(400, { error: 'redirectUri is required' });
  } else if (!clientId) {
    respond(200, {
      setupRequired: true,
      redirectUri: redirectUri,
      error: 'Google Photos is not configured yet. The workspace owner needs to add the Google OAuth client ID and secret first.',
    });
  } else {
    const state = 'gp_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    const row = await getSourceRow();
    const patch = { state: state, redirect_uri: redirectUri };
    if (row && row.session_id === sessionId) {
      await saveMeta(row, patch, {
        status: row.status === 'connected' ? 'connected' : 'pending',
        error_message: null,
      });
    } else {
      const insertData = {
        provider: 'google_photos',
        status: 'pending',
        metadata: JSON.stringify(patch),
      };
      if (sessionId) insertData.session_id = sessionId;
      await db.insert('photo_sources', insertData);
    }
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth' +
      '?client_id=' + encodeURIComponent(clientId) +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&response_type=code' +
      '&scope=' + encodeURIComponent(SCOPE) +
      '&access_type=offline' +
      '&prompt=consent' +
      '&state=' + encodeURIComponent(state);
    respond(200, { success: true, authUrl: authUrl });
  }
} else if (action === 'exchange') {
  const code = String(body.code || '');
  const state = String(body.state || '');
  const clientId = await getClientId();
  const row = await getSourceRow();
  const meta = parseMeta(row);
  if (!code) {
    respond(400, { error: 'code is required' });
  } else if (!clientId) {
    respond(200, { setupRequired: true, error: 'Missing Google OAuth client ID. Ask the workspace owner to finish setup.' });
  } else if (!row || !meta.state || meta.state !== state) {
    respond(400, { error: 'Sign-in session expired or mismatched. Please tap Connect Google Photos again.' });
  } else {
    const redirectUri = String(body.redirectUri || meta.redirect_uri || '');
    try {
      const tokens = await googleTokenRequest({
        code: code,
        client_id: clientId,
        client_secret: '{{secrets.GOOGLE_PHOTOS_CLIENT_SECRET}}',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      });
      if (!tokens.access_token) throw new Error('Google did not return an access token.');
      await saveMeta(row, {
        state: null,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || meta.refresh_token || null,
        expires_at: Date.now() + (Number(tokens.expires_in) || 3600) * 1000,
        scopes: [SCOPE],
        redirect_uri: redirectUri,
        mode: 'oauth',
      }, {
        status: 'connected',
        connected_at: new Date().toISOString(),
        error_message: null,
      });
      respond(200, { success: true, message: 'Google Photos connected! Now import the photos you want.' });
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      await db.update('photo_sources', { id: row.id }, { status: 'error', error_message: msg });
      respond(200, { success: false, error: msg, setupRequired: msg.indexOf('GOOGLE_PHOTOS_CLIENT_SECRET') >= 0 });
    }
  }
} else if (action === 'disconnect') {
  const row = await getSourceRow();
  if (row) {
    await db.update('photo_sources', { id: row.id }, {
      status: 'disconnected',
      error_message: null,
      metadata: JSON.stringify({ mode: 'oauth' }),
    });
  }
  respond(200, { success: true, status: 'disconnected' });
} else if (action === 'picker-init') {
  const row = await getSourceRow();
  try {
    if (!row) throw new Error('Google Photos is not connected yet.');
    const token = await getValidAccessToken(row);
    const res = await fetch(PICKER_BASE + '/sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const sess = await res.json();
    if (!res.ok || !sess.pickerUri) {
      const detail = sess && sess.error ? (sess.error.message || JSON.stringify(sess.error)) : JSON.stringify(sess);
      throw new Error('Could not start the Google Photos picker: ' + detail);
    }
    let pollMs = 5000;
    if (sess.pollingConfig && sess.pollingConfig.pollInterval) {
      const s = parseFloat(String(sess.pollingConfig.pollInterval));
      if (s > 0) pollMs = Math.round(s * 1000);
    }
    await saveMeta(row, { picker_session_id: sess.id });
    respond(200, { success: true, pickerUri: sess.pickerUri, pickerSessionId: sess.id, pollIntervalMs: pollMs });
  } catch (err) {
    respond(200, { success: false, error: String(err && err.message ? err.message : err) });
  }
} else if (action === 'picker-poll') {
  const row = await getSourceRow();
  const pickerSessionId = String(body.pickerSessionId || parseMeta(row).picker_session_id || '');
  try {
    if (!row) throw new Error('Google Photos is not connected yet.');
    if (!pickerSessionId) throw new Error('No picker session. Start the import again.');
    const token = await getValidAccessToken(row);
    const sessRes = await fetch(PICKER_BASE + '/sessions/' + encodeURIComponent(pickerSessionId), {
      headers: { Authorization: 'Bearer ' + token },
    });
    const sess = await sessRes.json();
    if (!sessRes.ok) {
      const detail = sess && sess.error ? (sess.error.message || JSON.stringify(sess.error)) : JSON.stringify(sess);
      throw new Error('Picker session check failed: ' + detail);
    }
    if (!sess.mediaItemsSet) {
      respond(200, { ready: false });
    } else {
      let items = [];
      let pageToken = null;
      let guard = 0;
      do {
        let url = PICKER_BASE + '/mediaItems?sessionId=' + encodeURIComponent(pickerSessionId) + '&pageSize=100';
        if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);
        const listRes = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
        const listData = await listRes.json();
        if (!listRes.ok) break;
        items = items.concat(listData.mediaItems || []);
        pageToken = listData.nextPageToken || null;
        guard++;
      } while (pageToken && guard < 5);

      const photos = items.filter(function (i) { return i && i.type === 'PHOTO' && i.mediaFile && i.mediaFile.baseUrl; });
      const importedBefore = await db.query('google_photo_imports', { limit: 1000 });
      const seen = new Set((importedBefore.rows || []).map(function (r) { return r.media_item_id; }));
      const pending = photos.filter(function (p) { return !seen.has(p.id); });
      const batch = pending.slice(0, 12);

      let imported = 0;
      for (const item of batch) {
        try {
          const dl = await fetch(item.mediaFile.baseUrl + '=w2048', { headers: { Authorization: 'Bearer ' + token } });
          if (!dl.ok) continue;
          const buf = await dl.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = '';
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
          }
          const base64 = btoa(binary);
          const mime = item.mediaFile.mimeType || 'image/jpeg';
          const fileName = item.mediaFile.filename || item.id + '.jpg';
          const up = await fetch('/api/upload/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageData: 'data:' + mime + ';base64,' + base64, fileName: fileName }),
          });
          const upData = await up.json();
          const fileUrl = upData.imageUrl || upData.url;
          if (!fileUrl) continue;
          const createdAt = item.createTime || new Date().toISOString();
          const mediaRow = {
            file_url: fileUrl,
            title: fileName.replace(/\\.[^.]+$/, '') || 'Memory',
            captured_at: createdAt,
            exif_date: createdAt,
            source: 'google_photos',
            in_cluster: false,
          };
          if (sessionId) mediaRow.session_id = sessionId;
          const ins = await db.insert('photo_media', mediaRow);
          const insertedId = ins.insertedRows && ins.insertedRows[0] ? ins.insertedRows[0].id : null;
          const importRow = { media_item_id: item.id, photo_media_id: insertedId };
          if (sessionId) importRow.session_id = sessionId;
          await db.insert('google_photo_imports', importRow);
          imported++;
        } catch (e) {
          console.warn('Import failed for item ' + item.id + ': ' + e);
        }
      }

      const remaining = Math.max(0, pending.length - batch.length);
      respond(200, {
        ready: true,
        imported: imported,
        remaining: remaining,
        done: remaining === 0,
        totalPicked: photos.length,
        skippedExisting: photos.length - pending.length,
      });
    }
  } catch (err) {
    respond(200, { ready: false, error: String(err && err.message ? err.message : err) });
  }
} else {
  respond(400, { error: 'Unknown action: ' + action });
}`,
  },
  {
    name: 'seed-products',
    description: 'Seeds shared product catalog if empty',
    code: `const existing = await db.rawQuery("SELECT COUNT(*)::int AS cnt FROM products WHERE session_id IS NULL");
const count = existing.rows[0]?.cnt || 0;
if (count > 0) {
  respond(200, { seeded: false, count, message: 'Catalog already exists' });
} else {
  const products = ${JSON.stringify(PRODUCT_SEED)};
  const rows = products.map((p) => ({ ...p, active: true }));
  await db.insert('products', rows);
  respond(200, { seeded: true, count: rows.length });
}`,
  },
];

const MCP_TOOLS = [
  {
    name: 'analyze_wall_photo',
    description:
      'Analyze a wall photo and suggest a specific frame gallery arrangement (sizes, layout, products). Call when the parent uploads or shares a photo of their wall.',
    parameters: {
      imageUrl: { type: 'string', required: true, description: 'Public URL of the wall photo' },
    },
    action: {
      type: 'api_call',
      method: 'POST',
      endpoint: `/api/hooks/execute/workspace-${WORKSPACE_NUMERIC}/analyze-wall-photo`,
      bodyMapping: { imageUrl: 'imageUrl' },
    },
  },
  {
    name: 'browse_product_catalog',
    description:
      'Browse available frame and album products. Use when the parent asks about frames, albums, sizes, or pricing.',
    parameters: {
      productType: {
        type: 'string',
        required: false,
        description: 'Filter: frame, album, or set',
        enum: ['frame', 'album', 'set'],
      },
      size: { type: 'string', required: false, description: 'Filter by size e.g. 8x10' },
    },
    action: {
      type: 'api_call',
      method: 'POST',
      endpoint: `/api/hooks/execute/workspace-${WORKSPACE_NUMERIC}/browse-product-catalog`,
      bodyMapping: { productType: 'productType', size: 'size' },
    },
  },
  {
    name: 'get_photo_cluster',
    description:
      'Get the AI-clustered birth photo collection. Use when discussing their baby photos or first-days album.',
    parameters: {
      eventDate: {
        type: 'string',
        required: false,
        description: 'Birth date YYYY-MM-DD; omit for most recent cluster',
      },
    },
    action: {
      type: 'api_call',
      method: 'POST',
      endpoint: `/api/hooks/execute/workspace-${WORKSPACE_NUMERIC}/get-photo-cluster`,
      bodyMapping: { eventDate: 'eventDate' },
    },
  },
];

let bootstrapPromise: Promise<void> | null = null;

export async function ensureMemoriBackend(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    try {
      const hooksRes = await fetch(`/api/workspaces/${WORKSPACE_NUMERIC}/hooks`);
      const hooks: Array<{ name: string; id: string; description?: string }> = hooksRes.ok
        ? await hooksRes.json()
        : [];
      const byName = new Map(hooks.map((h) => [h.name, h]));

      for (const def of HOOK_DEFINITIONS) {
        const current = byName.get(def.name);
        if (!current) {
          await fetch(`/api/workspaces/${WORKSPACE_NUMERIC}/hooks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: def.name,
              description: def.description,
              code: def.code,
              enabled: true,
            }),
          });
        } else if ((current.description || '') !== def.description) {
          // The description doubles as a version marker — bumping it redeploys the hook code.
          await fetch(`/api/workspaces/${WORKSPACE_NUMERIC}/hooks/${current.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              description: def.description,
              code: def.code,
              enabled: true,
            }),
          });
        }
      }

      await fetch(`/api/hooks/execute/workspace-${WORKSPACE_NUMERIC}/seed-products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const toolsRes = await fetch(`/api/workspace-settings/${WORKSPACE_ID}/customer-tools`);
      let currentTools: unknown[] = [];
      if (toolsRes.ok) {
        const data = await toolsRes.json();
        currentTools = data?.registry?.tools || [];
      }
      const names = new Set((currentTools as Array<{ name: string }>).map((t) => t.name));
      const missing = MCP_TOOLS.filter((t) => !names.has(t.name));
      if (missing.length > 0) {
        const merged = [
          ...(currentTools as typeof MCP_TOOLS),
          ...missing,
        ];
        await fetch(`/api/workspace-settings/${WORKSPACE_ID}/customer-tools`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation: 'replace_all', tools: merged }),
        });
      }
    } catch (e) {
      console.warn('[MemoriChristi] Backend bootstrap:', e);
    }
  })();
  return bootstrapPromise;
}

export async function callHook<T = unknown>(
  hookName: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`/api/hooks/execute/workspace-${WORKSPACE_NUMERIC}/${hookName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}
