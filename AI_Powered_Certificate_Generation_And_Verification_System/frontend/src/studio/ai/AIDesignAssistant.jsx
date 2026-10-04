import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, CircleHelp, RotateCcw, Sparkles, X } from 'lucide-react';
import { API } from '../../services/api';
import CertificateSurface from '../CertificateSurface';
import { compactDesign, designDiff, designFingerprint, previewDesign } from './aiDesignUtils';
import AIDesignDiff from './AIDesignDiff';
import AIVariants from './AIVariants';

const ACTIONS = [
  ['Create from prompt', 'Create a complete modern certificate with a clear title, recipient, event, signatory and QR.'],
  ['Restyle', 'Restyle this certificate with a cohesive color palette and typography. Preserve its content.'],
  ['Fix layout', 'Fix spacing and alignment without changing the certificate content.'],
  ['Make premium', 'Make this certificate feel premium with refined typography and restrained gold accents.'],
  ['Academic', 'Give this certificate a prestigious academic aesthetic.'],
  ['Corporate', 'Restyle as a polished corporate certificate.'],
  ['Modern', 'Create a contemporary, modern certificate design.'],
  ['Minimal', 'Make this certificate minimal and spacious.'],
  ['Luxury', 'Give this certificate an elegant luxury style.'],
  ['3 variations', 'Give me three different designs: minimal, luxury and modern.']
];
const SUGGESTIONS = ['Make the name larger', 'Add QR verification', 'Fix alignment'];
const STAGES = ['Analyzing your design…', 'Building the layout…', 'Checking the details…'];

function errorMessage(err) {
  if (err.response?.status === 401 || err.response?.status === 403) return 'Your session cannot use the AI designer. Please sign in with design access.';
  if (err.response?.status === 413) return 'This request is too large. Try a shorter instruction.';
  if (err.response?.status === 429) return 'Too many requests. Please try again shortly.';
  if (err.response?.status === 422) return 'I couldn’t safely apply that design change. Try a more specific instruction.';
  if (err.code === 'ECONNABORTED') return 'The designer took too long. Please try again.';
  return 'The AI designer is unavailable right now. Your design has not changed.';
}

