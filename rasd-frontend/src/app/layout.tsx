import type { Metadata } from 'next';
import { Cairo } from 'next/font/google';
import StoreProvider from '@/store/StoreProvider';
import './globals.css';

const cairo = Cairo({ subsets: ['arabic', 'latin'] });

export const metadata: Metadata = {
  title: 'رصد | تحليل السيو بالذكاء الاصطناعي',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${cairo.className} bg-gray-50 text-gray-900 antialiased`}>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}