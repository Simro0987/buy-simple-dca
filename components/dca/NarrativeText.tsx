"use client";

import type { ReactNode } from "react";

const KEY =
  /\$?\d[\d,]*(?:\.\d+)?(?:\s?%|\/100)?|\bCore\s+\d+(?:\.\d+)?%|\bSat(?:elity)?\s+\d+(?:\.\d+)?%|\bHigh-Beta\s+\d+(?:\.\d+)?%|\bAlokácia\s+\d+%|\bCONFLUENCE\s+\d+\/100|\bFinal Score\s+\d+\/100/gi;

export function NarrativeText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  const source = text;
  for (const match of source.matchAll(KEY)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      nodes.push(
        <span key={`m-${cursor}`} className="text-zinc-500">
          {source.slice(cursor, start)}
        </span>,
      );
    }
    nodes.push(
      <span key={`k-${start}`} className="font-mono text-cyan-100">
        {match[0]}
      </span>,
    );
    cursor = start + match[0].length;
  }
  if (cursor < source.length) {
    nodes.push(
      <span key={`t-${cursor}`} className="text-zinc-500">
        {source.slice(cursor)}
      </span>,
    );
  }
  return <span>{nodes}</span>;
}
