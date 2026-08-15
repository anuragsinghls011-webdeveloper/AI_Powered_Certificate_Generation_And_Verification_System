import React from 'react';
import {
  Calendar, Plus, Trash2, Award, Building2, Layers
} from 'lucide-react';

export default function EventsPage({
  events, newEvent, setNewEvent, onCreateEvent, onDeleteEvent,
  setBulkData, bulkData, setActiveTab
}) {
  return (
    <div data-testid="events-view" className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Create Event Form */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold font-serif text-slate-900 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-brand-600" /> Create New Event
          </h3>
          <form onSubmit={onCreateEvent} className="space-y-4">
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
                    onClick={() => onDeleteEvent(ev.id)}
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
  );
}
