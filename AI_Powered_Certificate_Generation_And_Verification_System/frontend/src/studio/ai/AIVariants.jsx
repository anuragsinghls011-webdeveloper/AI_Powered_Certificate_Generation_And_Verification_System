import React from 'react';
import { Sparkles } from 'lucide-react';
import AIDesignDiff from './AIDesignDiff';

export default function AIVariants({ choices, onApply, onCancel, onPreview }) {
  return (
    <div data-testid="ai-variants" className="space-y-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
        <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Choose a direction
      </div>
      {choices.map((choice, index) => <AIDesignDiff key={index} choice={choice} index={index}
        onApply={() => onApply(index)} onCancel={onCancel} onPreview={() => onPreview(index)} />)}
    </div>
  );
}