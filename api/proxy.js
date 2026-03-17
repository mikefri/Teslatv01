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

        if (url.endsWith('.mpd') || contentType.includes('dash+xml')) {
            let text = await response.text();

            // URL réelle après redirects (avec le token CDN)
            const finalUrl = response.url || url;
            const base = finalUrl.substring(0, finalUrl.lastIndexOf('/') + 1);

            // 1. Corriger les <BaseURL> relatives existantes
            text = text.replace(/<BaseURL>([^<]+)<\/BaseURL>/g, (_, href) => {
                if (href.startsWith('http')) return `<BaseURL>${href}</BaseURL>`;
                try { return `<BaseURL>${new URL(href, base).href}</BaseURL>`; }
                catch { return `<BaseURL>${href}</BaseURL>`; }
            });

            // 2. Si aucun <BaseURL> dans le MPD, en injecter un après <Period ...>
            // pour que dash.js sache où chercher les segments
            if (!text.includes('<BaseURL>')) {
                text = text.replace(
                    /(<Period[^>]*>)/,
                    `$1\n    <BaseURL>${base}</BaseURL>`
                );
            }

            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'application/dash+xml');
            res.setHeader('Cache-Control', 'no-cache');
            return res.status(200).send(text);
        }

        // Tout le reste : passage transparent
        const body = await response.arrayBuffer();
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-cache');
        return res.status(200).send(Buffer.from(body));

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
