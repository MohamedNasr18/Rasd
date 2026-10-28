import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="my-2 list-disc space-y-1 ps-5">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 ps-5">{children}</ol>,
        h1: ({ children }) => <h3 className="mb-1 mt-3 text-base font-bold">{children}</h3>,
        h2: ({ children }) => <h3 className="mb-1 mt-3 text-base font-bold">{children}</h3>,
        h3: ({ children }) => <h4 className="mb-1 mt-3 font-semibold">{children}</h4>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto">
            <table className="min-w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border bg-gray-200 px-2 py-1 text-start font-medium">{children}</th>
        ),
        td: ({ children }) => <td className="border px-2 py-1 align-top">{children}</td>,
        pre: ({ children }) => (
          <pre
            dir="ltr"
            className="my-2 overflow-x-auto rounded bg-gray-900 p-3 text-left text-xs text-gray-100 [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-gray-100"
          >
            {children}
          </pre>
        ),
        code: ({ children }) => (
          <code dir="ltr" className="rounded bg-gray-200 px-1 py-0.5 text-xs">
            {children}
          </code>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}