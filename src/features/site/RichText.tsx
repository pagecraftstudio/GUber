import { parseRichText, type Inline } from './text';

function Inlines({ nodes }: { nodes: Inline[] }) {
  return nodes.map((n, i) => {
    if (n.t === 'bold') return <strong key={i}>{n.v}</strong>;
    if (n.t === 'link') return <a key={i} href={n.href} rel="noopener noreferrer nofollow" className="underline underline-offset-2">{n.v}</a>;
    return <span key={i}>{n.v}</span>;
  });
}

/** Restricted markdown rendered as React elements. There is no dangerouslySetInnerHTML anywhere on the public site. */
export function RichText({ source }: { source: string }) {
  const blocks = parseRichText(source);
  return (
    <div className="space-y-3 leading-relaxed">
      {blocks.map((b, i) => b.t === 'ul'
        ? <ul key={i} className="list-disc ps-6 space-y-1">{b.items.map((it, j) => <li key={j}><Inlines nodes={it} /></li>)}</ul>
        : <p key={i} className="whitespace-pre-line"><Inlines nodes={b.inline} /></p>)}
    </div>
  );
}
