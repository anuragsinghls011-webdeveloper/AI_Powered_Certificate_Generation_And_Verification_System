import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { API } from './services/api';
import useNotification from './hooks/useNotification';

// Layout Components
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import Notification from './components/layout/Notification';
import PreviewModal from './components/certificates/PreviewModal';

// Page Components
import DashboardPage from './pages/DashboardPage';
import EventsPage from './pages/EventsPage';
import BulkGeneratorPage from './pages/BulkGeneratorPage';
import RepositoryPage from './pages/RepositoryPage';
import VerifyPage from './pages/VerifyPage';

// Feature Components (already standalone)
import DesignStudio from './DesignStudio';
import BulkStudio from './BulkStudio';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [events, setEvents] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const { notification, showNotification } = useNotification();

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

  // Selected certificate for preview modal
  const [previewCert, setPreviewCert] = useState(null);

  useEffect(() => {
    fetchAllData();
  }, []);

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

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });
        
        if (rows.length === 0) {
          showNotification('The uploaded file is empty.', 'error');
          return;
        }

        let nameIdx = -1, emailIdx = -1, roleIdx = -1, gradeIdx = -1;
        let firstNameIdx = -1, lastNameIdx = -1;
        let startIndex = 0;

        const firstRowStr = rows[0].map(h => String(h || '').toLowerCase().trim());
        const hasHeader = firstRowStr.some(h => h.includes('name') || h.includes('email') || h.includes('participant'));

        if (hasHeader) {
          startIndex = 1;
          const findCol = (keywords) => {
             return firstRowStr.findIndex(h => keywords.some(kw => h.includes(kw)));
          };
          firstNameIdx = findCol(['first name', 'first_name']);
          lastNameIdx = findCol(['last name', 'last_name']);
          if (firstNameIdx === -1 && lastNameIdx === -1) {
             nameIdx = firstRowStr.findIndex(h => (h.includes('name') || h.includes('recipient')) && !h.includes('id'));
          }
          emailIdx = findCol(['email', 'mail']);
          roleIdx = findCol(['role', 'position', 'type', 'program', 'designation']);
          gradeIdx = findCol(['grade', 'score', 'result', 'year', 'level']);
        } else {
          nameIdx = 0; emailIdx = 1; roleIdx = 2; gradeIdx = 3;
        }

        const formattedParticipants = [];
        for (let i = startIndex; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;
          const sanitize = (val) => {
             const str = val ? String(val).trim() : '';
             return str.replace(/,/g, ' ');
          };
          let nameStr = '';
          if (firstNameIdx !== -1 || lastNameIdx !== -1) {
             const fName = firstNameIdx !== -1 ? sanitize(row[firstNameIdx]) : '';
             const lName = lastNameIdx !== -1 ? sanitize(row[lastNameIdx]) : '';
             nameStr = `${fName} ${lName}`.trim();
          } else if (nameIdx !== -1) {
             nameStr = sanitize(row[nameIdx]);
          }
          const emailStr = emailIdx !== -1 ? sanitize(row[emailIdx]) : '';
          const roleStr = roleIdx !== -1 && row[roleIdx] ? sanitize(row[roleIdx]) : 'Participant';
          const gradeStr = gradeIdx !== -1 && row[gradeIdx] ? sanitize(row[gradeIdx]) : 'Successfully Completed';
          if (nameStr) {
             formattedParticipants.push(`${nameStr}, ${emailStr}, ${roleStr}, ${gradeStr}`);
          }
        }

        setBulkData(prev => ({
          ...prev,
          participantsText: formattedParticipants.join('\n')
        }));
        showNotification(`Successfully loaded ${formattedParticipants.length} participants from file.`);
      } catch (err) {
        showNotification('Error parsing file. Please check the format.', 'error');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = null;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <Notification notification={notification} />

      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        certificateCount={certificates.length}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8">
        {activeTab === 'dashboard' && (
          <DashboardPage
            analytics={analytics}
            events={events}
            certificates={certificates}
            setActiveTab={setActiveTab}
            setBulkData={setBulkData}
            bulkData={bulkData}
            setPreviewCert={setPreviewCert}
            apiBase={API}
          />
        )}

        {activeTab === 'events' && (
          <EventsPage
            events={events}
            newEvent={newEvent}
            setNewEvent={setNewEvent}
            onCreateEvent={handleCreateEvent}
            onDeleteEvent={handleDeleteEvent}
            setBulkData={setBulkData}
            bulkData={bulkData}
            setActiveTab={setActiveTab}
          />
        )}

        {activeTab === 'bulk' && (
          <BulkGeneratorPage
            events={events}
            templates={templates}
            bulkData={bulkData}
            setBulkData={setBulkData}
            loading={loading}
            onBulkGenerate={handleBulkGenerate}
            onFileUpload={handleFileUpload}
          />
        )}

        {activeTab === 'bulk-studio' && (
          <BulkStudio notify={showNotification} />
        )}

        {activeTab === 'repository' && (
          <RepositoryPage
            certificates={certificates}
            events={events}
            onSendEmail={handleSendEmail}
            onRevoke={handleRevoke}
            setPreviewCert={setPreviewCert}
            apiBase={API}
          />
        )}

        {activeTab === 'design' && (
          <DesignStudio notify={showNotification} onTemplatesChanged={fetchAllData} />
        )}

        {activeTab === 'verify' && (
          <VerifyPage apiBase={API} />
        )}
      </main>

      <PreviewModal
        cert={previewCert}
        onClose={() => setPreviewCert(null)}
        apiBase={API}
      />

      <Footer />
    </div>
  );
}
