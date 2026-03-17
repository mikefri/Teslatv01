export default async function handler(req, res) {
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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
                'Accept-Language': 'fr-FR,fr;q=0.9',
            },
            redirect: 'follow',
        });

        const contentType = response.headers.get('content-type') || 'application/octet-stream';

        // Pour les manifests MPD : on réécrit les BaseURL relatives en absolues
        if (contentType.includes('dash+xml') || url.endsWith('.mpd')) {
            let text = await response.text();

            // Calcule l'URL de base après redirects (le dossier parent de l'URL finale)
            const finalUrl = response.url || url;
            const baseUrl = finalUrl.substring(0, finalUrl.lastIndexOf('/') + 1);

            // Réécrit <BaseURL>../truc/</BaseURL> en <BaseURL>https://cdn.../truc/</BaseURL>
            text = text.replace(/<BaseURL>([^<]+)<\/BaseURL>/g, (match, href) => {
                if (href.startsWith('http://') || href.startsWith('https://')) {
                    return match; // déjà absolue
                }
                try {
                    const absolute = new URL(href, baseUrl).href;
                    return `<BaseURL>${absolute}</BaseURL>`;
                } catch {
                    return match;
                }
            });

            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Expose-Headers', '*');
            res.setHeader('Content-Type', 'application/dash+xml');
            res.setHeader('Cache-Control', 'no-cache');
            return res.status(200).send(text);
        }

        // Segments vidéo/audio et tout le reste
        const body = await response.arrayBuffer();
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', '*');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-cache');
        return res.status(response.status).send(Buffer.from(body));

    } catch (e) {
        console.error('[proxy] error:', e.message);
        return res.status(500).json({ error: e.message });
    }
}