export default function AIDesignAssistant({ template, onApply, onClose }) {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(null);
  const controller = useRef(null);
  const conversationEnd = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => conversationEnd.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }), [messages, proposal]);
  useEffect(() => {
    if (!loading) return undefined;
    const timer = setInterval(() => setStage(v => (v + 1) % STAGES.length), 1700);
    return () => clearInterval(timer);
  }, [loading]);

  const submit = async (selectedPrompt = prompt) => {
    const instruction = selectedPrompt.trim();
    if (!instruction || loading) { if (!instruction) setError('Describe what you want to design first.'); return; }
    if (instruction.length > 1200) { setError('Keep your instruction under 1,200 characters.'); return; }
    const fingerprint = designFingerprint(template);
    const conversation = messages.slice(-8).map(({ role, content }) => ({ role, content: content.slice(0, 360) }));
    setMessages(prev => [...prev, { role: 'user', content: instruction }]);
    setPrompt(''); setProposal(null); setError(''); setLoading(true); setStage(0);
    const abort = new AbortController(); controller.current = abort;
    try {
      const response = await axios.post(`${API}/ai/design`, {
        prompt: instruction, template: compactDesign(template), conversation
      }, { signal: abort.signal, timeout: 50000 });
      if (fingerprint !== designFingerprint(templateRef.current)) {
        setError('Your design changed while I was working. Send the prompt again to use the latest canvas.');
        return;
      }
      const design = response.data?.design;
      if (!design || typeof design.summary !== 'string') throw new Error('Invalid response');
      const variants = design.intent === 'variation';
      if (variants && (!Array.isArray(design.variants) || design.variants.length !== 3)) throw new Error('Invalid variants');
      const choices = (variants ? design.variants : [{ name: 'Proposed design', design }]).map(choice => {
        const draft = previewDesign(templateRef.current, choice.design);
        return { ...choice, template: draft, diff: designDiff(templateRef.current, draft) };
      });
      setProposal({ fingerprint, choices, variants });
      setMessages(prev => [...prev, { role: 'assistant', content: design.summary.slice(0, 360) }]);
    } catch (err) {
      if (!axios.isCancel(err)) setError(err.response ? errorMessage(err) :
        err.message?.includes('Invalid') || err.message?.includes('Unsafe') || err.message?.includes('Unsupported') ?
          'I couldn’t safely apply that design change. Try a more specific instruction.' : errorMessage(err));
    } finally {
      setLoading(false);
      controller.current = null;
    }
  };

  // This ref always follows manual edits, even while an asynchronous request is in flight.
  const templateRef = useRef(template);
  templateRef.current = template;
  const stale = proposal && proposal.fingerprint !== designFingerprint(template);
  const applyChoice = (index) => {
    const choice = proposal?.choices[index];
    if (!choice || stale) { setError('The canvas changed. Generate a new proposal for the latest design.'); return; }
    if (onApply(choice.design, proposal.fingerprint)) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Applied to the canvas. You can undo this as one step or use the existing Save button.' }]);
      setProposal(null); setPreviewIndex(null); setError('');
    } else setError('The canvas changed. Generate a new proposal for the latest design.');
  };
  const selectedPreview = previewIndex !== null ? proposal?.choices[previewIndex] : null;
  const modalScale = Math.min(0.84, (typeof window === 'undefined' ? 350 : window.innerWidth - 40) / 792);

  return (
    <div data-testid="ai-design-assistant" className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#fcfbf9] shadow-xl shadow-slate-900/10">
      <div className="shrink-0 relative overflow-hidden bg-slate-950 px-5 py-5 text-white">
        <div className="absolute -top-16 -right-6 h-40 w-40 rounded-full bg-amber-400/15 blur-3xl pointer-events-none" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex gap-3 items-start">
            <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-2.5 text-amber-300"><Sparkles size={19} /></div>
            <div>
              <p data-testid="ai-assistant-title" className="font-serif text-lg font-bold leading-tight">AI Design Assistant</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-300">Describe a design. Review every change before it reaches your canvas.</p>
            </div>
          </div>
          <button data-testid="ai-sidebar-close" type="button" onClick={onClose} aria-label="Close AI assistant"
            className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"><X size={17} /></button>
        </div>
      </div>

      <div data-testid="ai-conversation" className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {!messages.length && <div data-testid="ai-welcome" className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-4">
          <p className="text-sm font-semibold text-slate-900">Your idea, made editable.</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">Ask for a full certificate or refine one detail. The assistant works with your current canvas—not a separate design.</p>
        </div>}
        {messages.map((message, i) => <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          data-testid={`ai-message-${i}`} className={`max-w-[94%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words ${message.role === 'user' ? 'ml-auto rounded-br-sm bg-slate-900 text-white' : 'rounded-bl-sm border border-slate-200 bg-white text-slate-700'}`}>{message.content}</motion.div>)}

        {loading && <div data-testid="ai-thinking" role="status" className="rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
          <div className="flex gap-2 items-center text-xs font-semibold text-slate-800"><Sparkles size={15} className="text-amber-500 animate-pulse" /> Designing your certificate</div>
          <p data-testid="ai-thinking-stage" className="mt-2 text-xs text-slate-500">{STAGES[stage]}</p>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-amber-100"><div className="h-full w-1/2 rounded-full bg-amber-400 animate-pulse" /></div>
        </div>}
        {error && <p data-testid="ai-error" role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</p>}
        {stale && <p data-testid="ai-stale-proposal" role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">The canvas changed. Generate again to work from its latest state.</p>}
        {proposal && !stale && (proposal.variants ?
          <AIVariants choices={proposal.choices} onApply={applyChoice} onCancel={() => setProposal(null)} onPreview={setPreviewIndex} /> :
          <AIDesignDiff choice={proposal.choices[0]} index={0} onApply={() => applyChoice(0)}
            onCancel={() => setProposal(null)} onPreview={() => setPreviewIndex(0)} />)}
        <div ref={conversationEnd} />
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white p-4 space-y-3">
        <div data-testid="ai-quick-actions" className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {ACTIONS.map(([label, value], i) => <button key={label} data-testid={`ai-action-${i}`} type="button" disabled={loading}
            onClick={() => setPrompt(value)} className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:border-amber-400 hover:bg-amber-50 disabled:opacity-50 transition-colors">{label}</button>)}
        </div>
        {!messages.length && <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((text, i) => <button key={text} data-testid={`ai-suggestion-${i}`} type="button"
            onClick={() => setPrompt(text)} className="text-[11px] text-amber-800 hover:text-amber-950 underline underline-offset-2 transition-colors">{text}</button>)}
        </div>}
        <form data-testid="ai-prompt-form" onSubmit={e => { e.preventDefault(); submit(); }} className="relative rounded-xl border border-slate-300 bg-slate-50 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-100 transition-colors">
          <textarea data-testid="ai-prompt-input" value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={1200}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="Describe your certificate or ask for a change…" rows={3} disabled={loading}
            className="w-full resize-none bg-transparent p-3 pr-12 text-sm text-slate-900 placeholder:text-slate-400 outline-none disabled:opacity-50" />
          <button data-testid="ai-generate-button" type="submit" disabled={loading || !prompt.trim()}
            aria-label="Generate design" className="absolute bottom-2 right-2 rounded-lg bg-slate-900 p-2 text-white hover:bg-amber-600 disabled:bg-slate-300 transition-colors"><ArrowUp size={16} /></button>
        </form>
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><CircleHelp size={12} /> Changes are not saved automatically</span>
          {messages.length > 0 && <button data-testid="ai-clear-chat" type="button" onClick={() => { setMessages([]); setProposal(null); setError(''); }}
            className="flex items-center gap-1 hover:text-slate-700 transition-colors"><RotateCcw size={11} /> Clear chat</button>}
        </div>
      </div>

      <AnimatePresence>{selectedPreview && <motion.div data-testid="ai-preview-modal" role="dialog" aria-label="AI design preview"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }}
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-slate-950/85 p-5" onClick={() => setPreviewIndex(null)}>
        <div className="flex w-full max-w-3xl items-center justify-between text-white">
          <p data-testid="ai-preview-title" className="font-serif text-lg font-semibold">{selectedPreview.name}</p>
          <button data-testid="ai-preview-close" type="button" onClick={() => setPreviewIndex(null)} aria-label="Close preview" className="rounded-lg p-2 hover:bg-white/10"><X size={20} /></button>
        </div>
        <div className="max-w-full overflow-auto rounded-md shadow-2xl" onClick={e => e.stopPropagation()}>
          <CertificateSurface template={selectedPreview.template} scale={modalScale} testId="ai-preview-surface" />
        </div>
        <button data-testid="ai-preview-apply" type="button" onClick={e => { e.stopPropagation(); applyChoice(previewIndex); }}
          className="rounded-xl bg-amber-400 px-7 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300 transition-colors">Apply this design</button>
      </motion.div>}</AnimatePresence>
    </div>
  );
}