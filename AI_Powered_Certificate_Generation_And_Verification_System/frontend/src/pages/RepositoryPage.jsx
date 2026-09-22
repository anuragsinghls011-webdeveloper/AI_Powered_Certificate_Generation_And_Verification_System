import React, { useState, useEffect } from 'react';
import {
  Search, FileText, Download, Send, Trash2
} from 'lucide-react';

export default function RepositoryPage({
  certificates, events, onSendEmail, onRevoke, onBulkRevoke, setPreviewCert, apiBase
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEvent, setFilterEvent] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCerts, setSelectedCerts] = useState(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIndex, setDragStartIndex] = useState(null);
  const [dragBaseSelection, setDragBaseSelection] = useState(new Set());
  const itemsPerPage = 10;

  useEffect(() => {
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterEvent]);

  const filteredCertificates = certificates.filter(cert => {
    const matchesSearch = searchTerm === '' || 
      cert.recipient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert.recipient_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert.cert_id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEvent = filterEvent === '' || cert.event_id === filterEvent;
    return matchesSearch && matchesEvent;
  });

  const totalPages = Math.max(1, Math.ceil(filteredCertificates.length / itemsPerPage));
  const currentCertificates = filteredCertificates.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedCerts(new Set(currentCertificates.map(c => c.cert_id)));
    } else {
      setSelectedCerts(new Set());
    }
  };

  const handleSelectOne = (certId, checked) => {
    const newSelected = new Set(selectedCerts);
    if (checked) newSelected.add(certId);
    else newSelected.delete(certId);
    setSelectedCerts(newSelected);
  };

  const handleMouseDown = (e, certId, index) => {
    if (e.button !== 0 || e.target.closest('button') || e.target.closest('input')) return;
    
    setIsDragging(true);
    setDragStartIndex(index);
    
    let base = new Set(selectedCerts);
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      base = new Set();
    }
    setDragBaseSelection(base);
    
    if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      for (let i = start; i <= end; i++) {
        base.add(currentCertificates[i].cert_id);
      }
      setSelectedCerts(new Set(base));
    } else if (e.ctrlKey || e.metaKey) {
      if (base.has(certId)) base.delete(certId);
      else base.add(certId);
      setSelectedCerts(new Set(base));
      setLastSelectedIndex(index);
    } else {
      base.add(certId);
      setSelectedCerts(new Set(base));
      setLastSelectedIndex(index);
    }
  };

  const handleMouseEnter = (index) => {
    if (!isDragging || dragStartIndex === null) return;
    
    const start = Math.min(dragStartIndex, index);
    const end = Math.max(dragStartIndex, index);
    
    const newSel = new Set(dragBaseSelection);
    for (let i = start; i <= end; i++) {
      newSel.add(currentCertificates[i].cert_id);
    }
    setSelectedCerts(newSel);
    setLastSelectedIndex(index);
  };

  const handleBulkDelete = () => {
    if (selectedCerts.size === 0) return;
    onBulkRevoke(Array.from(selectedCerts));
    setSelectedCerts(new Set());
  };

  const allCurrentSelected = currentCertificates.length > 0 && currentCertificates.every(c => selectedCerts.has(c.cert_id));

  return (
    <div data-testid="repository-view" className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h3 className="text-xl font-bold font-serif text-slate-900">Certificate Repository</h3>
          <p className="text-xs text-slate-500 mt-1">Manage, search, download PDF, or resend notifications for all issued certificates.</p>
          {selectedCerts.size === 0 && <p className="text-xs text-emerald-600 mt-1 font-medium flex items-center gap-1 animate-pulse">💡 Tip: Click and drag your mouse over rows to select them.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {selectedCerts.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl shadow transition-colors flex items-center gap-2 animate-fade-in"
            >
              <Trash2 className="w-4 h-4" />
              Delete Selected ({selectedCerts.size})
            </button>
          )}
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
            <input 
              data-testid="repo-search-input"
              type="text" 
              placeholder="Search name, email, ID..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-600"
            />
          </div>
          <select 
            data-testid="repo-event-filter"
            value={filterEvent}
            onChange={e => setFilterEvent(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand-600"
          >
            <option value="">All Events</option>
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>{ev.title}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Certificates Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase border-b border-slate-200">
                {selectedCerts.size > 0 && (
                  <th className="p-4 w-12 transition-all animate-fade-in">
                    <input 
                      type="checkbox" 
                      checked={allCurrentSelected}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500 cursor-pointer"
                    />
                  </th>
                )}
                <th className="p-4">Certificate ID</th>
                <th className="p-4">Recipient</th>
                <th className="p-4">Event & Role</th>
                <th className="p-4">Issue Date</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {currentCertificates.length === 0 ? (
                <tr>
                  <td colSpan={selectedCerts.size > 0 ? "7" : "6"} className="text-center py-12 text-slate-400">
                    No certificates found matching criteria.
                  </td>
                </tr>
              ) : (
                currentCertificates.map((cert, index) => (
                  <tr 
                    key={cert.cert_id} 
                    onMouseDown={(e) => handleMouseDown(e, cert.cert_id, index)}
                    onMouseEnter={() => handleMouseEnter(index)}
                    onDoubleClick={() => setPreviewCert(cert)}
                    className={`hover:bg-slate-50/80 transition cursor-default select-none ${selectedCerts.has(cert.cert_id) ? 'bg-brand-50 border-l-4 border-brand-500' : 'border-l-4 border-transparent'}`}
                  >
                    {selectedCerts.size > 0 && (
                      <td className="p-4 transition-all animate-fade-in">
                        <input 
                          type="checkbox"
                          checked={selectedCerts.has(cert.cert_id)}
                          onChange={(e) => handleSelectOne(cert.cert_id, e.target.checked)}
                          className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="p-4 font-mono font-medium text-brand-600">{cert.cert_id}</td>
                    <td className="p-4">
                      <p className="font-semibold text-slate-900">{cert.recipient_name}</p>
                      <p className="text-xs text-slate-500">{cert.recipient_email}</p>
                    </td>
                    <td className="p-4">
                      <p className="font-medium text-slate-800">{cert.event_title}</p>
                      <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{cert.role}</span>
                    </td>
                    <td className="p-4 text-slate-600">{cert.issue_date}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        cert.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cert.status === 'Active' ? 'bg-emerald-600' : 'bg-rose-600'}`}></span>
                        {cert.status}
                      </span>
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <button 
                        data-testid={`preview-repo-${cert.cert_id}`}
                        onClick={() => setPreviewCert(cert)}
                        className="p-2 text-brand-600 hover:bg-brand-50 rounded-lg transition inline-flex"
                        title="Preview Certificate"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                      <button 
                        data-testid={`download-pdf-${cert.cert_id}`}
                        onClick={() => {
                          import('../services/api').then(module => {
                            module.downloadCertificatePdf(cert.cert_id);
                          });
                        }}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition inline-flex"
                        title="Download PDF"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button 
                        data-testid={`send-email-${cert.cert_id}`}
                        onClick={() => onSendEmail(cert.cert_id)}
                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition inline-flex"
                        title="Simulate Email Dispatch"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                      <button 
                        data-testid={`revoke-${cert.cert_id}`}
                        onClick={() => onRevoke(cert.cert_id)}
                        className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition inline-flex"
                        title="Revoke Certificate"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredCertificates.length)} of {filteredCertificates.length} certificates
            </span>
            <div className="flex gap-2">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 disabled:opacity-40 bg-white hover:bg-slate-50 transition"
              >
                Previous
              </button>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 disabled:opacity-40 bg-white hover:bg-slate-50 transition"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
