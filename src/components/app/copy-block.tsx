"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <Button
        size="sm"
        variant="outline"
        className="absolute top-2 right-2"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copied" : "Copy"}
      </Button>
      <pre className="overflow-x-auto rounded-xl bg-muted/50 p-4 pr-24 text-xs leading-relaxed whitespace-pre-wrap">{text}</pre>
    </div>
  );
}
