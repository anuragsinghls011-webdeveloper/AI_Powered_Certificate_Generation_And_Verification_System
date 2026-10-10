import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, X, Image as ImageIcon, Sparkles,
  Pencil, Wand2, RotateCcw, ZoomIn, AlertCircle, Check, Eye, Trash2, FileImage
} from 'lucide-react';
import { API } from '../../services/api';
import CertificateSurface from '../CertificateSurface';
import { previewDesign, designDiff, designFingerprint } from './aiDesignUtils';
import AIDesignDiff from './AIDesignDiff';

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

const STYLE_PRESETS = [
  { label: 'Modern Tech', prompt: 'Create a contemporary tech certificate with bold clean typography and subtle geometric accents' },
  { label: 'Classic Academic', prompt: 'Create an elegant classic academic certificate with prestigious serif fonts and traditional styling' },
  { label: 'Minimalist', prompt: 'Create a minimal, spacious design with restrained dark colors and fine typography' },
  { label: 'Luxury Gold', prompt: 'Create a luxurious premium award certificate with refined gold accents and elegant aesthetics' },
  { label: 'Corporate', prompt: 'Create a polished corporate achievement certificate with professional business styling' },
  { label: 'Hackathon', prompt: 'Create an energetic hackathon winner certificate with cyber tech styling and vibrant blue highlights' }
];

const THINKING_STAGES = [
  'Analyzing sketch strokes & boundaries…',
  'Detecting layout zones (title, recipient, QR, signatures)…',
  'Harmonizing typography & colors…',
  'Synthesizing editable certificate canvas…',
  'Polishing output & checking geometry…'
];

