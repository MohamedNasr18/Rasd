import { Injectable, Logger } from '@nestjs/common';
import puppeteer, { Browser } from 'puppeteer';

export interface RenderedPage {
  html: string;
  headers: Record<string, string>;
}

@Injectable()
export class RendererService {
  private readonly logger = new Logger(RendererService.name);

  async renderPage(url: string): Promise<RenderedPage> {
    let browser: Browser | null = null;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();

      await page.setUserAgent('RasdBot/1.0 (+https://rasd.app)');

      const response = await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Trigger lazy-loaded images by scrolling through the page.
      // This fires Intersection Observer callbacks so data-src images get their
      // src swapped before we capture the HTML.
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          const distance = 300;
          const delay = 100;
          const timer = setInterval(() => {
            window.scrollBy(0, distance);
            if (window.scrollY + window.innerHeight >= document.body.scrollHeight) {
              clearInterval(timer);
              // Scroll back to top and give a final moment for any remaining images
              window.scrollTo(0, 0);
              resolve();
            }
          }, delay);
        });
      });

      // Brief wait after scroll to allow any triggered network requests to settle
      await new Promise((r) => setTimeout(r, 1000));

      const html = await page.content();
      const headers = response ? response.headers() : {};

      return { html, headers };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}