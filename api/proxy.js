export default async function handler(req, res) {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        return res.status(200).end();
    }

    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url parameter' });
    if (!url.startsWith('http://') && !url.startsWith('https://'))
        return res.status(400).json({ error: 'Invalid URL' });

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'fr-FR,fr;q=0.9',
                'Origin': '',
                'Referer': '',
            },
            redirect: 'follow',
        });

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const finalUrl = response.url || url; // URL après redirects
        const baseUrl = finalUrl.substring(0, finalUrl.lastIndexOf('/') + 1);

        // ─── MPD : réécriture complète pour que TOUT passe par le proxy ───
        if (contentType.includes('dash+xml') || url.endsWith('.mpd')) {
            let text = await response.text();

            // 1. Résoudre et proxifier les <BaseURL>
            text = text.replace(/<BaseURL>([^<]+)<\/BaseURL>/g, (match, href) => {
                const absolute = resolveUrl(href, baseUrl);
                return `<BaseURL>/api/proxy?url=${encodeURIComponent(absolute)}</BaseURL>`;
            });

            // 2. Proxifier initialization= dans SegmentTemplate
            text = text.replace(/initialization="([^"]+)"/g, (match, href) => {
                if (href.startsWith('/api/proxy')) return match;
                const absolute = resolveUrl(href, baseUrl);
                return `initialization="/api/proxy?url=${encodeURIComponent(absolute)}"`;
            });

            // 3. Proxifier media= dans SegmentTemplate
            text = text.replace(/media="([^"]+)"/g, (match, href) => {
                if (href.startsWith('/api/proxy')) return match;
                const absolute = resolveUrl(href, baseUrl);
                return `media="/api/proxy?url=${encodeURIComponent(absolute)}"`;
            });

            // 4. Proxifier les <SegmentURL media="...">
            text = text.replace(/<SegmentURL\s+media="([^"]+)"/g, (match, href) => {
                if (href.startsWith('/api/proxy')) return match;
                const absolute = resolveUrl(href, baseUrl);
                return `<SegmentURL media="/api/proxy?url=${encodeURIComponent(absolute)}"`;
            });

            setCorsHeaders(res);
            res.setHeader('Content-Type', 'application/dash+xml');
            res.setHeader('Cache-Control', 'no-cache');
            return res.status(200).send(text);
        }

        // ─── HLS .m3u8 : réécriture des segments et sous-playlists ───
        if (contentType.includes('mpegurl') || contentType.includes('x-mpegurl') || url.includes('.m3u8')) {
            let text = await response.text();
            const lines = text.split('\n').map(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) return line;
                // C'est une URL de segment ou sous-playlist
                const absolute = resolveUrl(trimmed, baseUrl);
                return `/api/proxy?url=${encodeURIComponent(absolute)}`;
            });
            text = lines.join('\n');

            // Réécrire les URI= dans les tags HLS (#EXT-X-KEY, #EXT-X-MAP, etc.)
            text = text.replace(/URI="([^"]+)"/g, (match, href) => {
                if (href.startsWith('/api/proxy')) return match;
                const absolute = resolveUrl(href, baseUrl);
                return `URI="/api/proxy?url=${encodeURIComponent(absolute)}"`;
            });

            setCorsHeaders(res);
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Cache-Control', 'no-cache');
            return res.status(200).send(text);
        }

        // ─── Tout le reste : segments mp4, audio, clés de chiffrement ───
        const body = await response.arrayBuffer();
        setCorsHeaders(res);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-cache');
        return res.status(response.status).send(Buffer.from(body));

    } catch (e) {
        console.error('[proxy] error:', e.message, 'url:', url);
        return res.status(500).json({ error: e.message });
    }
}

function resolveUrl(href, base) {
    if (href.startsWith('http://') || href.startsWith('https://')) return href;
    try { return new URL(href, base).href; } catch { return href; }
}

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', '*');
}
