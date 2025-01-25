const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours cache duration
const subLink = env.SUBLINK; // this is loaded from the environment variable

async function getCachedOrFetch(url, cache_duration) {
    const cache = caches.default;
    let cachedResponse = await cache.match(url);
    if (cachedResponse) {
        if (Date.now() - new Date(cachedResponse.headers.get('date')).getTime() < cache_duration) {
            return cachedResponse;
        }
    }
    const resp = await fetch(url);
    if (resp.ok) {
        const respClone = resp.clone();
        await cache.put(url, respClone);
        return resp;
    } else {
        throw new Error(`Unable to fetch ${url}, status code is ${resp.status}`);
    }
}

export default {
    async fetch(request, env, ctx) {
        try {
            const url = new URL(request.url);
            const [realhostname, realpathname] = url.pathname.split('/').slice(1);

            if (url.pathname.startsWith('/sub')) {
                const resp = await getCachedOrFetch(subLink, CACHE_DURATION);
                const subConfigs = await resp.text();
                const configLines = subConfigs.split('\n');

                // Process lines in parallel
                const results = await Promise.allSettled(
                    configLines.map(async (subConfig) => {
                        if (subConfig.includes('vmess')) {
                            try {
                                subConfig = subConfig.replace('vmess://', '');
                                subConfig = atob(subConfig);
                                subConfig = JSON.parse(subConfig);
                                let add_address = realpathname || url.hostname
                                if (subConfig.sni && !isIp(subConfig.sni) && subConfig.net === 'ws' && subConfig.port === 443) {
                                    const configNew = {
                                        v: '2',
                                        ps: `Node-${subConfig.sni}`,
                                        add: add_address,
                                        port: subConfig.port,
                                        id: subConfig.id,
                                        net: subConfig.net,
                                        host: subConfig.sni,
                                        path: `/${subConfig.sni}${subConfig.path}`,
                                        tls: subConfig.tls,
                                        sni: url.hostname,
                                        aid: '0',
                                        scy: 'auto',
                                        type: 'auto',
                                        fp: 'chrome',
                                        alpn: 'http/1.1',
                                    };
                                    return `vmess://${btoa(JSON.stringify(configNew))}\n`;
                                }
                            } catch (error) {
                                console.error("Error processing vmess:", error);
                                return ''; // Return empty string for failed processing
                            }
                        }
                        return '';
                    })
                );

                const newConfigs = results
                    .filter((result) => result.status === 'fulfilled' && result.value !== '')
                    .map((result) => result.value)
                    .join('');

                return new Response(newConfigs, {
                    headers: {
                        'Cache-Control': `max-age=${CACHE_DURATION / 1000}, public`,
                    },
                });
            } else {
                // Redirect other requests
                const newUrl = new URL(request.url);
                const [address, ...path] = newUrl.pathname.replace(/^\/*/, '').split('/');
                newUrl.pathname = path.join('/');
                newUrl.hostname = address;
                newUrl.protocol = 'https';
                return fetch(new Request(newUrl, request));
            }
        } catch (error) {
            console.error("Error:", error.message);
            return new Response("خطای سرور: " + error.message, { status: 500 });
        }
    },
};

function isIp(ipstr) {
    if (!ipstr) return false;
    const ipPattern = /^(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])(\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])){3}$/;
    if (!ipPattern.test(ipstr)) return false;
    const parts = ipstr.split('.');
    return parts.length === 4 && parts[3] !== "0";
}
