import React, { useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wand2, Sparkles, Check, AlertCircle, RefreshCw, Trash2, ZoomIn, X, Image as ImageIcon
} from 'lucide-react';
import { API } from '../../services/api';

const BG_PRESETS = [
  {
    label: 'Luxury Gold Foil',
    prompt: 'Luxury gold foil ornate certificate border with elegant corner rosettes and warm ivory parchment texture'
  },
  {
    label: 'Royal Academic',
    prompt: 'Prestigious university academic diploma frame with deep Oxford navy and antique bronze guilloche filigree'
  },
  {
    label: 'Modern Cyber Tech',
    prompt: 'Contemporary cyber tech certificate border with geometric cut-corners and subtle blue neon accents'
  },
  {
    label: 'Corporate Executive',
    prompt: 'Executive business certificate frame with deep teal borders, clean brass pin-stripes, and professional aesthetic'
  },
  {
    label: 'Minimalist Clean',
    prompt: 'Refined minimalist diploma frame with delicate double hairlines and subtle corner marks on crisp white'
  },
  {
    label: 'Vintage Victorian',
    prompt: 'Antique Victorian certificate border with intricate floral filigree, engraved scrollwork, and heritage look'
  }
];

export default function AIBackgroundGenerator({ currentBackground, onApplyBackground, onRemoveBackground }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [providerUsed, setProviderUsed] = useState('');
  const [error, setError] = useState('');
  const [zoomOpen, setZoomOpen] = useState(false);

  const generate = async (selectedPrompt = prompt) => {
    const text = selectedPrompt.trim();
    if (!text || loading) {
      if (!text) setError('Please select a preset or type a prompt describing the border frame');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API}/ai/generate-background`, {
        prompt: text
      }, { timeout: 65000 });

      if (response.data?.success && response.data?.image) {
        setGeneratedImage(response.data.image);
        setProviderUsed(response.data.provider || 'AI');
      } else {
        throw new Error('Failed to generate background image');
      }
    } catch (err) {
      if (err.response?.status === 429) {
        setError('Too many requests. Please wait a moment before generating again.');
      } else if (err.response?.status === 401 || err.response?.status === 403) {
        setError('Your session cannot use the AI designer. Please sign in with design access.');
      } else {
        setError(err.response?.data?.error || 'Could not generate background. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!generatedImage) return;
    onApplyBackground?.(generatedImage);
  };

  return (
    <div data-testid="ai-background-generator" className="flex flex-col flex-1 min-h-0 bg-[#fcfbf9]">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">

        {/* Info Banner */}
        <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/80 to-orange-50/40 p-3 text-xs text-slate-700">
          <div className="flex items-center gap-2 font-semibold text-amber-900">
            <Sparkles size={14} className="text-amber-600" />
            AI Certificate Frame & Texture Generator (Nano Banana)
          </div>
          <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">
            Generate high-resolution ornate borders, guilloche filigree, and textures. The generated frame sits behind your editable text fields and QR code.
          </p>
        </div>

        {/* Presets */}
        <div>
          <p className="text-[11px] font-bold text-slate-600 mb-2 uppercase tracking-wide">Popular Frame Styles</p>
          <div className="grid grid-cols-2 gap-1.5">
            {BG_PRESETS.map((preset) => (
              <button
                key={preset.label}
                data-testid={`bg-preset-${preset.label.toLowerCase().replace(/\s+/g, '-')}`}
                type="button"
                onClick={() => {
                  setPrompt(preset.prompt);
                  generate(preset.prompt);
                }}
                disabled={loading}
                className={`rounded-xl border p-2.5 text-left transition-all ${
                  prompt === preset.prompt
                    ? 'border-amber-500 bg-amber-50 text-amber-900 font-semibold shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50/40'
                } disabled:opacity-50`}
              >
                <p className="text-xs font-semibold leading-tight">{preset.label}</p>
                <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">{preset.prompt}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Prompt Box */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Or Describe Custom Frame</label>
          <div className="relative rounded-xl border border-slate-300 bg-white focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-100 transition-colors">
            <textarea
              data-testid="bg-prompt-input"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. Ornate royal gold certificate border frame with dark navy blue accents, clean blank center..."
              rows={2}
              maxLength={500}
              disabled={loading}
              className="w-full resize-none bg-transparent p-2.5 pr-10 text-xs text-slate-900 placeholder:text-slate-400 outline-none disabled:opacity-50"
            />
            <button
              data-testid="bg-generate-btn"
              type="button"
              onClick={() => generate()}
              disabled={loading || !prompt.trim()}
              aria-label="Generate AI background"
              className="absolute bottom-2 right-2 rounded-lg bg-amber-500 p-1.5 text-white hover:bg-amber-600 disabled:bg-slate-200 transition-colors shadow-xs"
            >
              <Wand2 size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            data-testid="bg-loading"
            className="rounded-xl border border-amber-200 bg-white p-4 text-center shadow-xs"
          >
            <div className="flex justify-center items-center gap-2 text-xs font-semibold text-slate-800">
              <Sparkles size={16} className="text-amber-500 animate-spin" />
              Generating high-resolution certificate frame…
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Creating symmetrical borders and empty central area</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-amber-100">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-600"
                animate={{ width: ['0%', '85%', '40%', '95%', '60%'] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          </motion.div>
        )}

        {/* Error State */}
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            data-testid="bg-error"
            className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 flex items-start gap-2 text-xs text-rose-800">
            <AlertCircle size={14} className="shrink-0 text-rose-500 mt-0.5" />
            <p>{error}</p>
          </motion.div>
        )}

        {/* Generated Image Result Card */}
        {generatedImage && !loading && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
            data-testid="bg-result-card"
            className="rounded-xl border border-emerald-200 bg-white shadow-xs overflow-hidden"
          >
            <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-3.5 py-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                <Check size={14} className="text-emerald-600" />
                Frame Ready ({providerUsed.includes('gemini') ? 'Gemini Imagen' : 'Procedural Vector'})
              </div>
              <button
                type="button"
                onClick={() => setZoomOpen(true)}
                className="rounded-md p-1 text-slate-500 hover:bg-emerald-100 hover:text-emerald-800 transition-colors"
                title="Zoom frame preview"
              >
                <ZoomIn size={14} />
              </button>
            </div>
            <div className="p-3 flex justify-center bg-slate-50 cursor-pointer" onClick={() => setZoomOpen(true)}>
              <img
                src={generatedImage}
                alt="Generated certificate background"
                className="max-h-48 max-w-full rounded-lg object-contain shadow-xs border border-slate-200"
              />
            </div>
            <div className="p-3 bg-white border-t border-slate-100 flex gap-2">
              <button
                data-testid="bg-apply-btn"
                type="button"
                onClick={apply}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2 text-xs font-bold text-white hover:bg-amber-600 shadow-sm transition-colors"
              >
                <Check size={14} /> Apply to Canvas
              </button>
              <button
                type="button"
                onClick={() => generate()}
                title="Regenerate another style"
                className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </motion.div>
        )}

        {/* Current Active Background Notice */}
        {currentBackground && !generatedImage && (
          <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon size={15} className="text-slate-500" />
              <span className="text-xs font-semibold text-slate-700">Active Background Image</span>
            </div>
            <button
              data-testid="bg-remove-active-btn"
              type="button"
              onClick={onRemoveBackground}
              className="flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700"
            >
              <Trash2 size={13} /> Remove
            </button>
          </div>
        )}
      </div>

      {/* Zoom Modal */}
      <AnimatePresence>
        {zoomOpen && generatedImage && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4"
            onClick={() => setZoomOpen(false)}
          >
            <div className="relative max-h-[85vh] max-w-[85vw] overflow-hidden rounded-xl bg-white p-2" onClick={e => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setZoomOpen(false)}
                className="absolute top-3 right-3 rounded-full bg-slate-900/70 p-1.5 text-white hover:bg-slate-900"
              >
                <X size={16} />
              </button>
              <img src={generatedImage} alt="Zoomed background" className="max-h-[80vh] max-w-[80vw] object-contain rounded-lg" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
