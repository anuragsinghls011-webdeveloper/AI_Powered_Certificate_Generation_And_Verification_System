import React, { useState } from 'react';
import axios from 'axios';
import {
  ShieldCheck, CheckCircle2, AlertTriangle, Download, Linkedin, Twitter
} from 'lucide-react';

export default function VerifyPage({ apiBase }) {
  const [verifySearchId, setVerifySearchId] = useState('');
  const [verifiedCert, setVerifiedCert] = useState(null);
  const [verifyError, setVerifyError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleLinkedInPost = async (e) => {
    e.preventDefault();
    if (!verifiedCert) return;
    
    const text = `🎉 I'm excited to share that I have successfully completed ${verifiedCert.event_title} from ${verifiedCert.organization_name}.\n\nThis credential recognizes my achievement as a ${verifiedCert.role} with a grade of ${verifiedCert.grade}.\n\n🔗 Verify my credential: ${verifiedCert.verification_url}\n\n#${verifiedCert.event_category.replace(/[^a-zA-Z0-9]/g, '') || 'Achievement'} #Certification #Learning #${verifiedCert.organization_name.replace(/[^a-zA-Z0-9]/g, '') || 'Success'}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
      
      const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(verifiedCert.verification_url)}`;
      window.open(shareUrl, '_blank');
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleVerifyCertificate = async (e) => {
    e.preventDefault();
    if (!verifySearchId.trim()) return;
    setVerifyError('');
    setVerifiedCert(null);
    try {
      const res = await axios.get(`${apiBase}/verify/${verifySearchId.trim()}`);
      setVerifiedCert(res.data);
    } catch (err) {
      setVerifyError('Certificate not found or ID is invalid. Please check and try again.');
    }
  };

  const getLinkedInUrl = () => {
    if (!verifiedCert) return '#';
    const baseUrl = 'https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME';
    const name = encodeURIComponent(verifiedCert.event_title);
    const org = encodeURIComponent(verifiedCert.organization_name);
    const certId = encodeURIComponent(verifiedCert.cert_id);
    const certUrl = encodeURIComponent(verifiedCert.verification_url);
    const issueDate = new Date(verifiedCert.issue_date);
    const year = issueDate.getFullYear() || '';
    const month = issueDate.getMonth() + 1 || '';
    return `${baseUrl}&name=${name}&organizationName=${org}&issueYear=${year}&issueMonth=${month}&certId=${certId}&certUrl=${certUrl}`;
  };

  const getTwitterUrl = () => {
    if (!verifiedCert) return '#';
    const text = encodeURIComponent(`I just earned the ${verifiedCert.event_title} certificate from ${verifiedCert.organization_name}!`);
    const certUrl = encodeURIComponent(verifiedCert.verification_url);
    return `https://twitter.com/intent/tweet?text=${text}&url=${certUrl}`;
  };

  return (
    <div data-testid="verify-portal-view" className="space-y-8 max-w-3xl mx-auto">
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 text-center">
        <div className="inline-flex p-4 bg-emerald-50 text-emerald-600 rounded-2xl mb-4">
          <ShieldCheck className="w-10 h-10" />
        </div>
        <h3 className="text-2xl font-bold font-serif text-slate-900">Official Certificate Verification Portal</h3>
        <p className="text-sm text-slate-500 mt-2 max-w-lg mx-auto">
          Employers, academic institutions, and organizations can instantly verify the authenticity of any college certificate issued on our platform.
        </p>

        <form onSubmit={handleVerifyCertificate} className="mt-6 flex gap-3 max-w-lg mx-auto">
          <input 
            data-testid="verify-input-id"
            type="text" 
            value={verifySearchId}
            onChange={e => setVerifySearchId(e.target.value)}
            placeholder="Enter Certificate ID (e.g. CERT-2025-XXXX)" 
            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:border-brand-600 shadow-sm"
          />
          <button 
            data-testid="verify-submit-btn"
            type="submit" 
            className="px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition shadow"
          >
            Verify Now
          </button>
        </form>

        {verifyError && (
          <div data-testid="verify-error" className="mt-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center justify-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
            <span>{verifyError}</span>
          </div>
        )}
      </div>

      {verifiedCert && (
        <div data-testid="verify-success-card" className="bg-white p-8 rounded-3xl shadow-lg border-2 border-emerald-500 relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider px-6 py-2 rounded-bl-2xl flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> Authentic & Verified
          </div>
          
          <div className="flex flex-col md:flex-row gap-6 items-center border-b border-slate-100 pb-6">
            <div className="bg-slate-100 p-3 rounded-2xl border border-slate-200">
              <img src={`data:image/png;base64,${verifiedCert.qr_code_b64}`} alt="QR Code" className="w-32 h-32 object-contain" />
            </div>
            <div>
              <span className="text-xs font-mono bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-md">{verifiedCert.cert_id}</span>
              <h4 className="text-2xl font-bold font-serif text-slate-900 mt-2">{verifiedCert.recipient_name}</h4>
              <p className="text-sm text-slate-500">{verifiedCert.recipient_email}</p>
              <p className="text-xs text-slate-400 mt-1">Issued Date: {verifiedCert.issue_date}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase">Event Details</p>
              <p className="font-bold text-slate-800 mt-1">{verifiedCert.event_title}</p>
              <p className="text-xs text-slate-600 mt-0.5">Category: {verifiedCert.event_category}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase">Role & Achievement</p>
              <p className="font-bold text-brand-600 mt-1">{verifiedCert.role}</p>
              <p className="text-xs text-slate-600 mt-0.5">{verifiedCert.grade}</p>
            </div>
            
            <div className="md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <p className="text-xs font-semibold text-slate-400 uppercase">Complete Details & Description</p>
              <p className="text-sm text-slate-700 mt-1 leading-relaxed">{verifiedCert.event_description}</p>
            </div>
            
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase">Authorized Signatory</p>
              <p className="font-bold text-slate-800 mt-1">{verifiedCert.organization_name}</p>
              <p className="text-xs text-slate-600 mt-0.5">
                {verifiedCert.issuer_name}{verifiedCert.issuer_title ? ` - ${verifiedCert.issuer_title}` : ''}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase">Status</p>
              <p className="font-bold text-emerald-600 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> {verifiedCert.status} (Valid Digital Record)
              </p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button 
              onClick={() => {
                import('../services/api').then(module => {
                  module.downloadCertificatePdf(verifiedCert.cert_id);
                });
              }}
              className="py-3 bg-brand-600 text-white font-semibold rounded-xl text-center hover:bg-brand-700 transition flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" /> Download PDF
            </button>
            <button 
              onClick={handleLinkedInPost}
              className="py-3 bg-[#0077b5] text-white font-semibold rounded-xl text-center hover:bg-[#006396] transition flex items-center justify-center gap-2 relative overflow-hidden"
            >
              <Linkedin className="w-5 h-5" /> {copied ? 'Post Text Copied!' : 'Share Post (LinkedIn)'}
            </button>
            <a 
              href={getLinkedInUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="py-3 bg-slate-100 border border-slate-200 text-slate-700 font-semibold rounded-xl text-center hover:bg-slate-200 transition flex items-center justify-center gap-2"
            >
              <Linkedin className="w-5 h-5 text-[#0077b5]" /> Add to Profile
            </a>
            <a 
              href={getTwitterUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="py-3 bg-[#1DA1F2] text-white font-semibold rounded-xl text-center hover:bg-[#1a91da] transition flex items-center justify-center gap-2"
            >
              <Twitter className="w-5 h-5" /> Share Tweet
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
