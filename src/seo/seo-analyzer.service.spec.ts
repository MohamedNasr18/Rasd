import { Test } from '@nestjs/testing';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { vi } from 'vitest';
import { SeoAnalyzerService } from './seo-analyzer.service.js';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('SeoAnalyzerService', () => {
  let service: SeoAnalyzerService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [SeoAnalyzerService],
    }).compile();
    service = module.get(SeoAnalyzerService);
    vi.clearAllMocks();
  });

  describe('checkStructuredData', () => {
    it('fails when a Product schema is missing required fields', () => {
      const html = `<script type="application/ld+json">{"@type":"Product","name":"Shoe"}</script>`;
      const $ = cheerio.load(html);
      const result = (service as any).checkStructuredData($);
      expect(result.check).toBe('structured_data');
      expect(result.status).toBe('fail');
      expect(result.message).toContain('offers.price');
    });

    it('passes with valid Article schema', () => {
      const html = `<script type="application/ld+json">{"@type":"Article","headline":"H","author":"A","datePublished":"2026-01-01"}</script>`;
      const $ = cheerio.load(html);
      const result = (service as any).checkStructuredData($);
      expect(result.status).toBe('pass');
    });
  });

  describe('checkKeywordStuffing', () => {
    it('flags excessive repetition of a single word', () => {
      const html = `<body>${'buy buy buy buy buy shoe shoe now click here today please '.repeat(5)}</body>`;
      const $ = cheerio.load(html);
      const result = (service as any).checkKeywordStuffing($);
      expect(result.status).toBe('warning');
    });

    it('passes with naturally varied text', () => {
      const html = `<body>This is a normal paragraph describing a product with varied wording throughout.</body>`;
      const $ = cheerio.load(html);
      const result = (service as any).checkKeywordStuffing($);
      expect(result.status).toBe('pass');
    });
  });

  describe('checkSecurityHeaders', () => {
    it('warns when headers are missing', () => {
      const result = (service as any).checkSecurityHeaders({});
      expect(result.status).toBe('warning');
      expect(result.message).toContain('strict-transport-security');
    });

    it('passes when all required headers are present', () => {
      const headers = {
        'Strict-Transport-Security': 'max-age=63072000',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'",
      };
      const result = (service as any).checkSecurityHeaders(headers);
      expect(result.status).toBe('pass');
    });
  });

  describe('checkRobotsTxtContent', () => {
    it('fails when robots.txt disallows everything for all agents', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: 'User-agent: *\nDisallow: /',
      });
      const result = await (service as any).checkRobotsTxtContent('https://example.com');
      expect(result.status).toBe('fail');
    });

    it('passes when robots.txt only blocks specific paths', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: 'User-agent: *\nDisallow: /admin',
      });
      const result = await (service as any).checkRobotsTxtContent('https://example.com');
      expect(result.status).toBe('pass');
    });
  });
});