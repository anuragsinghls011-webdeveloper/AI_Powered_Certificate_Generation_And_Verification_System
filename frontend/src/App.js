import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Award, Calendar, Users, FileText, QrCode, ShieldCheck, 
  BarChart3, Plus, Trash2, Download, Send, CheckCircle2, 
  Search, RefreshCw, Layers, Sparkles, Building2, UserCheck, AlertTriangle, Wand2, Rocket, Loader2
} from 'lucide-react';
import DesignStudio from './DesignStudio';
import BulkStudio from './BulkStudio';
import { useAuth } from './auth/AuthContext';
import AuthPages from './auth/AuthPages';
import UserMenu from './auth/UserMenu';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [events, setEvents] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({ message: '', type: '' });

  // Event form state
  const [newEvent, setNewEvent] = useState({
    title: '',
    category: 'Workshop',
    date: new Date().toISOString().split('T')[0],
    description: '',
    organizer: '',
    location: 'Main Campus Auditorium'
  });

  // Bulk Generator State
  const [bulkData, setBulkData] = useState({
    event_id: '',
    template_id: '',
    participantsText: 'John Doe, john@example.com, Winner, First Place\nJane Smith, jane@example.com, Participant, Completed Successfully',
    issue_date: new Date().toISOString().split('T')[0]
  });

  // Verification Portal State
  const [verifySearchId, setVerifySearchId] = useState('');
  const [verifiedCert, setVerifiedCert] = useState(null);
  const [verifyError, setVerifyError] = useState('');

  // Selected certificate for preview modal
  const [previewCert, setPreviewCert] = useState(null);

  // Search & Filter in Repository
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEvent, setFilterEvent] = useState('');

  useEffect(() => {
    if (user) fetchAllData();
  }, [user]);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: '', type: '' }), 4000);
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [evRes, tplRes, certRes, anRes] = await Promise.all([
        axios.get(`${API}/events`),
        axios.get(`${API}/templates`),
        axios.get(`${API}/certificates`),
        axios.get(`${API}/analytics`)
      ]);
      setEvents(evRes.data);
      setTemplates(tplRes.data);
      setCertificates(certRes.data);
      setAnalytics(anRes.data);
      if (evRes.data.length > 0 && !bulkData.event_id) {
        setBulkData(prev => ({ ...prev, event_id: evRes.data[0].id }));
      }
      if (tplRes.data.length > 0 && !bulkData.template_id) {
        setBulkData(prev => ({ ...prev, template_id: tplRes.data[0].id }));
      }
    } catch (err) {
      console.error(err);
      showNotification('Failed to connect to backend server', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Event handlers
  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!newEvent.title || !newEvent.organizer) {
      showNotification('Please fill in required event fields', 'error');
      return;
    }
    try {
      await axios.post(`${API}/events`, newEvent);
      showNotification('Event created successfully!');
      setNewEvent({
        title: '',
        category: 'Workshop',
        date: new Date().toISOString().split('T')[0],
        description: '',
        organizer: '',
        location: 'Main Campus Auditorium'
      });
      fetchAllData();
    } catch (err) {
      showNotification('Error creating event', 'error');
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm('Are you sure you want to delete this event?')) return;
    try {
      await axios.delete(`${API}/events/${eventId}`);
      showNotification('Event deleted successfully');
      fetchAllData();
    } catch (err) {
      showNotification('Error deleting event', 'error');
    }
  };

  const handleBulkGenerate = async (e) => {
    e.preventDefault();
    if (!bulkData.event_id || !bulkData.template_id) {
      showNotification('Please select an event and template', 'error');
      return;
    }

    const lines = bulkData.participantsText.trim().split('\n');
    const participants = lines.map(line => {
      const parts = line.split(',').map(p => p.trim());
      return {
        name: parts[0] || 'Unknown',
        email: parts[1] || 'participant@example.com',
        role: parts[2] || 'Participant',
        grade: parts[3] || 'Successfully Completed'
      };
    }).filter(p => p.name);

    if (participants.length === 0) {
      showNotification('Please add at least one participant', 'error');
      return;
    }

    try {
      setLoading(true);
      const res = await axios.post(`${API}/certificates/generate-bulk`, {
        event_id: bulkData.event_id,
        template_id: bulkData.template_id,
        participants,
        issue_date: bulkData.issue_date
      });
      showNotification(res.data.message);
      setActiveTab('repository');
      fetchAllData();
    } catch (err) {
      showNotification('Error generating certificates', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCertificate = async (e) => {
    e.preventDefault();
    if (!verifySearchId.trim()) return;
    setVerifyError('');
    setVerifiedCert(null);
    try {
      const res = await axios.get(`${API}/certificates/${verifySearchId.trim()}`);
      setVerifiedCert(res.data);
    } catch (err) {
      setVerifyError('Certificate not found or ID is invalid. Please check and try again.');
    }
  };

  const handleSendEmail = async (certId) => {
    try {
      const res = await axios.post(`${API}/certificates/${certId}/send-email`);
      showNotification(res.data.message);
      fetchAllData();
    } catch (err) {
      showNotification('Failed to send email', 'error');
    }
  };

  const handleRevoke = async (certId) => {
    if (!window.confirm('Are you sure you want to revoke this certificate?')) return;
    try {
      await axios.delete(`${API}/certificates/${certId}`);
      showNotification('Certificate revoked');
      fetchAllData();
    } catch (err) {
      showNotification('Failed to revoke certificate', 'error');
    }
  };

  const filteredCertificates = certificates.filter(cert => {
    const matchesSearch = searchTerm === '' || 
      cert.recipient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert.recipient_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert.cert_id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEvent = filterEvent === '' || cert.event_id === filterEvent;
    return matchesSearch && matchesEvent;
  });

  // Gate the app behind auth
  if (authLoading) {
    return (
      <div data-testid="auth-loading" className="min-h-screen bg-slate-950 grid place-items-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-brand-400 animate-spin mx-auto mb-3" />
          <p className="text-slate-300 text-sm">Loading your workspace…</p>
        </div>
      </div>
    );
  }
  if (!user) return <AuthPages />;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Top Banner / Notification */}
      {notification.message && (
        <div data-testid="notification-banner" className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white font-medium flex items-center gap-3 transition-all ${
          notification.type === 'error' ? 'bg-rose-600' : 'bg-emerald-600'
        }`}>
          {notification.type === 'error' ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <header className="bg-slate-900 text-white shadow-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-brand-600 p-2.5 rounded-xl shadow-inner text-white">
              <Award className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-serif tracking-tight">CampusCert Pro</h1>
              <p className="text-xs text-slate-400">Centralized Certificate Generation & Management System</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button 
              data-testid="nav-dashboard"
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'dashboard' ? 'bg-brand-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}
            >
              Dashboard
            </button>
            <button 
              data-testid="nav-events"
              onClick={() => setActiveTab('events')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'events' ? 'bg-brand-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}
            >
              Events
            </button>
            <button 
              data-testid="nav-bulk"
              onClick={() => setActiveTab('bulk')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'bulk' ? 'bg-brand-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}
            >
              Bulk Generator
            </button>
            <button 
              data-testid="nav-bulk-studio"
              onClick={() => setActiveTab('bulk-studio')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${activeTab === 'bulk-studio' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}
            >
              <Rocket className="w-4 h-4" /> Bulk Studio
            </button>
            <button 
              data-testid="nav-repository"
              onClick={() => setActiveTab('repository')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'repository' ? 'bg-brand-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}
            >
              Repository ({certificates.length})
            </button>
            <button 
              data-testid="nav-design-studio"
              onClick={() => setActiveTab('design')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${activeTab === 'design' ? 'bg-brand-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}
            >
              <Wand2 className="w-4 h-4" /> Design Studio
            </button>
            <button 
              data-testid="nav-verify"
              onClick={() => setActiveTab('verify')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'verify' ? 'bg-brand-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}
            >
              Verify Portal
            </button>
          </div>

          <UserMenu />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8">

        {/* ================= DASHBOARD TAB ================= */}
        {activeTab === 'dashboard' && (
          <div data-testid="dashboard-view" className="space-y-8">
            <div className="bg-gradient-to-r from-brand-900 via-brand-700 to-indigo-800 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
              <div className="absolute right-0 top-0 opacity-10 translate-x-10 -translate-y-10">
                <Award className="w-96 h-96" />
              </div>
              <div className="relative z-10 max-w-2xl">
                <span className="bg-brand-500/30 border border-brand-400/30 text-brand-100 text-xs px-3 py-1 rounded-full uppercase font-semibold tracking-wider">
                  Automated Academic & Event Issuance
                </span>
                <h2 className="text-3xl md:text-4xl font-bold font-serif mt-3">Streamline College Certificates with QR Verification</h2>
                <p className="text-slate-200 mt-2 text-sm md:text-base">
                  Automate the creation, bulk issuance, digital signatures, and instant QR verification for workshops, hackathons, conferences, and seminars.
                </p>
                <div className="mt-6 flex flex-wrap gap-4">
                  <button 
                    data-testid="goto-bulk-btn"
                    onClick={() => setActiveTab('bulk')}
                    className="bg-white text-brand-900 font-semibold px-6 py-3 rounded-xl shadow-lg hover:bg-slate-100 transition flex items-center gap-2"
                  >
                    <Plus className="w-5 h-5 text-brand-600" /> Generate Bulk Certificates
                  </button>
                  <button 
                    data-testid="goto-verify-btn"
                    onClick={() => setActiveTab('verify')}
                    className="bg-brand-600/60 border border-white/30 text-white font-semibold px-6 py-3 rounded-xl hover:bg-brand-600 transition flex items-center gap-2"
                  >
                    <ShieldCheck className="w-5 h-5" /> Verify a Certificate
                  </button>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div data-testid="stat-total-certs" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
                <div className="p-4 bg-blue-50 text-brand-600 rounded-2xl">
                  <Award className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-sm text-slate-500 font-medium">Total Issued</p>
                  <h3 className="text-2xl font-bold text-slate-900">{analytics?.total_certificates || 0}</h3>
                </div>
              </div>

              <div data-testid="stat-events" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
                <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
                  <Calendar className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-sm text-slate-500 font-medium">College Events</p>
                  <h3 className="text-2xl font-bold text-slate-900">{analytics?.total_events || 0}</h3>
                </div>
              </div>

              <div data-testid="stat-templates" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
                <div className="p-4 bg-purple-50 text-purple-600 rounded-2xl">
                  <Layers className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-sm text-slate-500 font-medium">Templates</p>
                  <h3 className="text-2xl font-bold text-slate-900">{analytics?.total_templates || 0}</h3>
                </div>
              </div>

              <div data-testid="stat-active" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
                <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-sm text-slate-500 font-medium">Active & Valid</p>
                  <h3 className="text-2xl font-bold text-slate-900">{analytics?.active_certificates || 0}</h3>
                </div>
              </div>
            </div>

            {/* Recent Certificates & Events Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold font-serif text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-brand-600" /> Recent Issued Certificates
                  </h3>
                  <button 
                    onClick={() => setActiveTab('repository')}
                    className="text-sm text-brand-600 hover:text-brand-700 font-semibold"
                  >
                    View All →
                  </button>
                </div>
                {certificates.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p>No certificates issued yet. Go to Bulk Generator to issue certificates.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {certificates.slice(0, 5).map((cert) => (
                      <div key={cert.cert_id} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition">
                        <div>
                          <p className="font-semibold text-slate-900">{cert.recipient_name}</p>
                          <p className="text-xs text-slate-500">{cert.event_title} • <span className="text-brand-600 font-medium">{cert.role}</span></p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono bg-slate-200 text-slate-700 px-2.5 py-1 rounded-md">{cert.cert_id}</span>
                          <button 
                            data-testid={`preview-cert-${cert.cert_id}`}
                            onClick={() => setPreviewCert(cert)}
                            className="p-2 text-brand-600 hover:bg-brand-50 rounded-lg transition"
                            title="Preview Certificate"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          <a 
                            href={`${API}/certificates/${cert.cert_id}/download-pdf`}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                            title="Download PDF"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Events Panel */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold font-serif text-slate-900 mb-4 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-emerald-600" /> Active Events
                  </h3>
                  <div className="space-y-3">
                    {events.map((ev) => (
                      <div key={ev.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50">
                        <div className="flex justify-between items-start">
                          <span className="text-xs font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">{ev.category}</span>
                          <span className="text-xs text-slate-500">{ev.date}</span>
                        </div>
                        <h4 className="font-bold text-slate-800 text-sm mt-1">{ev.title}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Organizer: {ev.organizer}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <button 
                  onClick={() => setActiveTab('events')}
                  className="mt-6 w-full py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Manage & Add Events
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= EVENTS TAB ================= */}
        {activeTab === 'events' && (
          <div data-testid="events-view" className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Create Event Form */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold font-serif text-slate-900 mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-brand-600" /> Create New Event
                </h3>
                <form onSubmit={handleCreateEvent} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Event Title</label>
                    <input 
                      data-testid="event-title-input"
                      type="text" 
                      value={newEvent.title}
                      onChange={e => setNewEvent({...newEvent, title: e.target.value})}
                      placeholder="e.g. National AI Hackathon 2025" 
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Category</label>
                    <select 
                      data-testid="event-category-select"
                      value={newEvent.category}
                      onChange={e => setNewEvent({...newEvent, category: e.target.value})}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-600 bg-white"
                    >
                      <option value="Workshop">Workshop</option>
                      <option value="Seminar">Seminar</option>
                      <option value="Hackathon">Hackathon</option>
                      <option value="Cultural">Cultural Event</option>
                      <option value="Sports">Sports Activity</option>
                      <option value="Internship">Internship</option>
                      <option value="Training">Training Program</option>
                      <option value="FDP">Faculty Development Program</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Date</label>
                    <input 
                      data-testid="event-date-input"
                      type="date" 
                      value={newEvent.date}
                      onChange={e => setNewEvent({...newEvent, date: e.target.value})}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Organizer / Department</label>
                    <input 
                      data-testid="event-organizer-input"
                      type="text" 
                      value={newEvent.organizer}
                      onChange={e => setNewEvent({...newEvent, organizer: e.target.value})}
                      placeholder="e.g. Dept of Computer Science" 
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Location</label>
                    <input 
                      data-testid="event-location-input"
                      type="text" 
                      value={newEvent.location}
                      onChange={e => setNewEvent({...newEvent, location: e.target.value})}
                      placeholder="e.g. Main Auditorium" 
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Description</label>
                    <textarea 
                      data-testid="event-desc-input"
                      rows="2"
                      value={newEvent.description}
                      onChange={e => setNewEvent({...newEvent, description: e.target.value})}
                      placeholder="Brief event overview..." 
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-600"
                    ></textarea>
                  </div>
                  <button 
                    data-testid="create-event-submit"
                    type="submit" 
                    className="w-full py-3 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 transition flex items-center justify-center gap-2"
                  >
                    <Plus className="w-5 h-5" /> Save & Create Event
                  </button>
                </form>
              </div>

              {/* Events List */}
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold font-serif text-slate-900 mb-6 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-brand-600" /> College Events Catalog ({events.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {events.map((ev) => (
                    <div key={ev.id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:border-brand-300 transition flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-semibold bg-brand-100 text-brand-800 px-2.5 py-1 rounded-md">{ev.category}</span>
                          <span className="text-xs text-slate-500">{ev.date}</span>
                        </div>
                        <h4 className="font-bold text-slate-900 text-base">{ev.title}</h4>
                        <p className="text-xs text-slate-600 mt-1">{ev.description || 'No description provided.'}</p>
                        <p className="text-xs text-slate-500 mt-3 flex items-center gap-1 font-medium"><Building2 className="w-3.5 h-3.5" /> {ev.organizer} ({ev.location})</p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-200 flex justify-between items-center">
                        <button 
                          onClick={() => {
                            setBulkData({...bulkData, event_id: ev.id});
                            setActiveTab('bulk');
                          }}
                          className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                        >
                          <Award className="w-4 h-4" /> Issue Certificates
                        </button>
                        <button 
                          data-testid={`delete-event-${ev.id}`}
                          onClick={() => handleDeleteEvent(ev.id)}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Delete Event"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= BULK GENERATOR TAB ================= */}
        {activeTab === 'bulk' && (
          <div data-testid="bulk-generator-view" className="space-y-8 max-w-4xl mx-auto">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
              <div className="border-b border-slate-100 pb-4 mb-6">
                <h3 className="text-xl font-bold font-serif text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-brand-600" /> Bulk Certificate Generator
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Select an event and certificate template, then paste or input participant details to auto-generate unique certificate IDs and QR codes.
                </p>
              </div>

              <form onSubmit={handleBulkGenerate} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">Select Event</label>
                    <select 
                      data-testid="bulk-event-select"
                      value={bulkData.event_id}
                      onChange={e => setBulkData({...bulkData, event_id: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-600 bg-white"
                    >
                      {events.map(ev => (
                        <option key={ev.id} value={ev.id}>{ev.title} ({ev.category})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">Certificate Template Style</label>
                    <select 
                      data-testid="bulk-template-select"
                      value={bulkData.template_id}
                      onChange={e => setBulkData({...bulkData, template_id: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-600 bg-white"
                    >
                      {templates.map(tpl => (
                        <option key={tpl.id} value={tpl.id}>{tpl.name} - Signer: {tpl.issuer_name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">Issue Date</label>
                  <input 
                    type="date" 
                    value={bulkData.issue_date}
                    onChange={e => setBulkData({...bulkData, issue_date: e.target.value})}
                    className="w-full md:w-1/2 px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-semibold text-slate-700 uppercase">
                      Participants List (Format: Name, Email, Role, Grade per line)
                    </label>
                    <span className="text-xs text-slate-400">One participant per line</span>
                  </div>
                  <textarea 
                    data-testid="participants-textarea"
                    rows="6"
                    value={bulkData.participantsText}
                    onChange={e => setBulkData({...bulkData, participantsText: e.target.value})}
                    placeholder="Alice Johnson, alice@college.edu, Winner, First Place"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:border-brand-600"
                  ></textarea>
                </div>

                <button 
                  data-testid="generate-certificates-submit"
                  type="submit" 
                  disabled={loading}
                  className="w-full py-4 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 transition shadow-lg flex items-center justify-center gap-2"
                >
                  <Award className="w-5 h-5" /> {loading ? 'Generating Certificates...' : 'Generate & Issue All Certificates'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ================= REPOSITORY TAB ================= */}
        {activeTab === 'repository' && (
          <div data-testid="repository-view" className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
              <div>
                <h3 className="text-xl font-bold font-serif text-slate-900">Certificate Repository</h3>
                <p className="text-xs text-slate-500 mt-1">Manage, search, download PDF, or resend notifications for all issued certificates.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
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
                      <th className="p-4">Certificate ID</th>
                      <th className="p-4">Recipient</th>
                      <th className="p-4">Event & Role</th>
                      <th className="p-4">Issue Date</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredCertificates.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="text-center py-12 text-slate-400">
                          No certificates found matching criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredCertificates.map((cert) => (
                        <tr key={cert.cert_id} className="hover:bg-slate-50/80 transition">
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
                            <a 
                              data-testid={`download-pdf-${cert.cert_id}`}
                              href={`${API}/certificates/${cert.cert_id}/download-pdf`}
                              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition inline-flex"
                              title="Download PDF"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                            <button 
                              data-testid={`send-email-${cert.cert_id}`}
                              onClick={() => handleSendEmail(cert.cert_id)}
                              className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition inline-flex"
                              title="Simulate Email Dispatch"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                            <button 
                              data-testid={`revoke-${cert.cert_id}`}
                              onClick={() => handleRevoke(cert.cert_id)}
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
            </div>
          </div>
        )}

        {/* ================= DESIGN STUDIO TAB ================= */}
        {activeTab === 'design' && (
          <DesignStudio notify={showNotification} onTemplatesChanged={fetchAllData} />
        )}

        {/* ================= BULK STUDIO TAB ================= */}
        {activeTab === 'bulk-studio' && (
          <BulkStudio notify={showNotification} />
        )}

        {/* ================= VERIFICATION PORTAL TAB ================= */}
        {activeTab === 'verify' && (
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
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase">Authorized Signatory</p>
                    <p className="font-bold text-slate-800 mt-1">{verifiedCert.issuer_name}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{verifiedCert.issuer_title}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase">Status</p>
                    <p className="font-bold text-emerald-600 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> {verifiedCert.status} (Valid Digital Record)
                    </p>
                  </div>
                </div>

                <div className="mt-8 flex gap-4">
                  <a 
                    href={`${API}/certificates/${verifiedCert.cert_id}/download-pdf`}
                    className="flex-1 py-3 bg-brand-600 text-white font-semibold rounded-xl text-center hover:bg-brand-700 transition flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" /> Download Official PDF Certificate
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

      </main>

      {/* ================= CERTIFICATE PREVIEW MODAL ================= */}
      {previewCert && (
        <div data-testid="certificate-preview-modal" className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full p-8 relative border-8 border-slate-900 overflow-hidden">
            <button 
              data-testid="close-preview-modal"
              onClick={() => setPreviewCert(null)}
              className="absolute top-4 right-4 bg-slate-100 text-slate-700 hover:bg-slate-200 p-2 rounded-full font-bold transition"
            >
              ✕
            </button>

            {/* Certificate Canvas Mockup */}
            <div className="text-center p-8 border-4 border-amber-500/80 rounded-2xl bg-gradient-to-br from-amber-50/30 via-white to-blue-50/30 relative">
              <div className="absolute top-4 left-4">
                <img src={`data:image/png;base64,${previewCert.qr_code_b64}`} alt="QR" className="w-20 h-20 border border-slate-300 rounded shadow-sm" />
              </div>

              <span className="text-xs font-mono bg-slate-200 text-slate-700 px-3 py-1 rounded-full">{previewCert.cert_id}</span>
              
              <h2 className="text-3xl font-bold font-serif text-brand-900 mt-4 tracking-wider">CERTIFICATE OF RECOGNITION</h2>
              <p className="text-sm text-slate-500 mt-1 uppercase tracking-widest font-medium">This is proudly presented to</p>

              <h3 className="text-4xl font-bold font-serif text-slate-900 my-4 border-b-2 border-brand-600/30 pb-2 inline-block px-10">
                {previewCert.recipient_name}
              </h3>

              <p className="text-sm text-slate-600 max-w-xl mx-auto mt-2">
                For successfully participating with distinction as <span className="font-bold text-brand-600">{previewCert.role}</span> in the college event:
              </p>

              <h4 className="text-2xl font-bold text-slate-900 mt-2 font-serif">{previewCert.event_title}</h4>
              <p className="text-xs text-slate-500 mt-1">{previewCert.grade}</p>

              <div className="mt-12 flex justify-between items-end px-12">
                <div className="text-center">
                  <div className="w-40 border-b border-slate-400 mb-1 mx-auto"></div>
                  <p className="font-bold text-xs text-slate-800">{previewCert.issuer_name}</p>
                  <p className="text-[10px] text-slate-500">{previewCert.issuer_title}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold text-emerald-600">Issued: {previewCert.issue_date}</p>
                  <p className="text-[10px] text-slate-400">CampusCert Secure System</p>
                </div>
                <div className="text-center">
                  <div className="w-40 border-b border-slate-400 mb-1 mx-auto"></div>
                  <p className="font-bold text-xs text-slate-800">Authorized Signatory</p>
                  <p className="text-[10px] text-slate-500">College Academic Council</p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <a 
                href={`${API}/certificates/${previewCert.cert_id}/download-pdf`}
                className="px-6 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl text-sm hover:bg-emerald-700 transition flex items-center gap-2"
              >
                <Download className="w-4 h-4" /> Download PDF
              </a>
              <button 
                onClick={() => setPreviewCert(null)}
                className="px-6 py-2.5 bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm hover:bg-slate-300 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-6 border-t border-slate-800 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
          <p>© 2025 CampusCert Pro. Centralized Certificate Generation & Management System for College Events.</p>
          <div className="flex gap-6">
            <span className="text-emerald-400 flex items-center gap-1 font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> System Operational</span>
            <span>MongoDB Connected</span>
            <span>Node.js Backend</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