export default function SketchUploader({ template, onApply, onClose, onSwitchToChat }) {
  const [sketch, setSketch] = useState(null);        // { file, preview, name, base64 }
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  const fileInputRef = useRef(null);
  const controller = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    return () => {
      controller.current?.abort();
      if (sketch?.preview && !sketch.preview.startsWith('data:')) {
        URL.revokeObjectURL(sketch.preview);
      }
    };
  }, [sketch]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [proposal, error]);

  useEffect(() => {
    if (!loading) return undefined;
    const timer = setInterval(() => setStage(v => (v + 1) % THINKING_STAGES.length), 2200);
    return () => clearInterval(timer);
  }, [loading]);

  const validateFile = useCallback((file) => {
    if (!file) return 'No file selected';
    if (!ALLOWED_TYPES.includes(file.type)) return 'Only PNG, JPEG, and WebP images are supported';
    if (file.size > MAX_FILE_SIZE) return 'Image must be under 4MB';
    return null;
  }, []);

  const handleFile = useCallback((file) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (sketch?.preview && !sketch.preview.startsWith('data:')) {
      URL.revokeObjectURL(sketch.preview);
    }
    const preview = URL.createObjectURL(file);
    setSketch({ file, preview, name: file.name });
    setError('');
    setProposal(null);
  }, [validateFile, sketch]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const removeSketch = useCallback(() => {
    if (sketch?.preview && !sketch.preview.startsWith('data:')) {
      URL.revokeObjectURL(sketch.preview);
    }
    setSketch(null);
    setProposal(null);
    setError('');
  }, [sketch]);

  // Quick demo sketch generator for instant testing without needing paper on hand
  const loadDemoSketch = useCallback(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 792;
    canvas.height = 560;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#faf9f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Notebook lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let y = 30; y < 560; y += 22) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(792, y);
      ctx.stroke();
    }

    // Outer sketched border
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3;
    ctx.strokeRect(32, 28, 728, 504);
    ctx.lineWidth = 1;
    ctx.strokeRect(40, 36, 712, 488);

    // Sketch text elements
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ACADEMIC & TECHNOLOGY ACADEMY', 396, 70);

    ctx.font = 'bold 24px serif';
    ctx.strokeRect(180, 95, 432, 45);
    ctx.fillText('CERTIFICATE OF ACHIEVEMENT', 396, 126);

    ctx.font = 'italic 12px serif';
    ctx.fillText('This is proudly presented to:', 396, 170);

    ctx.font = 'bold 26px serif';
    ctx.strokeRect(150, 190, 492, 50);
    ctx.fillText('RECIPIENT FULL NAME', 396, 224);

    ctx.font = '12px sans-serif';
    ctx.fillText('For demonstrating outstanding leadership, exceptional competence, and excellence in', 396, 270);

    ctx.font = 'bold 16px sans-serif';
    ctx.strokeRect(180, 290, 432, 34);
    ctx.fillText('AI & WEB INNOVATION HACKATHON', 396, 313);

    // Date
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Date: 2026-10-10', 60, 380);

    // Signature
    ctx.beginPath();
    ctx.moveTo(80, 480);
    ctx.lineTo(260, 480);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText('Authorized Signatory', 170, 502);

    // QR square bottom right
    ctx.strokeRect(640, 420, 84, 84);
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('[ QR CODE ]', 682, 465);

    canvas.toBlob((blob) => {
      const file = new File([blob], 'demo_hand_drawn_sketch.png', { type: 'image/png' });
      handleFile(file);
      setPrompt('Create an elegant luxury gold award certificate with serif fonts');
    }, 'image/png');
  }, [handleFile]);

  const submit = async () => {
    if (loading) return;
    if (!sketch?.file) { setError('Upload a sketch image first'); return; }
    if (!prompt.trim()) { setError('Describe the style or theme you want'); return; }
    if (prompt.length > 1200) { setError('Keep your prompt under 1,200 characters'); return; }

    setError('');
    setLoading(true);
    setStage(0);
    setProposal(null);
    const abort = new AbortController();
    controller.current = abort;

    try {
      const formData = new FormData();
      formData.append('sketch', sketch.file);
      formData.append('prompt', prompt.trim());

      const response = await axios.post(`${API}/ai/design-from-sketch`, formData, {
        signal: abort.signal,
        timeout: 90000,
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const design = response.data?.design;
      if (!design || typeof design.summary !== 'string') throw new Error('Invalid response');

      // Build a preview using empty template since sketch generates from scratch
      const emptyTpl = { ...template, fields: [] };
      const choices = [{ name: 'Sketch-Derived Design', design }].map(choice => {
        const draft = previewDesign(emptyTpl, choice.design);
        return { ...choice, template: draft, diff: designDiff(emptyTpl, draft) };
      });

      setProposal({ choices, summary: design.summary });
    } catch (err) {
      if (!axios.isCancel(err)) {
        if (err.response?.status === 401 || err.response?.status === 403) {
          setError('Your session cannot use the AI designer. Please sign in with design access.');
        } else if (err.response?.status === 413) {
          setError('The sketch image is too large. Please use an image under 4MB.');
        } else if (err.response?.status === 429) {
          setError('Too many requests. Please wait a moment before trying again.');
        } else if (err.response?.status === 422) {
          setError(err.response.data?.error || 'Could not interpret the sketch into a valid certificate layout. Try a clearer sketch or more detailed prompt.');
        } else if (err.code === 'ECONNABORTED') {
          setError('The design request timed out. Please try again.');
        } else {
          setError(err.response?.data?.error || 'The AI sketch designer is unavailable right now. Please try again later.');
        }
      }
    } finally {
      setLoading(false);
      controller.current = null;
    }
  };

  const applyChoice = (index) => {
    const choice = proposal?.choices[index];
    if (!choice) { setError('No design proposal to apply'); return; }
    // Pass current template fingerprint
    if (onApply(choice.design, designFingerprint(template))) {
      setProposal(null);
      setPreviewIndex(null);
      setError('');
    } else {
      setError('Could not apply design. Please try again.');
    }
  };

  const selectedPreview = previewIndex !== null ? proposal?.choices[previewIndex] : null;
  const modalScale = Math.min(0.84, (typeof window === 'undefined' ? 350 : window.innerWidth - 40) / 792);

  return (
    <div data-testid="sketch-uploader" className="flex flex-col flex-1 min-h-0 bg-[#fcfbf9]">
      {/* Scrollable middle content */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">

        {/* Intro banner */}
        <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-indigo-50/40 p-3 text-xs text-slate-700">
          <div className="flex items-center gap-2 font-semibold text-violet-900">
            <Pencil size={14} className="text-violet-600" />
            Hand-Drawn Sketch to Certificate
          </div>
          <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">
            Draw your certificate layout on paper with a pen, snap a photo, and upload it here. The AI will analyze the placement of your title, recipient, signatures, and QR code to generate a fully editable template.
          </p>
        </div>

        {/* Upload Zone */}
        {!sketch ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            data-testid="sketch-dropzone"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200
              ${dragActive
                ? 'border-violet-500 bg-violet-50 scale-[1.01] shadow-md shadow-violet-200/50'
                : 'border-slate-300 bg-white hover:border-violet-400 hover:bg-violet-50/40 hover:shadow-sm'
              }`}
          >
            <input
              ref={fileInputRef}
              data-testid="sketch-file-input"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
            />
            <div className="flex flex-col items-center gap-2.5 py-8 px-5">
              <div className={`rounded-xl p-3 transition-colors ${dragActive ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-500'}`}>
                <Upload size={26} strokeWidth={1.7} />
              </div>
              <div className="text-center">
                <p className="text-xs font-bold text-slate-800">
                  {dragActive ? 'Drop your sketch image here' : 'Upload photo of your hand-drawn sketch'}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  PNG, JPEG, WebP up to 4MB
                </p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  className="rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-500 transition-colors"
                >
                  <ImageIcon size={13} className="inline mr-1.5 -mt-0.5" />Browse Photo
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); loadDemoSketch(); }}
                  className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 transition-colors"
                >
                  <FileImage size={13} className="inline mr-1 -mt-0.5" />Try Demo Sketch
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
            data-testid="sketch-preview-card"
            className="rounded-xl border border-violet-200 bg-white shadow-sm overflow-hidden"
          >
            <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 to-white px-3.5 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <ImageIcon size={14} className="shrink-0 text-violet-600" />
                <p className="text-xs font-semibold text-slate-800 truncate">{sketch.name}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  data-testid="sketch-zoom"
                  type="button"
                  onClick={() => setZoomOpen(true)}
                  title="Zoom sketch"
                  className="rounded-lg p-1 text-slate-500 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  data-testid="sketch-change"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg px-2 py-0.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
                >
                  Change
                </button>
                <button
                  data-testid="sketch-remove"
                  type="button"
                  onClick={removeSketch}
                  className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
              />
            </div>
            <div className="p-3 flex justify-center bg-slate-50 cursor-pointer" onClick={() => setZoomOpen(true)}>
              <img
                data-testid="sketch-preview-image"
                src={sketch.preview}
                alt="Uploaded sketch"
                className="max-h-44 max-w-full rounded-lg object-contain shadow-sm border border-slate-200"
              />
            </div>
          </motion.div>
        )}

        {/* Style presets */}
        {sketch && !proposal && !loading && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-[11px] font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Quick Style Presets</p>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  data-testid={`sketch-preset-${preset.label.toLowerCase().replace(/\s+/g, '-')}`}
                  type="button"
                  onClick={() => setPrompt(preset.prompt)}
                  className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors
                    ${prompt === preset.prompt
                      ? 'border-violet-500 bg-violet-100 text-violet-800 font-semibold'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50/60'
                    }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Loading indicator */}
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            data-testid="sketch-thinking" role="status"
            className="rounded-xl border border-violet-200 bg-white p-4 shadow-sm"
          >
            <div className="flex gap-2 items-center text-xs font-semibold text-slate-800">
              <Wand2 size={16} className="text-violet-600 animate-spin" style={{ animationDuration: '3s' }} />
              Translating hand-drawn sketch to certificate…
            </div>
            <p data-testid="sketch-stage" className="mt-2 text-xs text-slate-600">{THINKING_STAGES[stage]}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-violet-100">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-600"
                animate={{ width: ['0%', '75%', '40%', '95%', '60%'] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
            <p className="mt-2 text-[10px] text-slate-400">Analyzing layout zones, text hierarchy and border contours</p>
          </motion.div>
        )}

        {/* Error message */}
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            data-testid="sketch-error" role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 p-3 flex items-start gap-2">
            <AlertCircle size={15} className="shrink-0 text-rose-500 mt-0.5" />
            <p className="text-xs text-rose-800 leading-snug">{error}</p>
          </motion.div>
        )}

        {/* Proposal result */}
        {proposal && !loading && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3.5 mb-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                <Check size={15} className="text-emerald-600" />
                Template Generated from Sketch
              </div>
              <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">{proposal.summary}</p>
            </div>

            <AIDesignDiff
              choice={proposal.choices[0]}
              index={0}
              onApply={() => applyChoice(0)}
              onCancel={() => setProposal(null)}
              onPreview={() => setPreviewIndex(0)}
            />
          </motion.div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Bottom prompt input bar */}
      <div className="shrink-0 border-t border-slate-200 bg-white p-3.5 space-y-2.5">
        {sketch && !loading && !proposal && (
          <form data-testid="sketch-prompt-form" onSubmit={e => { e.preventDefault(); submit(); }}
            className="relative rounded-xl border border-slate-300 bg-slate-50 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-100 transition-colors">
            <textarea
              data-testid="sketch-prompt-input"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              maxLength={1200}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder="Describe your design style, colors, fonts, or certificate title (e.g., 'Modern academic certificate with navy and gold accents')…"
              rows={2}
              disabled={loading}
              className="w-full resize-none bg-transparent p-3 pr-12 text-xs text-slate-900 placeholder:text-slate-400 outline-none disabled:opacity-50"
            />
            <button
              data-testid="sketch-generate-btn"
              type="submit"
              disabled={loading || !prompt.trim() || !sketch}
              aria-label="Generate from sketch"
              title="Generate template from sketch"
              className="absolute bottom-2 right-2 rounded-lg bg-violet-600 p-2 text-white hover:bg-violet-500 disabled:bg-slate-300 transition-colors shadow-sm"
            >
              <Sparkles size={15} />
            </button>
          </form>
        )}

        {proposal && !loading && (
          <button
            data-testid="sketch-regenerate"
            type="button"
            onClick={() => { setProposal(null); setError(''); }}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <RotateCcw size={13} /> Try another style with this sketch
          </button>
        )}

        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <button
            data-testid="sketch-switch-chat"
            type="button"
            onClick={onSwitchToChat}
            className="flex items-center gap-1 font-medium text-slate-600 hover:text-violet-600 transition-colors"
          >
            <Sparkles size={11} className="text-violet-500" /> Switch to AI Chat
          </button>
          <span className="flex items-center gap-1">
            <Pencil size={10} className="text-violet-500" /> Sketch mode
          </span>
        </div>
      </div>

      {/* Full preview modal */}
      <AnimatePresence>
        {selectedPreview && (
          <motion.div data-testid="sketch-preview-modal" role="dialog" aria-label="Sketch design preview"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-slate-950/85 p-5"
            onClick={() => setPreviewIndex(null)}
          >
            <div className="flex w-full max-w-3xl items-center justify-between text-white">
              <p data-testid="sketch-preview-title" className="font-serif text-lg font-semibold">{selectedPreview.name}</p>
              <button data-testid="sketch-preview-close" type="button" onClick={() => setPreviewIndex(null)}
                aria-label="Close preview" className="rounded-lg p-2 hover:bg-white/10">
                <X size={20} />
              </button>
            </div>
            <div className="max-w-full overflow-auto rounded-md shadow-2xl" onClick={e => e.stopPropagation()}>
              <CertificateSurface template={selectedPreview.template} scale={modalScale} testId="sketch-preview-surface" />
            </div>
            <button data-testid="sketch-preview-apply" type="button"
              onClick={e => { e.stopPropagation(); applyChoice(previewIndex); }}
              className="rounded-xl bg-violet-600 px-7 py-2.5 text-sm font-bold text-white hover:bg-violet-500 transition-colors shadow-lg"
            >
              Apply this design
            </button>
          </motion.div>
        )}

        {/* Sketch Image Zoom Modal */}
        {zoomOpen && sketch?.preview && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4"
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
              <img src={sketch.preview} alt="Zoomed sketch" className="max-h-[80vh] max-w-[80vw] object-contain rounded-lg" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
