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

        // MPD uniquement : réécriture BaseURL relative → absolue
        if (url.endsWith('.mpd') || contentType.includes('dash+xml')) {
            let text = await response.text();
            const finalUrl = response.url || url;
            const base = finalUrl.substring(0, finalUrl.lastIndexOf('/') + 1);

            text = text.replace(/<BaseURL>([^<]+)<\/BaseURL>/g, (_, href) => {
                if (href.startsWith('http')) return `<BaseURL>${href}</BaseURL>`;
                try { return `<BaseURL>${new URL(href, base).href}</BaseURL>`; }
                catch { return `<BaseURL>${href}</BaseURL>`; }
            });

            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'application/dash+xml');
            return res.status(200).send(text);
        }

        // Tout le reste : passage transparent
        const body = await response.arrayBuffer();
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', contentType);
        return res.status(200).send(Buffer.from(body));

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
