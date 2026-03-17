export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        return res.status(200).end();
    }

    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url' });

    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' },
            redirect: 'follow',
        });

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const finalUrl = response.url || url;
        const base = finalUrl.substring(0, finalUrl.lastIndexOf('/') + 1);

        // ── MPD DASH ──────────────────────────────────────────────
        if (url.endsWith('.mpd') || contentType.includes('dash+xml')) {
            let text = await response.text();

            // Corriger les <BaseURL> relatives
            text = text.replace(/<BaseURL>([^<]+)<\/BaseURL>/g, (_, href) => {
                if (href.startsWith('http')) return `<BaseURL>${href}</BaseURL>`;
                try { return `<BaseURL>${new URL(href, base).href}</BaseURL>`; }
                catch { return `<BaseURL>${href}</BaseURL>`; }
            });

            // Injecter <BaseURL> si absent
            if (!text.includes('<BaseURL>')) {
                text = text.replace(/(<Period[^>]*>)/, `$1\n    <BaseURL>${base}</BaseURL>`);
            }

            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'application/dash+xml');
            res.setHeader('Cache-Control', 'no-cache');
            return res.status(200).send(text);
        }

        // ── HLS m3u8 ──────────────────────────────────────────────
        if (url.includes('.m3u8') || contentType.includes('mpegurl')) {
            let text = await response.text();

            const lines = text.split('\n').map(line => {
                const t = line.trim();
                if (!t || t.startsWith('#')) {
                    // Réécrire URI= dans les tags (#EXT-X-KEY, #EXT-X-MAP...)
                    return line.replace(/URI="([^"]+)"/g, (_, href) => {
                        const abs = href.startsWith('http') ? href : new URL(href, base).href;
                        return `URI="/api/proxy?url=${encodeURIComponent(abs)}"`;
                    });
                }
                // Ligne segment ou sous-playlist
                const abs = t.startsWith('http') ? t : new URL(t, base).href;
                return `/api/proxy?url=${encodeURIComponent(abs)}`;
            });

            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Cache-Control', 'no-cache');
            return res.status(200).send(lines.join('\n'));
        }

        // ── Segments vidéo/audio et tout le reste ─────────────────
        const body = await response.arrayBuffer();
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-cache');
        return res.status(200).send(Buffer.from(body));

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
