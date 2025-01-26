// لیست لینک‌های کانفیگ
const subLinks = [
  'https://raw.githubusercontent.com/mahdibland/ShadowsocksAggregator/master/sub/splitted/vmess.txt',
  'https://raw.githubusercontent.com/Epodonios/v2ray-configs/main/Splitted-By-Protocol/vmess.txt',
  'https://raw.githubusercontent.com/coldwater-10/V2Hub3/main/Split/Normal/vmess',
  'https://raw.githubusercontent.com/coldwater-10/V2Hub2/main/Split/Normal/vmess',
  'https://raw.githubusercontent.com/coldwater-10/V2rayCollectorLire/main/vmess_iran.txt',
 // لینک‌های اضافی
];

class VmessProcessor {
  constructor(subLinks) {
    this.subLinks = subLinks;
    // در پلن رایگان، حداکثر مقدار max-age دو ساعت است
    // این مقدار را بر اساس نیاز خود تنظیم کنید
    // برای مثال، 7200 ثانیه معادل 2 ساعت است
    this.cacheDuration = 7200;
  }

  // دریافت داده‌ها از همه‌ی لینک‌ها
  async fetchConfigs() {
    try {
      const configs = await Promise.all(
        this.subLinks.map(async (link) => {
          try {
            const resp = await fetch(link);
            if (!resp.ok) throw new Error(`خطا در دریافت داده‌ها از ${link}: ${resp.status}`);
            return await resp.text();
          } catch (error) {
            console.error(`خطا در دریافت از ${link}:`, error);
            return '';
          }
        })
      );
      // فشرده‌سازی کانفیگ‌ها با حذف فضاهای خالی و خطوط جدید
      return configs.join('\n').replace(/\s+/g, '');
    } catch (error) {
      console.error("خطا در دریافت داده‌ها:", error);
      throw error;
    }
  }

  // پردازش هر خط از کانفیگ‌ها
  processConfig(subConfig, url) {
    try {
      subConfig = subConfig.replace('vmess://', '');
      subConfig = atob(subConfig);
      subConfig = JSON.parse(subConfig);

      if (subConfig.sni && !this.isIp(subConfig.sni) && subConfig.net === 'ws' && subConfig.port === 443) {
        return {
          v: '2',
          ps: `Node-${subConfig.sni}`,
          add: url.hostname,
          port: subConfig.port,
          id: subConfig.id,
          net: subConfig.net,
          host: url.hostname,
          path: `/${subConfig.sni}${subConfig.path}`,
          tls: subConfig.tls,
          sni: url.hostname,
          aid: '0',
          scy: 'auto',
          type: 'auto',
          fp: 'chrome',
          alpn: 'http/1.1',
        };
      }
    } catch (error) {
      console.error("خطا در پردازش vmess:", error);
    }
    return null;
  }

  // بررسی اینکه آیا رشته داده‌شده یک IP معتبر است
  isIp(ipstr) {
    if (!ipstr) return false;
    const ipPattern = /^(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])(\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])){3}$/;
    return ipPattern.test(ipstr) && ipstr.split('.').length === 4;
  }

  // مدیریت درخواست‌ها
  async handleRequest(request, event) {
    try {
      const url = new URL(request.url);
      const cache = caches.default;
      const cacheKey = new Request(request.url, request);

      if (url.pathname.startsWith('/sub')) {
        // بررسی حافظه پنهان
        let response = await cache.match(cacheKey);

        if (!response) {
          console.log("کانفیگ‌ها در کش موجود نیستند، در حال دریافت...");

          // دریافت و پردازش کانفیگ‌ها
          const subConfigs = await this.fetchConfigs();
          const configLines = subConfigs.split('\n');

          const newConfigs = await Promise.all(
            configLines.map(async (subConfig) => {
              const processed = this.processConfig(subConfig, url);
              return processed ? `vmess://${btoa(JSON.stringify(processed))}` : '';
            })
          );

          const configData = newConfigs.join('');

          // ایجاد پاسخ با هدر Cache-Control
          response = new Response(configData, {
            headers: {
              'Cache-Control': `public, max-age=${this.cacheDuration}, stale-while-revalidate=30, stale-if-error=86400`,
            },
          });

          // ذخیره پاسخ در حافظه پنهان
          event.waitUntil(cache.put(cacheKey, response.clone()));

          console.log("کانفیگ‌های جدید دریافت و در کش ذخیره شدند");
        } else {
          console.log("استفاده از کش موجود برای کانفیگ‌ها");
        }

        return response;
      } else {
        // تغییر مسیر درخواست‌های دیگر
        const newUrl = new URL(request.url);
        const [address, ...path] = newUrl.pathname.replace(/^\/*/, '').split('/');
        newUrl.pathname = path.join('/');
        newUrl.hostname = address;
        newUrl.protocol = 'https';
        return fetch(new Request(newUrl, request));
      }
    } catch (error) {
      console.error("خطا در پردازش درخواست:", error);
      return new Response("خطای سرور: " + error.message, { status: 500 });
    }
  }
}

// ایجاد یک نمونه از کلاس VmessProcessor
const processor = new VmessProcessor(subLinks);

// مدیریت درخواست‌های ورودی
addEventListener('fetch', event => {
  event.respondWith(processor.handleRequest(event.request, event));
});
